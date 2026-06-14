import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import { strToU8, zipSync } from 'fflate'

import { extractZip, sha256OfFile } from './binary-fetch'

function mkTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'om-bf-'))
}

describe('extractZip', () => {
  it('extracts a onedir bundle preserving nested paths', async () => {
    const dir = await mkTmpDir()
    try {
      const zip = zipSync({
        'om-core-bin.exe': strToU8('binary'),
        '_internal/lib.txt': strToU8('lib'),
      }) as Uint8Array
      const archive = path.join(dir, 'b.zip')
      await fs.writeFile(archive, zip)
      const dest = path.join(dir, 'out')
      await extractZip(archive, dest)
      expect(
        await fs.readFile(path.join(dest, 'om-core-bin.exe'), 'utf8'),
      ).toBe('binary')
      expect(
        await fs.readFile(path.join(dest, '_internal', 'lib.txt'), 'utf8'),
      ).toBe('lib')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects zip-slip entries escaping the destination', async () => {
    const dir = await mkTmpDir()
    try {
      const zip = zipSync({ '../escape.txt': strToU8('evil') }) as Uint8Array
      const archive = path.join(dir, 'b.zip')
      await fs.writeFile(archive, zip)
      await expect(extractZip(archive, path.join(dir, 'out'))).rejects.toThrow(
        /escapes destination/,
      )
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('sha256OfFile', () => {
  it('streams the file digest', async () => {
    const dir = await mkTmpDir()
    try {
      const f = path.join(dir, 'f')
      await fs.writeFile(f, 'hello')
      // sha256("hello")
      expect(await sha256OfFile(f)).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      )
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
