import { ChildProcess, spawn } from 'child_process'
import { promises as fs, openSync } from 'fs'
import path from 'path'

import { App, Plugin } from 'obsidian'

import {
  OmCoreAuth,
  OmCoreTransport,
  OmSidecarUnavailable,
  describeTransport,
  directSpawnEnabled,
  pickTransport,
  readServerJson,
  requestOmCore,
  transportToAuth,
} from './transport'

const HEALTH_RETRIES = 3
const HEALTH_INTERVAL_MS = 500
const SERVER_JSON_POLL_INTERVAL_MS = 250
const SERVER_JSON_POLL_TIMEOUT_MS = 30_000
const KILL_GRACE_MS = 3000
const LOG_MAX_BYTES = 5 * 1024 * 1024
const LOG_TRUNCATE_TARGET = 1 * 1024 * 1024
// om-core uses a series-reset api_minor model: __api_minor__ resets to 0 at
// the start of each new (major, minor) series and counts additive bumps
// within it, so api_minor is not comparable across series. We anchor on a
// minimum (major, minor) series parsed from the healthz `version` field,
// plus a minimum api_minor *within* that series.
//
// This is the run gate; download.ts REQUIRED_CORE_VERSION must stay >= the
// version that satisfies it so the download layer only fetches binaries that
// pass this gate.
const MIN_REQUIRED_SERIES: readonly [number, number] = [0, 36]
const MIN_REQUIRED_API_MINOR = 7

function parseSeries(version: string | undefined): [number, number] | null {
  if (!version) return null
  const parts = version.split('.')
  if (parts.length < 2) return null
  const major = Number.parseInt(parts[0], 10)
  const minor = Number.parseInt(parts[1], 10)
  if (Number.isNaN(major) || Number.isNaN(minor)) return null
  return [major, minor]
}

type CompatCheck = { ok: true } | { ok: false; message: string }

function checkCompat(
  version: string | undefined,
  apiMinor: number | undefined,
): CompatCheck {
  const series = parseSeries(version)
  if (series === null) {
    return {
      ok: false,
      message:
        `om-core version=${version ?? 'unknown'} is unparseable. ` +
        'Expected semver X.Y.Z. Reinstall the KogCat engine.',
    }
  }
  const reqSeries = `${MIN_REQUIRED_SERIES[0]}.${MIN_REQUIRED_SERIES[1]}.x`
  if (
    series[0] < MIN_REQUIRED_SERIES[0] ||
    (series[0] === MIN_REQUIRED_SERIES[0] && series[1] < MIN_REQUIRED_SERIES[1])
  ) {
    return {
      ok: false,
      message:
        `om-core version=${version ?? 'unknown'} (series ${series[0]}.${series[1]}.x) but ` +
        `Obsidian wrapper requires >= ${reqSeries}. Upgrade the KogCat engine.`,
    }
  }
  if (
    series[0] === MIN_REQUIRED_SERIES[0] &&
    series[1] === MIN_REQUIRED_SERIES[1] &&
    (apiMinor ?? 0) < MIN_REQUIRED_API_MINOR
  ) {
    return {
      ok: false,
      message:
        `om-core api_minor=${apiMinor ?? 'unknown'} in series ${series[0]}.${series[1]}.x ` +
        `but Obsidian wrapper requires >= ${MIN_REQUIRED_API_MINOR} within this series.`,
    }
  }
  return { ok: true }
}

export type OmCoreStatus =
  | { kind: 'stopped' }
  | { kind: 'starting' }
  | {
      kind: 'running'
      pid: number
      transport: OmCoreTransport
      version?: string
    }
  | { kind: 'failed'; message: string }

export type { OmCoreAuth } from './transport'

export type OmCoreLifecycleOptions = {
  binaryPathOverride: string | null
  omPluginRoot?: string | null
}

export class OmCoreLifecycle {
  private proc: ChildProcess | null = null
  private status: OmCoreStatus = { kind: 'stopped' }
  private listeners: ((s: OmCoreStatus) => void)[] = []
  private cleanupHandlers: (() => void)[] = []
  private auth: OmCoreAuth | null = null

  constructor(
    private app: App,
    private plugin: Plugin,
  ) {}

  getStatus(): OmCoreStatus {
    return this.status
  }

  getAuth(): OmCoreAuth | null {
    return this.auth
  }

  getEndpoint(): string | null {
    if (this.status.kind !== 'running') return null
    return describeTransport(this.status.transport)
  }

  subscribe(listener: (s: OmCoreStatus) => void): () => void {
    this.listeners.push(listener)
    listener(this.status)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private setStatus(s: OmCoreStatus) {
    this.status = s
    this.listeners.forEach((l) => l(s))
  }

  private get pluginDir(): string {
    const base = (this.app.vault.adapter as unknown as { basePath?: string })
      .basePath
    if (!base) throw new Error('Vault basePath unavailable')
    return path.join(base, this.plugin.manifest.dir ?? '')
  }

  private get logPath(): string {
    return path.join(this.pluginDir, 'logs', 'om-core.log')
  }

  // `waitForServerJsonMs`: if > 0, poll server.json + transport liveness up to
  // that budget before declaring "no service". Used right after install-service
  // when launchd hasn't yet spawned the sidecar.
  async attachSupervised(opts?: {
    waitForServerJsonMs?: number
  }): Promise<void> {
    this.setStatus({ kind: 'starting' })

    const waitBudgetMs = Math.max(0, opts?.waitForServerJsonMs ?? 0)
    const cfg = await waitForLiveServerJson(waitBudgetMs)

    if (cfg) {
      try {
        const transport = pickTransport(cfg)
        const auth = transportToAuth(transport, cfg.token ?? '')
        const healthy = await waitForHealth(auth)
        if (!healthy) {
          this.setStatus({
            kind: 'failed',
            message: 'om-core listener responded but /healthz did not',
          })
          return
        }
        const reportedVersion = cfg.binary_version ?? healthy.version
        const apiMinor = healthy.api_minor ?? cfg.api_minor
        const compat = checkCompat(reportedVersion, apiMinor)
        if (!compat.ok) {
          this.setStatus({ kind: 'failed', message: compat.message })
          return
        }
        this.auth = auth
        this.setStatus({
          kind: 'running',
          pid: cfg.pid ?? -1,
          transport,
          version: reportedVersion,
        })
        return
      } catch (e) {
        this.setStatus({
          kind: 'failed',
          message: e instanceof Error ? e.message : String(e),
        })
        return
      }
    }
    if (directSpawnEnabled()) {
      console.warn(
        'WARNING om: OM_ALLOW_DIRECT_SPAWN=1 active; bypassing supervisor lifecycle (advanced / CI use only).',
      )
      this.setStatus({ kind: 'failed', message: 'pending direct spawn' })
      return
    }
    // Neutral message — onboarding flow in main.ts decides whether to surface
    // "service not yet installed" vs "service installed but not coming up".
    this.setStatus({
      kind: 'failed',
      message:
        waitBudgetMs > 0
          ? `om-core service did not become ready within ${Math.round(waitBudgetMs / 1000)}s`
          : 'om-core service not running',
    })
  }

  // Clean stopped state without dropping listeners (subscribers survive restart).
  reset(): void {
    this.kill()
    this.auth = null
    this.setStatus({ kind: 'stopped' })
  }

  async directSpawn(
    binaryPath: string,
    opts: OmCoreLifecycleOptions,
  ): Promise<void> {
    if (!directSpawnEnabled()) {
      this.setStatus({
        kind: 'failed',
        message:
          'directSpawn called without OM_ALLOW_DIRECT_SPAWN=1 — refusing.',
      })
      return
    }
    if (this.proc) return
    this.setStatus({ kind: 'starting' })

    await fs.mkdir(path.dirname(this.logPath), { recursive: true })
    await rotateLog(this.logPath)
    const logFd = openSync(this.logPath, 'a')

    const spawnTimeMs = Date.now()
    const isWin = process.platform === 'win32'
    const omPluginRoot = opts.omPluginRoot ?? null
    const proc = spawn(binaryPath, ['serve'], {
      stdio: ['ignore', logFd, logFd],
      detached: !isWin,
      windowsHide: true,
      env: {
        ...process.env,
        ...(omPluginRoot ? { OM_PLUGIN_ROOT: omPluginRoot } : {}),
      },
    })

    this.proc = proc
    proc.on('exit', (code, signal) => {
      this.proc = null
      this.auth = null
      this.setStatus({
        kind: 'failed',
        message: `om-core exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      })
    })
    proc.on('error', (err) => {
      this.proc = null
      this.auth = null
      this.setStatus({
        kind: 'failed',
        message: `om-core spawn error: ${err.message}`,
      })
    })

    if (proc.pid === undefined) {
      this.setStatus({
        kind: 'failed',
        message: 'om-core spawn returned no pid',
      })
      this.kill()
      return
    }

    const cfg = await waitForServerJson(
      spawnTimeMs,
      SERVER_JSON_POLL_TIMEOUT_MS,
    )
    if (!cfg) {
      this.setStatus({
        kind: 'failed',
        message:
          `om-core never wrote server.json within ` +
          `${SERVER_JSON_POLL_TIMEOUT_MS / 1000}s (check ${this.logPath}).`,
      })
      this.kill()
      return
    }

    let transport: OmCoreTransport
    try {
      transport = pickTransport(cfg)
    } catch (e) {
      this.setStatus({
        kind: 'failed',
        message: e instanceof Error ? e.message : String(e),
      })
      this.kill()
      return
    }
    const auth = transportToAuth(transport, cfg.token ?? '')
    const healthy = await waitForHealth(auth)
    if (!healthy) {
      this.setStatus({
        kind: 'failed',
        message: `om-core wrote server.json but /healthz did not respond`,
      })
      this.kill()
      return
    }
    const reportedVersion = cfg.binary_version ?? healthy.version
    const apiMinor = healthy.api_minor ?? cfg.api_minor
    const compat = checkCompat(reportedVersion, apiMinor)
    if (!compat.ok) {
      this.setStatus({ kind: 'failed', message: compat.message })
      this.kill()
      return
    }

    this.auth = auth
    this.setStatus({
      kind: 'running',
      pid: proc.pid,
      transport,
      version: cfg.binary_version ?? healthy.version,
    })

    this.installCleanupHandlers()
  }

  installCleanupHandlers(): void {
    if (this.cleanupHandlers.length > 0) return

    const beforeUnload = () => this.kill()
    window.addEventListener('beforeunload', beforeUnload)
    this.cleanupHandlers.push(() =>
      window.removeEventListener('beforeunload', beforeUnload),
    )

    const quitRef = this.app.workspace.on('quit', () => this.kill())
    this.plugin.registerEvent(quitRef)
    this.cleanupHandlers.push(() => this.app.workspace.offref(quitRef))
  }

  kill(): void {
    if (!this.proc) {
      // Supervised mode: no owned proc, just drop refs.
      this.auth = null
      this.setStatus({ kind: 'stopped' })
      return
    }
    const proc = this.proc
    const pid = proc.pid

    try {
      if (process.platform === 'win32') {
        proc.kill('SIGTERM')
      } else if (pid) {
        try {
          process.kill(-pid, 'SIGTERM')
        } catch {
          proc.kill('SIGTERM')
        }
      } else {
        proc.kill('SIGTERM')
      }
    } catch {
      // already gone
    }

    setTimeout(() => {
      if (!this.proc || this.proc !== proc) return
      try {
        if (process.platform !== 'win32' && pid) {
          try {
            process.kill(-pid, 'SIGKILL')
          } catch {
            proc.kill('SIGKILL')
          }
        } else {
          proc.kill('SIGKILL')
        }
      } catch {
        // ignore
      }
    }, KILL_GRACE_MS)

    this.proc = null
    this.auth = null
    this.setStatus({ kind: 'stopped' })

    this.cleanupHandlers.forEach((fn) => {
      try {
        fn()
      } catch {
        // ignore
      }
    })
    this.cleanupHandlers = []
  }
}

// Poll readServerJson + transport probe until one is live or the budget runs
// out. `budgetMs=0` falls back to a single read.
async function waitForLiveServerJson(
  budgetMs: number,
): Promise<Awaited<ReturnType<typeof readServerJson>>> {
  const deadline = Date.now() + budgetMs
  // First read is unconditional so budget=0 path matches old semantics.
  let cfg = await readServerJson()
  if (cfg && (await transportProbeAlive(cfg))) return cfg
  while (Date.now() < deadline) {
    await sleep(SERVER_JSON_POLL_INTERVAL_MS)
    cfg = await readServerJson()
    if (cfg && (await transportProbeAlive(cfg))) return cfg
  }
  return null
}

async function transportProbeAlive(cfg: {
  transport?: string
  socket_path?: string
  pipe_name?: string
}): Promise<boolean> {
  if (cfg.transport === 'uds') {
    if (typeof cfg.socket_path !== 'string') return false
    return udsListenerAlive(cfg.socket_path)
  }
  if (cfg.transport === 'npipe') {
    if (typeof cfg.pipe_name !== 'string') return false
    return socketPathListenerAlive(cfg.pipe_name)
  }
  return false
}

function udsListenerAlive(socketPath: string): Promise<boolean> {
  return socketPathListenerAlive(socketPath)
}

function socketPathListenerAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy Node builtin, desktop-only runtime
    const net = require('net') as typeof import('net')
    const sock = net.createConnection({ path: socketPath })
    let done = false
    const finish = (alive: boolean) => {
      if (done) return
      done = true
      try {
        sock.destroy()
      } catch {
        // ignore
      }
      resolve(alive)
    }
    sock.once('connect', () => finish(true))
    sock.once('error', () => finish(false))
    setTimeout(() => finish(false), 500)
  })
}

async function waitForServerJson(
  spawnTimeMs: number,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof readServerJson>>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const cfg = await readServerJson()
    if (cfg) {
      const writtenAt = cfg.started_at ? Date.parse(cfg.started_at) : 0
      if (writtenAt >= spawnTimeMs - 2000) {
        return cfg
      }
    }
    await sleep(SERVER_JSON_POLL_INTERVAL_MS)
  }
  return null
}

async function waitForHealth(
  auth: OmCoreAuth,
): Promise<{ version?: string; api_minor?: number } | null> {
  for (let i = 0; i < HEALTH_RETRIES; i++) {
    try {
      const res = await requestOmCore(auth, {
        method: 'GET',
        path: '/healthz',
        timeoutMs: 2000,
      })
      if (res.status >= 200 && res.status < 300) {
        const body = (res.json ?? {}) as {
          version?: string
          api_minor?: number
        }
        return { version: body.version, api_minor: body.api_minor }
      }
    } catch {
      // pending
    }
    await sleep(HEALTH_INTERVAL_MS)
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function rotateLog(logPath: string): Promise<void> {
  try {
    const stat = await fs.stat(logPath)
    if (stat.size <= LOG_MAX_BYTES) return
    const fd = await fs.open(logPath, 'r')
    const tail = Buffer.alloc(LOG_TRUNCATE_TARGET)
    const offset = Math.max(0, stat.size - LOG_TRUNCATE_TARGET)
    await fd.read(tail, 0, LOG_TRUNCATE_TARGET, offset)
    await fd.close()
    await fs.writeFile(logPath, tail)
  } catch {
    // missing file is fine
  }
}

export { OmSidecarUnavailable }
