import { z } from 'zod'

import {
  DEFAULT_APPLY_MODEL_ID,
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
} from '../../constants'
import { chatModelSchema } from '../../types/chat-model.types'
import { embeddingModelSchema } from '../../types/embedding-model.types'
import { mcpServerConfigSchema } from '../../types/mcp.types'
import { llmProviderSchema } from '../../types/provider.types'

import { SETTINGS_SCHEMA_VERSION } from './migrations'

// Changing chunkSize requires a full reindex.
const ragOptionsSchema = z.object({
  chunkSize: z.number().catch(500),
  thresholdTokens: z.number().catch(8192),
  minSimilarity: z.number().catch(0.4),
  limit: z.number().catch(5),
  excludePatterns: z.array(z.string()).catch([]),
  includePatterns: z.array(z.string()).catch([]),
})

export const smartComposerSettingsSchema = z.object({
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  chatModels: z.array(chatModelSchema).catch([...DEFAULT_CHAT_MODELS]),

  embeddingModels: z
    .array(embeddingModelSchema)
    .catch([...DEFAULT_EMBEDDING_MODELS]),

  chatModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ),
  applyModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_APPLY_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ),
  embeddingModelId: z.string().catch(DEFAULT_EMBEDDING_MODELS[0].id),

  systemPrompt: z.string().catch(''),

  ragOptions: ragOptionsSchema.catch({
    chunkSize: 500,
    thresholdTokens: 8192,
    minSimilarity: 0.4,
    limit: 5,
    excludePatterns: [],
    includePatterns: [],
  }),

  mcp: z
    .object({
      servers: z.array(mcpServerConfigSchema).catch([]),
    })
    .catch({
      servers: [],
    }),

  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      enableTools: z.boolean(),
      maxAutoIterations: z.number(),
    })
    .catch({
      includeCurrentFileContent: true,
      enableTools: true,
      maxAutoIterations: 1,
    }),

  // UI locale: 'auto' follows Obsidian's interface language.
  locale: z.enum(['auto', 'en', 'zh']).catch('auto'),
  kogcatEnabled: z.boolean().catch(true),
  kogcatAnswerMode: z.enum(['quick', 'advisor']).catch('quick'),
  kogcatShowToggleBar: z.boolean().catch(true),
  kogcatLlmConsented: z.boolean().catch(false),
  // empty = managed binary under {plugin-dir}/bin/
  omCorePath: z.string().catch(''),
  omCorePort: z.number().int().min(1).max(65535).catch(18271),
  // empty = bundled scripts; non-empty overrides with on-disk engine source checkout.
  omPluginRoot: z.string().catch(''),
  // true = plugin skips download/spawn and connects to externally-managed om-core.
  kogcatEngineExternal: z.boolean().catch(false),
  kogcatPanelOpen: z.boolean().catch(false),
  // unix ms; throttle update checks to 24h
  lastCoreCheckTime: z.number().int().catch(0),
  licenseKey: z.string().catch(''),
})
export type SmartComposerSettings = z.infer<typeof smartComposerSettingsSchema>

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}
