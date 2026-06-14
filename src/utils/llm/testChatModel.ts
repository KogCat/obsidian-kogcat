import { requestUrl } from 'obsidian'

import { LLMProvider } from '../../types/provider.types'
import { normalizeOpenAICompatibleApiBaseUrl } from './providerBaseUrl'

const TEST_TIMEOUT_MS = 12_000

export type TestChatResult = { ok: true } | { ok: false; message: string }

export async function testChatModel(
  provider: LLMProvider,
  modelName: string,
): Promise<TestChatResult> {
  const req = resolveChatTestRequest(provider, modelName)
  if (!req) return { ok: false, message: 'unsupported provider' }

  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  try {
    const res = await raceTimeout(
      requestUrl({
        url: req.url,
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        throw: false,
      }),
      controller.signal,
    )
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        message: formatHttpError(res.status, res.text),
      }
    }
    return { ok: true }
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err as Error)?.name === 'AbortError'
    return {
      ok: false,
      message: aborted
        ? 'request timed out'
        : ((err as Error)?.message ?? String(err)),
    }
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function raceTimeout<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      new DOMException('The operation timed out.', 'AbortError'),
    )
  }
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () =>
          reject(new DOMException('The operation timed out.', 'AbortError')),
        { once: true },
      )
    }),
  ])
}

function resolveChatTestRequest(
  provider: LLMProvider,
  modelName: string,
): { url: string; headers: Record<string, string>; body: unknown } | null {
  const key = provider.apiKey?.trim() ?? ''
  const jsonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const openAiBody = {
    model: modelName,
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    max_tokens: 8,
  }
  const bearerHeaders = key
    ? { ...jsonHeaders, Authorization: `Bearer ${key}` }
    : jsonHeaders

  switch (provider.type) {
    case 'openai':
      return {
        url: `${trim(provider.baseUrl) || 'https://api.openai.com/v1'}/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'deepseek':
      return {
        url: `${trim(provider.baseUrl) || 'https://api.deepseek.com'}/chat/completions`,
        headers: bearerHeaders,
        body: {
          ...openAiBody,
          temperature: undefined,
          top_p: undefined,
          presence_penalty: undefined,
          frequency_penalty: undefined,
          thinking: { type: 'disabled' },
        },
      }
    case 'openrouter':
      return {
        url: `${trim(provider.baseUrl) || 'https://openrouter.ai/api/v1'}/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'xai':
      return {
        url: `${trim(provider.baseUrl) || 'https://api.x.ai/v1'}/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'mistral':
      return {
        url: `${trim(provider.baseUrl) || 'https://api.mistral.ai/v1'}/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'ollama':
      return {
        url: `${trim(provider.baseUrl) || 'http://127.0.0.1:11434'}/v1/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'lm-studio':
      return {
        url: `${trim(provider.baseUrl) || 'http://127.0.0.1:1234'}/v1/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    case 'openai-compatible': {
      const base = provider.baseUrl?.trim()
        ? normalizeOpenAICompatibleApiBaseUrl(provider.baseUrl)
        : ''
      if (!base) return null
      return {
        url: `${base}/chat/completions`,
        headers: bearerHeaders,
        body: openAiBody,
      }
    }
    case 'anthropic':
      return {
        url: `${trim(provider.baseUrl) || 'https://api.anthropic.com'}/v1/messages`,
        headers: {
          ...jsonHeaders,
          'anthropic-version': '2023-06-01',
          ...(key ? { 'x-api-key': key } : {}),
        },
        body: {
          model: modelName,
          messages: [{ role: 'user', content: 'Reply with one word: ok' }],
          max_tokens: 8,
        },
      }
    case 'gemini': {
      const base =
        trim(provider.baseUrl) ||
        'https://generativelanguage.googleapis.com/v1beta'
      return {
        url: `${base}/models/${encodeURIComponent(modelName)}:generateContent${key ? `?key=${encodeURIComponent(key)}` : ''}`,
        headers: jsonHeaders,
        body: {
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Reply with the single word: ok' }],
            },
          ],
          generationConfig: { maxOutputTokens: 8 },
        },
      }
    }
    default:
      return null
  }
}

function trim(url: string | undefined): string {
  return url?.trim().replace(/\/+$/, '') ?? ''
}

function formatHttpError(status: number, text?: string): string {
  const compact = text?.trim().replace(/\s+/g, ' ').slice(0, 240)
  return compact ? `HTTP ${status}: ${compact}` : `HTTP ${status}`
}
