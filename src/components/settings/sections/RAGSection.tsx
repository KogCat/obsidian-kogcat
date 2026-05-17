import { App } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { RECOMMENDED_MODELS_FOR_EMBEDDING } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import SmartComposerPlugin from '../../../main'
import { findFilesMatchingPatterns } from '../../../utils/glob-utils'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { EmbeddingDbManageModal } from '../modals/EmbeddingDbManageModal'
import { ExcludedFilesModal } from '../modals/ExcludedFilesModal'
import { IncludedFilesModal } from '../modals/IncludedFilesModal'

type RAGSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function RAGSection({ app, plugin }: RAGSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation('settings')
  const recommended = t('chat.chatModel.recommendedSuffix')

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('rag.header')}</div>

      <ObsidianSetting
        name={t('rag.embeddingModel.name')}
        desc={t('rag.embeddingModel.desc')}
      >
        <ObsidianDropdown
          value={settings.embeddingModelId}
          options={Object.fromEntries(
            settings.embeddingModels.map((embeddingModel) => [
              embeddingModel.id,
              `${embeddingModel.id}${RECOMMENDED_MODELS_FOR_EMBEDDING.includes(embeddingModel.id) ? recommended : ''}`,
            ]),
          )}
          onChange={async (value) => {
            await setSettings({
              ...settings,
              embeddingModelId: value,
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.includePatterns.name')}
        desc={t('rag.includePatterns.desc')}
      >
        <ObsidianButton
          text={t('rag.includePatterns.test')}
          onClick={async () => {
            const patterns = settings.ragOptions.includePatterns
            const includedFiles = await findFilesMatchingPatterns(
              patterns,
              plugin.app.vault,
            )
            new IncludedFilesModal(app, includedFiles, patterns).open()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting className="cc-settings-textarea">
        <ObsidianTextArea
          value={settings.ragOptions.includePatterns.join('\n')}
          onChange={async (value: string) => {
            const patterns = value
              .split('\n')
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
            await setSettings({
              ...settings,
              ragOptions: {
                ...settings.ragOptions,
                includePatterns: patterns,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.excludePatterns.name')}
        desc={t('rag.excludePatterns.desc')}
      >
        <ObsidianButton
          text={t('rag.excludePatterns.test')}
          onClick={async () => {
            const patterns = settings.ragOptions.excludePatterns
            const excludedFiles = await findFilesMatchingPatterns(
              patterns,
              plugin.app.vault,
            )
            new ExcludedFilesModal(app, excludedFiles).open()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting className="cc-settings-textarea">
        <ObsidianTextArea
          value={settings.ragOptions.excludePatterns.join('\n')}
          onChange={async (value) => {
            const patterns = value
              .split('\n')
              .map((p) => p.trim())
              .filter((p) => p.length > 0)
            await setSettings({
              ...settings,
              ragOptions: {
                ...settings.ragOptions,
                excludePatterns: patterns,
              },
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.chunkSize.name')}
        desc={t('rag.chunkSize.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.chunkSize)}
          placeholder="500"
          onChange={async (value) => {
            const chunkSize = parseInt(value, 10)
            if (!isNaN(chunkSize)) {
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  chunkSize,
                },
              })
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.thresholdTokens.name')}
        desc={t('rag.thresholdTokens.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.thresholdTokens)}
          placeholder="8192"
          onChange={async (value) => {
            const thresholdTokens = parseInt(value, 10)
            if (!isNaN(thresholdTokens)) {
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  thresholdTokens,
                },
              })
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.minSimilarity.name')}
        desc={t('rag.minSimilarity.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.minSimilarity)}
          placeholder="0.4"
          onChange={async (value) => {
            // Allow decimal point and numbers only
            if (!/^[0-9.]*$/.test(value)) return

            // Ignore typing decimal point to prevent interference with the input
            if (value === '.' || value.endsWith('.')) return

            const minSimilarity = parseFloat(value)
            if (!isNaN(minSimilarity)) {
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  minSimilarity,
                },
              })
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('rag.limit.name')}
        desc={t('rag.limit.desc')}
      >
        <ObsidianTextInput
          value={String(settings.ragOptions.limit)}
          placeholder="5"
          onChange={async (value) => {
            const limit = parseInt(value, 10)
            if (!isNaN(limit)) {
              await setSettings({
                ...settings,
                ragOptions: {
                  ...settings.ragOptions,
                  limit,
                },
              })
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('rag.manageDb.name')}>
        <ObsidianButton
          text={t('rag.manageDb.action')}
          onClick={async () => {
            new EmbeddingDbManageModal(app, plugin).open()
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
