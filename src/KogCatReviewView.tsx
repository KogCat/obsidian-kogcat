import { Copy, Loader2, Sparkles } from 'lucide-react'
import { ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { Root, createRoot } from 'react-dom/client'

import { ensureLlmConsent } from './components/modals/PrivacyConsentModal'
import { AddProviderModal } from './components/settings/modals/ProviderFormModal'
import {
  KOGCAT_ICON_ID,
  PROVIDER_TYPES_INFO,
  REVIEW_VIEW_TYPE,
} from './constants'
import { calibrateReview } from './core/kogcat/calibrate'
import { KOGCAT_DEMO_REVIEW, KOGCAT_DEMO_TEXT } from './core/kogcat/demo'
import {
  SynthPoint,
  SynthesizedReview,
  buildObsidianReviewSeeds,
  curateReviewDeterministic,
  synthesizeReview,
} from './core/kogcat/reviewSynthesis'
import { getChatModelClient } from './core/llm/manager'
import { t, useTranslation } from './i18n'
import SmartComposerPlugin from './main'
import { isModelUsable } from './utils/llm/hasUsableProvider'

const REVIEW_SYNTHESIS_TIMEOUT_MS = 15000

type PanelState =
  | { kind: 'empty' }
  | { kind: 'loading'; label: string; stage: LoadingStage }
  | { kind: 'error'; message: string }
  | {
      kind: 'done'
      label: string
      review: SynthesizedReview
      refined: boolean
      modelLabel?: string
      previewReason?: string
    }

export type ReviewPanelRef = {
  runReview: (
    text: string,
    label: string,
    demoReview?: SynthesizedReview,
  ) => void
}

type LoadingStage = 'recall' | 'refine' | 'shape'

const ReviewPanel = forwardRef<ReviewPanelRef, { plugin: SmartComposerPlugin }>(
  function ReviewPanel({ plugin }, ref) {
    const { t } = useTranslation(['calibration', 'common'])
    const [state, setState] = useState<PanelState>({ kind: 'empty' })

    useImperativeHandle(
      ref,
      () => ({
        runReview: async (
          text: string,
          label: string,
          demoReview?: SynthesizedReview,
        ) => {
          const trimmed = text?.trim()
          if (!trimmed) {
            setState({ kind: 'error', message: t('calibration:errors.empty') })
            return
          }
          if (demoReview || trimmed === KOGCAT_DEMO_TEXT) {
            setState({
              kind: 'done',
              label,
              review: demoReview ?? KOGCAT_DEMO_REVIEW,
              refined: false,
            })
            return
          }
          // Boot attaches once; the sidecar may have come up (or restarted)
          // afterwards. Re-attach on demand before declaring it unavailable.
          let auth = plugin.omCore?.getAuth() ?? null
          if (!auth && plugin.omCore) {
            setState({ kind: 'loading', label, stage: 'recall' })
            try {
              await plugin.omCore.attachSupervised({
                waitForServerJsonMs: 8000,
              })
            } catch {
              // fall through to the null-auth check below
            }
            auth = plugin.omCore.getAuth() ?? null
          }
          if (!auth) {
            setState({
              kind: 'error',
              message: t('calibration:errors.engineNotReady'),
            })
            return
          }
          // One-time consent before any LLM refinement (sends the selected text
          // to your configured model). Without it, results stay deterministic.
          if (
            !plugin.settings.kogcatLlmConsented &&
            hasAnyUsableReviewModel(plugin)
          ) {
            await ensureLlmConsent({
              app: plugin.app,
              consented: plugin.settings.kogcatLlmConsented,
              setConsented: (v) =>
                plugin.setSettings({
                  ...plugin.settings,
                  kogcatLlmConsented: v,
                }),
            })
          }
          setState({ kind: 'loading', label, stage: 'recall' })
          const result = await calibrateReview({
            auth,
            text: trimmed,
            question: buildReviewQuestion(trimmed),
            seeds: buildObsidianReviewSeeds(trimmed),
            source: 'vault_selection',
          })
          if (!result) {
            setState({
              kind: 'error',
              message: t('calibration:errors.noResponse'),
            })
            return
          }
          setState({ kind: 'loading', label, stage: 'refine' })
          const refined = await refine(plugin, result.review, trimmed, t)
          setState({ kind: 'loading', label, stage: 'shape' })
          setState({ kind: 'done', label, ...refined })
        },
      }),
      [plugin, t],
    )

    if (state.kind === 'empty') {
      const needsProvider = !hasAnyUsableReviewModel(plugin)
      return (
        <div className="kogcat-review-panel">
          {needsProvider && (
            <div className="kogcat-setup-banner">
              <p className="kogcat-setup-banner__text">
                {t('calibration:setup.banner')}
              </p>
              <button
                className="mod-cta"
                onClick={() => new AddProviderModal(plugin.app, plugin).open()}
              >
                {t('calibration:setup.action')}
              </button>
            </div>
          )}
          <div className="kogcat-review-empty">
            <Sparkles size={18} aria-hidden="true" />
            <p className="kogcat-review-hint">{t('calibration:empty.hint')}</p>
          </div>
        </div>
      )
    }

    if (state.kind === 'loading') {
      return (
        <div className="kogcat-review-panel">
          <LoadingReview label={state.label} stage={state.stage} />
        </div>
      )
    }

    if (state.kind === 'error') {
      const reconnect = async () => {
        if (!plugin.omCore) return
        await plugin.omCore.attachSupervised({ waitForServerJsonMs: 8000 })
        const st = plugin.omCore.getStatus()
        if (st.kind === 'running') {
          new Notice(t('calibration:notice.reconnected'))
          setState({ kind: 'empty' })
        } else {
          setState({
            kind: 'error',
            message:
              st.kind === 'failed'
                ? st.message
                : t('calibration:errors.engineNotReady'),
          })
        }
      }
      return (
        <div className="kogcat-review-panel">
          <p className="kogcat-review-error">{state.message}</p>
          <button className="mod-cta" onClick={reconnect}>
            {t('calibration:errors.reconnect')}
          </button>
        </div>
      )
    }

    const { review, label } = state
    const firstPoint = review.points[0]
    const remainingPoints = review.points.slice(1)
    const hasContent = review.points.length > 0
    const hasSummary = !!review.summary?.trim()
    const copyReview = async () => {
      try {
        await navigator.clipboard.writeText(formatReviewText(review, t))
        new Notice(t('calibration:notice.copiedAll'))
      } catch {
        new Notice(t('calibration:notice.copyFailed'))
      }
    }
    return (
      <div className="kogcat-review-panel">
        <div className="kogcat-review-ctx">
          <span className="kogcat-review-target">{label}</span>
          <span aria-hidden="true">·</span>
          <span className="kogcat-review-mode">
            {t(`calibration:mode.${review.mode}.label`)}
          </span>
        </div>
        <p className="kogcat-review-source">
          {state.refined
            ? t('calibration:source.llm', {
                model: state.modelLabel ?? plugin.settings.chatModelId,
              })
            : t('calibration:source.local')}
        </p>
        {hasSummary && (
          <p className="kogcat-review-summary">{review.summary}</p>
        )}
        {hasContent ? (
          <>
            {hasSummary && <div className="kogcat-review-rule" />}
            <div className="kogcat-review-points">
              {firstPoint && <PointRow point={firstPoint} primary />}
              {remainingPoints.map((pt, i) => (
                <PointRow key={`p${i}`} point={pt} />
              ))}
            </div>
          </>
        ) : (
          <p className="kogcat-review-empty-note">
            {t('calibration:result.noStrongPoints')}
          </p>
        )}
        {review.next_step && (
          <p className="kogcat-review-next">
            <b>{t('calibration:result.nextStepLabel')}</b>
            {review.next_step}
          </p>
        )}
        {state.previewReason && (
          <p className="kogcat-review-basic-note">{state.previewReason}</p>
        )}
        <div className="kogcat-review-foot">
          <button
            className="kogcat-review-copy"
            type="button"
            onClick={copyReview}
            aria-label={t('calibration:actions.copyAll')}
            title={t('calibration:actions.copyAll')}
          >
            <Copy size={12} aria-hidden="true" />
            <span>{t('calibration:actions.copyAll')}</span>
          </button>
        </div>
      </div>
    )
  },
)

function buildReviewQuestion(text: string): string {
  return `从 Obsidian 用户的 daily note、剪藏、复述、判断、行动场景校准这段文字：${text}`
}

function formatReviewText(
  review: SynthesizedReview,
  translate: ReturnType<typeof useTranslation>['t'],
): string {
  const lines: string[] = []
  if (review.summary?.trim()) lines.push(review.summary.trim())
  for (const point of review.points) {
    lines.push(point.why ? `${point.judgment}\n${point.why}` : point.judgment)
  }
  if (review.next_step) {
    lines.push(
      translate('calibration:result.nextStep', { step: review.next_step }),
    )
  }
  return lines.filter(Boolean).join('\n\n')
}

async function refine(
  plugin: SmartComposerPlugin,
  review: Parameters<typeof curateReviewDeterministic>[0],
  selectedText: string,
  translate: ReturnType<typeof useTranslation>['t'],
): Promise<{
  review: SynthesizedReview
  refined: boolean
  modelLabel?: string
  previewReason?: string
}> {
  const settings = plugin.settings
  const selectedModel = await resolveReviewModel(plugin)
  if (settings.kogcatLlmConsented && selectedModel) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      controller.abort()
    }, REVIEW_SYNTHESIS_TIMEOUT_MS)
    try {
      const { providerClient, model } = getChatModelClient({
        modelId: selectedModel.id,
        settings,
        setSettings: (next) => plugin.setSettings(next),
      })
      const out = await synthesizeReview({
        selectedText,
        review,
        providerClient,
        model,
        abortSignal: controller.signal,
      })
      if (out) {
        return {
          review: out,
          refined: true,
          modelLabel: formatReviewModelLabel(plugin, model.id),
        }
      }
    } catch {
      // fall through to deterministic curation
    } finally {
      window.clearTimeout(timer)
    }
    return {
      review: curateReviewDeterministic(review, selectedText),
      refined: false,
      previewReason: translate('calibration:preview.refineFailed'),
    }
  }
  return {
    review: curateReviewDeterministic(review, selectedText),
    refined: false,
    previewReason: translate('calibration:preview.noModel'),
  }
}

function getSelectedUsableReviewModel(plugin: SmartComposerPlugin) {
  const settings = plugin.settings
  const selected = settings.chatModels.find(
    (m) => m.id === settings.chatModelId,
  )
  return selected && isModelUsable(selected, settings) ? selected : null
}

async function resolveReviewModel(plugin: SmartComposerPlugin) {
  const selected = getSelectedUsableReviewModel(plugin)
  if (selected) return selected
  const fallback = plugin.settings.chatModels.find((m) =>
    isModelUsable(m, plugin.settings),
  )
  if (fallback) {
    await plugin.setSettings({ ...plugin.settings, chatModelId: fallback.id })
  }
  return fallback ?? null
}

function hasAnyUsableReviewModel(plugin: SmartComposerPlugin): boolean {
  return plugin.settings.chatModels.some((m) =>
    isModelUsable(m, plugin.settings),
  )
}

function formatReviewModelLabel(
  plugin: SmartComposerPlugin,
  modelId: string,
): string {
  const settings = plugin.settings
  const model = settings.chatModels.find((m) => m.id === modelId)
  if (!model) return modelId
  const provider = settings.providers.find((p) => p.id === model.providerId)
  const providerLabel =
    provider?.id === model.providerType
      ? PROVIDER_TYPES_INFO[model.providerType]?.label
      : provider?.id ||
        PROVIDER_TYPES_INFO[model.providerType]?.label ||
        model.providerType
  return `${providerLabel} · ${model.model || model.id}`
}

function LoadingReview({
  label,
  stage,
}: {
  label: string
  stage: LoadingStage
}) {
  const { t } = useTranslation('calibration')
  const stages: LoadingStage[] = ['recall', 'refine', 'shape']
  return (
    <div className="kogcat-review-loading">
      <div className="kogcat-review-loading-title">
        <Loader2 size={15} aria-hidden="true" />
        <span>{t('loading.title', { label })}</span>
      </div>
      <div className="kogcat-review-loading-steps">
        {stages.map((s) => {
          const active = s === stage
          const done = stages.indexOf(s) < stages.indexOf(stage)
          return (
            <div
              key={s}
              className={[
                'kogcat-review-loading-step',
                active ? 'is-active' : '',
                done ? 'is-done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="kogcat-review-loading-dot" />
              <span>{t(`loading.${s}`)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PointRow({
  point,
  primary = false,
}: {
  point: SynthPoint
  primary?: boolean
}) {
  return (
    <div
      className={
        primary ? 'kogcat-review-point is-lead' : 'kogcat-review-point'
      }
    >
      <p className="kogcat-review-judgment">{point.judgment}</p>
      {point.why && <p className="kogcat-review-why">{point.why}</p>}
    </div>
  )
}

export class KogCatReviewView extends ItemView {
  private root: Root | null = null
  private panelRef: React.RefObject<ReviewPanelRef> = React.createRef()
  private pending: {
    text: string
    label: string
    demoReview?: SynthesizedReview
  } | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SmartComposerPlugin,
  ) {
    super(leaf)
  }

  getViewType() {
    return REVIEW_VIEW_TYPE
  }

  getIcon() {
    return KOGCAT_ICON_ID
  }

  getDisplayText() {
    return t('command:openReview')
  }

  async onOpen() {
    this.render()
    if (this.pending) {
      const p = this.pending
      this.pending = null
      // Defer one tick so the imperative ref is attached after first paint.
      window.setTimeout(
        () => this.panelRef.current?.runReview(p.text, p.label, p.demoReview),
        0,
      )
    }
  }

  async onClose() {
    this.root?.unmount()
    this.root = null
  }

  // Called by main.ts commands; safe whether the view is freshly opened or reused.
  runReview(text: string, label: string, demoReview?: SynthesizedReview) {
    if (this.panelRef.current) {
      this.panelRef.current.runReview(text, label, demoReview)
    } else {
      this.pending = { text, label, demoReview }
    }
  }

  private render() {
    if (!this.root) {
      this.root = createRoot(this.containerEl.children[1])
    }
    this.root.render(<ReviewPanel ref={this.panelRef} plugin={this.plugin} />)
  }
}
