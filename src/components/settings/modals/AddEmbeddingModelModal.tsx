import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DEFAULT_PROVIDERS,
  isVisibleApiProviderType,
  PROVIDER_TYPES_INFO,
} from '../../../constants'
import { getProviderClient } from '../../../core/llm/manager'
import { supportedDimensionsForIndex } from '../../../database/schema'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import {
  EmbeddingModel,
  embeddingModelSchema,
} from '../../../types/embedding-model.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'
import { ConfirmModal } from '../../modals/ConfirmModal'

type AddEmbeddingModelModalComponentProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
}

export class AddEmbeddingModelModal extends ReactModal<AddEmbeddingModelModalComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: AddEmbeddingModelModalComponent,
      props: { plugin },
      options: {
        title: tFn('modal:addEmbeddingModel.title'),
      },
    })
  }
}

function AddEmbeddingModelModalComponent({
  plugin,
  onClose,
}: AddEmbeddingModelModalComponentProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const availableProviders = plugin.settings.providers.filter(
    (provider) =>
      isVisibleApiProviderType(provider.type) &&
      PROVIDER_TYPES_INFO[provider.type].supportEmbedding,
  )
  const defaultProvider =
    availableProviders[0] ??
    DEFAULT_PROVIDERS.find((provider) => provider.type === 'openai') ?? {
      type: 'openai',
      id: 'openai',
    }
  const [formData, setFormData] = useState<Omit<EmbeddingModel, 'dimension'>>({
    providerId: defaultProvider.id,
    providerType: defaultProvider.type,
    id: '',
    model: '',
    outputDimension: undefined,
  })
  const [outputDimensionInput, setOutputDimensionInput] = useState('')

  const handleSubmit = async () => {
    try {
      if (plugin.settings.embeddingModels.some((p) => p.id === formData.id)) {
        throw new Error(t('notice:model.idExists'))
      }

      if (
        !plugin.settings.providers.some(
          (provider) => provider.id === formData.providerId,
        )
      ) {
        throw new Error(t('notice:provider.doesNotExist'))
      }

      const providerClient = getProviderClient({
        settings: plugin.settings,
        providerId: formData.providerId,
      })

      const embeddingResult = await providerClient.getEmbedding(
        formData.model,
        'test',
        { dimensions: formData.outputDimension },
      )

      if (!Array.isArray(embeddingResult) || embeddingResult.length === 0) {
        throw new Error(t('modal:addEmbeddingModel.errors.invalidResult'))
      }

      const dimension = embeddingResult.length

      if (
        formData.outputDimension !== undefined &&
        dimension !== formData.outputDimension
      ) {
        throw new Error(
          t('modal:addEmbeddingModel.errors.dimensionMismatch', {
            requested: formData.outputDimension,
            actual: dimension,
          }),
        )
      }

      if (!supportedDimensionsForIndex.includes(dimension)) {
        const confirmed = await new Promise<boolean>((resolve) => {
          new ConfirmModal(plugin.app, {
            title: t('modal:addEmbeddingModel.performanceWarning.title'),
            message: t('modal:addEmbeddingModel.performanceWarning.message', {
              dimension,
              supported: supportedDimensionsForIndex.join(', '),
            }),
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
          }).open()
        })

        if (!confirmed) {
          return
        }
      }

      const embeddingModel: EmbeddingModel = {
        ...formData,
        dimension,
      }

      const validationResult = embeddingModelSchema.safeParse(embeddingModel)

      if (!validationResult.success) {
        throw new Error(
          validationResult.error.issues.map((v) => v.message).join('\n'),
        )
      }

      await plugin.setSettings({
        ...plugin.settings,
        embeddingModels: [...plugin.settings.embeddingModels, embeddingModel],
      })

      onClose()
    } catch (error) {
      new Notice(
        error instanceof Error
          ? error.message
          : t('modal:addEmbeddingModel.errors.unknown'),
      )
    }
  }

  return (
    <>
      <ObsidianSetting
        name={t('modal:addEmbeddingModel.id')}
        desc={t('modal:addEmbeddingModel.idDesc')}
        required
      >
        <ObsidianTextInput
          value={formData.id}
          placeholder={t('modal:addEmbeddingModel.idPlaceholder')}
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, id: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('modal:addEmbeddingModel.providerId')} required>
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
            setFormData((prev) => ({
              ...prev,
              providerId: value,
              providerType: provider.type,
            }))
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting name={t('modal:addEmbeddingModel.modelName')} required>
        <ObsidianTextInput
          value={formData.model}
          placeholder={t('modal:addEmbeddingModel.modelNamePlaceholder')}
          onChange={(value: string) =>
            setFormData((prev) => ({ ...prev, model: value }))
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:addEmbeddingModel.outputDimensions')}
        desc={t('modal:addEmbeddingModel.outputDimensionsDesc')}
      >
        <ObsidianTextInput
          value={outputDimensionInput}
          placeholder={t('modal:addEmbeddingModel.outputDimensionsPlaceholder')}
          onChange={(value: string) => {
            setOutputDimensionInput(value)
            const parsed = parseInt(value, 10)
            setFormData((prev) => ({
              ...prev,
              outputDimension: isNaN(parsed) ? undefined : parsed,
            }))
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton text={t('modal:addEmbeddingModel.add')} onClick={handleSubmit} cta />
        <ObsidianButton text={t('modal:addEmbeddingModel.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
