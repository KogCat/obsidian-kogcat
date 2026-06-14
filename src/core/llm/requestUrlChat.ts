import { requestUrl } from 'obsidian'

import { LLMRequestNonStreaming, RequestMessage } from '../../types/llm/request'
import { LLMResponseNonStreaming } from '../../types/llm/response'

type RequestUrlChatOptions = {
  url: string
  apiKey?: string
  request: LLMRequestNonStreaming
  signal?: AbortSignal
  noStainless?: boolean
}

export async function requestUrlChatCompletion({
  url,
  apiKey,
  request,
  signal,
  noStainless = true,
}: RequestUrlChatOptions): Promise<LLMResponseNonStreaming> {
  const body = buildRequestBody(request)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
  if (!noStainless) {
    headers['X-Stainless-Arch'] = 'unknown'
  }
  const res = await raceAbort(
    requestUrl({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      throw: false,
    }),
    signal,
  )
  if (res.status < 200 || res.status >= 300) {
    throw new Error(formatHttpError(res.status, res.text))
  }
  return parseChatCompletionResponse(res.json, request.model)
}

function buildRequestBody(
  request: LLMRequestNonStreaming,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages.map(parseRequestMessage),
    tools: request.tools,
    tool_choice: request.tool_choice,
    reasoning_effort: request.reasoning_effort,
    response_format: request.response_format,
    web_search_options: request.web_search_options,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    frequency_penalty: request.frequency_penalty,
    presence_penalty: request.presence_penalty,
    logit_bias: request.logit_bias,
    prediction: request.prediction,
    ...(request.extra_body ?? {}),
  }
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }
  return body
}

function parseRequestMessage(message: RequestMessage): Record<string, unknown> {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content }
    case 'system':
      return { role: 'system', content: message.content }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.tool_calls?.map((toolCall) => ({
          id: toolCall.id,
          function: {
            arguments: toolCall.arguments ?? '{}',
            name: toolCall.name,
          },
          type: 'function',
        })),
      }
    case 'tool':
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.tool_call.id,
      }
  }
}

function parseChatCompletionResponse(
  raw: unknown,
  fallbackModel: string,
): LLMResponseNonStreaming {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawChoices = Array.isArray(obj.choices) ? obj.choices : []
  return {
    id: typeof obj.id === 'string' ? obj.id : '',
    created: typeof obj.created === 'number' ? obj.created : undefined,
    model: typeof obj.model === 'string' ? obj.model : fallbackModel,
    object: 'chat.completion',
    system_fingerprint:
      typeof obj.system_fingerprint === 'string'
        ? obj.system_fingerprint
        : undefined,
    usage:
      obj.usage && typeof obj.usage === 'object'
        ? (obj.usage as LLMResponseNonStreaming['usage'])
        : undefined,
    choices: rawChoices.map((choice) => parseChoice(choice)),
  }
}

function parseChoice(
  choice: unknown,
): LLMResponseNonStreaming['choices'][number] {
  const c =
    choice && typeof choice === 'object'
      ? (choice as Record<string, unknown>)
      : {}
  const message =
    c.message && typeof c.message === 'object'
      ? (c.message as Record<string, unknown>)
      : {}
  return {
    finish_reason:
      typeof c.finish_reason === 'string' || c.finish_reason === null
        ? c.finish_reason
        : null,
    message: {
      content:
        typeof message.content === 'string' || message.content === null
          ? message.content
          : '',
      reasoning:
        typeof message.reasoning === 'string' ? message.reasoning : undefined,
      role: typeof message.role === 'string' ? message.role : 'assistant',
    },
  }
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(
      new DOMException('The operation was aborted.', 'AbortError'),
    )
  }
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true },
      )
    }),
  ])
}

function formatHttpError(status: number, text?: string): string {
  const compact = text?.trim().replace(/\s+/g, ' ').slice(0, 500)
  return compact ? `HTTP ${status}: ${compact}` : `HTTP ${status}`
}
