import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Info,
  Loader2,
} from 'lucide-react'
import * as React from 'react'

import { useTranslation } from 'react-i18next'

import { ObsidianMarkdown } from './ObsidianMarkdown'

// KogCat per-message status icon (spec §3.1, §9.7).
// Rendered after each assistant message bubble. Single icon + tooltip,
// intentionally not a panel or list — exposing structured KB hits would
// violate the §9 UX rule against metadata leaks.

export type CogCalibrationView =
  | { kind: 'idle' }
  | { kind: 'checked' }
  | { kind: 'calibrating' }
  | { kind: 'composing_advisor' }
  | {
      kind: 'advisor'
      intensity: 'supplement' | 'caution'
      advisorAnswer: string
    }
  | { kind: 'advisor_primary'; advisorAnswer: string }
  | { kind: 'reinforce' }
  | { kind: 'flag_gap' }
  | { kind: 'unavailable_no_llm' }
  | { kind: 'failed'; message: string }

type Props = {
  view: CogCalibrationView
  showAdvisor: boolean
  onToggleAdvisor?: () => void
}

type CogCalibrationActionModel = {
  indicator:
    | 'loading'
    | 'checked'
    | 'reinforce'
    | 'flag_gap'
    | 'unavailable'
    | 'failed'
    | null
  toggleLabel: string | null
}

type CogAdvisorCardModel = {
  tone: 'supplement' | 'caution'
  expanded: boolean
  title: string
  summary: string
  actionLabel: string
}

export function getCogCalibrationActionModel(
  view: CogCalibrationView,
): CogCalibrationActionModel {
  switch (view.kind) {
    case 'idle':
      return { indicator: null, toggleLabel: null }
    case 'checked':
      return { indicator: 'checked', toggleLabel: null }
    case 'calibrating':
    case 'composing_advisor':
      return { indicator: 'loading', toggleLabel: null }
    case 'advisor':
    case 'advisor_primary':
      return { indicator: null, toggleLabel: null }
    case 'reinforce':
      return { indicator: 'reinforce', toggleLabel: null }
    case 'flag_gap':
      return { indicator: 'flag_gap', toggleLabel: null }
    case 'unavailable_no_llm':
      return { indicator: 'unavailable', toggleLabel: null }
    case 'failed':
      return { indicator: 'failed', toggleLabel: null }
  }
}

export function getCogAdvisorCardModel(
  view: CogCalibrationView,
  showAdvisor: boolean,
): CogAdvisorCardModel | null {
  if (view.kind !== 'advisor') return null
  const tone = view.intensity
  return {
    tone,
    expanded: showAdvisor,
    title:
      tone === 'caution'
        ? 'advisor:card.caution.title'
        : 'advisor:card.supplement.title',
    summary:
      tone === 'caution'
        ? 'advisor:card.caution.summary'
        : 'advisor:card.supplement.summary',
    actionLabel: showAdvisor ? 'advisor:card.hide' : 'advisor:card.view',
  }
}

export function CogCalibrationStatus({
  view,
  showAdvisor,
  onToggleAdvisor,
}: Props): React.ReactElement | null {
  const { t } = useTranslation('status')
  const model = getCogCalibrationActionModel(view)
  if (!model.indicator) return null

  switch (view.kind) {
    case 'idle':
      return null
    case 'checked':
      return (
        <span
          className="ca-calibration-actions ca-reinforce"
          title={t('checked')}
        >
          <CheckCircle size={14} />
        </span>
      )
    case 'calibrating':
      return (
        <span
          className="ca-calibration-actions ca-calibrating"
          title={t('calibrating')}
        >
          <Loader2 size={14} className="ca-spin" />
        </span>
      )
    case 'composing_advisor':
      return (
        <span
          className="ca-calibration-actions ca-calibrating"
          title={t('composingAdvisor')}
        >
          <Loader2 size={14} className="ca-spin" />
        </span>
      )
    case 'advisor':
    case 'advisor_primary':
      return null
    case 'reinforce':
      return (
        <span
          className="ca-calibration-actions ca-reinforce"
          title={t('kbConfirmed')}
        >
          <CheckCircle size={14} />
        </span>
      )
    case 'flag_gap':
      return (
        <span
          className="ca-calibration-actions ca-flag-gap"
          title={t('kbUncovered')}
        >
          <Info size={14} />
        </span>
      )
    case 'unavailable_no_llm':
      return (
        <span
          className="ca-calibration-actions ca-unavailable"
          title={t('unavailableNoLlm')}
        >
          <Info size={14} />
        </span>
      )
    case 'failed':
      return (
        <span
          className="ca-calibration-actions ca-failed"
          title={`${t('failed')} · ${view.message}`}
        >
          <CircleAlert size={14} />
        </span>
      )
  }
}

export function CogAdvisorCard({
  view,
  showAdvisor,
  onToggleAdvisor,
}: Props): React.ReactElement | null {
  const { t } = useTranslation()
  const model = getCogAdvisorCardModel(view, showAdvisor)
  if (!model || view.kind !== 'advisor' || !onToggleAdvisor) return null

  return (
    <div
      className={`ca-advisor-shelf ca-advisor-shelf--${model.tone}${
        model.expanded ? ' is-expanded' : ''
      }`}
    >
      <button
        type="button"
        className="ca-advisor-shelf-trigger"
        onClick={onToggleAdvisor}
        aria-expanded={showAdvisor}
      >
        <span className="ca-advisor-shelf-dot" aria-hidden="true" />
        <span className="ca-advisor-shelf-main">
          <span className="ca-advisor-shelf-title">{t(model.title)}</span>
          <span className="ca-advisor-shelf-summary">{t(model.summary)}</span>
        </span>
        <span className="ca-advisor-shelf-action">{t(model.actionLabel)}</span>
        {showAdvisor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showAdvisor && (
        <div className="ca-advisor-shelf-answer">
          <ObsidianMarkdown content={view.advisorAnswer} scale="xs" />
        </div>
      )}
    </div>
  )
}
