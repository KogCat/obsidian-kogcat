import { OmCoreAuth, requestOmCore } from './transport'

export type PackLockEntry = {
  version: string
  integrity?: string
  installed_at?: string
  pinned?: boolean
  source?: string
}

export type PackListResult = {
  packs: Record<string, PackLockEntry>
  error?: string
}

export type PackInfoResult = {
  found: boolean
  name: string
  lock?: Record<string, unknown>
  manifest?: Record<string, unknown>
}

export type PackInstallStats = {
  nodes: number
  edges: number
  vectors: number
  skipped_edges: number
}

export type PackInstallResult = {
  name: string
  version: string
  installed_at?: string
  integrity?: string
  stats: PackInstallStats
  noop: boolean
  warnings: string[]
}

export type PackUninstallResult = {
  name: string
  nodes_deleted: number
  overlay_unmerged: boolean
  dangling_edges: number
  warnings: string[]
}

export type PackUpgradeResult = {
  name: string
  old_version: string
  new_version: string
  dry_run: boolean
  applied: boolean
  noop: boolean
  stats?: PackInstallStats
  plan_summary?: {
    migrations: number
    markdown_edits: number
    db_edits: number
    is_empty: boolean
  }
  plan_text?: string
  warnings: string[]
}

export class PackApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly hint?: string,
  ) {
    super(message)
    this.name = 'PackApiError'
  }
}

function throwIfError(
  res: { status: number; text: string; json: unknown },
  op: string,
): void {
  if (res.status >= 200 && res.status < 300) return
  const body = res.json as Record<string, string> | undefined
  if (body?.code) {
    throw new PackApiError(body.code, body.message ?? res.text, body.hint)
  }
  throw new Error(`${op} failed (${res.status}): ${res.text}`)
}

export async function packList(auth: OmCoreAuth): Promise<PackListResult> {
  const res = await requestOmCore(auth, { path: '/v1/packs' })
  throwIfError(res, 'pack list')
  return res.json as PackListResult
}

export async function packInfo(
  auth: OmCoreAuth,
  name: string,
): Promise<PackInfoResult> {
  const res = await requestOmCore(auth, { path: `/v1/packs/${name}` })
  throwIfError(res, 'pack info')
  return res.json as PackInfoResult
}

export async function packInstall(
  auth: OmCoreAuth,
  archivePath: string,
): Promise<PackInstallResult> {
  const res = await requestOmCore(auth, {
    method: 'POST',
    path: '/v1/packs/install',
    body: JSON.stringify({ archive_path: archivePath }),
  })
  throwIfError(res, 'pack install')
  return res.json as PackInstallResult
}

export async function packUninstall(
  auth: OmCoreAuth,
  name: string,
  yes = false,
): Promise<PackUninstallResult> {
  const res = await requestOmCore(auth, {
    method: 'POST',
    path: '/v1/packs/uninstall',
    body: JSON.stringify({ name, yes }),
  })
  throwIfError(res, 'pack uninstall')
  return res.json as PackUninstallResult
}

export async function packUpgrade(
  auth: OmCoreAuth,
  archivePath: string,
  opts: { dry_run?: boolean; yes?: boolean; force?: boolean } = {},
): Promise<PackUpgradeResult> {
  const res = await requestOmCore(auth, {
    method: 'POST',
    path: '/v1/packs/upgrade',
    body: JSON.stringify({ archive_path: archivePath, ...opts }),
  })
  throwIfError(res, 'pack upgrade')
  return res.json as PackUpgradeResult
}
