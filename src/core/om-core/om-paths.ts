// Neutral om binary cache + stable-pointer, decoupled from Claude's ~/.claude.
// A machine runs ONE om-core sidecar; ob and the CC plugin share this cache so
// whoever has the highest version owns `current`. Layout mirrors the CC
// client's bin cache exactly (same on-disk contract → cross-client coordination):
//
//   <cacheRoot>/<version>/<target>/om-core-bin[.exe]   bundle exe
//   <cacheRoot>/<version>/<target>/_internal/          bundled libs
//   <cacheRoot>/current/<target>/                      stable pointer (junction/symlink)
//
// cacheRoot defaults to <om data_dir>/bin (platformdirs "om"), overridable via
// OM_CORE_CACHE_ROOT — both match CC so the two plugins resolve the same paths.

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const BUNDLE_EXE =
  process.platform === 'win32' ? 'om-core-bin.exe' : 'om-core-bin'

// om data dir — platformdirs user_data_dir("om", appauthor=False). Overridable
// via OM_DATA_HOME (matches om-core). NOTE: on Linux data_dir
// (XDG_DATA_HOME) differs from config_dir (XDG_CONFIG_HOME) — binaries go here.
export function omDataDir(): string {
  const override = process.env.OM_DATA_HOME?.trim()
  if (override) return path.resolve(override)
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'om')
  }
  if (process.platform === 'win32') {
    const local =
      process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    return path.join(local, 'om')
  }
  const xdg = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share')
  return path.join(xdg, 'om')
}

// Binary cache root — shared with CC. Overridable via OM_CORE_CACHE_ROOT
// (matches the CC client's cache-root resolver).
export function cacheRoot(): string {
  const override = process.env.OM_CORE_CACHE_ROOT?.trim()
  if (override) return path.resolve(override)
  return path.join(omDataDir(), 'bin')
}

// <cacheRoot>/<version>/<target>/ — onedir bundle dir for a specific version.
export function versionDir(version: string, target: string): string {
  return path.join(cacheRoot(), version, target)
}

// Stable pointer dir the OS supervisor is registered against; never versioned.
export function currentDir(target: string): string {
  return path.join(cacheRoot(), 'current', target)
}

export function currentBinPath(target: string): string {
  return path.join(currentDir(target), BUNDLE_EXE)
}

// Version `current` currently points at, or null if unset/broken.
export async function currentVersion(target: string): Promise<string | null> {
  try {
    // realpath follows the junction/symlink → <cacheRoot>/<version>/<target>
    const real = await fs.realpath(currentDir(target))
    return path.basename(path.dirname(real))
  } catch {
    return null
  }
}

// Point current/<target> at the bundle dir holding `bundleExePath`, so a binary
// upgrade is one pointer swap (no service rewrite). Windows: directory junction
// (mklink /J, privilege-free — fs.symlink needs admin). POSIX: symlink + atomic
// rename. MUST keep the bundle under cacheRoot (foreign target would repoint the
// live supervisor at an ephemeral binary). Returns the stable exe path.
export async function ensureCurrentPointer(
  bundleExePath: string,
  target: string,
): Promise<string> {
  const bundleDir = path.dirname(path.resolve(bundleExePath))
  const root = path.resolve(cacheRoot())
  if (bundleDir !== root && !bundleDir.startsWith(root + path.sep)) {
    throw new Error(
      `refusing to point current at ${bundleDir} (outside cache root ${root})`,
    )
  }
  const stableDir = currentDir(target)
  await fs.mkdir(path.dirname(stableDir), { recursive: true })
  const tmp = `${stableDir}.tmp`

  if (process.platform === 'win32') {
    await winClearPointer(tmp)
    await winMakeJunction(tmp, bundleDir)
    await winClearPointer(stableDir)
    await fs.rename(tmp, stableDir)
  } else {
    await posixClearPointer(tmp)
    await fs.symlink(bundleDir, tmp, 'dir')
    // A pre-onedir real directory must go before rename can replace it; an
    // existing symlink is left for rename to swap atomically.
    const st = await fs.lstat(stableDir).catch(() => null)
    if (st && !st.isSymbolicLink() && st.isDirectory()) {
      await fs.rm(stableDir, { recursive: true, force: true })
    }
    await fs.rename(tmp, stableDir)
  }
  return currentBinPath(target)
}

// Remove a Windows dir junction/symlink (rmdir, leaving target) or a real dir.
async function winClearPointer(p: string): Promise<void> {
  const st = await fs.lstat(p).catch(() => null)
  if (!st) return
  try {
    await fs.rmdir(p) // junction / dir-symlink / empty dir — does not touch target
    return
  } catch {
    // real (legacy full-copy) dir → recursive remove
  }
  await fs.rm(p, { recursive: true, force: true })
}

async function winMakeJunction(link: string, target: string): Promise<void> {
  // mklink /J — privilege-free directory junction. Falls back to a full copy
  // only if junction creation fails (locked-down host).
  try {
    await execFileAsync('cmd', ['/c', 'mklink', '/J', link, target], {
      windowsHide: true,
    })
  } catch {
    await fs.cp(target, link, { recursive: true })
  }
}

async function posixClearPointer(p: string): Promise<void> {
  const st = await fs.lstat(p).catch(() => null)
  if (!st) return
  if (st.isSymbolicLink()) {
    await fs.unlink(p)
  } else if (st.isDirectory()) {
    await fs.rm(p, { recursive: true, force: true })
  } else {
    await fs.unlink(p)
  }
}
