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
import { isModelUsable } from '../../../utils/llm/hasUsableProvider'
import {
  listModels,
  providerSupportsModelListing,
} from '../../../utils/llm/listModels'
import { testChatModel } from '../../../utils/llm/testChatModel'
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

type ProviderAdditionalSetting = {
  label: string
  key: string
  type: 'text' | 'toggle'
  placeholder?: string
  description?: string
  required?: boolean
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
  const [fetching, setFetching] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showManualModel, setShowManualModel] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[] | null>(null)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [modelFilter, setModelFilter] = useState('')
  const [manualModel, setManualModel] = useState('')

  const providerTypeInfo = PROVIDER_TYPES_INFO[formData.type]
  const additionalSettings =
    providerTypeInfo.additionalSettings as readonly ProviderAdditionalSetting[]
  const supportsListing = providerSupportsModelListing(formData.type)
  const requiredAdditionalSettings = additionalSettings.filter(
    (setting) => setting.required,
  )
  const advancedAdditionalSettings = additionalSettings.filter(
    (setting) => !setting.required,
  )

  const renderAdditionalSetting = (setting: ProviderAdditionalSetting) => (
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
  )

  const fetchModels = async () => {
    setFetching(true)
    try {
      const models = await listModels(formData)
      setAvailableModels(models)
      if (models.length === 0) {
        setShowManualModel(true)
        new Notice(t('modal:addProvider.fetchEmpty'))
      }
    } catch (e) {
      setAvailableModels(null)
      setShowManualModel(true)
      new Notice(
        t('modal:addProvider.fetchFailed', { message: (e as Error).message }),
      )
    } finally {
      setFetching(false)
    }
  }

  const toggleModel = (name: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const pickedModelNames = (): string[] =>
    Array.from(
      new Set([...selectedModels, manualModel.trim()].filter((n) => n.length)),
    )

  const testConnection = async () => {
    const validationResult = llmProviderSchema.safeParse(formData)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }

    setTesting(true)
    try {
      const picked = pickedModelNames()
      let probeModelName = picked[0]
      let modelCount = availableModels?.length ?? 0

      if (!probeModelName && supportsListing) {
        const models = await listModels(formData)
        setAvailableModels(models)
        modelCount = models.length
        probeModelName = models[0]
      }

      if (!probeModelName) {
        if (!supportsListing) setShowManualModel(true)
        new Notice(t('modal:addProvider.testNeedsModel'))
        return
      }

      const result = await testChatModel(validationResult.data, probeModelName)
      if (!result.ok) {
        new Notice(
          t('modal:addProvider.testFailed', { message: result.message }),
        )
        return
      }
      new Notice(
        t('modal:addProvider.testSucceeded', {
          model: probeModelName,
          count: modelCount,
        }),
      )
    } catch (e) {
      new Notice(
        t('modal:addProvider.testFailed', { message: (e as Error).message }),
      )
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    const validationResult = llmProviderSchema.safeParse(formData)
    if (!validationResult.success) {
      new Notice(validationResult.error.issues.map((v) => v.message).join('\n'))
      return
    }

    let nextProviders: LLMProvider[]
    if (provider) {
      const idx = plugin.settings.providers.findIndex(
        (v) => v.id === formData.id,
      )
      if (idx === -1) {
        new Notice(t('notice:provider.notFound'))
        return
      }
      nextProviders = [
        ...plugin.settings.providers.slice(0, idx),
        formData,
        ...plugin.settings.providers.slice(idx + 1),
      ]
    } else {
      if (plugin.settings.providers.some((p) => p.id === formData.id)) {
        new Notice(t('notice:provider.idExists'))
        return
      }
      nextProviders = [...plugin.settings.providers, formData]
    }

    const names = pickedModelNames()
    const existingIds = new Set(plugin.settings.chatModels.map((m) => m.id))
    const providerModelIds: string[] = []
    const newChatModels: ChatModel[] = []
    for (const name of names) {
      const existingProviderModel = plugin.settings.chatModels.find(
        (m) => m.providerId === formData.id && m.model === name,
      )
      if (existingProviderModel) {
        providerModelIds.push(existingProviderModel.id)
        continue
      }
      const id = makeChatModelId(formData.id, name, existingIds)
      providerModelIds.push(id)
      const chatModel = {
        providerId: formData.id,
        providerType: formData.type,
        id,
        model: name,
      } as ChatModel
      const result = chatModelSchema.safeParse(chatModel)
      if (!result.success) {
        new Notice(result.error.issues.map((i) => i.message).join('\n'))
        return
      }
      existingIds.add(name)
      newChatModels.push(chatModel)
    }

    const nextSettings = {
      ...plugin.settings,
      providers: nextProviders,
      chatModels: [...plugin.settings.chatModels, ...newChatModels],
    }

    const providerModels = nextSettings.chatModels.filter(
      (m) =>
        m.providerId === formData.id &&
        m.providerType === formData.type &&
        isModelUsable(m, nextSettings),
    )
    const preferredProviderModel =
      providerModels.find((m) => providerModelIds.includes(m.id)) ??
      providerModels[0]
    if (preferredProviderModel) {
      nextSettings.chatModelId = preferredProviderModel.id
    } else {
      const selected = nextSettings.chatModels.find(
        (m) => m.id === nextSettings.chatModelId,
      )
      if (!selected || !isModelUsable(selected, nextSettings)) {
        const fallback = nextSettings.chatModels.find((m) =>
          isModelUsable(m, nextSettings),
        )
        if (fallback) nextSettings.chatModelId = fallback.id
      }
    }

    await plugin.setSettings(nextSettings)

    onClose()
  }

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
        </>
      )}

      {requiredAdditionalSettings.map(renderAdditionalSetting)}

      {!PLAN_PROVIDER_TYPES.includes(formData.type) && (
        <>
          <ObsidianSetting
            name={t('modal:addProvider.modelsHeader')}
            desc={
              supportsListing
                ? t('modal:addProvider.modelsDesc')
                : t('modal:addProvider.modelsManualOnly')
            }
          >
            {supportsListing && (
              <ObsidianButton
                text={
                  fetching
                    ? t('modal:addProvider.fetching')
                    : t('modal:addProvider.fetchModels')
                }
                onClick={fetchModels}
                disabled={fetching}
              />
            )}
            <ObsidianButton
              text={
                testing
                  ? t('modal:addProvider.testing')
                  : t('modal:addProvider.testConnection')
              }
              onClick={testConnection}
              disabled={fetching || testing}
            />
          </ObsidianSetting>

          {availableModels && availableModels.length > 0 && (
            <div className="kogcat-model-picker">
              <input
                type="text"
                className="kogcat-model-picker__filter"
                placeholder={t('modal:addProvider.filterPlaceholder')}
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              />
              <div className="kogcat-model-picker__list">
                {availableModels
                  .filter((m) =>
                    m.toLowerCase().includes(modelFilter.toLowerCase()),
                  )
                  .map((m) => (
                    <label key={m} className="kogcat-model-picker__item">
                      <input
                        type="checkbox"
                        checked={selectedModels.has(m)}
                        onChange={() => toggleModel(m)}
                      />
                      <span>{m}</span>
                    </label>
                  ))}
              </div>
              {selectedModels.size > 0 && (
                <div className="kogcat-model-picker__count">
                  {t('modal:addProvider.selectedCount', {
                    count: selectedModels.size,
                  })}
                </div>
              )}
            </div>
          )}

          {showManualModel || !supportsListing ? (
            <ObsidianSetting
              name={t('modal:addProvider.manualModel')}
              desc={t('modal:addProvider.manualModelDesc')}
            >
              <ObsidianTextInput
                value={manualModel}
                placeholder={t('modal:addProvider.manualModelPlaceholder')}
                onChange={(value: string) => setManualModel(value)}
              />
            </ObsidianSetting>
          ) : (
            <ObsidianSetting
              name={t('modal:addProvider.manualModelFallback')}
              desc={t('modal:addProvider.manualModelFallbackDesc')}
            >
              <ObsidianButton
                text={t('modal:addProvider.manualModelFallbackAction')}
                onClick={() => setShowManualModel(true)}
              />
            </ObsidianSetting>
          )}
        </>
      )}

      {advancedAdditionalSettings.length > 0 && (
        <>
          {!showAdvancedSettings ? (
            <ObsidianSetting
              name={t('modal:addProvider.advancedSettings')}
              desc={t('modal:addProvider.advancedSettingsDesc')}
            >
              <ObsidianButton
                text={t('modal:addProvider.showAdvancedSettings')}
                onClick={() => setShowAdvancedSettings(true)}
              />
            </ObsidianSetting>
          ) : (
            <>
              <ObsidianSetting
                name={t('modal:addProvider.advancedSettings')}
                desc={t('modal:addProvider.advancedSettingsDesc')}
              >
                <ObsidianButton
                  text={t('modal:addProvider.hideAdvancedSettings')}
                  onClick={() => setShowAdvancedSettings(false)}
                />
              </ObsidianSetting>
              {advancedAdditionalSettings.map(renderAdditionalSetting)}
            </>
          )}
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
        <ObsidianButton
          text={t('modal:addProvider.cancel')}
          onClick={onClose}
        />
      </ObsidianSetting>
    </>
  )
}

function makeChatModelId(
  providerId: string,
  modelName: string,
  existingIds: Set<string>,
): string {
  if (!existingIds.has(modelName)) return modelName
  const base = `${providerId}/${modelName}`
  if (!existingIds.has(base)) return base
  let index = 2
  let candidate = `${base}-${index}`
  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${base}-${index}`
  }
  return candidate
}
