import { SettingMigration } from '../setting.types'

import { getMigratedChatModels } from './migrationUtils'

export const DEFAULT_CHAT_MODEL_ID_V20 = 'claude-sonnet-4.6'
export const DEFAULT_APPLY_MODEL_ID_V20 = 'gpt-5.5'

const RETIRED_BUILT_IN_MODEL_IDS = new Set([
  'claude-opus-4.5 (plan)',
  'claude-sonnet-4.5 (plan)',
  'gpt-5.2 (plan)',
  'gemini-3-pro-preview (plan)',
  'gemini-3-flash-preview (plan)',
  'claude-opus-4.5',
  'claude-sonnet-4.5',
  'claude-haiku-4.5',
  'gpt-5.2',
  'gpt-5-mini',
  'gpt-4.1-mini',
  'o4-mini',
  'gemini-3-pro-preview',
  'deepseek-chat',
  'deepseek-reasoner',
])

export const DEFAULT_CHAT_MODELS_V20 = [
  {
    providerType: 'anthropic-plan',
    providerId: 'anthropic-plan',
    id: 'claude-sonnet-4.6 (plan)',
    model: 'claude-sonnet-4-6',
    thinking: {
      enabled: true,
      budget_tokens: 8192,
    },
  },
  {
    providerType: 'anthropic-plan',
    providerId: 'anthropic-plan',
    id: 'claude-opus-4.6 (plan)',
    model: 'claude-opus-4-6',
    thinking: {
      enabled: true,
      budget_tokens: 8192,
    },
  },
  {
    providerType: 'anthropic-plan',
    providerId: 'anthropic-plan',
    id: 'claude-opus-4.7 (plan)',
    model: 'claude-opus-4-7',
  },
  {
    providerType: 'openai-plan',
    providerId: 'openai-plan',
    id: 'gpt-5.4 (plan)',
    model: 'gpt-5.4',
  },
  {
    providerType: 'openai-plan',
    providerId: 'openai-plan',
    id: 'gpt-5.5 (plan)',
    model: 'gpt-5.5',
  },
  {
    providerType: 'gemini-plan',
    providerId: 'gemini-plan',
    id: 'gemini-3.1-pro-preview (plan)',
    model: 'gemini-3.1-pro-preview',
  },
  {
    providerType: 'gemini-plan',
    providerId: 'gemini-plan',
    id: 'gemini-3-flash-preview (plan)',
    model: 'gemini-3-flash-preview',
  },
  {
    providerType: 'anthropic',
    providerId: 'anthropic',
    id: 'claude-sonnet-4.6',
    model: 'claude-sonnet-4-6',
    thinking: {
      enabled: true,
      budget_tokens: 8192,
    },
  },
  {
    providerType: 'anthropic',
    providerId: 'anthropic',
    id: 'claude-opus-4.6',
    model: 'claude-opus-4-6',
    thinking: {
      enabled: true,
      budget_tokens: 8192,
    },
  },
  {
    providerType: 'anthropic',
    providerId: 'anthropic',
    id: 'claude-opus-4.7',
    model: 'claude-opus-4-7',
  },
  {
    providerType: 'openai',
    providerId: 'openai',
    id: 'gpt-5.4',
    model: 'gpt-5.4',
  },
  {
    providerType: 'openai',
    providerId: 'openai',
    id: 'gpt-5.5',
    model: 'gpt-5.5',
  },
  {
    providerType: 'gemini',
    providerId: 'gemini',
    id: 'gemini-3.1-pro-preview',
    model: 'gemini-3.1-pro-preview',
  },
  {
    providerType: 'gemini',
    providerId: 'gemini',
    id: 'gemini-3-flash-preview',
    model: 'gemini-3-flash-preview',
  },
  {
    providerType: 'deepseek',
    providerId: 'deepseek',
    id: 'deepseek-v4-flash',
    model: 'deepseek-v4-flash',
  },
  {
    providerType: 'deepseek',
    providerId: 'deepseek',
    id: 'deepseek-v4-pro',
    model: 'deepseek-v4-pro',
  },
  {
    providerType: 'openrouter',
    providerId: 'openrouter',
    id: 'openrouter/auto',
    model: 'openrouter/auto',
  },
]

const isRetiredBuiltInModel = (item: unknown): boolean => {
  const model = item as {
    id?: unknown
    providerId?: unknown
    providerType?: unknown
  }

  return (
    typeof model.id === 'string' &&
    RETIRED_BUILT_IN_MODEL_IDS.has(model.id) &&
    model.providerId === model.providerType
  )
}

const hasModelId = (models: unknown[], modelId: unknown): boolean =>
  typeof modelId === 'string' &&
  models.some((model) => (model as { id?: unknown }).id === modelId)

export const migrateFrom19To20: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 20

  if (Array.isArray(newData.chatModels)) {
    newData.chatModels = newData.chatModels.filter(
      (model) => !isRetiredBuiltInModel(model),
    )
  }

  newData.chatModels = getMigratedChatModels(newData, DEFAULT_CHAT_MODELS_V20)
  const chatModels = Array.isArray(newData.chatModels)
    ? newData.chatModels
    : DEFAULT_CHAT_MODELS_V20

  if (!hasModelId(chatModels, newData.chatModelId)) {
    newData.chatModelId = DEFAULT_CHAT_MODEL_ID_V20
  }

  if (!hasModelId(chatModels, newData.applyModelId)) {
    newData.applyModelId = DEFAULT_APPLY_MODEL_ID_V20
  }

  return newData
}
