import { SettingMigration } from '../setting.types'

const RETIRED_DEFAULT_PROVIDER_TYPES = ['xai', 'mistral', 'perplexity']

const RETIRED_BUILT_IN_MODEL_IDS = new Set([
  'grok-4-1-fast',
  'grok-4-1-fast-non-reasoning',
  'mistral-small-latest',
  'sonar',
  'sonar-pro',
  'sonar-deep-research',
  'sonar-reasoning',
  'sonar-reasoning-pro',
])

const DEFAULT_CHAT_MODEL_ID = 'claude-sonnet-4.5'
const DEFAULT_APPLY_MODEL_ID = 'gpt-4.1-mini'

const isRetiredDefaultProvider = (item: unknown): boolean => {
  const provider = item as { type?: unknown; id?: unknown }
  return RETIRED_DEFAULT_PROVIDER_TYPES.some(
    (type) => provider.type === type && provider.id === type,
  )
}

const isRetiredBuiltInModel = (item: unknown): boolean => {
  const model = item as {
    id?: unknown
    providerType?: unknown
    providerId?: unknown
  }
  return (
    (typeof model.id === 'string' &&
      RETIRED_BUILT_IN_MODEL_IDS.has(model.id)) ||
    RETIRED_DEFAULT_PROVIDER_TYPES.some(
      (type) => model.providerType === type && model.providerId === type,
    )
  )
}

const chooseExistingModelId = (
  preferredId: string,
  models: unknown[],
): string | undefined => {
  const ids = models
    .map((item) => (item as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string')
  return ids.includes(preferredId) ? preferredId : ids[0]
}

// Simplifies the default provider/model surface by removing legacy built-ins
// for xAI, Mistral, and Perplexity. Custom OpenAI-compatible providers are
// preserved even if their ID mentions one of those services.
export const migrateFrom18To19: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 19

  if (Array.isArray(newData.providers)) {
    newData.providers = newData.providers.filter(
      (provider) => !isRetiredDefaultProvider(provider),
    )
  }

  if (Array.isArray(newData.chatModels)) {
    const chatModels = newData.chatModels.filter(
      (model) => !isRetiredBuiltInModel(model),
    )
    newData.chatModels = chatModels

    const chatModelId = chooseExistingModelId(DEFAULT_CHAT_MODEL_ID, chatModels)
    if (
      chatModelId &&
      !chatModels.some(
        (model: unknown) =>
          (model as { id?: unknown }).id === newData.chatModelId,
      )
    ) {
      newData.chatModelId = chatModelId
    }

    const applyModelId = chooseExistingModelId(
      DEFAULT_APPLY_MODEL_ID,
      chatModels,
    )
    if (
      applyModelId &&
      !chatModels.some(
        (model: unknown) =>
          (model as { id?: unknown }).id === newData.applyModelId,
      )
    ) {
      newData.applyModelId = applyModelId
    }
  }

  if (Array.isArray(newData.embeddingModels)) {
    const embeddingModels = newData.embeddingModels.filter(
      (model) => !isRetiredBuiltInModel(model),
    )
    newData.embeddingModels = embeddingModels
    const embeddingModelId = chooseExistingModelId(
      'openai/text-embedding-3-small',
      embeddingModels,
    )
    if (
      embeddingModelId &&
      !embeddingModels.some(
        (model: unknown) =>
          (model as { id?: unknown }).id === newData.embeddingModelId,
      )
    ) {
      newData.embeddingModelId = embeddingModelId
    }
  }

  return newData
}
