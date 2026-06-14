const mockRequestUrl = jest.fn<
  Promise<{ status: number; json: unknown; text?: string }>,
  [
    {
      url: string
      method: string
      headers: Record<string, string>
      body?: string
      throw: false
    },
  ]
>()
jest.mock('obsidian', () => ({
  requestUrl: (opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    throw: false
  }) => mockRequestUrl(opts),
}))

import { listModels } from './listModels'
import {
  buildOpenAICompatibleModelUrls,
  normalizeOpenAICompatibleApiBaseUrl,
} from './providerBaseUrl'
import { testChatModel } from './testChatModel'

describe('listModels', () => {
  beforeEach(() => mockRequestUrl.mockReset())

  it('adds /v1 for openai-compatible root base URLs', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { data: [{ id: 'gpt-test' }] },
    })
    await expect(
      listModels({
        type: 'openai-compatible',
        id: 'relay',
        baseUrl: 'https://relay.example.com/',
        apiKey: 'sk-test',
      }),
    ).resolves.toEqual(['gpt-test'])
    expect(mockRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://relay.example.com/v1/models',
      }),
    )
  })

  it('keeps explicit openai-compatible API paths', async () => {
    expect(
      normalizeOpenAICompatibleApiBaseUrl('https://relay.example.com/api/v1/'),
    ).toBe('https://relay.example.com/api/v1')
    expect(
      normalizeOpenAICompatibleApiBaseUrl(
        'https://relay.example.com/v1/chat/completions',
      ),
    ).toBe('https://relay.example.com/v1')
  })

  it('tries cc-switch style fallback endpoints for compat subpaths', async () => {
    mockRequestUrl
      .mockResolvedValueOnce({
        status: 404,
        json: { error: 'not found' },
      })
      .mockResolvedValueOnce({
        status: 200,
        json: { data: [{ id: 'deepseek-chat' }] },
      })
    await expect(
      listModels({
        type: 'openai-compatible',
        id: 'deepseek-relay',
        baseUrl: 'https://api.deepseek.com/anthropic',
        apiKey: 'sk-test',
      }),
    ).resolves.toEqual(['deepseek-chat'])
    expect(mockRequestUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: 'https://api.deepseek.com/anthropic/v1/models',
      }),
    )
    expect(mockRequestUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: 'https://api.deepseek.com/v1/models',
      }),
    )
  })

  it('builds version-segment and compat-subpath candidates like cc-switch', () => {
    expect(
      buildOpenAICompatibleModelUrls(
        'https://open.bigmodel.cn/api/coding/paas/v4',
      ),
    ).toEqual([
      'https://open.bigmodel.cn/api/coding/paas/v4/models',
      'https://open.bigmodel.cn/api/coding/paas/v4/v1/models',
    ])
    expect(
      buildOpenAICompatibleModelUrls(
        'https://ark.cn-beijing.volces.com/api/coding',
      ),
    ).toEqual([
      'https://ark.cn-beijing.volces.com/api/coding/v1/models',
      'https://ark.cn-beijing.volces.com/v1/models',
      'https://ark.cn-beijing.volces.com/models',
    ])
  })

  it('derives model endpoint from full API URLs like cc-switch', () => {
    expect(
      buildOpenAICompatibleModelUrls(
        'https://proxy.example.com/v1/chat/completions',
      ),
    ).toEqual(['https://proxy.example.com/v1/models'])
    expect(
      buildOpenAICompatibleModelUrls(
        'https://proxy.example.com/openai/responses',
      ),
    ).toEqual(['https://proxy.example.com/openai/v1/models'])
  })

  it('reports HTML model responses as a base URL problem', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: '<!doctype html>',
      text: '<!doctype html><html></html>',
    })
    await expect(
      listModels({
        type: 'openai-compatible',
        id: 'relay',
        baseUrl: 'https://relay.example.com',
      }),
    ).rejects.toThrow('Provider returned HTML instead of JSON')
  })

  it('reports JSON parser failures as a base URL problem', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      get json(): unknown {
        throw new Error('Unexpected token < in JSON')
      },
    })
    await expect(
      listModels({
        type: 'openai-compatible',
        id: 'relay',
        baseUrl: 'https://relay.example.com',
      }),
    ).rejects.toThrow('Provider returned a non-JSON model list')
  })

  it('tests deepseek chat through Obsidian requestUrl', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { id: 'ok' },
    })
    await expect(
      testChatModel(
        {
          type: 'deepseek',
          id: 'deepseek',
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk-test',
        },
        'deepseek-chat',
      ),
    ).resolves.toEqual({ ok: true })
    expect(mockRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.deepseek.com/chat/completions',
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      }),
    )
  })

  it('returns provider HTTP errors from chat test', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 401,
      json: { error: 'bad key' },
      text: '{"error":"bad key"}',
    })
    await expect(
      testChatModel(
        {
          type: 'deepseek',
          id: 'deepseek',
          apiKey: 'bad',
        },
        'deepseek-chat',
      ),
    ).resolves.toEqual({
      ok: false,
      message: 'HTTP 401: {"error":"bad key"}',
    })
  })
})
