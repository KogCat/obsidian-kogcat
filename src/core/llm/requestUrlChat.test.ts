const mockRequestUrl = jest.fn<
  Promise<{ status: number; json: unknown; text: string }>,
  [
    {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
      throw?: boolean
    },
  ]
>()

jest.mock('obsidian', () => ({
  requestUrl: (opts: Parameters<typeof mockRequestUrl>[0]) =>
    mockRequestUrl(opts),
}))

import { requestUrlChatCompletion } from './requestUrlChat'

describe('requestUrlChatCompletion', () => {
  beforeEach(() => mockRequestUrl.mockReset())

  it('posts an OpenAI-compatible chat completion through requestUrl', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      text: '',
      json: {
        id: 'chatcmpl-test',
        model: 'gpt-test',
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"ok":true}' },
          },
        ],
      },
    })

    const res = await requestUrlChatCompletion({
      url: 'https://example.com/v1/chat/completions',
      apiKey: 'sk-test',
      request: {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
        response_format: { type: 'json_object' },
        max_tokens: 12,
      },
    })

    expect(res.choices[0].message.content).toBe('{"ok":true}')
    expect(mockRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/v1/chat/completions',
        method: 'POST',
        throw: false,
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    )
    expect(JSON.parse(mockRequestUrl.mock.calls[0][0].body ?? '{}')).toEqual(
      expect.objectContaining({
        model: 'gpt-test',
        response_format: { type: 'json_object' },
        max_tokens: 12,
      }),
    )
  })

  it('throws a compact HTTP error', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 400,
      text: '{ "error": "bad response_format" }',
      json: {},
    })

    await expect(
      requestUrlChatCompletion({
        url: 'https://example.com/v1/chat/completions',
        request: {
          model: 'gpt-test',
          messages: [{ role: 'user', content: 'hi' }],
        },
      }),
    ).rejects.toThrow('HTTP 400')
  })
})
