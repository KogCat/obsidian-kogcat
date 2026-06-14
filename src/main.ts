import os from 'os'
import path from 'path'

import { Editor, Notice, Plugin, addIcon } from 'obsidian'

import { KogCatIntroModal } from './components/modals/KogCatIntroModal'
import { KOGCAT_ICON_ID, REVIEW_VIEW_TYPE } from './constants'
import { KOGCAT_DEMO_REVIEW, KOGCAT_DEMO_TEXT } from './core/kogcat/demo'
import { PromptCache } from './core/kogcat/prompts'
import {
  REQUIRED_CORE_VERSION,
  checkForCoreUpdate,
  ensureOmCoreBinary,
} from './core/om-core/download'
import { OmCoreLifecycle } from './core/om-core/lifecycle'
import {
  activateService,
  ensureServiceCurrent,
} from './core/om-core/service-supervision'
import { directSpawnEnabled } from './core/om-core/transport'
import { applyLocale, initI18n, t } from './i18n'
import { KogCatReviewView } from './KogCatReviewView'
import {
  SmartComposerSettings,
  smartComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseSmartComposerSettings } from './settings/schema/settings'
import { SmartComposerSettingTab } from './settings/SettingTab'
import { openPathWithDefaultApp } from './utils/openPathWithDefaultApp'

export default class SmartComposerPlugin extends Plugin {
  settings: SmartComposerSettings
  settingsChangeListeners: ((newSettings: SmartComposerSettings) => void)[] = []
  omCore: OmCoreLifecycle | null = null
  promptCache: PromptCache | null = null
  private timeoutIds: ReturnType<typeof setTimeout>[] = []

  async onload() {
    await this.loadSettings()
    initI18n(this.settings.locale)

    // Synchronous so UI mounted before the engine boots can subscribe immediately.
    this.omCore = new OmCoreLifecycle(this.app, this)

    this.registerView(
      REVIEW_VIEW_TYPE,
      (leaf) => new KogCatReviewView(leaf, this),
    )

    addIcon(
      KOGCAT_ICON_ID,
      '<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(50,50) scale(1.55) translate(-50,-40)"><circle cx="50" cy="17" r="6"/><path d="M50,23 L50,68"/><path d="M35,39 L65,39"/><path d="M24,44 L27,49 L50,69 L73,49 L76,44"/></g>',
    )
    this.addRibbonIcon(KOGCAT_ICON_ID, t('command:openReview'), () => {
      void this.openReviewView()
    })

    // ── review pass: selection / paragraph / whole note ──
    this.addCommand({
      id: 'kogcat-calibrate-selection',
      name: t('command:calibrateSelection'),
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'c' }],
      editorCallback: (editor: Editor) => {
        const sel = editor.getSelection()
        if (sel && sel.trim()) {
          void this.runReview(sel, t('calibration:labels.selection'))
        } else {
          const para = paragraphAtCursor(editor)
          void this.runReview(para, t('calibration:labels.paragraph'))
        }
      },
    })

    this.addCommand({
      id: 'kogcat-calibrate-note',
      name: t('command:calibrateNote'),
      editorCallback: (editor: Editor) => {
        void this.runReview(editor.getValue(), t('calibration:labels.note'))
      },
    })

    // 右键入口（有选区→校准选区，否则当前段落 + onboarding 手势）。
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const sel = editor.getSelection()
        const hasSel = !!(sel && sel.trim())
        menu.addItem((item) =>
          item
            .setTitle(
              hasSel
                ? t('command:calibrateSelectionOnly')
                : t('command:calibrateParagraph'),
            )
            .setIcon(KOGCAT_ICON_ID)
            .onClick(() => {
              if (hasSel)
                void this.runReview(sel, t('calibration:labels.selection'))
              else
                void this.runReview(
                  paragraphAtCursor(editor),
                  t('calibration:labels.paragraph'),
                )
            }),
        )
      }),
    )

    this.addCommand({
      id: 'kogcat-show-intro',
      name: t('command:showIntro'),
      callback: () => {
        new KogCatIntroModal(this.app, this, {
          hasChatHistory: this.settings.kogcatLlmConsented,
        }).open()
      },
    })

    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

    // Defer engine boot until layout is ready so download Notice doesn't block UI paint.
    this.app.workspace.onLayoutReady(() => {
      void this.bootOmCore()
      this.maybeShowProductIntro()
    })
  }

  // First-run product onboarding. Shown once; the sample run does
  // not require the engine to be ready yet (it surfaces a "未就绪" hint if so).
  private maybeShowProductIntro(): void {
    if (this.settings.kogcatIntroSeen) return
    new KogCatIntroModal(this.app, this, {
      hasChatHistory: this.settings.kogcatLlmConsented,
    }).open()
    void this.setSettings({ ...this.settings, kogcatIntroSeen: true })
  }

  // Boot path covers three cases:
  //   1. Sidecar already running (CC plugin / prior Obsidian session left
  //      launchd alive) — fast-attach, no UI.
  //   2. No plist, no sidecar (typical BRAT-only user, first run) — full
  //      onboarding: download binary → install-service → wait for ready,
  //      with a single sticky Notice carrying stage-by-stage progress.
  //   3. CI / mock — OM_ALLOW_DIRECT_SPAWN=1 hands control to direct-spawn.
  async bootOmCore(): Promise<void> {
    if (!this.omCore) {
      this.omCore = new OmCoreLifecycle(this.app, this)
    }
    const status = this.omCore.getStatus()
    if (status.kind === 'running' || status.kind === 'starting') return

    // Fast path: server.json already live. Skip onboarding entirely.
    await this.omCore.attachSupervised()
    if (this.omCore.getStatus().kind === 'running') {
      this.finalizePromptCacheAfterBoot()
      return
    }

    if (directSpawnEnabled()) {
      await this.bootOmCoreDirectSpawn()
      return
    }

    await this.runOnboarding()
  }

  // Sticky Notice walks the user through download → register service → wait
  // for sidecar, then settles to a short success / failure message.
  private async runOnboarding(): Promise<void> {
    const notice = new Notice(t('onboarding:preparing'), 0)
    const stage = (msg: string) => {
      notice.setMessage(msg)
    }
    const fail = (msg: string) => {
      console.warn('[KogCat] onboarding failed:', msg)
      notice.setMessage(t('onboarding:installFailed', { message: msg }))
      setTimeout(() => notice.hide(), 8000)
    }

    try {
      stage(t('onboarding:downloading'))
      const ensured = await ensureOmCoreBinary({
        override: this.settings.omCorePath || null,
      })
      if (ensured.kind === 'failed') {
        fail(ensured.message)
        return
      }

      stage(t('onboarding:registeringService'))
      const outcome = await ensureServiceCurrent(ensured.binaryPath)
      if (outcome.kind === 'failed') {
        fail(
          t('onboarding:serviceRegisterFailed', { message: outcome.message }),
        )
        return
      }
      if (
        outcome.kind === 'skipped' &&
        outcome.reason === 'unsupported-platform'
      ) {
        fail(
          t('onboarding:platformUnsupported', { platform: process.platform }),
        )
        return
      }

      stage(t('onboarding:starting'))
      if (!this.omCore) {
        this.omCore = new OmCoreLifecycle(this.app, this)
      }
      await this.omCore.attachSupervised({ waitForServerJsonMs: 30_000 })
      const status = this.omCore.getStatus()
      if (status.kind !== 'running') {
        fail(
          status.kind === 'failed'
            ? status.message
            : t('onboarding:statusAbnormal', { kind: status.kind }),
        )
        return
      }

      notice.setMessage(t('onboarding:ready'))
      setTimeout(() => notice.hide(), 2000)
      this.finalizePromptCacheAfterBoot()
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  // CI / mock path: OM_ALLOW_DIRECT_SPAWN=1 — plugin owns the process.
  private async bootOmCoreDirectSpawn(): Promise<void> {
    if (!this.omCore) {
      this.omCore = new OmCoreLifecycle(this.app, this)
    }
    const ensured = await ensureOmCoreBinary({
      override: this.settings.omCorePath || null,
    })
    if (ensured.kind === 'failed') {
      new Notice(t('notice:engine.unavailable', { message: ensured.message }))
      return
    }
    await this.omCore.directSpawn(ensured.binaryPath, {
      binaryPathOverride: this.settings.omCorePath || null,
      omPluginRoot: this.settings.omPluginRoot || null,
    })
    if (this.omCore.getStatus().kind === 'running') {
      this.finalizePromptCacheAfterBoot()
    }
  }

  private finalizePromptCacheAfterBoot(): void {
    if (!this.omCore?.getAuth()) return
    this.promptCache = new PromptCache(
      this.app,
      this,
      () => this.omCore?.getAuth() ?? null,
    )
    void this.promptCache.refreshFromManifest()
  }

  onunload() {
    this.timeoutIds.forEach((id) => clearTimeout(id))
    this.timeoutIds = []

    this.omCore?.kill()
    this.omCore = null
    this.promptCache = null
  }

  async loadSettings() {
    this.settings = parseSmartComposerSettings(await this.loadData())
    await this.saveData(this.settings)
  }

  async setSettings(newSettings: SmartComposerSettings) {
    const validationResult = smartComposerSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(
        t('notice:settings.invalid', {
          issues: validationResult.error.issues
            .map((v) => v.message)
            .join('\n'),
        }),
      )
      return
    }

    const localeChanged =
      this.settings && this.settings.locale !== newSettings.locale
    this.settings = newSettings
    await this.saveData(newSettings)
    if (localeChanged) {
      void applyLocale(newSettings.locale)
    }
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: SmartComposerSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openReviewView() {
    const existing = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0]
    await (existing ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: REVIEW_VIEW_TYPE,
      active: true,
    })
    const leaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0]
    if (leaf) this.app.workspace.revealLeaf(leaf)
  }

  async runReview(text: string, label: string) {
    await this.openReviewView()
    const leaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0]
    if (leaf && leaf.view instanceof KogCatReviewView) {
      leaf.view.runReview(
        text,
        label,
        text === KOGCAT_DEMO_TEXT ? KOGCAT_DEMO_REVIEW : undefined,
      )
    }
  }

  async restartOmCore(): Promise<void> {
    if (directSpawnEnabled()) {
      this.omCore?.reset()
      this.promptCache = null
      await this.bootOmCore()
      return
    }
    const ensured = await ensureOmCoreBinary({
      override: this.settings.omCorePath || null,
    })
    if (ensured.kind === 'failed') {
      throw new Error(ensured.message)
    }
    const svc = await ensureServiceCurrent(ensured.binaryPath)
    if (svc.kind === 'failed') {
      throw new Error(svc.message)
    }
    const outcome = await activateService(ensured.binaryPath)
    if (outcome.kind === 'failed') {
      throw new Error(outcome.message)
    }
    if (outcome.kind === 'skipped') {
      throw new Error(`service restart skipped: ${outcome.reason}`)
    }
    this.promptCache = null
    if (!this.omCore) {
      this.omCore = new OmCoreLifecycle(this.app, this)
    }
    await this.omCore.attachSupervised({ waitForServerJsonMs: 30_000 })
    if (this.omCore.getStatus().kind !== 'running') {
      await this.bootOmCore()
    }
    if (this.omCore.getStatus().kind === 'running') {
      this.finalizePromptCacheAfterBoot()
    }
  }

  async checkOmCoreUpdate(): Promise<{
    latest: string
    needsUpdate: boolean
  } | null> {
    const status = this.omCore?.getStatus()
    const installed =
      status?.kind === 'running'
        ? (status.version ?? REQUIRED_CORE_VERSION)
        : undefined
    const result = await checkForCoreUpdate({
      lastCheckMs: this.settings.lastCoreCheckTime,
      installedVersion: installed,
    })
    if (result) {
      await this.setSettings({
        ...this.settings,
        lastCoreCheckTime: Date.now(),
      })
    }
    return result
  }

  async openOmCoreLog(): Promise<void> {
    await openPathWithDefaultApp(this.app, omCoreLogPath())
  }
}

function omCoreLogPath(): string {
  const override = (process.env.OM_LOG_HOME ?? '').trim()
  if (override) return path.join(override, 'om-core.log')
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', 'om', 'om-core.log')
  }
  if (process.platform === 'win32') {
    const base =
      process.env.LOCALAPPDATA ??
      process.env.APPDATA ??
      path.join(os.homedir(), 'AppData', 'Local')
    return path.join(base, 'om', 'Logs', 'om-core.log')
  }
  const xdgState = process.env.XDG_STATE_HOME
  if (xdgState) return path.join(xdgState, 'om', 'log', 'om-core.log')
  return path.join(os.homedir(), '.local', 'share', 'om', 'om-core.log')
}

// Expand a cursor position to its surrounding paragraph (blank-line bounded).
function paragraphAtCursor(editor: Editor): string {
  const cursor = editor.getCursor()
  let start = cursor.line
  let end = cursor.line
  while (start > 0 && editor.getLine(start - 1).trim() !== '') start--
  while (
    end < editor.lineCount() - 1 &&
    editor.getLine(end + 1).trim() !== ''
  ) {
    end++
  }
  const lines: string[] = []
  for (let i = start; i <= end; i++) lines.push(editor.getLine(i))
  return lines.join('\n')
}
