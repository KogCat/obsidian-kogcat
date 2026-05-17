// Thin client over om-core /v1/memory/*. Mirrors
// om-core/om_core/api/routes/memory.py and schemas/memory.py.
//
// Memory entries live in the sidecar's KB, so they are shared with any
// other client of the same sidecar (CC plugins included).

import { OmCoreAuth, requestOmCore } from './transport'

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'
export type MemorySource = 'user_explicit' | 'client_inferred'

export type MemoryListItem = {
  name: string
  description: string
  type: MemoryType
  source: MemorySource
}

export type MemoryItem = MemoryListItem & { body: string }

export type MemoryUpsertRequest = {
  name: string
  description: string
  type: MemoryType
  source: MemorySource
  body?: string
}

export class OmMemoryError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'OmMemoryError'
    this.status = status
    this.code = code
  }
}

function extractErrorCode(json: unknown): string | undefined {
  if (json && typeof json === 'object') {
    const j = json as Record<string, unknown>
    if (typeof j.error === 'string') return j.error
    if (j.detail && typeof j.detail === 'object') {
      const d = j.detail as Record<string, unknown>
      if (typeof d.error === 'string') return d.error
    }
  }
  return undefined
}

export async function memoryList(auth: OmCoreAuth): Promise<MemoryListItem[]> {
  const res = await requestOmCore(auth, {
    method: 'GET',
    path: '/v1/memory/list',
    timeoutMs: 10000,
  })
  if (res.status !== 200) {
    throw new OmMemoryError(
      `memory_list failed: ${res.status}`,
      res.status,
      extractErrorCode(res.json),
    )
  }
  const j = res.json as { items?: MemoryListItem[] } | null
  return j?.items ?? []
}

export async function memoryGet(
  auth: OmCoreAuth,
  name: string,
): Promise<MemoryItem | null> {
  const res = await requestOmCore(auth, {
    method: 'GET',
    path: `/v1/memory/${encodeURIComponent(name)}`,
    timeoutMs: 10000,
  })
  if (res.status === 404) return null
  if (res.status !== 200) {
    throw new OmMemoryError(
      `memory_get failed: ${res.status}`,
      res.status,
      extractErrorCode(res.json),
    )
  }
  return res.json as MemoryItem
}

export async function memorySave(
  auth: OmCoreAuth,
  req: MemoryUpsertRequest,
): Promise<MemoryItem> {
  const res = await requestOmCore(auth, {
    method: 'POST',
    path: '/v1/memory/upsert',
    body: JSON.stringify(req),
    timeoutMs: 10000,
  })
  if (res.status !== 200) {
    throw new OmMemoryError(
      `memory_save failed: ${res.status}`,
      res.status,
      extractErrorCode(res.json),
    )
  }
  return res.json as MemoryItem
}

export async function memoryDelete(
  auth: OmCoreAuth,
  name: string,
): Promise<boolean> {
  const res = await requestOmCore(auth, {
    method: 'DELETE',
    path: `/v1/memory/${encodeURIComponent(name)}`,
    timeoutMs: 10000,
  })
  if (res.status === 404) return false
  if (res.status !== 200) {
    throw new OmMemoryError(
      `memory_delete failed: ${res.status}`,
      res.status,
      extractErrorCode(res.json),
    )
  }
  return true
}
