const trimSlash = (url: string): string => url.replace(/\/+$/, '')

const KNOWN_COMPAT_SUFFIXES = [
  '/api/claudecode',
  '/api/anthropic',
  '/apps/anthropic',
  '/api/coding',
  '/claudecode',
  '/anthropic',
  '/step_plan',
  '/coding',
  '/claude',
] as const

export function normalizeProviderBaseUrl(url: string): string {
  return trimSlash(url.trim())
}

export function normalizeOpenAICompatibleApiBaseUrl(url: string): string {
  const base = normalizeProviderBaseUrl(url)
  if (!base) return ''
  const fullApiBase = deriveApiBaseFromFullApiUrl(base)
  if (fullApiBase) return fullApiBase
  if (endsWithVersionSegment(base)) return base
  try {
    const parsed = new URL(base)
    const path = parsed.pathname.replace(/\/+$/, '')
    if (!path || path === '/') {
      parsed.pathname = '/v1'
      parsed.search = ''
      parsed.hash = ''
      return trimSlash(parsed.toString())
    }
  } catch {
    return base
  }
  return base
}

export function buildOpenAICompatibleModelUrls(url: string): string[] {
  const base = normalizeProviderBaseUrl(url)
  if (!base) return []

  const candidates: string[] = []
  if (looksLikeFullApiUrl(base)) {
    const derived = deriveModelUrlFromFullApiUrl(base)
    if (derived) candidates.push(derived)
    return unique(candidates)
  }

  if (endsWithVersionSegment(base)) {
    candidates.push(`${base}/models`)
    if (!base.endsWith('/v1')) candidates.push(`${base}/v1/models`)
  } else {
    candidates.push(`${base}/v1/models`)
  }

  const stripped = stripCompatSuffix(base)
  if (stripped) {
    const root = normalizeProviderBaseUrl(stripped)
    if (root && root.includes('://')) {
      candidates.push(`${root}/v1/models`)
      candidates.push(`${root}/models`)
    }
  }

  return unique(candidates)
}

function endsWithVersionSegment(url: string): boolean {
  const last = url.split('/').pop() ?? ''
  return /^v\d+$/.test(last)
}

function looksLikeFullApiUrl(url: string): boolean {
  return /\/(chat\/completions|responses|completions|embeddings)$/.test(url)
}

function deriveModelUrlFromFullApiUrl(url: string): string | null {
  const apiBase = deriveApiBaseFromFullApiUrl(url)
  return apiBase ? `${apiBase}/models` : null
}

function deriveApiBaseFromFullApiUrl(url: string): string | null {
  const v1Index = url.indexOf('/v1/')
  if (v1Index >= 0) return `${url.slice(0, v1Index)}/v1`

  const lastSlash = url.lastIndexOf('/')
  if (lastSlash < 0) return null
  const root = url.slice(0, lastSlash)
  if (!root.includes('://')) return null
  return `${root}/v1`
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function stripCompatSuffix(baseUrl: string): string | null {
  for (const suffix of KNOWN_COMPAT_SUFFIXES) {
    if (baseUrl.endsWith(suffix)) {
      return baseUrl.slice(0, -suffix.length)
    }
  }
  return null
}
