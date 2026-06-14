import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'

import { Notice, requestUrl } from 'obsidian'

import { t } from '../../i18n'

import { downloadWithMirrors, extractZip, sha256OfFile } from './binary-fetch'
import {
  currentBinPath,
  currentVersion,
  ensureCurrentPointer,
  versionDir,
} from './om-paths'

const RELEASE_OWNER = 'KogCat'
const RELEASE_REPO = 'om-core-binaries'
const ALI_OSS_MIRROR_BASE_URL =
  'https://kogcat.oss-cn-beijing.aliyuncs.com/om-core'

// Fallback floor — the exact om-core version this plugin build ships as
// known-good. The rolling channel (see fetchChannel) supersedes it whenever
// reachable; REQUIRED_CORE_VERSION is the offline / channel-down fallback.
// Bump together with REQUIRED_SPEC when the engine crosses a schema break.
export const REQUIRED_CORE_VERSION = '0.36.43'

const RELEASE_TAG_SUFFIX = ''

// om-core spec contract. The release channel and every per-target manifest
// carry a matching `spec` field, cross-checked at fetch time. Bump together
// with REQUIRED_CORE_VERSION when the engine crosses a schema break.
const REQUIRED_SPEC = '22'

// aggregate-manifest.json schema (single-version fallback asset).
// v3 carries api_minor so clients can pre-filter known-too-old binaries.
const SUPPORTED_SCHEMA_VERSION = 3
// channel.json schema (rolling multi-version index).
// v3 adds the per-target `format` field.
const SUPPORTED_CHANNEL_SCHEMA = 3

type TargetTriple =
  | 'aarch64-apple-darwin'
  | 'x86_64-apple-darwin'
  | 'x86_64-pc-windows-msvc'

// `tar.xz` / `zip` → an --onedir bundle archive: extract, then run
// <dir>/om-core-bin[.exe]. macOS/Linux ship tar.xz, Windows ships zip.
// Absent/other → a legacy raw single-file executable.
type AssetFormat = 'tar.xz' | 'zip'

// Bundle executable name — PyInstaller appends .exe on Windows.
const BUNDLE_EXE =
  process.platform === 'win32' ? 'om-core-bin.exe' : 'om-core-bin'

type AggregateManifestTarget = {
  asset_name: string
  url: string
  sha256: string
  size_bytes: number
  format?: AssetFormat
}

type AggregateManifest = {
  schema_version: number
  om_core_version: string
  spec: string
  targets: Partial<Record<TargetTriple, AggregateManifestTarget>>
}

type ChannelRelease = {
  om_core_version: string
  spec: string
  targets: Partial<Record<TargetTriple, AggregateManifestTarget>>
}

export type Channel = {
  schema_version: number
  releases: ChannelRelease[]
}

export type EnsureBinaryResult =
  | { kind: 'ready'; binaryPath: string }
  | { kind: 'failed'; message: string }

type ResolvedRelease = {
  version: string
  entry: AggregateManifestTarget
}

export async function ensureOmCoreBinary(args: {
  override: string | null
}): Promise<EnsureBinaryResult> {
  const { override } = args
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
  const isBundle = entry.format === 'tar.xz' || entry.format === 'zip'

  // Shared neutral cache (om data_dir), layout identical to the CC plugin so a
  // machine runs ONE sidecar off a single `current` pointer. Version-scoped:
  // never overwrite an old install in place.
  const bundleDir = versionDir(version, triple) // <cacheRoot>/<version>/<triple>
  await fs.mkdir(path.dirname(bundleDir), { recursive: true })
  // Bundle mode: onedir at bundleDir, runnable om-core-bin at its root. Raw mode
  // (legacy single-file): <bundleDir>/om-core-<triple>[.exe].
  const versionedExe = isBundle
    ? path.join(bundleDir, BUNDLE_EXE)
    : path.join(
        bundleDir,
        triple.includes('windows')
          ? `om-core-${triple}.exe`
          : `om-core-${triple}`,
      )

  // Download + verify into cache if this version isn't already present
  // (presence implies a prior sha256-verified install).
  if (!(await pathExists(versionedExe))) {
    const notice = new Notice(t('notice:engine.downloading', { version }), 0)
    // Persistent resume file beside the bundle dir (same fs → atomic rename;
    // survives a restart for Range-resume).
    const partPath = path.join(
      path.dirname(bundleDir),
      `.${entry.asset_name}.part`,
    )
    try {
      const urls = mirrorCandidates(entry, version)
      let lastPct = -1
      const onProgress = (got: number, total: number | null) => {
        if (!total) return
        const pct = Math.floor((got / total) * 100)
        if (pct === lastPct) return
        lastPct = pct
        notice.setMessage(
          t('onboarding:downloadingProgress', {
            version,
            pct,
            mb: Math.floor(got / (1 << 20)),
            totalMb: Math.floor(total / (1 << 20)),
          }),
        )
      }
      try {
        await downloadWithMirrors(
          urls,
          partPath,
          entry.size_bytes ?? 0,
          onProgress,
        )
      } catch (e) {
        return {
          kind: 'failed',
          message: `Could not download om-core binary: ${
            e instanceof Error ? e.message : String(e)
          }`,
        }
      }
      const got = await sha256OfFile(partPath)
      if (got !== entry.sha256) {
        // Corrupt / cross-mirror mismatch — drop the partial so the next run
        // starts clean rather than resuming onto bad bytes.
        await safeUnlink(partPath)
        return {
          kind: 'failed',
          message:
            `om-core checksum mismatch — refusing to install ` +
            `(expected ${entry.sha256.slice(0, 12)}…, got ${got.slice(0, 12)}…)`,
        }
      }
      if (isBundle) {
        await installBundle(partPath, bundleDir, entry.format ?? 'tar.xz')
      } else {
        await fs.rename(partPath, versionedExe)
        if (process.platform !== 'win32') await fs.chmod(versionedExe, 0o755)
      }
      notice.setMessage(`KogCat engine installed (${version})`)
      setTimeout(() => notice.hide(), 1500)
    } catch (err) {
      return {
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      }
    } finally {
      notice.hide()
    }
  }

  // Raw/legacy single-file: no stable pointer, return the versioned exe.
  if (!isBundle) {
    return { kind: 'ready', binaryPath: versionedExe }
  }

  // Stable pointer: point `current` at this version UNLESS a newer one is
  // already current (the CC plugin or a prior ob run may own a higher version —
  // never downgrade a shared sidecar). The supervisor is always registered
  // against currentBinPath, so an upgrade is a single pointer swap.
  try {
    const cur = await currentVersion(triple)
    if (!cur || compareSemver(version, cur) > 0) {
      await ensureCurrentPointer(versionedExe, triple)
    }
  } catch {
    // Pointer hop failed — fall back to the concrete versioned exe so onboarding
    // can still register/spawn; pointer coordination converges next run.
    return { kind: 'ready', binaryPath: versionedExe }
  }
  return { kind: 'ready', binaryPath: currentBinPath(triple) }
}

// Extract an onedir bundle archive into `bundleDir`, then atomically rename
// into place so a running sidecar never sees a half-extracted tree. The
// archive root carries `om-core-bin[.exe]` plus an `_internal/` library tree.
export async function installBundle(
  archivePath: string,
  bundleDir: string,
  format: AssetFormat,
): Promise<void> {
  const stagingDir = `${bundleDir}.staging-${Date.now()}`
  try {
    await fs.mkdir(stagingDir, { recursive: true })
    await extractArchive(archivePath, stagingDir, format)
    // Tolerate an archive that wraps its payload in a single top-level dir.
    let payloadDir = stagingDir
    if (!(await pathExists(path.join(stagingDir, BUNDLE_EXE)))) {
      const entries = await fs.readdir(stagingDir)
      if (entries.length === 1) {
        const nested = path.join(stagingDir, entries[0])
        if (await pathExists(path.join(nested, BUNDLE_EXE))) {
          payloadDir = nested
        }
      }
    }
    const exePath = path.join(payloadDir, BUNDLE_EXE)
    if (!(await pathExists(exePath))) {
      throw new Error(
        `om-core bundle archive has no ${BUNDLE_EXE} executable at its root`,
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

// Electron has no stdlib xz codec, so tar.xz shells out to system `tar` (macOS
// bsdtar / Linux GNU tar both honour `-J`). zip uses pure-JS fflate — no
// PowerShell / shell dependency on Windows.
async function extractArchive(
  archivePath: string,
  destDir: string,
  format: AssetFormat,
): Promise<void> {
  if (format === 'zip') {
    await extractZip(archivePath, destDir)
    return
  }
  await execFileAsync('tar', ['-xJf', archivePath, '-C', destDir])
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

export function channelUrlsForDownload(): string[] {
  return [
    `${ALI_OSS_MIRROR_BASE_URL}/channel/channel.json`,
    `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/` +
      `download/channel/channel.json`,
  ]
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

// All sources raced concurrently; first fulfilled (2xx) wins. Losing
// requests run to completion in the background (requestUrl has no abort) —
// harmless for a small JSON index.
export async function fetchChannel(): Promise<Channel | null> {
  try {
    const res = await Promise.any(
      channelUrlsForDownload().map((url) => requestUrl({ url, method: 'GET' })),
    )
    return res.json as Channel
  } catch {
    return null
  }
}

export function aggregateManifestUrlsForDownload(version: string): string[] {
  return [
    `${ALI_OSS_MIRROR_BASE_URL}/v${version}/aggregate-manifest.json`,
    `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/download/v${version}${RELEASE_TAG_SUFFIX}/aggregate-manifest.json`,
  ]
}

// Binary download mirrors. `entry.url` is the resolved source's own url — the
// channel-race winner (whichever host answered channel.json fastest) or the
// bundled manifest — so it leads, reflecting which host is reachable now. The
// other host is then derived from the fixed mirror layout as fallback. Same
// byte-identical asset → shared sha256 gate, so order is purely a speed pick.
export function mirrorCandidates(
  entry: { url: string; asset_name: string },
  version: string,
): string[] {
  const ali = `${ALI_OSS_MIRROR_BASE_URL}/v${version}/${entry.asset_name}`
  const gh =
    `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/` +
    `download/v${version}${RELEASE_TAG_SUFFIX}/${entry.asset_name}`
  const urls = entry.url ? [entry.url] : []
  for (const u of [ali, gh]) if (u && !urls.includes(u)) urls.push(u)
  return urls
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
  try {
    const res = await Promise.any(
      aggregateManifestUrlsForDownload(version).map((url) =>
        requestUrl({ url, method: 'GET' }),
      ),
    )
    return res.json as AggregateManifest
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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
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
