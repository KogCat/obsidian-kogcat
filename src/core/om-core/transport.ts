// `obsidian.requestUrl` is TCP-only via Electron net; UDS needs node:http's
// `socketPath` option, so this module bypasses requestUrl entirely.

import * as http from 'http'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

export type ServerJsonShape = {
  transport?: 'uds' | 'pipe'
  socket_path?: string
  pipe_name?: string
  port?: number
  token?: string
  pid?: number
  started_at?: string
  binary_version?: string
  api_minor?: number
}

export type OmCoreTransport =
  | { kind: 'uds'; socketPath: string }
  | { kind: 'tcp'; host: string; port: number }

// target = socket path (uds) | "host:port" (tcp). UDS auth is fs perm 0o600;
// token is retained for legacy TCP / external mocks.
export type OmCoreAuth = {
  transport: 'uds' | 'tcp'
  target: string
  token: string
}

export class OmSidecarUnavailable extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'OmSidecarUnavailable'
    this.hint = hint
  }
}

const NOT_RUNNING_HINT =
  'Run `om-core install-service` to register the supervisor ' +
  '(launchd on macOS / SCM or Task Scheduler on Windows / ' +
  'systemd --user on Linux). For one-off bypass set ' +
  'OM_ALLOW_DIRECT_SPAWN=1 in your env before launching Obsidian.'

export function pickTransport(cfg: ServerJsonShape): OmCoreTransport {
  if (cfg.transport === 'uds') {
    if (typeof cfg.socket_path !== 'string' || cfg.socket_path.length === 0) {
      throw new OmSidecarUnavailable(
        'server.json transport=uds but socket_path missing',
        NOT_RUNNING_HINT,
      )
    }
    return { kind: 'uds', socketPath: cfg.socket_path }
  }
  if (cfg.transport === 'pipe') {
    throw new OmSidecarUnavailable(
      'Windows named-pipe transport is pending — wrapper not wired for it yet',
      'Run on POSIX, or downgrade om-core to a TCP-mode build.',
    )
  }
  // Legacy: pre-UDS builds wrote { port, token } only.
  if (typeof cfg.port === 'number') {
    return { kind: 'tcp', host: '127.0.0.1', port: cfg.port }
  }
  throw new OmSidecarUnavailable(
    'server.json missing transport / port field',
    'Upgrade plugin / om-core to a matching version.',
  )
}

export function transportToAuth(
  t: OmCoreTransport,
  token: string,
): OmCoreAuth {
  if (t.kind === 'uds') {
    return { transport: 'uds', target: t.socketPath, token }
  }
  return { transport: 'tcp', target: `${t.host}:${t.port}`, token }
}

export function describeTransport(t: OmCoreTransport): string {
  return t.kind === 'uds'
    ? `uds:${t.socketPath}`
    : `http://${t.host}:${t.port}`
}

export function describeAuth(a: OmCoreAuth): string {
  return a.transport === 'uds' ? `uds:${a.target}` : `http://${a.target}`
}

export type OmRequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  path: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export type OmResponse = {
  status: number
  text: string
  json: unknown
}

export function requestOmCore(
  auth: OmCoreAuth,
  opts: OmRequestOptions,
): Promise<OmResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) }
    if (!hasHeader(headers, 'authorization') && auth.token !== undefined) {
      headers['Authorization'] = `Bearer ${auth.token}`
    }
    if (opts.body && !hasHeader(headers, 'content-type')) {
      headers['content-type'] = 'application/json'
    }

    const reqOpts: http.RequestOptions = {
      method: opts.method ?? 'GET',
      path: opts.path,
      headers,
    }
    if (auth.transport === 'uds') {
      reqOpts.socketPath = auth.target
      // node:http requires a Host header even on UDS; placeholder for log clarity.
      reqOpts.host = 'om'
    } else {
      const [host, portStr] = auth.target.split(':')
      reqOpts.host = host || '127.0.0.1'
      reqOpts.port = portStr ? Number(portStr) : 80
    }

    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer | string) =>
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
      )
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: unknown = undefined
        if (text.length > 0) {
          try {
            json = JSON.parse(text)
          } catch {
            // not JSON — caller reads text
          }
        }
        resolve({ status: res.statusCode ?? 0, text, json })
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      req.setTimeout(opts.timeoutMs, () => {
        req.destroy(
          new Error(`om-core request timeout after ${opts.timeoutMs}ms`),
        )
      })
    }
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const wanted = name.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === wanted) return true
  }
  return false
}

// Must mirror om-core `om_core/infra/paths.py::server_json()` (platformdirs APP="om").
export function serverJsonPath(): string {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'om', 'server.json')
  }
  if (process.platform === 'win32') {
    const appdata =
      process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return path.join(appdata, 'om', 'server.json')
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')
  return path.join(xdg, 'om', 'server.json')
}

export async function readServerJson(): Promise<ServerJsonShape | null> {
  try {
    const raw = await fs.readFile(serverJsonPath(), 'utf8')
    return JSON.parse(raw) as ServerJsonShape
  } catch {
    return null
  }
}

// OM_ALLOW_DIRECT_SPAWN=1: wrapper owns lifecycle (CI / mock mode).
export function directSpawnEnabled(): boolean {
  const val = (process.env.OM_ALLOW_DIRECT_SPAWN ?? '').trim().toLowerCase()
  return val === '1' || val === 'true' || val === 'yes' || val === 'on'
}
