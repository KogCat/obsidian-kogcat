import path from 'path'

import { Editor, MarkdownView, Notice, Plugin, addIcon } from 'obsidian'

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { InstallerUpdateRequiredModal } from './components/modals/InstallerUpdateRequiredModal'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE, KOGCAT_ICON_ID } from './constants'
import { PromptCache } from './core/kogcat/prompts'
import { McpManager } from './core/mcp/mcpManager'
import {
  REQUIRED_CORE_VERSION,
  checkForCoreUpdate,
  ensureOmCoreBinary,
} from './core/om-core/download'
import { OmCoreLifecycle } from './core/om-core/lifecycle'
import { ensureServiceCurrent } from './core/om-core/service-supervision'
import { directSpawnEnabled } from './core/om-core/transport'
import { RAGEngine } from './core/rag/ragEngine'
import { VaultIndexScheduler } from './core/rag/VaultIndexScheduler'
import { DatabaseManager } from './database/DatabaseManager'
import { initI18n, applyLocale, t } from './i18n'
import { PGLiteAbortedException } from './database/exception'
import { migrateToJsonDatabase } from './database/json/migrateToJsonDatabase'
import {
  SmartComposerSettings,
  smartComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseSmartComposerSettings } from './settings/schema/settings'
import { SmartComposerSettingTab } from './settings/SettingTab'
import { getMentionableBlockData } from './utils/obsidian'
import { openPathWithDefaultApp } from './utils/openPathWithDefaultApp'

export default class SmartComposerPlugin extends Plugin {
  settings: SmartComposerSettings
  initialChatProps?: ChatProps // TODO: change this to use view state like ApplyView
  settingsChangeListeners: ((newSettings: SmartComposerSettings) => void)[] = []
  mcpManager: McpManager | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null
  vaultIndexScheduler: VaultIndexScheduler | null = null
  omCore: OmCoreLifecycle | null = null
  promptCache: PromptCache | null = null
  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null
  private timeoutIds: ReturnType<typeof setTimeout>[] = []

  async onload() {
    await this.loadSettings()
    initI18n(this.settings.locale)

    // Synchronous so UI mounted before the engine boots can subscribe immediately.
    this.omCore = new OmCoreLifecycle(this.app, this)

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))

    addIcon(KOGCAT_ICON_ID, '<polygon points="4,2 1,9 7,9"/><polygon points="20,2 23,9 17,9"/><ellipse cx="12" cy="15" rx="9" ry="7"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>')
    this.addRibbonIcon(KOGCAT_ICON_ID, t('command:openRibbon'), () =>
      this.openChatView(),
    )

    this.addCommand({
      id: 'open-new-chat',
      name: t('command:openChat'),
      callback: () => this.openChatView(true),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: t('command:addSelectionToChat'),
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addSelectionToChat(editor, view)
      },
    })

    this.addCommand({
      id: 'toggle-kogcat-calibration',
      name: t('command:toggleCalibration'),
      callback: async () => {
        const next = !this.settings.kogcatEnabled
        await this.setSettings({ ...this.settings, kogcatEnabled: next })
        new Notice(
          next
            ? t('notice:calibration.enabled')
            : t('notice:calibration.disabled'),
        )
      },
    })

    this.addCommand({
      id: 'rebuild-vault-index',
      name: t('command:rebuildVaultIndex'),
      callback: async () => {
        const notice = new Notice(t('notice:vaultIndex.rebuilding'), 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: true },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  t(
                    queryProgress.indexProgress.waitingForRateLimit
                      ? 'notice:vaultIndex.indexingProgressRateLimited'
                      : 'notice:vaultIndex.indexingProgress',
                    { completed: completedChunks, total: totalChunks },
                  ),
                )
              }
            },
          )
          notice.setMessage(t('notice:vaultIndex.rebuildComplete'))
        } catch (error) {
          console.error(error)
          notice.setMessage(t('notice:vaultIndex.rebuildFailed'))
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    this.addCommand({
      id: 'update-vault-index',
      name: t('command:updateVaultIndex'),
      callback: async () => {
        const notice = new Notice(t('notice:vaultIndex.updating'), 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: false },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  t(
                    queryProgress.indexProgress.waitingForRateLimit
                      ? 'notice:vaultIndex.indexingProgressRateLimited'
                      : 'notice:vaultIndex.indexingProgress',
                    { completed: completedChunks, total: totalChunks },
                  ),
                )
              }
            },
          )
          notice.setMessage(t('notice:vaultIndex.updateComplete'))
        } catch (error) {
          console.error(error)
          notice.setMessage(t('notice:vaultIndex.updateFailed'))
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

    this.vaultIndexScheduler = new VaultIndexScheduler({
      app: this.app,
      getRAGEngine: () => this.getRAGEngine(),
      registerEvent: (eventRef) => this.registerEvent(eventRef),
    })
    this.vaultIndexScheduler.start()

    void this.migrateToJsonStorage()

    // Defer engine boot until layout is ready so download Notice doesn't block UI paint.
    this.app.workspace.onLayoutReady(() => {
      void this.bootOmCore()
    })
  }

  // Boot path covers four cases:
  //   1. External mode — attach to a caller-owned process on TCP.
  //   2. Sidecar already running (CC plugin / prior Obsidian session left
  //      launchd alive) — fast-attach, no UI.
  //   3. No plist, no sidecar (typical BRAT-only user, first run) — full
  //      onboarding: download binary → install-service → wait for ready,
  //      with a single sticky Notice carrying stage-by-stage progress.
  //   4. CI / mock — OM_ALLOW_DIRECT_SPAWN=1 hands control to direct-spawn.
  async bootOmCore(): Promise<void> {
    if (!this.omCore) {
      this.omCore = new OmCoreLifecycle(this.app, this)
    }
    const status = this.omCore.getStatus()
    if (status.kind === 'running' || status.kind === 'starting') return

    if (this.settings.kogcatEngineExternal) {
      await this.omCore.attachExternal(this.settings.omCorePort)
      const s = this.omCore.getStatus()
      if (s.kind === 'failed') {
        new Notice(t('notice:engine.unreachable', { message: s.message }))
        return
      }
      this.finalizePromptCacheAfterBoot()
      return
    }

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
      console.info('[KogCat] onboarding:', msg)
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
        app: this.app,
        plugin: this,
        override: this.settings.omCorePath || null,
      })
      if (ensured.kind === 'failed') {
        fail(ensured.message)
        return
      }

      stage(t('onboarding:registeringService'))
      const outcome = await ensureServiceCurrent(ensured.binaryPath)
      if (outcome.kind === 'failed') {
        fail(t('onboarding:serviceRegisterFailed', { message: outcome.message }))
        return
      }
      if (outcome.kind === 'skipped' && outcome.reason === 'unsupported-platform') {
        fail(t('onboarding:platformUnsupported', { platform: process.platform }))
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
      app: this.app,
      plugin: this,
      override: this.settings.omCorePath || null,
    })
    if (ensured.kind === 'failed') {
      new Notice(t('notice:engine.unavailable', { message: ensured.message }))
      return
    }
    await this.omCore.directSpawn(ensured.binaryPath, {
      binaryPathOverride: this.settings.omCorePath || null,
      externalPort: this.settings.omCorePort || null,
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

    this.vaultIndexScheduler?.cleanup()
    this.vaultIndexScheduler = null

    this.ragEngine?.cleanup()
    this.ragEngine = null

    this.dbManagerInitPromise = null
    this.ragEngineInitPromise = null

    this.dbManager?.cleanup()
    this.dbManager = null

    this.mcpManager?.cleanup()
    this.mcpManager = null

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
    this.ragEngine?.setSettings(newSettings)
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

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    this.initialChatProps = chatProps

    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }

  async getDbManager(): Promise<DatabaseManager> {
    if (this.dbManager) {
      return this.dbManager
    }

    if (!this.dbManagerInitPromise) {
      this.dbManagerInitPromise = (async () => {
        try {
          this.dbManager = await DatabaseManager.create(this.app)
          return this.dbManager
        } catch (error) {
          this.dbManagerInitPromise = null
          if (error instanceof PGLiteAbortedException) {
            new InstallerUpdateRequiredModal(this.app).open()
          }
          throw error
        }
      })()
    }

    return this.dbManagerInitPromise
  }

  async getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) {
      return this.ragEngine
    }

    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = (async () => {
        try {
          const dbManager = await this.getDbManager()
          this.ragEngine = new RAGEngine(
            this.app,
            this.settings,
            dbManager.getVectorManager(),
          )
          return this.ragEngine
        } catch (error) {
          this.ragEngineInitPromise = null
          throw error
        }
      })()
    }

    return this.ragEngineInitPromise
  }

  async getMcpManager(): Promise<McpManager> {
    if (this.mcpManager) {
      return this.mcpManager
    }

    try {
      this.mcpManager = new McpManager({
        settings: this.settings,
        registerSettingsListener: (
          listener: (settings: SmartComposerSettings) => void,
        ) => this.addSettingsChangeListener(listener),
      })
      await this.mcpManager.initialize()
      return this.mcpManager
    } catch (error) {
      this.mcpManager = null
      throw error
    }
  }

  async restartOmCore(): Promise<void> {
    // Reset (not replace) so listeners stay subscribed across restart.
    this.omCore?.reset()
    this.promptCache = null
    await this.bootOmCore()
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
    const base = (this.app.vault.adapter as unknown as { basePath?: string })
      .basePath
    if (!base || !this.manifest.dir) {
      new Notice(t('notice:engine.logPathUnavailable'))
      return
    }
    const logPath = path.join(base, this.manifest.dir, 'logs', 'om-core.log')
    await openPathWithDefaultApp(this.app, logPath)
  }

  private registerTimeout(callback: () => void, timeout: number): void {
    const timeoutId = setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }

  private async migrateToJsonStorage() {
    try {
      const dbManager = await this.getDbManager()
      await migrateToJsonDatabase(this.app, dbManager, async () => {
        await this.reloadChatView()
        console.log('Migration to JSON storage completed successfully')
      })
    } catch (error) {
      console.error('Failed to migrate to JSON storage:', error)
      new Notice(t('notice:migration.failed'))
    }
  }

  private async reloadChatView() {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      return
    }
    new Notice(t('notice:migration.reloading'), 1000)
    leaves[0].detach()
    await this.activateChatView()
  }
}
