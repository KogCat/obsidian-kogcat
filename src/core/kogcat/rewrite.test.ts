import { ChatModel } from '../../types/chat-model.types'
import { LLMRequestStreaming } from '../../types/llm/request'
import { LLMResponseStreaming } from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { BaseLLMProvider } from '../llm/base'

import { CalibrationResult } from './calibrate'
import { PromptAsset, PromptCache } from './prompts'
import { rewriteResponse } from './rewrite'

// PromptCache partial mock — rewrite.ts only calls promptCache.get()
function mockCache(asset: PromptAsset | null): PromptCache {
  return { get: jest.fn().mockResolvedValue(asset) } as unknown as PromptCache
}

const model = {
  model: 'test-model',
  id: 'test',
  providerId: 'openai',
} as ChatModel

// Provider that yields preset chunks then terminates
class ChunkProvider extends BaseLLMProvider<LLMProvider> {
  constructor(private readonly chunks: LLMResponseStreaming[]) {
    super({ type: 'openai', id: 'test' } as LLMProvider)
  }
  async generateResponse(): Promise<never> {
    throw new Error('not used')
  }
  async streamResponse() {
    const c = this.chunks
    return (async function* () {
      for (const chunk of c) yield chunk
    })()
  }
  async getEmbedding(): Promise<number[]> {
    return []
  }
}

function makeChunk(content: string): LLMResponseStreaming {
  return {
    id: 'x',
    model: 'test-model',
    object: 'chat.completion.chunk',
    choices: [{ finish_reason: null, delta: { content } }],
  }
}

const basePrompt: PromptAsset = {
  name: 'calibrate-rewrite',
  version: '3',
  hash: 'abc123',
  system: 'You are a calibration assistant.',
  // Template uses the canonical variable names introduced in prompt v3
  // (post v25 directive refactor). If these ever drift, the variable-
  // contract test below will catch it.
  user_template:
    'R={{R}} phrasing={{phrasing}} note={{user_facing_note}} ' +
    'placement={{placement}} refs={{inline_refs}} ref_count={{inline_ref_count}}',
}

const baseCalibration: CalibrationResult = {
  directive: {
    should_emit: true,
    placement: 'front',
    phrasing: '',
    inline_refs: [],
  },
}

describe('rewriteResponse', () => {
  test('no_prompt — returns no_prompt when cache misses', async () => {
    const result = await rewriteResponse({
      originalResponse: 'hello',
      calibration: baseCalibration,
      promptCache: mockCache(null),
      providerClient: new ChunkProvider([]),
      model,
      onDelta: jest.fn(),
    })
    expect(result).toEqual({ kind: 'no_prompt' })
  })

  test('ok — accumulates chunks and fires onDelta', async () => {
    const deltas: string[] = []
    const result = await rewriteResponse({
      originalResponse: 'R',
      calibration: baseCalibration,
      promptCache: mockCache(basePrompt),
      providerClient: new ChunkProvider([
        makeChunk('Hello'),
        makeChunk(' world'),
      ]),
      model,
      onDelta: (c) => deltas.push(c),
    })
    expect(result).toEqual({ kind: 'ok', text: 'Hello world' })
    expect(deltas).toEqual(['Hello', ' world'])
  })

  test('ok — ignores null/undefined delta content', async () => {
    const nullChunk: LLMResponseStreaming = {
      id: 'x',
      model: 'test-model',
      object: 'chat.completion.chunk',
      choices: [{ finish_reason: null, delta: { content: null } }],
    }
    const deltas: string[] = []
    const result = await rewriteResponse({
      originalResponse: 'R',
      calibration: baseCalibration,
      promptCache: mockCache(basePrompt),
      providerClient: new ChunkProvider([nullChunk, makeChunk('B')]),
      model,
      onDelta: (c) => deltas.push(c),
    })
    expect(result).toEqual({ kind: 'ok', text: 'B' })
    expect(deltas).toEqual(['B'])
  })

  test('error — returns error when streamResponse throws', async () => {
    class FailProvider extends BaseLLMProvider<LLMProvider> {
      constructor() {
        super({ type: 'openai', id: 'test' } as LLMProvider)
      }
      async generateResponse(): Promise<never> {
        throw new Error()
      }
      async streamResponse(): Promise<never> {
        throw new Error('network failure')
      }
      async getEmbedding(): Promise<number[]> {
        return []
      }
    }
    const result = await rewriteResponse({
      originalResponse: 'R',
      calibration: baseCalibration,
      promptCache: mockCache(basePrompt),
      providerClient: new FailProvider(),
      model,
      onDelta: jest.fn(),
    })
    expect(result).toEqual({ kind: 'error', message: 'network failure' })
  })

  // Regression: rewrite.ts must pass the v3 directive-shaped variables
  // (R / phrasing / user_facing_note / placement / inline_refs / inline_ref_count).
  // Missing keys silently become empty strings, sending blanks to the LLM.
  describe('variable contract — R/phrasing/user_facing_note/placement/inline_refs/inline_ref_count (prompt v3 regression guard)', () => {
    let capturedUserContent = ''
    let capturedSystemContent = ''

    class CapturingProvider extends BaseLLMProvider<LLMProvider> {
      constructor() {
        super({ type: 'openai', id: 'test' } as LLMProvider)
      }
      async generateResponse(): Promise<never> {
        throw new Error()
      }
      async streamResponse(_m: ChatModel, req: LLMRequestStreaming) {
        const systemMsg = req.messages.find((m) => m.role === 'system')
        const userMsg = req.messages.find((m) => m.role === 'user')
        capturedSystemContent = (systemMsg?.content as string) ?? ''
        capturedUserContent = (userMsg?.content as string) ?? ''
        return (async function* () {})()
      }
      async getEmbedding(): Promise<number[]> {
        return []
      }
    }

    beforeEach(() => {
      capturedSystemContent = ''
      capturedUserContent = ''
    })

    test('passes R, phrasing, user_facing_note, placement, inline_refs, inline_ref_count', async () => {
      await rewriteResponse({
        originalResponse: 'fixture-original-response',
        calibration: {
          directive: {
            should_emit: true,
            placement: 'inline',
            phrasing: 'fixture-phrasing-text',
            inline_refs: [{ title: 'fixture-ref-title' }],
            user_facing_note: 'fixture-note',
          },
        },
        promptCache: mockCache(basePrompt),
        providerClient: new CapturingProvider(),
        model,
        onDelta: jest.fn(),
      })
      expect(capturedUserContent).toContain('R=fixture-original-response')
      expect(capturedUserContent).toContain('phrasing=fixture-phrasing-text')
      expect(capturedUserContent).toContain('placement=inline')
      expect(capturedUserContent).toContain('note=fixture-note')
      expect(capturedUserContent).toContain('"fixture-ref-title"') // inline_refs JSON-stringified
      expect(capturedUserContent).toContain('ref_count=1')
    })

    test('adds advisor-answer output constraints', async () => {
      await rewriteResponse({
        originalResponse: 'fixture-original-response',
        calibration: baseCalibration,
        promptCache: mockCache(basePrompt),
        providerClient: new CapturingProvider(),
        model,
        onDelta: jest.fn(),
      })

      expect(capturedSystemContent).toContain('KogCat advisor answer')
      expect(capturedSystemContent).toContain('not a diff')
    })

    test('adds quick-answer constraints for short supplemental guidance', async () => {
      await rewriteResponse({
        originalResponse: '走走停停还是持续跑步更好？',
        calibration: baseCalibration,
        promptCache: mockCache(basePrompt),
        providerClient: new CapturingProvider(),
        model,
        answerMode: 'quick',
        onDelta: jest.fn(),
      })

      expect(capturedSystemContent).toContain('Quick Answer mode')
      expect(capturedSystemContent).toContain('short supplemental note')
      expect(capturedSystemContent).toContain(
        'Do not write a full replacement answer',
      )
      expect(capturedSystemContent).toContain(
        'Do not place KB references inline',
      )
      expect(capturedSystemContent).toContain('smooth and natural')
    })

    test('adds advisor-answer constraints for a complete primary answer', async () => {
      await rewriteResponse({
        originalResponse: '走走停停还是持续跑步更好？',
        calibration: baseCalibration,
        promptCache: mockCache(basePrompt),
        providerClient: new CapturingProvider(),
        model,
        answerMode: 'advisor',
        onDelta: jest.fn(),
      })

      expect(capturedSystemContent).toContain('Advisor Answer mode')
      expect(capturedSystemContent).toContain('complete primary answer')
      expect(capturedSystemContent).toContain(
        'The user should not need the original LLM answer',
      )
      expect(capturedSystemContent).toContain(
        'Do not place KB references inline',
      )
      expect(capturedSystemContent).toContain('smooth and natural')
    })

    test('missing template keys render as empty string, not the key name', async () => {
      const sparsePrompt: PromptAsset = {
        ...basePrompt,
        user_template: 'known={{R}} unknown={{missing_key}}',
      }
      await rewriteResponse({
        originalResponse: 'test input',
        calibration: baseCalibration,
        promptCache: mockCache(sparsePrompt),
        providerClient: new CapturingProvider(),
        model,
        onDelta: jest.fn(),
      })
      expect(capturedUserContent).toBe('known=test input unknown=')
    })

    test('R is not empty even when directive is sparse / idle', async () => {
      await rewriteResponse({
        originalResponse: 'non-empty original',
        calibration: {
          directive: {
            should_emit: false,
            placement: 'none',
            phrasing: '',
            inline_refs: [],
          },
        },
        promptCache: mockCache(basePrompt),
        providerClient: new CapturingProvider(),
        model,
        onDelta: jest.fn(),
      })
      expect(capturedUserContent).toContain('R=non-empty original')
    })
  })

  test('abort — stops accumulating after signal fires', async () => {
    const controller = new AbortController()
    const deltas: string[] = []

    class AbortingProvider extends BaseLLMProvider<LLMProvider> {
      constructor() {
        super({ type: 'openai', id: 'test' } as LLMProvider)
      }
      async generateResponse(): Promise<never> {
        throw new Error()
      }
      async streamResponse() {
        return (async function* () {
          yield makeChunk('first')
          controller.abort()
          yield makeChunk('second')
        })()
      }
      async getEmbedding(): Promise<number[]> {
        return []
      }
    }

    await rewriteResponse({
      originalResponse: 'R',
      calibration: baseCalibration,
      promptCache: mockCache(basePrompt),
      providerClient: new AbortingProvider(),
      model,
      abortSignal: controller.signal,
      onDelta: (c) => deltas.push(c),
    })
    expect(deltas).toEqual(['first'])
  })
})
