import OpenAI from 'openai'

import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { normalizeOpenAICompatibleApiBaseUrl } from '../../utils/llm/providerBaseUrl'
import { formatMessages } from '../../utils/llm/request'

import { BaseLLMProvider } from './base'
import { LLMBaseUrlNotSetException } from './exception'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'
import { requestUrlChatCompletion } from './requestUrlChat'

export class OpenAICompatibleProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'openai-compatible' }>
> {
  private adapter: OpenAIMessageAdapter
  private client: OpenAI

  constructor(provider: Extract<LLMProvider, { type: 'openai-compatible' }>) {
    super(provider)
    this.adapter = new OpenAIMessageAdapter()
    this.client = new (
      provider.additionalSettings?.noStainless ? NoStainlessOpenAI : OpenAI
    )({
      apiKey: provider.apiKey ?? '',
      baseURL: provider.baseUrl
        ? normalizeOpenAICompatibleApiBaseUrl(provider.baseUrl)
        : '',
      dangerouslyAllowBrowser: true,
    })
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: formatMessages(request.messages),
    }
    return requestUrlChatCompletion({
      url: `${normalizeOpenAICompatibleApiBaseUrl(this.provider.baseUrl)}/chat/completions`,
      apiKey: this.provider.apiKey,
      request: formattedRequest,
      signal: options?.signal,
      noStainless: this.provider.additionalSettings?.noStainless ?? true,
    })
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: formatMessages(request.messages),
    }
    return this.adapter.streamResponse(this.client, formattedRequest, options)
  }

  async getEmbedding(
    model: string,
    text: string,
    options?: { dimensions?: number },
  ): Promise<number[]> {
    const embedding = await this.client.embeddings.create({
      model: model,
      input: text,
      encoding_format: 'float',
      ...(options?.dimensions && { dimensions: options.dimensions }),
    })
    return embedding.data[0].embedding
  }
}
