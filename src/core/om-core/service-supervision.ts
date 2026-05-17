import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// Pre-0.27 launchd plists used `KeepAlive: {SuccessfulExit:false,Crashed:true}`,
// which silently skips respawn on graceful SIGTERM. Probe + reinstall on stale
// plist; reinstall is idempotent.

const LAUNCHD_LABEL = 'com.kogcat.om'

function plistPath(): string {
  return path.join(
    os.homedir(),
    'Library',
    'LaunchAgents',
    `${LAUNCHD_LABEL}.plist`,
  )
}

// True iff plist has unconditional `KeepAlive: <true/>`. Any "not sure" → false.
async function plistIsCurrent(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  let xml: string
  try {
    xml = await fs.readFile(plistPath(), 'utf8')
  } catch {
    return false
  }
  // Regex scan: om-core installer always writes literal `<true/>`.
  const m = xml.match(/<key>KeepAlive<\/key>\s*([\s\S]*?)(?=<key>|<\/dict>)/i)
  if (!m) return false
  const valueBlock = m[1].trim()
  return /^<true\/>/.test(valueBlock)
}

async function systemdUnitExists(): Promise<boolean> {
  const unit = path.join(
    os.homedir(),
    '.config',
    'systemd',
    'user',
    'om.service',
  )
  try {
    await fs.access(unit)
    return true
  } catch {
    return false
  }
}

function runInstallService(binaryPath: string, timeoutMs = 45_000): Promise<{
  ok: boolean
  message: string
}> {
  return new Promise((resolve) => {
    const proc = spawn(binaryPath, ['install-service'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    proc.stdout?.on('data', (c: Buffer) => out.push(c))
    proc.stderr?.on('data', (c: Buffer) => err.push(c))
    let settled = false
    const finish = (ok: boolean, message: string) => {
      if (settled) return
      settled = true
      try {
        proc.kill('SIGKILL')
      } catch {
        // already gone
      }
      resolve({ ok, message })
    }
    const timer = setTimeout(
      () => finish(false, `install-service timeout after ${timeoutMs}ms`),
      timeoutMs,
    )
    proc.on('exit', (code) => {
      clearTimeout(timer)
      const stderr = Buffer.concat(err).toString('utf8').trim()
      const stdout = Buffer.concat(out).toString('utf8').trim()
      if (code === 0) finish(true, stdout || 'installed')
      else finish(false, `rc=${code} ${stderr || stdout}`)
    })
    proc.on('error', (e) => {
      clearTimeout(timer)
      finish(false, e.message)
    })
  })
}

export type EnsureServiceOutcome =
  | { kind: 'noop'; reason: 'not-darwin' | 'plist-current' | 'unit-current' }
  | { kind: 'reinstalled'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'skipped'; reason: 'no-binary' | 'unsupported-platform' }

// Best-effort: keep supervisor's on-disk schema in lockstep with om-core binary.
export async function ensureServiceCurrent(
  binaryPath: string | null,
): Promise<EnsureServiceOutcome> {
  if (process.platform === 'darwin') {
    if (await plistIsCurrent()) {
      return { kind: 'noop', reason: 'plist-current' }
    }
    if (!binaryPath) {
      return { kind: 'skipped', reason: 'no-binary' }
    }
    const r = await runInstallService(binaryPath)
    return r.ok
      ? { kind: 'reinstalled', message: r.message }
      : { kind: 'failed', message: r.message }
  }
  if (process.platform === 'linux') {
    if (await systemdUnitExists()) {
      return { kind: 'noop', reason: 'unit-current' }
    }
    if (!binaryPath) return { kind: 'skipped', reason: 'no-binary' }
    const r = await runInstallService(binaryPath)
    return r.ok
      ? { kind: 'reinstalled', message: r.message }
      : { kind: 'failed', message: r.message }
  }
  return { kind: 'skipped', reason: 'unsupported-platform' }
}
