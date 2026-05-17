import { migrateFrom18To19 } from './18_to_19'

describe('Migration from v18 to v19', () => {
  it('removes retired default providers and their built-in models', () => {
    const result = migrateFrom18To19({
      version: 18,
      providers: [
        { type: 'openai', id: 'openai' },
        { type: 'xai', id: 'xai' },
        { type: 'mistral', id: 'mistral' },
        { type: 'perplexity', id: 'perplexity' },
      ],
      chatModels: [
        {
          providerType: 'openai',
          providerId: 'openai',
          id: 'gpt-5.2',
          model: 'gpt-5.2',
        },
        {
          providerType: 'xai',
          providerId: 'xai',
          id: 'grok-4-1-fast',
          model: 'grok-4-1-fast',
        },
        {
          providerType: 'mistral',
          providerId: 'mistral',
          id: 'mistral-small-latest',
          model: 'mistral-small-latest',
        },
        {
          providerType: 'perplexity',
          providerId: 'perplexity',
          id: 'sonar',
          model: 'sonar',
        },
      ],
    })

    expect(result.version).toBe(19)
    expect(result.providers).toEqual([{ type: 'openai', id: 'openai' }])
    expect(result.chatModels).toEqual([
      {
        providerType: 'openai',
        providerId: 'openai',
        id: 'gpt-5.2',
        model: 'gpt-5.2',
      },
    ])
  })

  it('preserves custom providers that happen to use retired names as IDs', () => {
    const customProvider = {
      type: 'openai-compatible',
      id: 'mistral',
      baseUrl: 'https://example.test/v1',
    }

    const result = migrateFrom18To19({
      version: 18,
      providers: [customProvider],
      chatModels: [
        {
          providerType: 'openai-compatible',
          providerId: 'mistral',
          id: 'custom-mistral',
          model: 'mistral-small-latest',
        },
      ],
    })

    expect(result.providers).toEqual([customProvider])
    expect(result.chatModels).toEqual([
      {
        providerType: 'openai-compatible',
        providerId: 'mistral',
        id: 'custom-mistral',
        model: 'mistral-small-latest',
      },
    ])
  })
})
