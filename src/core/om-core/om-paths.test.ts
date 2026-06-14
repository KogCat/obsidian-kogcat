import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import {
  cacheRoot,
  currentBinPath,
  currentVersion,
  ensureCurrentPointer,
  omDataDir,
  versionDir,
} from './om-paths'

const TARGET = 'aarch64-apple-darwin'
const EXE = process.platform === 'win32' ? 'om-core-bin.exe' : 'om-core-bin'

describe('om-paths resolution', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('honors OM_CORE_CACHE_ROOT / OM_DATA_HOME overrides', () => {
    process.env.OM_CORE_CACHE_ROOT = path.join(os.tmpdir(), 'x', 'bin')
    expect(cacheRoot()).toBe(path.resolve(path.join(os.tmpdir(), 'x', 'bin')))
    delete process.env.OM_CORE_CACHE_ROOT
    process.env.OM_DATA_HOME = path.join(os.tmpdir(), 'd')
    expect(omDataDir()).toBe(path.resolve(path.join(os.tmpdir(), 'd')))
    expect(cacheRoot()).toBe(
      path.join(path.resolve(process.env.OM_DATA_HOME), 'bin'),
    )
  })

  it('defaults to a neutral om data dir, never ~/.claude', () => {
    delete process.env.OM_CORE_CACHE_ROOT
    delete process.env.OM_DATA_HOME
    expect(cacheRoot()).not.toContain('.claude')
    expect(cacheRoot().endsWith(path.join('om', 'bin'))).toBe(true)
  })

  it('lays out version / current paths under the cache root', () => {
    process.env.OM_CORE_CACHE_ROOT = path.join(os.tmpdir(), 'c')
    const root = path.resolve(process.env.OM_CORE_CACHE_ROOT)
    expect(versionDir('0.36.34', TARGET)).toBe(
      path.join(root, '0.36.34', TARGET),
    )
    expect(currentBinPath(TARGET)).toBe(path.join(root, 'current', TARGET, EXE))
  })
})

// Junction creation needs Windows; the pointer logic is exercised on POSIX.
const posixIt = process.platform === 'win32' ? it.skip : it

describe('ensureCurrentPointer (POSIX symlink)', () => {
  const saved = { ...process.env }
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'om-paths-'))
    process.env.OM_CORE_CACHE_ROOT = dir
  })
  afterEach(async () => {
    process.env = { ...saved }
    await fs.rm(dir, { recursive: true, force: true })
  })

  async function fakeBundle(version: string): Promise<string> {
    const vd = versionDir(version, TARGET)
    await fs.mkdir(vd, { recursive: true })
    const exe = path.join(vd, EXE)
    await fs.writeFile(exe, version)
    return exe
  }

  posixIt('points current at a bundle and resolves the exe', async () => {
    const exe = await fakeBundle('0.36.30')
    const stable = await ensureCurrentPointer(exe, TARGET)
    expect(stable).toBe(currentBinPath(TARGET))
    expect(await fs.readFile(stable, 'utf8')).toBe('0.36.30')
    expect(await currentVersion(TARGET)).toBe('0.36.30')
  })

  posixIt('swaps current to a new version atomically', async () => {
    await ensureCurrentPointer(await fakeBundle('0.36.30'), TARGET)
    await ensureCurrentPointer(await fakeBundle('0.36.34'), TARGET)
    expect(await fs.readFile(currentBinPath(TARGET), 'utf8')).toBe('0.36.34')
    expect(await currentVersion(TARGET)).toBe('0.36.34')
  })

  posixIt('refuses a bundle outside the cache root', async () => {
    const outside = path.join(os.tmpdir(), `om-evil-${process.pid}`, EXE)
    await fs.mkdir(path.dirname(outside), { recursive: true })
    await fs.writeFile(outside, 'x')
    try {
      await expect(ensureCurrentPointer(outside, TARGET)).rejects.toThrow(
        /outside cache root/,
      )
    } finally {
      await fs.rm(path.dirname(outside), { recursive: true, force: true })
    }
  })
})
