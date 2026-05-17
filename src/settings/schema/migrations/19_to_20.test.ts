import { DEFAULT_CHAT_MODELS_V20, migrateFrom19To20 } from './19_to_20'

describe('Migration from v19 to v20', () => {
  it('replaces the broad built-in model list with current recommended defaults', () => {
    const customModel = {
      providerType: 'openai-compatible',
      providerId: 'local-proxy',
      id: 'my-kimi',
      model: 'moonshotai/kimi-k2',
    }

    const result = migrateFrom19To20({
      version: 19,
      chatModelId: 'claude-sonnet-4.5',
      applyModelId: 'gpt-5.2',
      providers: [
        { type: 'anthropic', id: 'anthropic' },
        { type: 'openai', id: 'openai' },
        { type: 'gemini', id: 'gemini' },
        { type: 'deepseek', id: 'deepseek' },
        {
          type: 'openai-compatible',
          id: 'local-proxy',
          baseUrl: 'https://example.test/v1',
        },
      ],
      chatModels: [
        {
          providerType: 'anthropic',
          providerId: 'anthropic',
          id: 'claude-opus-4.5',
          model: 'claude-opus-4-5',
        },
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-5-mini',
          model: 'gpt-5-mini',
        },
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-4.1-mini',
          model: 'gpt-4.1-mini',
        },
        {
          providerType: 'deepseek',
          providerId: 'deepseek',
          id: 'deepseek-reasoner',
          model: 'deepseek-reasoner',
        },
        customModel,
      ],
    })

    expect(result.version).toBe(20)
    expect(result.chatModels).toEqual([...DEFAULT_CHAT_MODELS_V20, customModel])
    expect(result.chatModelId).toBe('claude-sonnet-4.6')
    expect(result.applyModelId).toBe('gpt-5.5')
  })

  it('preserves existing selections when they still point at available models', () => {
    const result = migrateFrom19To20({
      version: 19,
      chatModelId: 'gpt-5.4',
      applyModelId: 'gpt-5.4',
      chatModels: [
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-5.4',
          model: 'gpt-5.4',
        },
      ],
    })

    expect(result.chatModelId).toBe('gpt-5.4')
    expect(result.applyModelId).toBe('gpt-5.4')
  })
})
