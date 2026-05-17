import { App, EventRef, TAbstractFile, TFile } from 'obsidian'

import { QueryProgressState } from '../../components/chat-view/QueryProgress'

import { RAGEngine } from './ragEngine'

export type VaultIndexStatus =
  | {
      kind: 'idle'
    }
  | {
      kind: 'scheduled'
      reason: string
    }
  | {
      kind: 'indexing'
      reason: string
      completedChunks?: number
      totalChunks?: number
      totalFiles?: number
      waitingForRateLimit?: boolean
    }
  | {
      kind: 'error'
      message: string
    }

type VaultIndexStatusListener = (status: VaultIndexStatus) => void

type VaultIndexSchedulerOptions = {
  app: App
  getRAGEngine: () => Promise<RAGEngine>
  registerEvent: (eventRef: EventRef) => void
  debounceMs?: number
  scheduleOnStart?: boolean
  startupEventIgnoreWindowMs?: number
}

const DEFAULT_DEBOUNCE_MS = 5000
const DEFAULT_SCHEDULE_ON_START = false
const DEFAULT_STARTUP_EVENT_IGNORE_WINDOW_MS = 30000
const EVENT_MTIME_TOLERANCE_MS = 1000

export class VaultIndexScheduler {
  private app: App
  private getRAGEngine: () => Promise<RAGEngine>
  private registerEvent: (eventRef: EventRef) => void
  private debounceMs: number
  private listeners = new Set<VaultIndexStatusListener>()
  private status: VaultIndexStatus = { kind: 'idle' }
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false
  private running = false
  private queuedAfterCurrentRun = false
  private dirtyPaths = new Set<string>()
  private scheduleOnStart: boolean
  private startedAtMs = 0
  private startupEventIgnoreWindowMs: number

  constructor({
    app,
    getRAGEngine,
    registerEvent,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    scheduleOnStart = DEFAULT_SCHEDULE_ON_START,
    startupEventIgnoreWindowMs = DEFAULT_STARTUP_EVENT_IGNORE_WINDOW_MS,
  }: VaultIndexSchedulerOptions) {
    this.app = app
    this.getRAGEngine = getRAGEngine
    this.registerEvent = registerEvent
    this.debounceMs = debounceMs
    this.scheduleOnStart = scheduleOnStart
    this.startupEventIgnoreWindowMs = startupEventIgnoreWindowMs
  }

  start() {
    if (this.started) return
    this.started = true
    this.startedAtMs = Date.now()

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        this.scheduleForPossiblyStaleFileEvent('create', file)
      }),
    )
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        this.scheduleForPossiblyStaleFileEvent('modify', file)
      }),
    )
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.scheduleForFile('delete', file)
      }),
    )
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (this.isMarkdownFile(file) || oldPath.endsWith('.md')) {
          this.dirtyPaths.add(oldPath)
          if (this.isMarkdownFile(file)) {
            this.dirtyPaths.add(file.path)
          }
          this.schedule('rename')
        }
      }),
    )

    if (this.scheduleOnStart) {
      this.schedule('startup')
    }
  }

  cleanup() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.listeners.clear()
  }

  getStatus(): VaultIndexStatus {
    return this.status
  }

  subscribe(listener: VaultIndexStatusListener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  schedule(reason: string) {
    if (this.running) {
      this.queuedAfterCurrentRun = true
      this.setStatus({ kind: 'scheduled', reason })
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.setStatus({ kind: 'scheduled', reason })
    this.timer = setTimeout(() => {
      void this.runNow()
    }, this.debounceMs)
  }

  async runNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.running) {
      this.queuedAfterCurrentRun = true
      return
    }

    const reason =
      this.status.kind === 'scheduled' ? this.status.reason : 'manual'
    const dirtyPaths = [...this.dirtyPaths]
    this.dirtyPaths.clear()
    this.running = true
    this.setStatus({ kind: 'indexing', reason })
    try {
      const ragEngine = await this.getRAGEngine()
      if (dirtyPaths.length > 0) {
        await ragEngine.updateFilesIndex(dirtyPaths, (queryProgress) =>
          this.handleIndexProgress(reason, queryProgress),
        )
      } else {
        await ragEngine.updateVaultIndex(
          { reindexAll: false },
          (queryProgress) => this.handleIndexProgress(reason, queryProgress),
        )
      }
      this.setStatus({ kind: 'idle' })
    } catch (error) {
      dirtyPaths.forEach((path) => this.dirtyPaths.add(path))
      this.setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      this.running = false
      if (this.queuedAfterCurrentRun) {
        this.queuedAfterCurrentRun = false
        this.schedule('queued')
      }
    }
  }

  private scheduleForFile(reason: string, file: TAbstractFile) {
    if (!this.isMarkdownFile(file)) return
    this.dirtyPaths.add(file.path)
    this.schedule(reason)
  }

  private scheduleForPossiblyStaleFileEvent(
    reason: string,
    file: TAbstractFile,
  ) {
    if (!this.isMarkdownFile(file)) return
    if (this.isStaleStartupFileEvent(file)) return
    this.dirtyPaths.add(file.path)
    this.schedule(reason)
  }

  private isMarkdownFile(file: TAbstractFile | null | undefined): file is TFile {
    return (
      typeof file === 'object' &&
      file !== null &&
      'extension' in file &&
      file.extension === 'md'
    )
  }

  private isStaleStartupFileEvent(file: TFile): boolean {
    if (Date.now() - this.startedAtMs > this.startupEventIgnoreWindowMs) {
      return false
    }
    if (!file.stat) {
      return false
    }
    return file.stat.mtime < this.startedAtMs - EVENT_MTIME_TOLERANCE_MS
  }

  private handleIndexProgress(
    reason: string,
    queryProgress: QueryProgressState,
  ) {
    if (queryProgress.type !== 'indexing') return
    const { completedChunks, totalChunks, totalFiles, waitingForRateLimit } =
      queryProgress.indexProgress
    this.setStatus({
      kind: 'indexing',
      reason,
      completedChunks,
      totalChunks,
      totalFiles,
      waitingForRateLimit,
    })
  }

  private setStatus(status: VaultIndexStatus) {
    this.status = status
    this.listeners.forEach((listener) => listener(status))
  }
}
