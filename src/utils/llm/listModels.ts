import { requestUrl } from 'obsidian'

import { LLMProvider, LLMProviderType } from '../../types/provider.types'
import {
  buildOpenAICompatibleModelUrls,
  normalizeProviderBaseUrl,
} from './providerBaseUrl'

// Provider types whose available models can be fetched over HTTP.
const LISTABLE_TYPES: readonly LLMProviderType[] = [
  'openai',
  'openai-compatible',
  'deepseek',
  'openrouter',
  'xai',
  'mistral',
  'ollama',
  'lm-studio',
  'gemini',
  'anthropic',
]

export function providerSupportsModelListing(type: LLMProviderType): boolean {
  return LISTABLE_TYPES.includes(type)
}

// Resolve the models endpoint candidates + headers for a provider; null if unsupported.
function resolveModelsRequest(
  provider: LLMProvider,
): { urls: string[]; headers: Record<string, string> } | null {
  const key = provider.apiKey?.trim() ?? ''
  const base = provider.baseUrl?.trim()
    ? normalizeProviderBaseUrl(provider.baseUrl)
    : ''
  const bearer: Record<string, string> = key
    ? { Authorization: `Bearer ${key}` }
    : {}

  switch (provider.type) {
    case 'openai':
      return {
        urls: [`${base || 'https://api.openai.com/v1'}/models`],
        headers: bearer,
      }
    case 'openai-compatible':
      return base
        ? {
            urls: buildOpenAICompatibleModelUrls(base),
            headers: bearer,
          }
        : null
    case 'deepseek':
      return {
        urls: [`${base || 'https://api.deepseek.com'}/models`],
        headers: bearer,
      }
    case 'openrouter':
      return {
        urls: [`${base || 'https://openrouter.ai/api/v1'}/models`],
        headers: bearer,
      }
    case 'xai':
      return {
        urls: [`${base || 'https://api.x.ai/v1'}/models`],
        headers: bearer,
      }
    case 'mistral':
      return {
        urls: [`${base || 'https://api.mistral.ai/v1'}/models`],
        headers: bearer,
      }
    case 'ollama':
      return {
        urls: [`${base || 'http://127.0.0.1:11434'}/v1/models`],
        headers: bearer,
      }
    case 'lm-studio':
      return {
        urls: [`${base || 'http://127.0.0.1:1234'}/v1/models`],
        headers: bearer,
      }
    case 'anthropic':
      return {
        urls: [`${base || 'https://api.anthropic.com'}/v1/models`],
        headers: {
          'anthropic-version': '2023-06-01',
          ...(key ? { 'x-api-key': key } : {}),
        },
      }
    case 'gemini': {
      const gbase = base || 'https://generativelanguage.googleapis.com/v1beta'
      return {
        urls: [
          `${gbase}/models${key ? `?key=${encodeURIComponent(key)}` : ''}`,
        ],
        headers: {},
      }
    }
    default:
      return null
  }
}

type ModelsJson = {
  data?: { id?: string }[]
  models?: { id?: string; name?: string }[]
}

type ModelsResponse = {
  status: number
  json: unknown
  text?: string
}

// OpenAI-style `{data:[{id}]}`, Gemini `{models:[{name}]}`, or both.
function parseModelIds(json: ModelsJson): string[] {
  const ids = new Set<string>()
  for (const m of json.data ?? []) if (m?.id) ids.add(m.id)
  for (const m of json.models ?? []) {
    const raw = m?.id ?? m?.name
    if (raw) ids.add(raw.replace(/^models\//, ''))
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

// Fetch the model ids a provider exposes. Throws on unsupported / HTTP error.
export async function listModels(provider: LLMProvider): Promise<string[]> {
  const req = resolveModelsRequest(provider)
  if (!req || req.urls.length === 0) throw new Error('unsupported provider')
  let lastEndpointError = ''
  for (const url of req.urls) {
    try {
      return await fetchModelsFromUrl(url, req.headers)
    } catch (error) {
      const message = (error as Error).message
      if (/^HTTP (404|405)\b/.test(message)) {
        lastEndpointError = message
        continue
      }
      throw error
    }
  }
  throw new Error(
    lastEndpointError
      ? `No models endpoint found. Last error: ${lastEndpointError}`
      : 'No models endpoint found.',
  )
}

async function fetchModelsFromUrl(
  url: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const res = (await requestUrl({
    url,
    method: 'GET',
    headers,
    throw: false,
  })) as ModelsResponse
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}`)
  }
  let json: unknown
  try {
    json = res.json
  } catch {
    throw new Error(
      'Provider returned a non-JSON model list. Check that Base URL points to the API endpoint, usually ending in /v1.',
    )
  }
  if (typeof json !== 'object' || json === null) {
    const hint =
      typeof res.text === 'string' && /^\s*</.test(res.text)
        ? 'Provider returned HTML instead of JSON. Check that Base URL points to the API endpoint, usually ending in /v1.'
        : 'Provider returned a non-JSON model list.'
    throw new Error(hint)
  }
  return parseModelIds(json as ModelsJson)
}
