import { ChildProcess, spawn } from 'child_process'
import { promises as fs, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'

import {
  CalibrationPlacement,
  calibrate,
  directiveTriggersRewrite,
} from '../../core/kogcat/calibrate'
import { PromptCache } from '../../core/kogcat/prompts'
import { rewriteResponse } from '../../core/kogcat/rewrite'
import { BaseLLMProvider } from '../../core/llm/base'
import {
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'

// KogCat full-chain acceptance.
// Spawns scripts/mock-om-core.mjs, then drives every client module the
// production plugin uses end-to-end:
//   1. PromptCache → manifest fetch + per-prompt fetch + on-disk caching
//   2. calibrate() → all 5 stances + null
//   3. rewriteResponse() → with a stub LLM streaming back R'
//
// LLM is stubbed because the production code expects a chatModel + provider
// client; the goal here is to validate the wiring + serialization, not the
// real LLM call (which is out of KogCat's scope per spec §2.3).

let serverProc: ChildProcess
let cacheDir: string
let socketPath: string
let AUTH: import('../../core/om-core/transport').OmCoreAuth

beforeAll(async () => {
  cacheDir = mkdtempSync(path.join(tmpdir(), 'kogcat-e2e-'))
  socketPath = path.join(cacheDir, 'om.sock')
  AUTH = { transport: 'uds', target: socketPath, token: '' }
  serverProc = spawn(
    process.execPath,
    [
      path.resolve(__dirname, '../../../scripts/mock-om-core.mjs'),
      '--socket',
      socketPath,
    ],
    { stdio: 'pipe' },
  )
  // Wait for server to print its ready line.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('mock-om-core did not start')),
      5000,
    )
    serverProc.stdout?.on('data', (b: Buffer) => {
      if (b.toString().includes('listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
    serverProc.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}, 10_000)

afterAll(async () => {
  if (serverProc) {
    await new Promise<void>((resolve) => {
      serverProc.on('exit', () => resolve())
      serverProc.kill('SIGTERM')
    })
  }
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true })
})

// ---------- Stubs ----------

// Minimal Plugin/App fakes good enough for PromptCache to compute its on-disk
// path. Real Obsidian provides Vault + manifest.dir; we forward both via a
// throwaway directory created in beforeAll.
function makePluginStub(): {
  app: { vault: { adapter: { basePath: string } } }
  plugin: { manifest: { dir: string } }
} {
  return {
    app: { vault: { adapter: { basePath: cacheDir } } } as ReturnType<
      typeof makePluginStub
    >['app'],
    plugin: { manifest: { dir: '.' } },
  }
}

// LLM stub: replies with a predetermined chunk sequence used by rewrite.
class StubProvider extends BaseLLMProvider<never> {
  constructor(private chunks: string[]) {
    super(undefined as never)
  }

  generateResponse(): Promise<LLMResponseNonStreaming> {
    throw new Error('not used')
  }

  async streamResponse(
    _model: unknown,
    _request: LLMRequestStreaming | LLMRequestNonStreaming,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    const chunks = this.chunks
    return (async function* () {
      for (const text of chunks) {
        yield {
          id: 'stub',
          choices: [{ delta: { content: text } }],
        } as unknown as LLMResponseStreaming
      }
    })()
  }

  async getEmbedding(): Promise<number[]> {
    throw new Error('not used')
  }
}

const fakeChatModel = {
  id: 'stub-model',
  providerId: 'stub',
  providerType: 'openai-compatible',
  model: 'stub-model',
  enable: true,
} as never

// ---------- Tests ----------

describe('KogCat full chain (mock om-core)', () => {
  it('engine reachable + prompts cached on disk by hash', async () => {
    // Sanity: healthz (also done by lifecycle in production)
    const health = (await import('../../core/om-core/transport')).requestOmCore
    const healthResp = await health(AUTH, { path: '/healthz' })
    const healthJson = healthResp.json as { ok?: boolean }
    expect(healthJson.ok).toBe(true)

    const stub = makePluginStub()
    const cache = new PromptCache(
      stub.app as never,
      stub.plugin as never,
      () => AUTH,
    )
    await cache.refreshFromManifest()

    const rewrite = await cache.get('calibrate-rewrite')
    expect(rewrite?.name).toBe('calibrate-rewrite')
    expect(rewrite?.hash).toBeTruthy()

    // Verify hash-keyed file landed on disk so a second boot wouldn't re-fetch.
    const onDisk = await fs.readFile(
      path.join(cacheDir, 'prompts', 'calibrate-rewrite.json'),
      'utf8',
    )
    const parsed = JSON.parse(onDisk)
    expect(parsed.hash).toEqual(rewrite?.hash)
  })

  it('calibrate routes by directive placement and triggers rewrite where appropriate', async () => {
    const cases: {
      text: string
      expectedPlacement: CalibrationPlacement
      shouldEmit: boolean
      triggersRewrite: boolean
    }[] = [
      {
        text: 'fact-only response with no signals',
        expectedPlacement: 'none',
        shouldEmit: false,
        triggersRewrite: false,
      },
      {
        text: 'this contains warn keyword',
        expectedPlacement: 'front',
        shouldEmit: true,
        triggersRewrite: true,
      },
      {
        text: 'please calibrate this',
        expectedPlacement: 'inline',
        shouldEmit: true,
        triggersRewrite: true,
      },
      {
        // Reinforce in v25 maps to inline + no primary_mode, which the
        // client now routes as rewrite (it's still useful to surface as
        // a supplementary advisor note).
        text: 'matches reinforce pattern',
        expectedPlacement: 'inline',
        shouldEmit: true,
        triggersRewrite: true,
      },
      {
        text: 'should hit flag_gap path',
        expectedPlacement: 'suffix',
        shouldEmit: true,
        triggersRewrite: false,
      },
      {
        // answer = front + primary_mode=kb → passive reinforce display
        text: 'definitive answer mode',
        expectedPlacement: 'front',
        shouldEmit: true,
        triggersRewrite: false,
      },
    ]

    for (const c of cases) {
      const r = await calibrate({
        auth: AUTH,
        text: c.text,
        source: 'chat_response',
      })
      expect(r).not.toBeNull()
      expect(r!.directive.placement).toBe(c.expectedPlacement)
      expect(r!.directive.should_emit).toBe(c.shouldEmit)
      expect(directiveTriggersRewrite(r!.directive)).toBe(c.triggersRewrite)
    }
  })

  it('rewrite path streams R prime via stub LLM', async () => {
    const stub = makePluginStub()
    const cache = new PromptCache(
      stub.app as never,
      stub.plugin as never,
      () => AUTH,
    )

    const calibration = await calibrate({
      auth: AUTH,
      text: 'warn me',
      source: 'chat_response',
    })
    expect(calibration?.directive.placement).toBe('front')
    expect(calibration?.directive.should_emit).toBe(true)

    const provider = new StubProvider([
      'Calibrated ',
      'response: ',
      'check signal.',
    ])
    const collected: string[] = []
    const outcome = await rewriteResponse({
      originalResponse: 'original LLM text',
      calibration: calibration!,
      promptCache: cache,
      providerClient: provider as never,
      model: fakeChatModel,
      onDelta: (chunk) => collected.push(chunk),
    })
    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.text).toBe('Calibrated response: check signal.')
    }
    expect(collected.join('')).toBe('Calibrated response: check signal.')
  })

  it('calibrate honors timeout when om-core hangs', async () => {
    const closedSocket = path.join(cacheDir, 'closed.sock')
    const r = await calibrate({
      auth: { transport: 'uds', target: closedSocket, token: '' },
      text: 'whatever',
      source: 'chat_response',
      timeoutMs: 200,
    })
    expect(r).toBeNull()
  })
})
