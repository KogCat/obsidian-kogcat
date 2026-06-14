import { PLAN_PROVIDER_TYPES, PROVIDER_TYPES_INFO } from '../../constants'
import { SmartComposerSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

export function isProviderConfigured(
  provider: LLMProvider,
  settings: SmartComposerSettings,
): boolean {
  if (PLAN_PROVIDER_TYPES.includes(provider.type)) {
    const oauth = (provider as { oauth?: { accessToken?: string } }).oauth
    return !!oauth?.accessToken
  }
  if (PROVIDER_TYPES_INFO[provider.type].requireApiKey) {
    return !!provider.apiKey?.trim()
  }
  // Keyless (ollama / lm-studio / openai-compatible): configured once the user
  // set a base URL or bound a chat model to it (defaults seed neither).
  return (
    !!provider.baseUrl?.trim() ||
    settings.chatModels.some((m) => m.providerId === provider.id)
  )
}

// True once the user has at least one provider that can actually run a model.
export function hasUsableProvider(settings: SmartComposerSettings): boolean {
  return settings.providers.some((p) => isProviderConfigured(p, settings))
}

export function isModelUsable(
  model: ChatModel,
  settings: SmartComposerSettings,
): boolean {
  const bound = settings.providers.find((p) => p.id === model.providerId)
  return !!bound && isProviderConfigured(bound, settings)
}
