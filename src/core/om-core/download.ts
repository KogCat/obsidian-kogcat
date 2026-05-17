import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

import { App, Notice, Plugin, requestUrl } from 'obsidian'

import { t } from '../../i18n'

const RELEASE_OWNER = 'KogCat'
const RELEASE_REPO = 'om-core-binaries'

// Fallback floor — the exact om-core version this plugin build ships as
// known-good. The rolling channel (see fetchChannel) supersedes it whenever
// reachable; REQUIRED_CORE_VERSION is the offline / channel-down fallback.
// Bump together with REQUIRED_SPEC when the engine crosses a schema break.
export const REQUIRED_CORE_VERSION = '0.34.0'

const RELEASE_TAG_SUFFIX = ''

// om-core spec contract; cross-checked against aggregate-manifest.spec and
// every channel release entry. Sourced from om-core's `SCHEMA_VERSION`
// constant — release_manifest.py writes it into every per-target manifest,
// build_aggregate_manifest.py / build_channel.py assert cross-target
// consistency.
const REQUIRED_SPEC = '19'

// aggregate-manifest.json schema (single-version fallback asset).
// v2 adds the per-target `format` field (onedir bundle distribution).
const SUPPORTED_SCHEMA_VERSION = 2
// channel.json schema (rolling multi-version index — build_channel.py).
// v3 adds the per-target `format` field.
const SUPPORTED_CHANNEL_SCHEMA = 3

type TargetTriple =
  | 'aarch64-apple-darwin'
  | 'x86_64-apple-darwin'
  | 'x86_64-pc-windows-msvc'

// `tar.xz` → an --onedir bundle archive: extract, then run <dir>/om-core-bin.
// Absent/other → a legacy raw single-file executable.
type AssetFormat = 'tar.xz'

interface AggregateManifestTarget {
  asset_name: string
  url: string
  sha256: string
  size_bytes: number
  format?: AssetFormat
}

interface AggregateManifest {
  schema_version: number
  om_core_version: string
  spec: string
  targets: Partial<Record<TargetTriple, AggregateManifestTarget>>
}

interface ChannelRelease {
  om_core_version: string
  spec: string
  targets: Partial<Record<TargetTriple, AggregateManifestTarget>>
}

export interface Channel {
  schema_version: number
  releases: ChannelRelease[]
}

export type EnsureBinaryResult =
  | { kind: 'ready'; binaryPath: string }
  | { kind: 'failed'; message: string }

interface ResolvedRelease {
  version: string
  entry: AggregateManifestTarget
}

export async function ensureOmCoreBinary(args: {
  app: App
  plugin: Plugin
  override: string | null
}): Promise<EnsureBinaryResult> {
  const { app, plugin, override } = args
  if (override && override.length > 0) {
    if (await pathExists(override)) {
      return { kind: 'ready', binaryPath: override }
    }
    return {
      kind: 'failed',
      message: `Configured om-core path does not exist: ${override}`,
    }
  }

  const triple = detectTargetTriple()
  if (!triple) {
    return {
      kind: 'failed',
      message:
        `Unsupported platform: ${process.platform}/${process.arch}. ` +
        'V1.x ships macOS (arm64/x64) and Windows x64 only.',
    }
  }

  // Resolve which version to install: channel-first, falling back to the
  // bundled REQUIRED_CORE_VERSION when the channel is unreachable or carries
  // no spec-compatible release for this target.
  const resolved = await resolveRelease(triple)
  if (!resolved) {
    return {
      kind: 'failed',
      message:
        `Could not resolve an om-core release for ${triple} — the channel ` +
        `and the v${REQUIRED_CORE_VERSION} fallback are both unavailable ` +
        `(network unreachable, or no release ships spec ${REQUIRED_SPEC}).`,
    }
  }
  const { version, entry } = resolved
  const isBundle = entry.format === 'tar.xz'

  // Version-scoped: never overwrite an old install in place.
  const binDir = path.join(getPluginDir(app, plugin), 'bin', version)
  await fs.mkdir(binDir, { recursive: true })
  // Raw mode: <binDir>/om-core-<triple>[.exe]. Bundle mode: extracted onedir
  // at <binDir>/bundle/, whose root holds the runnable `om-core-bin`.
  const binaryPath = isBundle
    ? path.join(binDir, 'bundle', 'om-core-bin')
    : path.join(
        binDir,
        triple.includes('windows')
          ? `om-core-${triple}.exe`
          : `om-core-${triple}`,
      )

  // Presence in version-scoped path implies prior sha256-verified install.
  if (await pathExists(binaryPath)) {
    return { kind: 'ready', binaryPath }
  }

  const notice = new Notice(t('notice:engine.downloading', { version }), 0)
  try {
    const tmpPath = await downloadAsset(entry.url, entry.asset_name)
    if (!tmpPath) {
      return {
        kind: 'failed',
        message: 'Could not download om-core binary (network unreachable?)',
      }
    }
    const got = await sha256OfFile(tmpPath)
    if (got !== entry.sha256) {
      await safeUnlink(tmpPath)
      return {
        kind: 'failed',
        message:
          `om-core checksum mismatch — refusing to install ` +
          `(expected ${entry.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…)`,
      }
    }

    if (isBundle) {
      await installBundle(tmpPath, path.join(binDir, 'bundle'))
    } else {
      // Atomic install: rename avoids a half-written file at binaryPath.
      await fs.rename(tmpPath, binaryPath)
      if (process.platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755)
      }
    }
    notice.setMessage(`KogCat engine installed (${version})`)
    setTimeout(() => notice.hide(), 1500)
    return { kind: 'ready', binaryPath }
  } catch (err) {
    return {
      kind: 'failed',
      message: err instanceof Error ? err.message : String(err),
    }
  } finally {
    notice.hide()
  }
}

// Extract a `tar.xz` onedir bundle into `bundleDir`. The archive root carries
// `om-core-bin` plus an `_internal/` library tree. Electron has no stdlib xz
// codec, so we shell out to the system `tar` (macOS bsdtar and Linux GNU tar
// both honour `-J`/xz); the plugin already spawns the sidecar, so child_process
// is an established pattern. Extracts to a staging dir, then atomically renames
// into place so a running sidecar is never disturbed by a half-extracted tree.
export async function installBundle(
  archivePath: string,
  bundleDir: string,
): Promise<void> {
  const stagingDir = `${bundleDir}.staging-${Date.now()}`
  try {
    await fs.mkdir(stagingDir, { recursive: true })
    await execFileAsync('tar', ['-xJf', archivePath, '-C', stagingDir])
    // Tolerate an archive that wraps its payload in a single top-level dir.
    let payloadDir = stagingDir
    const exeAtRoot = path.join(stagingDir, 'om-core-bin')
    if (!(await pathExists(exeAtRoot))) {
      const entries = await fs.readdir(stagingDir)
      if (entries.length === 1) {
        const nested = path.join(stagingDir, entries[0])
        if (await pathExists(path.join(nested, 'om-core-bin'))) {
          payloadDir = nested
        }
      }
    }
    const exePath = path.join(payloadDir, 'om-core-bin')
    if (!(await pathExists(exePath))) {
      throw new Error(
        'om-core bundle archive has no om-core-bin executable at its root',
      )
    }
    if (process.platform !== 'win32') {
      await fs.chmod(exePath, 0o755)
    }
    // Atomic swap into the version-scoped path.
    await safeRmdir(bundleDir)
    await fs.rename(payloadDir, bundleDir)
  } finally {
    await safeRmdir(stagingDir)
    await safeUnlink(archivePath)
  }
}

// Resolve which om-core release to install. Channel-first: the rolling
// channel.json carries every currently-served version, so a newer binary is
// picked up without a plugin release. Falls back to the bundled
// REQUIRED_CORE_VERSION (via its tagged aggregate-manifest.json) when the
// channel is unreachable or has no spec-compatible release for this target.
async function resolveRelease(
  triple: TargetTriple,
): Promise<ResolvedRelease | null> {
  const channel = await fetchChannel()
  if (channel) {
    const picked = pickFromChannel(channel, triple)
    if (picked) return picked
  }

  const manifest = await fetchAggregateManifest(REQUIRED_CORE_VERSION)
  if (!manifest) return null
  if (manifest.schema_version !== SUPPORTED_SCHEMA_VERSION) return null
  if (manifest.spec !== REQUIRED_SPEC) return null
  const entry = manifest.targets[triple]
  if (!entry || !entry.url || !entry.sha256) return null
  return { version: REQUIRED_CORE_VERSION, entry }
}

// Highest channel release that ships spec REQUIRED_SPEC, is not older than
// REQUIRED_CORE_VERSION, and carries a binary for `triple`. spec equality is
// the schema-break gate; the version floor blocks a downgrade below the
// build's known-good baseline.
export function pickFromChannel(
  channel: Channel,
  triple: TargetTriple,
): ResolvedRelease | null {
  if (channel.schema_version !== SUPPORTED_CHANNEL_SCHEMA) return null
  if (!Array.isArray(channel.releases)) return null
  let best: ResolvedRelease | null = null
  for (const r of channel.releases) {
    if (!r || r.spec !== REQUIRED_SPEC) continue
    if (compareSemver(r.om_core_version, REQUIRED_CORE_VERSION) < 0) continue
    const entry = r.targets?.[triple]
    if (!entry || !entry.url || !entry.sha256) continue
    if (!best || compareSemver(r.om_core_version, best.version) > 0) {
      best = { version: r.om_core_version, entry }
    }
  }
  return best
}

async function fetchChannel(): Promise<Channel | null> {
  const url =
    `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/` +
    `download/channel/channel.json`
  try {
    const res = await requestUrl({ url, method: 'GET' })
    return res.json as Channel
  } catch {
    return null
  }
}

// Throttled to once per 24h; surfaces "newer plugin available" hints only.
export async function checkForCoreUpdate(args: {
  lastCheckMs: number
  installedVersion: string | undefined
}): Promise<{ latest: string; needsUpdate: boolean } | null> {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
  if (Date.now() - args.lastCheckMs < TWENTY_FOUR_HOURS) return null
  try {
    const res = await requestUrl({
      url: `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`,
      method: 'GET',
    })
    const tag = ((res.json as { tag_name?: string })?.tag_name ?? '').replace(
      /^v/,
      '',
    )
    if (!tag) return null
    const baseline = args.installedVersion ?? REQUIRED_CORE_VERSION
    return {
      latest: tag,
      needsUpdate: compareSemver(baseline, tag) < 0,
    }
  } catch {
    return null
  }
}

async function fetchAggregateManifest(
  version: string,
): Promise<AggregateManifest | null> {
  const url = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/download/v${version}${RELEASE_TAG_SUFFIX}/aggregate-manifest.json`
  try {
    const res = await requestUrl({ url, method: 'GET' })
    return res.json as AggregateManifest
  } catch {
    return null
  }
}

async function downloadAsset(
  url: string,
  assetName: string,
): Promise<string | null> {
  try {
    const dl = await requestUrl({ url, method: 'GET' })
    // Buffer to system temp; caller verifies sha256 before rename.
    const tmpPath = path.join(
      os.tmpdir(),
      `${assetName}-${Date.now()}.download`,
    )
    await fs.writeFile(tmpPath, Buffer.from(dl.arrayBuffer))
    return tmpPath
  } catch {
    return null
  }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

function detectTargetTriple(): TargetTriple | null {
  if (process.platform === 'darwin' && process.arch === 'arm64')
    return 'aarch64-apple-darwin'
  if (process.platform === 'darwin' && process.arch === 'x64')
    return 'x86_64-apple-darwin'
  if (process.platform === 'win32' && process.arch === 'x64')
    return 'x86_64-pc-windows-msvc'
  return null
}

function getPluginDir(app: App, plugin: Plugin): string {
  const base = (app.vault.adapter as unknown as { basePath?: string }).basePath
  if (!base) throw new Error('Vault basePath unavailable')
  return path.join(base, plugin.manifest.dir ?? '')
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function sha256OfFile(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p)
  } catch {
    /* ignore */
  }
}

async function safeRmdir(p: string): Promise<void> {
  try {
    await fs.rm(p, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

const execFileAsync = promisify(execFile)
