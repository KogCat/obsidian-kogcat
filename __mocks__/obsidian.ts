export const App = jest.fn()
export const Editor = jest.fn()
export const MarkdownView = jest.fn()
export const TFile = jest.fn()
export const TFolder = jest.fn()
export const Vault = jest.fn()
export const Plugin = jest.fn()
export class Modal {
  contentEl = {
    empty: jest.fn(),
  }
  open = jest.fn()
  close = jest.fn()
  onOpen = jest.fn()
  onClose = jest.fn()
}
export const normalizePath = jest.fn((path: string) => path)

// Real HTTP forwarder so integration tests can drive client modules against
// a spawned mock om-core server. Production Obsidian provides a CORS-bypass
// implementation; in jest (testEnvironment=node) we just pass through fetch.
export async function requestUrl(opts: {
  url: string
  method?: string
  contentType?: string
  body?: string
  headers?: Record<string, string>
}): Promise<{
  status: number
  text: string
  json: unknown
  arrayBuffer: ArrayBuffer
}> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.contentType) headers['content-type'] = opts.contentType
  const res = await fetch(opts.url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body,
  })
  const buf = await res.arrayBuffer()
  const text = new TextDecoder().decode(buf)
  // Obsidian's requestUrl throws on non-2xx — match that behavior so client
  // error paths fire correctly. Mirrors `RequestUrlResponseError`.
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`Request failed, status ${res.status}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  let json: unknown = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    /* not json */
  }
  return { status: res.status, text, json, arrayBuffer: buf }
}
