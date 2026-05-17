import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PLAN_PROVIDER_TYPES,
  PROVIDER_TYPES_INFO,
  VISIBLE_API_PROVIDER_TYPES,
} from '../../../constants'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { ChatModel, chatModelSchema } from '../../../types/chat-model.types'
import { LLMProvider, llmProviderSchema } from '../../../types/provider.types'
import { PromptLevel } from '../../../types/prompt-level.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ReactModal } from '../../common/ReactModal'

type ProviderFormComponentProps = {
  plugin: SmartComposerPlugin
  provider: LLMProvider | null // null for new provider
  onClose: () => void
}

export class AddProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider: null },
      options: {
        title: tFn('modal:addProvider.title'),
      },
    })
  }
}

export class EditProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin, provider: LLMProvider) {
    super({
      app: app,
      Component: ProviderFormComponent,
      props: { plugin, provider },
      options: {
        title: tFn('modal:addProvider.edit', { id: provider.id }),
      },
    })
  }
}

function ProviderFormComponent({
  plugin,
  provider,
  onClose,
}: ProviderFormComponentProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const [formData, setFormData] = useState<LLMProvider>(
    provider
      ? { ...provider }
      : {
          type: 'openai-compatible',
          id: '',
          apiKey: '',
          baseUrl: '',
        },
  )
  const [chatModelData, setChatModelData] = useState({
    id: '',
    model: '',
    promptLevel: PromptLevel.Default,
  })

  const handleSubmit = async () => {
    if (provider) {
      const newProviders = [...plugin.settings.providers]
      const currentProviderIndex = newProviders.findIndex(
        (v) => v.id === formData.id,
      )

      if (currentProviderIndex === -1) {
        new Notice(t('notice:provider.notFound'))
        return
      }

      const validationResult = llmProviderSchema.safeParse(formData)
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }

      await plugin.setSettings({
        ...plugin.settings,
        providers: [
          ...plugin.settings.providers.slice(0, currentProviderIndex),
          formData,
          ...plugin.settings.providers.slice(currentProviderIndex + 1),
        ],
      })
    } else {
      if (
        plugin.settings.providers.some((p: LLMProvider) => p.id === formData.id)
      ) {
        new Notice(t('notice:provider.idExists'))
        return
      }

      const validationResult = llmProviderSchema.safeParse(formData)
      if (!validationResult.success) {
        new Notice(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
        return
      }

      const chatModelId = chatModelData.id.trim()
      const chatModelName = chatModelData.model.trim()
      const shouldCreateChatModel = Boolean(chatModelId || chatModelName)
      let chatModel: ChatModel | null = null

      if (shouldCreateChatModel) {
        if (!chatModelId || !chatModelName) {
          new Notice(t('notice:model.idAndNameRequired'))
          return
        }

        if (
          plugin.settings.chatModels.some((model) => model.id === chatModelId)
        ) {
          new Notice(t('notice:model.idExists'))
          return
        }

        chatModel = {
          providerId: formData.id,
          providerType: formData.type,
          id: chatModelId,
          model: chatModelName,
          promptLevel: chatModelData.promptLevel,
        } as ChatModel

        const chatModelValidationResult = chatModelSchema.safeParse(chatModel)
        if (!chatModelValidationResult.success) {
          new Notice(
            chatModelValidationResult.error.issues
              .map((issue) => issue.message)
              .join('\n'),
          )
          return
        }
      }

      await plugin.setSettings({
        ...plugin.settings,
        providers: [...plugin.settings.providers, formData],
        chatModels: chatModel
          ? [...plugin.settings.chatModels, chatModel]
          : plugin.settings.chatModels,
      })
    }

    onClose()
  }

  const providerTypeInfo = PROVIDER_TYPES_INFO[formData.type]

  return (
    <>
      {!provider && (
        <>
          <ObsidianSetting
            name={t('modal:addProvider.id')}
            desc={t('modal:addProvider.idDesc')}
            required
          >
            <ObsidianTextInput
              value={formData.id}
              placeholder={t('modal:addProvider.idPlaceholder')}
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting name={t('modal:addProvider.type')} required>
            <ObsidianDropdown
              value={formData.type}
              options={Object.fromEntries(
                VISIBLE_API_PROVIDER_TYPES.map((key) => [
                  key,
                  PROVIDER_TYPES_INFO[key].label,
                ]),
              )}
              onChange={(value: string) =>
                setFormData(
                  (prev) =>
                    ({
                      ...prev,
                      type: value,
                      additionalSettings: {},
                    }) as LLMProvider,
                )
              }
            />
          </ObsidianSetting>
        </>
      )}

      {!PLAN_PROVIDER_TYPES.includes(formData.type) && (
        <>
          <ObsidianSetting
            name={t('modal:addProvider.apiKey')}
            desc={t('modal:addProvider.apiKeyDesc')}
            required={providerTypeInfo.requireApiKey}
          >
            <ObsidianTextInput
              value={formData.apiKey ?? ''}
              placeholder={t('modal:addProvider.apiKeyPlaceholder')}
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, apiKey: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('modal:addProvider.baseUrl')}
            desc={t('modal:addProvider.baseUrlDesc')}
            required={providerTypeInfo.requireBaseUrl}
          >
            <ObsidianTextInput
              value={formData.baseUrl ?? ''}
              placeholder={t('modal:addProvider.baseUrlPlaceholder')}
              onChange={(value: string) =>
                setFormData((prev) => ({ ...prev, baseUrl: value }))
              }
            />
          </ObsidianSetting>
        </>
      )}

      {providerTypeInfo.additionalSettings.map((setting) => (
        <ObsidianSetting
          key={setting.key}
          name={setting.label}
          desc={'description' in setting ? setting.description : undefined}
          required={setting.required}
        >
          {setting.type === 'toggle' ? (
            <ObsidianToggle
              value={
                (formData.additionalSettings as Record<string, boolean>)?.[
                  setting.key
                ] ?? false
              }
              onChange={(value: boolean) =>
                setFormData(
                  (prev) =>
                    ({
                      ...prev,
                      additionalSettings: {
                        ...(prev.additionalSettings ?? {}),
                        [setting.key]: value,
                      },
                    }) as LLMProvider,
                )
              }
            />
          ) : (
            <ObsidianTextInput
              value={
                (formData.additionalSettings as Record<string, string>)?.[
                  setting.key
                ] ?? ''
              }
              placeholder={setting.placeholder}
              onChange={(value: string) =>
                setFormData(
                  (prev) =>
                    ({
                      ...prev,
                      additionalSettings: {
                        ...(prev.additionalSettings ?? {}),
                        [setting.key]: value,
                      },
                    }) as LLMProvider,
                )
              }
            />
          )}
        </ObsidianSetting>
      ))}

      {!provider && !PLAN_PROVIDER_TYPES.includes(formData.type) && (
        <>
          <ObsidianSetting
            name={t('modal:addProvider.chatModelOptional')}
            desc={t('modal:addProvider.chatModelOptionalDesc')}
          />

          <ObsidianSetting
            name={t('modal:addProvider.modelId')}
            desc={t('modal:addProvider.modelIdDesc')}
          >
            <ObsidianTextInput
              value={chatModelData.id}
              placeholder={t('modal:addProvider.modelIdPlaceholder')}
              onChange={(value: string) =>
                setChatModelData((prev) => ({ ...prev, id: value }))
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('modal:addProvider.modelName')}
            desc={t('modal:addProvider.modelNameDesc')}
          >
            <ObsidianTextInput
              value={chatModelData.model}
              placeholder={t('modal:addProvider.modelNamePlaceholder')}
              onChange={(value: string) =>
                setChatModelData((prev) => {
                  const shouldMirrorId =
                    prev.id.trim() === '' || prev.id === prev.model

                  return {
                    ...prev,
                    id: shouldMirrorId ? value : prev.id,
                    model: value,
                  }
                })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('modal:addProvider.promptLevel')}
            desc={t('modal:addProvider.promptLevelDesc')}
          >
            <ObsidianDropdown
              value={chatModelData.promptLevel.toString()}
              options={{
                [PromptLevel.Default]: 'default',
                [PromptLevel.Simple]: 'simple',
              }}
              onChange={(value: string) =>
                setChatModelData((prev) => ({
                  ...prev,
                  promptLevel: Number(value) as PromptLevel,
                }))
              }
            />
          </ObsidianSetting>
        </>
      )}

      <ObsidianSetting>
        <ObsidianButton
          text={
            provider ? t('modal:addProvider.save') : t('modal:addProvider.add')
          }
          onClick={handleSubmit}
          cta
        />
        <ObsidianButton text={t('modal:addProvider.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
