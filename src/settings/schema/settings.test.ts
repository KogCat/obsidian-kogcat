import {
  DEFAULT_APPLY_MODEL_ID,
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
} from '../../constants'

import { SETTINGS_SCHEMA_VERSION } from './migrations'
import { parseSmartComposerSettings } from './settings'

describe('parseSmartComposerSettings', () => {
  it('should return default values for empty input', () => {
    const result = parseSmartComposerSettings({})
    expect(result).toEqual({
      version: SETTINGS_SCHEMA_VERSION,

      providers: [...DEFAULT_PROVIDERS],

      chatModels: [...DEFAULT_CHAT_MODELS],
      embeddingModels: [...DEFAULT_EMBEDDING_MODELS],

      chatModelId: DEFAULT_CHAT_MODEL_ID,
      applyModelId: DEFAULT_APPLY_MODEL_ID,
      embeddingModelId: 'openai/text-embedding-3-small',

      systemPrompt: '',

      ragOptions: {
        chunkSize: 500,
        thresholdTokens: 8192,
        minSimilarity: 0.4,
        limit: 5,
        excludePatterns: [],
        includePatterns: [],
      },

      mcp: {
        servers: [],
      },

      chatOptions: {
        includeCurrentFileContent: true,
        enableTools: true,
        maxAutoIterations: 1,
      },

      locale: 'auto',
      kogcatEnabled: true,
      kogcatAnswerMode: 'quick',
      kogcatShowToggleBar: true,
      kogcatLlmConsented: false,
      kogcatIntroSeen: false,
      omCorePath: '',
      omPluginRoot: '',
      kogcatPanelOpen: false,
      lastCoreCheckTime: 0,
      licenseKey: '',
    })
  })
})
