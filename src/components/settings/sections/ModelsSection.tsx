import { App } from 'obsidian'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import SmartComposerPlugin from '../../../main'
import { ChatModel } from '../../../types/chat-model.types'
import { isModelUsable } from '../../../utils/llm/hasUsableProvider'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'

import { ChatModelsSubSection } from './models/ChatModelsSubSection'

type ModelsSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function ModelsSection({ app, plugin }: ModelsSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation('settings')

  // Only surface models the user can actually run — hides the keyless default
  // providers' models that otherwise flood the picker.
  const usableModels = settings.chatModels.filter((m) =>
    isModelUsable(m, settings),
  )
  const options: Record<string, string> = Object.fromEntries(
    usableModels.map((m) => [m.id, formatModelOption(m, settings)]),
  )

  const selectionValid = usableModels.some((m) => m.id === settings.chatModelId)
  const firstUsableId = usableModels[0]?.id
  const selectedValue = selectionValid
    ? settings.chatModelId
    : (firstUsableId ?? '')
  useEffect(() => {
    if (!selectionValid && firstUsableId) {
      void setSettings({ ...settings, chatModelId: firstUsableId })
    }
  }, [selectionValid, firstUsableId, setSettings, settings])

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-sub-header">{t('models.header')}</div>
      <div className="cc-settings-desc">{t('models.desc')}</div>

      <ObsidianSetting
        name={t('models.reviewModel.name')}
        desc={t('models.reviewModel.desc')}
      >
        {usableModels.length > 0 ? (
          <ObsidianDropdown
            value={selectedValue}
            options={options}
            onChange={async (value) => {
              await setSettings({ ...settings, chatModelId: value })
            }}
          />
        ) : (
          <span className="cc-settings-desc">
            {t('models.reviewModel.none')}
          </span>
        )}
      </ObsidianSetting>

      <ChatModelsSubSection app={app} plugin={plugin} />
    </div>
  )
}

function formatModelOption(
  model: ChatModel,
  settings: ReturnType<typeof useSettings>['settings'],
): string {
  const provider = settings.providers.find((p) => p.id === model.providerId)
  const providerLabel =
    provider?.id === model.providerType
      ? PROVIDER_TYPES_INFO[model.providerType]?.label
      : provider?.id ||
        PROVIDER_TYPES_INFO[model.providerType]?.label ||
        model.providerType
  return `${providerLabel} · ${model.model || model.id}`
}
