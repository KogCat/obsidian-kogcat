import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DEFAULT_PROVIDERS,
  PLAN_PROVIDER_TYPES,
  isVisibleApiProviderType,
} from '../../../constants'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { ChatModel, chatModelSchema } from '../../../types/chat-model.types'
import { PromptLevel } from '../../../types/prompt-level.types'
import { isModelUsable } from '../../../utils/llm/hasUsableProvider'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

type AddChatModelModalComponentProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
}

export class AddChatModelModal extends ReactModal<AddChatModelModalComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: AddChatModelModalComponent,
      props: { plugin },
      options: {
        title: tFn('modal:addChatModel.title'),
      },
    })
  }
}

function AddChatModelModalComponent({
  plugin,
  onClose,
}: AddChatModelModalComponentProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const availableProviders = plugin.settings.providers.filter(
    (provider) =>
      !PLAN_PROVIDER_TYPES.includes(provider.type) &&
      isVisibleApiProviderType(provider.type),
  )
  const defaultProvider = availableProviders[0] ??
    DEFAULT_PROVIDERS.find((provider) => provider.type === 'openai') ?? {
      type: 'openai',
      id: 'openai',
    }
  const [formData, setFormData] = useState<ChatModel>({
    providerId: defaultProvider.id,
    providerType: defaultProvider.type,
    id: '',
    model: '',
    promptLevel: PromptLevel.Default,
  })

  const handleSubmit = async () => {
    if (plugin.settings.chatModels.some((p) => p.id === formData.id)) {
      new Notice(t('notice:model.idExists'))
      return
    }

    if (
      !plugin.settings.providers.some(
        (provider) => provider.id === formData.providerId,
      )
    ) {
      new Notice(t('notice:provider.doesNotExist'))
      return
    }

    const validationResult = chatModelSchema.safeParse(formData)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }

    const nextSettings = {
      ...plugin.settings,
      chatModels: [...plugin.settings.chatModels, formData],
    }
    const selected = nextSettings.chatModels.find(
      (m) => m.id === nextSettings.chatModelId,
    )
    if (
      (!selected || !isModelUsable(selected, nextSettings)) &&
      isModelUsable(formData, nextSettings)
    ) {
      nextSettings.chatModelId = formData.id
    }
    await plugin.setSettings(nextSettings)

    onClose()
  }

  return (
    <>
      <ObsidianSetting
        name={t('modal:addChatModel.id')}
        desc={t('modal:addChatModel.idDesc')}
        required
      >
        <ObsidianTextInput
          value={formData.id}
          placeholder={t('modal:addChatModel.idPlaceholder')}
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, id: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('modal:addChatModel.providerId')} required>
        <ObsidianDropdown
          value={formData.providerId}
          options={Object.fromEntries(
            availableProviders.map((provider) => [provider.id, provider.id]),
          )}
          onChange={(value: string) => {
            const provider = plugin.settings.providers.find(
              (p) => p.id === value,
            )
            if (!provider) {
              new Notice(t('notice:provider.idMissing', { id: value }))
              return
            }
            // Cast required because we're changing the discriminant field
            setFormData(
              (prev) =>
                ({
                  ...prev,
                  providerId: value,
                  providerType: provider.type,
                }) as ChatModel,
            )
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('modal:addChatModel.modelName')} required>
        <ObsidianTextInput
          value={formData.model}
          placeholder={t('modal:addChatModel.modelNamePlaceholder')}
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, model: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:addChatModel.promptLevel')}
        desc={t('modal:addChatModel.promptLevelDesc')}
        required
      >
        <ObsidianDropdown
          value={(formData.promptLevel ?? PromptLevel.Default).toString()}
          options={{
            [PromptLevel.Default]: 'default',
            [PromptLevel.Simple]: 'simple',
          }}
          onChange={(value: string) =>
            setFormData((prev) => ({
              ...prev,
              promptLevel: Number(value) as PromptLevel,
            }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton
          text={t('modal:addChatModel.add')}
          onClick={handleSubmit}
          cta
        />
        <ObsidianButton
          text={t('modal:addChatModel.cancel')}
          onClick={onClose}
        />
      </ObsidianSetting>
    </>
  )
}
