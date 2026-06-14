import { ChatModel } from '../../types/chat-model.types'
import { LLMRequestNonStreaming } from '../../types/llm/request'
import { LLMResponseNonStreaming } from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { BaseLLMProvider } from '../llm/base'

import {
  buildObsidianReviewSeeds,
  curateReviewDeterministic,
  inferThoughtMode,
  nextStepForMode,
  synthesizeReview,
} from './reviewSynthesis'

const model = {
  id: 'test',
  model: 'test-model',
  providerId: 'openai',
  providerType: 'openai',
} as ChatModel

class CapturingProvider extends BaseLLMProvider<LLMProvider> {
  request: LLMRequestNonStreaming | null = null
  requests: LLMRequestNonStreaming[] = []
  calls = 0

  constructor(
    private readonly response:
      | LLMResponseNonStreaming
      | (LLMResponseNonStreaming | Error)[],
  ) {
    super({ type: 'openai', id: 'test' } as LLMProvider)
  }

  async generateResponse(_m: ChatModel, req: LLMRequestNonStreaming) {
    this.request = req
    this.requests.push(req)
    const response = Array.isArray(this.response)
      ? this.response[Math.min(this.calls, this.response.length - 1)]
      : this.response
    this.calls += 1
    if (response instanceof Error) throw response
    return response
  }

  async streamResponse(): Promise<never> {
    throw new Error('not used')
  }

  async getEmbedding(): Promise<number[]> {
    return []
  }
}

function makeResponse(
  content: string,
  finish_reason: string | null = 'stop',
): LLMResponseNonStreaming {
  return {
    id: 'x',
    model: 'test-model',
    object: 'chat.completion',
    choices: [
      {
        finish_reason,
        message: { content, role: 'assistant' },
      },
    ],
  }
}

describe('reviewSynthesis thought mode', () => {
  it('classifies common Obsidian fragments', () => {
    expect(inferThoughtMode('摘录：作者说个人知识库容易变成收藏夹。')).toBe(
      'summary',
    )
    expect(
      inferThoughtMode('我判断现在应该先做 Obsidian pack，因为触发面更大。'),
    ).toBe('claim')
    expect(inferThoughtMode('- [ ] 明天整理 daily note 模板')).toBe('action')
    expect(inferThoughtMode('- 作者说知识管理很容易变成收藏癖')).toBe('summary')
    expect(inferThoughtMode('会议记录：KogCat onboarding')).toBe('capture')
  })

  it('adds a mode and next step to deterministic no-signal output', () => {
    const out = curateReviewDeterministic(
      {
        summary: '无显著差异',
        has_signal: false,
        warnings: [],
        clusters: [],
        reinforce: [],
      },
      '摘录：这篇文章主要讲 collector fallacy。',
    )

    expect(out.mode).toBe('summary')
    expect(out.next_step).toBe(nextStepForMode('summary'))
    expect(out.points).toEqual([])
  })

  it('keeps deterministic fallback language aligned with selected text', () => {
    const out = curateReviewDeterministic(
      {
        summary: 'Signals found',
        has_signal: true,
        warnings: [
          {
            kind: 'anti_pattern',
            anchor: 'confirmation bias',
            note: 'Kogcat opposes: [confirmation bias]',
            claim: null,
            far: null,
            stable_id: 'x',
          },
        ],
        clusters: [],
        reinforce: [],
      },
      'I think we should keep going because the supporting signs look strong.',
    )

    expect(out.next_step).toContain('assumption')
    expect(out.points[0].judgment).toContain('This may match')
  })

  it('keeps backend warnings visible when LLM refinement is unavailable', () => {
    const out = curateReviewDeterministic(
      {
        summary: '与 KB 交叉出 2 处反对',
        has_signal: true,
        warnings: [
          {
            kind: 'anti_pattern',
            anchor: '德克萨斯神枪手谬误',
            note: 'Kogcat 反对（命中已知反模式）：[德克萨斯神枪手谬误]',
            claim: null,
            far: null,
            stable_id: 'x',
          },
          {
            kind: 'contradicts',
            anchor: '效用',
            note: 'Kogcat 反对（KB 有反向声明）：[效用] ←→ [前景理论]：经典效用模型被前景理论反驳',
            claim: '经典效用模型被前景理论反驳',
            far: '前景理论',
            stable_id: 'y',
          },
        ],
        clusters: [],
        reinforce: [],
      },
      '我觉得只要看到这些支持信号,就应该继续投入。',
    )

    expect(out.points.length).toBeGreaterThan(0)
    expect(out.points[0].judgment).toContain('德克萨斯神枪手谬误')
  })

  it('asks LLM refinement for compact JSON and rejects truncated output', async () => {
    const providerClient = new CapturingProvider(
      makeResponse('{"summary":"截断"', 'length'),
    )
    const out = await synthesizeReview({
      selectedText: '我觉得只要看到这些支持信号,就应该继续投入。'.repeat(50),
      review: {
        summary: '与 KB 交叉出 1 处反对',
        has_signal: true,
        warnings: [
          {
            kind: 'anti_pattern',
            anchor: '德克萨斯神枪手谬误',
            note: 'Kogcat 反对（命中已知反模式）：[德克萨斯神枪手谬误]',
            claim: null,
            far: null,
            stable_id: 'x',
          },
        ],
        clusters: [],
        reinforce: [],
      },
      providerClient,
      model,
    })

    expect(out).toBeNull()
    expect(providerClient.request?.response_format).toEqual({
      type: 'json_object',
    })
    expect(providerClient.request?.max_tokens).toBe(1200)
    const userMessage = providerClient.request?.messages.find(
      (m) => m.role === 'user',
    )
    expect((userMessage?.content as string).length).toBeLessThan(1800)
  })

  it('retries without response_format when JSON mode is rejected', async () => {
    const providerClient = new CapturingProvider([
      new Error('HTTP 400: unsupported response_format'),
      makeResponse(
        '{"summary":"这段判断有一个可检查的依据。","mode":"claim","next_step":"补一个反例。","points":[{"stance":"bridge","judgment":"先检查支持信号是否足够独立。","why":"候选提示这里可能只是同一来源重复。","refs":["德克萨斯神枪手谬误"]}]}',
      ),
    ])
    const out = await synthesizeReview({
      selectedText: '我觉得只要看到这些支持信号,就应该继续投入。',
      review: {
        summary: '与 KB 交叉出 1 处反对',
        has_signal: true,
        warnings: [
          {
            kind: 'anti_pattern',
            anchor: '德克萨斯神枪手谬误',
            note: 'Kogcat 反对（命中已知反模式）：[德克萨斯神枪手谬误]',
            claim: null,
            far: null,
            stable_id: 'x',
          },
        ],
        clusters: [],
        reinforce: [],
      },
      providerClient,
      model,
    })

    expect(out?.summary).toContain('可检查')
    expect(providerClient.requests).toHaveLength(2)
    expect(providerClient.requests[0].response_format).toEqual({
      type: 'json_object',
    })
    expect(providerClient.requests[1].response_format).toBeUndefined()
  })

  it('builds Obsidian scenario seeds from existing KB language', () => {
    expect(
      buildObsidianReviewSeeds('摘录：作者说笔记要服务输出。').join(' '),
    ).toContain('知识与行动并济')
    expect(
      buildObsidianReviewSeeds('- [ ] 本周整理插件清单').join(' '),
    ).toContain('承诺谬误')
    expect(
      buildObsidianReviewSeeds(
        '我判断这个功能值得先做，因为用户触发面更大。',
      ).join(' '),
    ).toContain('因果谬误')
  })
})
