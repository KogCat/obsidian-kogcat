import { promises as fs } from 'fs'
import path from 'path'

import { App, Plugin } from 'obsidian'

import { OmCoreAuth, requestOmCore } from '../om-core/transport'

// KogCat prompt asset cache (spec §2.3 / §7.2 P0 #12).
// Prompts live in om-core; client pulls + caches by hash, executes locally with
// the user-configured chatModel. Asset center, execution decentral.

export type PromptName = 'calibrate-rewrite'

export type PromptAsset = {
  name: PromptName
  version: string
  hash: string
  system: string
  user_template: string
  output_schema?: Record<string, unknown>
  model_hints?: Record<string, unknown>
}

type ManifestEntry = { name: PromptName; version: string; hash: string }

export class PromptCache {
  private mem = new Map<PromptName, PromptAsset>()

  constructor(
    private app: App,
    private plugin: Plugin,
    // Returns the auth descriptor for the currently-running om-core, or null
    // if it's not up yet. We pull this lazily on each call rather than
    // capturing once because the lifecycle can restart underneath us — both
    // socket path and (legacy TCP) port + token can change.
    private getAuth: () => OmCoreAuth | null,
  ) {}

  private get cacheDir(): string {
    // Plugin private dir lives outside vault; isDesktopOnly=true so node fs is fine.
    const base = (this.app.vault.adapter as unknown as { basePath?: string })
      .basePath
    if (!base) throw new Error('Vault basePath unavailable')
    return path.join(base, this.plugin.manifest.dir ?? '', 'prompts')
  }

  private filePath(name: PromptName): string {
    return path.join(this.cacheDir, `${name}.json`)
  }

  async refreshFromManifest(): Promise<void> {
    const auth = this.getAuth()
    if (!auth) return
    let manifest: ManifestEntry[]
    try {
      const res = await requestOmCore(auth, {
        method: 'GET',
        path: '/v1/prompts/manifest',
        timeoutMs: 10_000,
      })
      if (res.status < 200 || res.status >= 300) return
      // om-core returns { prompts: [...] }, not the array directly.
      const body = res.json as { prompts: ManifestEntry[] } | ManifestEntry[]
      manifest = Array.isArray(body) ? body : (body?.prompts ?? [])
    } catch (_e) {
      // om-core unreachable — fall back to whatever is on disk; advisor path
      // will surface its own error if a needed prompt is missing.
      return
    }

    await fs.mkdir(this.cacheDir, { recursive: true })

    for (const entry of manifest) {
      const cached = await this.readDisk(entry.name)
      if (cached && cached.hash === entry.hash) {
        this.mem.set(entry.name, cached)
        continue
      }
      const fresh = await this.fetchOne(entry.name, auth)
      if (fresh) {
        await fs.writeFile(this.filePath(entry.name), JSON.stringify(fresh))
        this.mem.set(entry.name, fresh)
      }
    }
  }

  async get(name: PromptName): Promise<PromptAsset | null> {
    if (this.mem.has(name)) return this.mem.get(name)!
    const onDisk = await this.readDisk(name)
    if (onDisk) {
      this.mem.set(name, onDisk)
      return onDisk
    }
    const auth = this.getAuth()
    if (!auth) return null
    const fresh = await this.fetchOne(name, auth)
    if (fresh) {
      await fs.mkdir(this.cacheDir, { recursive: true })
      await fs.writeFile(this.filePath(name), JSON.stringify(fresh))
      this.mem.set(name, fresh)
    }
    return fresh
  }

  private async readDisk(name: PromptName): Promise<PromptAsset | null> {
    try {
      const raw = await fs.readFile(this.filePath(name), 'utf8')
      return JSON.parse(raw) as PromptAsset
    } catch {
      return null
    }
  }

  private async fetchOne(
    name: PromptName,
    auth: OmCoreAuth,
  ): Promise<PromptAsset | null> {
    try {
      const res = await requestOmCore(auth, {
        method: 'GET',
        path: `/v1/prompts/${name}`,
        timeoutMs: 10_000,
      })
      if (res.status < 200 || res.status >= 300) return null
      const body = res.json as Omit<PromptAsset, 'name'>
      return { ...body, name }
    } catch {
      return null
    }
  }
}
