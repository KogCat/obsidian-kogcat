import { Settings, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useTranslation } from 'react-i18next'
import { ObsidianToggle } from 'src/components/common/ObsidianToggle'

import { DEFAULT_CHAT_MODELS, PROVIDER_TYPES_INFO } from '../../../../constants'
import { useSettings } from '../../../../contexts/settings-context'
import SmartComposerPlugin from '../../../../main'
import { ConfirmModal } from '../../../modals/ConfirmModal'
import { AddChatModelModal } from '../../modals/AddChatModelModal'

import {
  ChatModelSettingsModal,
  hasChatModelSettings,
} from './ChatModelSettings'

type ChatModelsSubSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

const isEnabled = (enable: boolean | undefined | null) => enable ?? true

export function ChatModelsSubSection({
  app,
  plugin,
}: ChatModelsSubSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'modal'])

  const handleDeleteChatModel = async (modelId: string) => {
    if (modelId === settings.chatModelId || modelId === settings.applyModelId) {
      new Notice(t('modal:deleteChatModel.cannotRemoveSelected'))
      return
    }

    new ConfirmModal(app, {
      title: t('modal:deleteChatModel.title'),
      message: t('modal:deleteChatModel.message', { id: modelId }),
      ctaText: t('modal:deleteChatModel.cta'),
      onConfirm: async () => {
        await setSettings({
          ...settings,
          chatModels: [...settings.chatModels].filter((v) => v.id !== modelId),
        })
      },
    }).open()
  }

  const handleToggleEnableChatModel = async (
    modelId: string,
    value: boolean,
  ) => {
    if (
      !value &&
      (modelId === settings.chatModelId || modelId === settings.applyModelId)
    ) {
      new Notice(t('modal:deleteChatModel.cannotDisableSelected'))
      await setSettings({
        ...settings,
        chatModels: [...settings.chatModels].map((v) =>
          v.id === modelId ? { ...v, enable: true } : v,
        ),
      })
      return
    }

    await setSettings({
      ...settings,
      chatModels: [...settings.chatModels].map((v) =>
        v.id === modelId ? { ...v, enable: value } : v,
      ),
    })
  }

  return (
    <div>
      <div className="cc-settings-sub-header">
        {t('settings:models.chatModels.header')}
      </div>
      <div className="cc-settings-desc">
        {t('settings:models.chatModels.desc')}
      </div>

      <div className="cc-model-list">
        {settings.chatModels.map((chatModel) => {
          const providerLabel =
            PROVIDER_TYPES_INFO[chatModel.providerType]?.label ?? chatModel.providerType
          const isCustom = !DEFAULT_CHAT_MODELS.some((v) => v.id === chatModel.id)

          return (
            <div key={chatModel.id} className="cc-model-list-item">
              <div className="cc-model-list-item-info">
                <span className="cc-model-list-item-name">{chatModel.id}</span>
                <span className="cc-model-list-item-provider">{providerLabel}</span>
              </div>
              <div className="cc-model-list-item-actions">
                <ObsidianToggle
                  value={isEnabled(chatModel.enable)}
                  onChange={(value) =>
                    handleToggleEnableChatModel(chatModel.id, value)
                  }
                />
                {hasChatModelSettings(chatModel) && (
                  <button
                    onClick={() => {
                      new ChatModelSettingsModal(chatModel, app, plugin).open()
                    }}
                    className="clickable-icon"
                  >
                    <Settings size={16} />
                  </button>
                )}
                {isCustom && (
                  <button
                    onClick={() => handleDeleteChatModel(chatModel.id)}
                    className="clickable-icon"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="cc-model-list-footer">
        <button
          onClick={() => {
            new AddChatModelModal(app, plugin).open()
          }}
        >
          {t('settings:models.chatModels.addCustom')}
        </button>
      </div>
    </div>
  )
}
