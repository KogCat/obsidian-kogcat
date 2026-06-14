// Robust om-core binary fetch — streamed download with Range-resume + chunk
// timeout + retries across mirror sources, plus pure-JS zip extraction.
// Mirrors the CC plugin's _bin_fetch_runner.py robustness so a flaky GitHub
// link on a CN network eventually completes instead of hanging on a single
// timeout-less GET. Desktop-only (uses node:http/https + fs streams).

import { createHash } from 'crypto'
import { createWriteStream, promises as fs } from 'fs'
import path from 'path'

import { unzip } from 'fflate'

// No bytes within this window → reconnect. The actual silent-hang fix: a bare
// GET blocks on OS keepalive (minutes) when a CDN stalls mid-stream.
const CHUNK_TIMEOUT_MS = 30_000
// Throughput floor: idle timeout only catches a fully frozen socket. A mirror
// that trickles bytes (e.g. a CN-mainland OSS reached through a foreign-exit
// VPN) keeps the socket "active" forever, so the order-driven mirror list
// would never advance. Abort a sustained-below-floor link so the next mirror
// gets a turn.
const MIN_RATE_BPS = 40 * 1024 // 40 KB/s
const RATE_WINDOW_MS = 20_000 // sustained below floor this long → abort
const RATE_CHECK_MS = 5_000 // throughput sampling interval
const MAX_RETRIES = 3 // per-url Range-resume reconnects
const MAX_REDIRECTS = 5

export type ProgressFn = (bytesNow: number, total: number | null) => void

async function fileSize(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size
  } catch {
    return 0
  }
}

// One streaming attempt: GET `url` (following redirects), Range-resuming from
// the current `.part` size into `partPath`. A chunk-idle timeout destroys the
// request so a stall reconnects. Resolves only on a complete body; a short
// read rejects so the caller resumes via Range.
function streamOnce(
  url: string,
  partPath: string,
  sizeHint: number,
  onProgress: ProgressFn,
  redirectsLeft: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy Node builtin, desktop-only runtime
    const https = require('https') as typeof import('https')
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy Node builtin, desktop-only runtime
    const http = require('http') as typeof import('http')
    const u = new URL(url)
    const client = u.protocol === 'https:' ? https : http

    void (async () => {
      const start = await fileSize(partPath)
      const headers: Record<string, string> = {
        'User-Agent': 'om-bin-fetch/1.0',
      }
      if (start > 0) headers.Range = `bytes=${start}-`

      const req = client.get(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port ? Number(u.port) : undefined,
          path: `${u.pathname}${u.search}`,
          headers,
        },
        (res) => {
          const status = res.statusCode ?? 0
          // Follow redirects (GitHub release → signed storage URL). Range +
          // .part offset re-derive on the recursive call, so resume position
          // is preserved across the hop.
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            if (redirectsLeft <= 0) {
              reject(new Error(`too many redirects from ${u.hostname}`))
              return
            }
            const next = new URL(res.headers.location, url).toString()
            streamOnce(
              next,
              partPath,
              sizeHint,
              onProgress,
              redirectsLeft - 1,
            ).then(resolve, reject)
            return
          }
          if (status !== 200 && status !== 206) {
            res.resume()
            reject(new Error(`HTTP ${status} from ${u.hostname}`))
            return
          }

          // 206 → server honored Range, append. 200 → full body, truncate any
          // stale .part.
          const resume = status === 206 && start > 0
          const cl = res.headers['content-length']
          let total: number | null = sizeHint > 0 ? sizeHint : null
          if (cl) {
            const len = parseInt(cl, 10)
            total = resume ? start + len : len
          }

          const out = createWriteStream(partPath, { flags: resume ? 'a' : 'w' })
          let got = resume ? start : 0
          const fail = (e: Error) => {
            out.destroy()
            reject(e)
          }
          // Throughput guard: abort a link delivering below MIN_RATE_BPS for a
          // sustained window so downloadWithMirrors can fall through to the next
          // mirror (idle timeout alone never fires on a trickle).
          let sampleBytes = got
          let lowMs = 0
          const monitor = setInterval(() => {
            const rate = (got - sampleBytes) / (RATE_CHECK_MS / 1000)
            sampleBytes = got
            lowMs = rate < MIN_RATE_BPS ? lowMs + RATE_CHECK_MS : 0
            if (lowMs >= RATE_WINDOW_MS) {
              req.destroy(new Error(`throughput below floor from ${u.hostname}`))
            }
          }, RATE_CHECK_MS)
          req.on('close', () => clearInterval(monitor))
          res.on('data', (c: Buffer) => {
            got += c.length
            onProgress(got, total)
          })
          res.on('error', fail)
          out.on('error', fail)
          out.on('finish', () => resolve())
          res.on('end', () => {
            // Server closed early — treat as a stall so the retry resumes.
            if (total !== null && got < total) {
              out.destroy()
              reject(new Error(`short read ${got}/${total} from ${u.hostname}`))
              return
            }
            out.end()
          })
          res.pipe(out)
        },
      )
      req.on('error', reject)
      // Socket-idle timeout covers connect stalls AND mid-stream stalls — a
      // bare GET otherwise blocks on OS keepalive (minutes) when a CDN hangs.
      req.setTimeout(CHUNK_TIMEOUT_MS, () =>
        req.destroy(new Error('idle timeout')),
      )
    })().catch(reject)
  })
}

// Download `url` into `partPath` with up to MAX_RETRIES Range-resume reconnects.
async function downloadFromUrl(
  url: string,
  partPath: string,
  sizeHint: number,
  onProgress: ProgressFn,
): Promise<void> {
  let attempt = 0
  for (;;) {
    attempt++
    try {
      await streamOnce(url, partPath, sizeHint, onProgress, MAX_REDIRECTS)
      return
    } catch (e) {
      if (attempt > MAX_RETRIES) throw e
      // .part is preserved → next attempt resumes via Range.
    }
  }
}

// Try each mirror in order; first to complete wins. Returns the winning url.
// Throws the last error if all fail (partPath kept for the next run; sha256 in
// the caller catches any cross-mirror byte mismatch).
export async function downloadWithMirrors(
  urls: string[],
  partPath: string,
  sizeHint: number,
  onProgress: ProgressFn,
): Promise<string> {
  let lastErr: unknown = new Error('no download urls')
  for (const url of urls) {
    try {
      await downloadFromUrl(url, partPath, sizeHint, onProgress)
      return url
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

// Streamed sha256 — never buffers the whole file (binaries are ~60MB+).
export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const fd = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.allocUnsafe(1 << 20)
    for (;;) {
      const { bytesRead } = await fd.read(buf, 0, buf.length, null)
      if (bytesRead === 0) break
      hash.update(buf.subarray(0, bytesRead))
    }
  } finally {
    await fd.close()
  }
  return hash.digest('hex')
}

// Extract a zip into `destDir` via pure-JS fflate (no PowerShell dependency).
// MUST reject zip-slip entries; creates parent dirs; skips directory entries.
export async function extractZip(
  archivePath: string,
  destDir: string,
): Promise<void> {
  const buf = await fs.readFile(archivePath)
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(new Uint8Array(buf), (err, data) =>
        err ? reject(err) : resolve(data),
      )
    },
  )
  const root = path.resolve(destDir)
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue
    const dest = path.resolve(root, name)
    if (dest !== root && !dest.startsWith(root + path.sep)) {
      throw new Error(`zip entry escapes destination: ${name}`)
    }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, data)
  }
}
