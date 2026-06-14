import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// Keep the OS supervisor registered against the STABLE `current` pointer
// (om-paths.currentBinPath, passed in as binaryPath), so a binary upgrade is a
// single pointer swap — no plist/task rewrite. Because ob and the CC plugin
// share one cache + one `current`, they register identical entries (idempotent,
// no fight). Detection = "does the registration already reference this path?"
// via a locale-independent substring match on the plist/unit/schtasks/Run-key
// output; otherwise (re)install through the om-core CLI, which writes the path
// and — on Windows — falls back to the HKCU Run key when schtasks is unavailable.

const LAUNCHD_LABEL = 'com.kogcat.om'
// Mirror om-core service_windows.py TASK_NAME / Run-key value name.
const SCHEDULED_TASK_NAME = 'OmCore'
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

function plistPath(): string {
  return path.join(
    os.homedir(),
    'Library',
    'LaunchAgents',
    `${LAUNCHD_LABEL}.plist`,
  )
}

function systemdUnitPath(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user', 'om.service')
}

// launchd: plist references binaryPath AND has unconditional KeepAlive <true/>
// (pre-0.27 plists used a conditional KeepAlive that skips respawn on SIGTERM).
async function plistRegisteredFor(binaryPath: string): Promise<boolean> {
  let xml: string
  try {
    xml = await fs.readFile(plistPath(), 'utf8')
  } catch {
    return false
  }
  if (!xml.includes(binaryPath)) return false
  const m = xml.match(/<key>KeepAlive<\/key>\s*([\s\S]*?)(?=<key>|<\/dict>)/i)
  return !!m && m[1].trim().startsWith('<true/>')
}

async function systemdRegisteredFor(binaryPath: string): Promise<boolean> {
  try {
    const unit = await fs.readFile(systemdUnitPath(), 'utf8')
    return unit.includes(binaryPath)
  } catch {
    return false
  }
}

// Windows: a registered supervisor entry (schtasks task OR HKCU Run key)
// references binaryPath. Substring match on raw output → locale-independent
// (om-core registers schtasks when available, else the Run key).
async function windowsRegisteredFor(binaryPath: string): Promise<boolean> {
  const want = binaryPath.toLowerCase()
  if (
    await outputIncludes(
      'schtasks.exe',
      ['/Query', '/TN', SCHEDULED_TASK_NAME, '/FO', 'LIST', '/V'],
      want,
    )
  ) {
    return true
  }
  return outputIncludes(
    'reg.exe',
    ['query', RUN_KEY, '/v', SCHEDULED_TASK_NAME],
    want,
  )
}

function outputIncludes(
  cmd: string,
  args: string[],
  needleLower: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    const out: Buffer[] = []
    proc.stdout?.on('data', (c: Buffer) => out.push(c))
    proc.on('exit', () =>
      resolve(
        Buffer.concat(out).toString('utf8').toLowerCase().includes(needleLower),
      ),
    )
    proc.on('error', () => resolve(false))
  })
}

function runServiceCommand(
  binaryPath: string,
  args: string[],
  timeoutMs = 45_000,
): Promise<{
  ok: boolean
  message: string
}> {
  return new Promise((resolve) => {
    const proc = spawn(binaryPath, args, {
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
      () => finish(false, `${args[0]} timeout after ${timeoutMs}ms`),
      timeoutMs,
    )
    proc.on('exit', (code) => {
      clearTimeout(timer)
      const stderr = Buffer.concat(err).toString('utf8').trim()
      const stdout = Buffer.concat(out).toString('utf8').trim()
      if (code === 0) finish(true, stdout || 'installed')
      else finish(false, `rc=${code ?? 'null'} ${stderr || stdout}`)
    })
    proc.on('error', (e) => {
      clearTimeout(timer)
      finish(false, e.message)
    })
  })
}

export type EnsureServiceOutcome =
  | {
      kind: 'noop'
      reason: 'plist-current' | 'unit-current' | 'task-current'
    }
  | { kind: 'reinstalled'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'skipped'; reason: 'no-binary' | 'unsupported-platform' }

// Ensure the OS supervisor is registered against `binaryPath` (the stable
// current pointer). No-op if it already references it; else (re)install.
export async function ensureServiceCurrent(
  binaryPath: string | null,
): Promise<EnsureServiceOutcome> {
  if (
    process.platform !== 'darwin' &&
    process.platform !== 'linux' &&
    process.platform !== 'win32'
  ) {
    return { kind: 'skipped', reason: 'unsupported-platform' }
  }
  if (!binaryPath) return { kind: 'skipped', reason: 'no-binary' }

  if (process.platform === 'darwin') {
    if (await plistRegisteredFor(binaryPath)) {
      return { kind: 'noop', reason: 'plist-current' }
    }
  } else if (process.platform === 'linux') {
    if (await systemdRegisteredFor(binaryPath)) {
      return { kind: 'noop', reason: 'unit-current' }
    }
  } else if (await windowsRegisteredFor(binaryPath)) {
    return { kind: 'noop', reason: 'task-current' }
  }

  const r = await runServiceCommand(binaryPath, ['install-service'])
  return r.ok
    ? { kind: 'reinstalled', message: r.message }
    : { kind: 'failed', message: r.message }
}

export async function activateService(
  binaryPath: string | null,
): Promise<EnsureServiceOutcome> {
  if (!binaryPath) return { kind: 'skipped', reason: 'no-binary' }
  if (
    process.platform !== 'darwin' &&
    process.platform !== 'linux' &&
    process.platform !== 'win32'
  ) {
    return { kind: 'skipped', reason: 'unsupported-platform' }
  }
  const r = await runServiceCommand(binaryPath, [
    'service-activate',
    '--bin',
    binaryPath,
  ])
  return r.ok
    ? { kind: 'reinstalled', message: r.message }
    : { kind: 'failed', message: r.message }
}
