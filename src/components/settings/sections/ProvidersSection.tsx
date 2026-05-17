import { Settings, Trash2 } from 'lucide-react'
import { App } from 'obsidian'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
  DEFAULT_PROVIDERS,
  isVisibleApiProviderType,
  PLAN_PROVIDER_TYPES,
  PROVIDER_TYPES_INFO,
} from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import { getEmbeddingModelClient } from '../../../core/rag/embedding'
import SmartComposerPlugin from '../../../main'
import { LLMProvider } from '../../../types/provider.types'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddProviderModal,
  EditProviderModal,
} from '../modals/ProviderFormModal'

type ProvidersSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function ProvidersSection({ app, plugin }: ProvidersSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'modal', 'common'])
  const apiProviders = settings.providers.filter(
    (p) =>
      !PLAN_PROVIDER_TYPES.includes(p.type) &&
      isVisibleApiProviderType(p.type),
  )

  const handleDeleteProvider = async (provider: LLMProvider) => {
    const associatedChatModels = settings.chatModels.filter(
      (m) => m.providerId === provider.id,
    )
    const associatedEmbeddingModels = settings.embeddingModels.filter(
      (m) => m.providerId === provider.id,
    )

    new ConfirmModal(app, {
      title: t('modal:deleteProvider.title'),
      message: t('modal:deleteProvider.message', {
        id: provider.id,
        chatModels: associatedChatModels.length,
        embeddingModels: associatedEmbeddingModels.length,
      }),
      ctaText: t('modal:deleteProvider.cta'),
      onConfirm: async () => {
        const vectorManager = (await plugin.getDbManager()).getVectorManager()
        const embeddingStats = await vectorManager.getEmbeddingStats()

        for (const embeddingModel of associatedEmbeddingModels) {
          const embeddingStat = embeddingStats.find(
            (v) => v.model === embeddingModel.id,
          )

          if (embeddingStat?.rowCount && embeddingStat.rowCount > 0) {
            const embeddingModelClient = getEmbeddingModelClient({
              settings,
              embeddingModelId: embeddingModel.id,
            })
            await vectorManager.clearAllVectors(embeddingModelClient)
          }
        }

        await setSettings({
          ...settings,
          providers: [...settings.providers].filter(
            (v) => v.id !== provider.id,
          ),
          chatModels: [...settings.chatModels].filter(
            (v) => v.providerId !== provider.id,
          ),
          embeddingModels: [...settings.embeddingModels].filter(
            (v) => v.providerId !== provider.id,
          ),
        })
      },
    }).open()
  }

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">
        {t('settings:providers.header')}
      </div>

      <div className="cc-settings-desc">
        <span>{t('settings:providers.desc')}</span>
      </div>

      <div className="cc-settings-table-container">
        <table className="cc-settings-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col width={60} />
          </colgroup>
          <thead>
            <tr>
              <th>{t('common:id')}</th>
              <th>{t('common:type')}</th>
              <th>{t('common:apiKey')}</th>
              <th>{t('common:actions')}</th>
            </tr>
          </thead>
          <tbody>
            {apiProviders.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.id}</td>
                <td>{PROVIDER_TYPES_INFO[provider.type].label}</td>
                <td
                  className="cc-settings-table-api-key"
                  onClick={() => {
                    new EditProviderModal(app, plugin, provider).open()
                  }}
                >
                  {provider.apiKey
                    ? t('settings:providers.apiKeyMasked')
                    : t('settings:providers.apiKeySet')}
                </td>
                <td>
                  <div className="cc-settings-actions">
                    <button
                      onClick={() => {
                        new EditProviderModal(app, plugin, provider).open()
                      }}
                      className="clickable-icon"
                    >
                      <Settings />
                    </button>
                    {!DEFAULT_PROVIDERS.some((v) => v.id === provider.id) && (
                      <button
                        onClick={() => handleDeleteProvider(provider)}
                        className="clickable-icon"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button
                  onClick={() => {
                    new AddProviderModal(app, plugin).open()
                  }}
                >
                  {t('settings:providers.addCustom')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
