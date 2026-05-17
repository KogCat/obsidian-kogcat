import { execFileSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import {
  Channel,
  REQUIRED_CORE_VERSION,
  installBundle,
  pickFromChannel,
} from './download'

// pickFromChannel is the channel-resolution core: spec equality is the
// schema-break gate, REQUIRED_CORE_VERSION is the downgrade floor, and the
// highest surviving release wins. The CC plugin implements the same
// channel-resolution logic Python-side, with its own test coverage.

const TRIPLE = 'aarch64-apple-darwin' as const

function mkEntry(version: string, format?: 'tar.xz') {
  return {
    asset_name: `om-core-bin-${TRIPLE}${format ? '.tar.xz' : ''}`,
    url: `https://ex/${version}/${TRIPLE}`,
    sha256: 'f'.repeat(64),
    size_bytes: 1,
    ...(format ? { format } : {}),
  }
}

describe('pickFromChannel', () => {
  it('picks the highest spec-compatible release', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        { om_core_version: '0.36.0', spec: '19', targets: { [TRIPLE]: mkEntry('0.36.0') } },
        { om_core_version: '0.35.3', spec: '19', targets: { [TRIPLE]: mkEntry('0.35.3') } },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)?.version).toBe('0.36.0')
  })

  it('skips releases whose spec does not match REQUIRED_SPEC', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        { om_core_version: '0.40.0', spec: '20', targets: { [TRIPLE]: mkEntry('0.40.0') } },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)).toBeNull()
  })

  it('skips releases below the REQUIRED_CORE_VERSION floor', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        { om_core_version: '0.30.0', spec: '19', targets: { [TRIPLE]: mkEntry('0.30.0') } },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)).toBeNull()
  })

  it('accepts a release exactly at the REQUIRED_CORE_VERSION floor', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        {
          om_core_version: REQUIRED_CORE_VERSION,
          spec: '19',
          targets: { [TRIPLE]: mkEntry(REQUIRED_CORE_VERSION) },
        },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)?.version).toBe(REQUIRED_CORE_VERSION)
  })

  it('skips a release that ships no binary for the target', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        {
          om_core_version: '0.36.0',
          spec: '19',
          targets: { 'x86_64-pc-windows-msvc': mkEntry('0.36.0') },
        },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)).toBeNull()
  })

  it('rejects an unsupported channel schema_version', () => {
    const ch: Channel = {
      schema_version: 2,
      releases: [
        { om_core_version: '0.36.0', spec: '19', targets: { [TRIPLE]: mkEntry('0.36.0') } },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)).toBeNull()
  })

  it('rejects a malformed channel with non-array releases', () => {
    const ch = { schema_version: 3, releases: null } as unknown as Channel
    expect(pickFromChannel(ch, TRIPLE)).toBeNull()
  })

  it('carries the tar.xz format field through to the resolved entry', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        {
          om_core_version: '0.36.0',
          spec: '19',
          targets: { [TRIPLE]: mkEntry('0.36.0', 'tar.xz') },
        },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)?.entry.format).toBe('tar.xz')
  })

  it('leaves format undefined for a legacy raw-binary entry', () => {
    const ch: Channel = {
      schema_version: 3,
      releases: [
        {
          om_core_version: '0.36.0',
          spec: '19',
          targets: { [TRIPLE]: mkEntry('0.36.0') },
        },
      ],
    }
    expect(pickFromChannel(ch, TRIPLE)?.entry.format).toBeUndefined()
  })
})

// Exercises the onedir-bundle extraction path. Builds a tiny tar.xz with the
// same shape as a real om-core --onedir archive (om-core-bin at the root plus
// an _internal/ tree) and verifies installBundle lands a runnable executable.
describe('installBundle', () => {
  let workDir: string

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'om-bundle-test-'))
  })

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true })
  })

  // Pack a `payload/` dir into <workDir>/<name>.tar.xz with payload as root.
  async function makeArchive(name: string, payload: string): Promise<string> {
    const archive = path.join(workDir, `${name}.tar.xz`)
    execFileSync('tar', ['-cJf', archive, '-C', payload, '.'])
    return archive
  }

  it('extracts a flat-root bundle and yields a runnable om-core-bin', async () => {
    const payload = path.join(workDir, 'payload')
    await fs.mkdir(path.join(payload, '_internal'), { recursive: true })
    await fs.writeFile(path.join(payload, 'om-core-bin'), '#!/bin/sh\necho ok\n')
    await fs.writeFile(path.join(payload, '_internal', 'lib.so'), 'x')
    const archive = await makeArchive('flat', payload)

    const bundleDir = path.join(workDir, 'bin', '0.36.0', 'bundle')
    await installBundle(archive, bundleDir)

    await expect(
      fs.access(path.join(bundleDir, 'om-core-bin')),
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(bundleDir, '_internal', 'lib.so')),
    ).resolves.toBeUndefined()
    // Archive consumed; staging dir cleaned up.
    await expect(fs.access(archive)).rejects.toThrow()
    const leftovers = await fs.readdir(path.dirname(bundleDir))
    expect(leftovers).toEqual(['bundle'])
  })

  it('tolerates an archive that nests the payload in one top-level dir', async () => {
    const wrapper = path.join(workDir, 'wrap')
    const inner = path.join(wrapper, 'om-core-bin-dir')
    await fs.mkdir(inner, { recursive: true })
    await fs.writeFile(path.join(inner, 'om-core-bin'), '#!/bin/sh\necho ok\n')
    const archive = await makeArchive('nested', wrapper)

    const bundleDir = path.join(workDir, 'bin', '0.36.0', 'bundle')
    await installBundle(archive, bundleDir)

    await expect(
      fs.access(path.join(bundleDir, 'om-core-bin')),
    ).resolves.toBeUndefined()
  })

  it('rejects an archive with no om-core-bin executable', async () => {
    const payload = path.join(workDir, 'payload')
    await fs.mkdir(payload, { recursive: true })
    await fs.writeFile(path.join(payload, 'not-the-binary'), 'x')
    const archive = await makeArchive('bad', payload)

    const bundleDir = path.join(workDir, 'bin', '0.36.0', 'bundle')
    await expect(installBundle(archive, bundleDir)).rejects.toThrow(
      /no om-core-bin executable/,
    )
  })
})
