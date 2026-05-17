import { Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { DEFAULT_EMBEDDING_MODELS } from '../../../../constants'
import { useSettings } from '../../../../contexts/settings-context'
import { getEmbeddingModelClient } from '../../../../core/rag/embedding'
import SmartComposerPlugin from '../../../../main'
import { ConfirmModal } from '../../../modals/ConfirmModal'
import { AddEmbeddingModelModal } from '../../modals/AddEmbeddingModelModal'

type EmbeddingModelsSubSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function EmbeddingModelsSubSection({
  app,
  plugin,
}: EmbeddingModelsSubSectionProps) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'modal', 'common'])

  const handleDeleteEmbeddingModel = async (modelId: string) => {
    if (modelId === settings.embeddingModelId) {
      new Notice(t('modal:deleteEmbeddingModel.cannotRemoveSelected'))
      return
    }

    new ConfirmModal(app, {
      title: t('modal:deleteEmbeddingModel.title'),
      message: t('modal:deleteEmbeddingModel.message', { id: modelId }),
      ctaText: t('modal:deleteEmbeddingModel.cta'),
      onConfirm: async () => {
        const vectorManager = (await plugin.getDbManager()).getVectorManager()
        const embeddingStats = await vectorManager.getEmbeddingStats()
        const embeddingStat = embeddingStats.find((v) => v.model === modelId)

        if (embeddingStat?.rowCount && embeddingStat.rowCount > 0) {
          const embeddingModelClient = getEmbeddingModelClient({
            settings,
            embeddingModelId: modelId,
          })
          await vectorManager.clearAllVectors(embeddingModelClient)
        }

        await setSettings({
          ...settings,
          embeddingModels: [...settings.embeddingModels].filter(
            (v) => v.id !== modelId,
          ),
        })
      },
    }).open()
  }

  return (
    <div>
      <div className="cc-settings-sub-header">
        {t('settings:models.embeddingModels.header')}
      </div>
      <div className="cc-settings-desc">
        {t('settings:models.embeddingModels.desc')}
      </div>

      <div className="cc-settings-table-container">
        <table className="cc-settings-table">
          <thead>
            <tr>
              <th>{t('common:id')}</th>
              <th>{t('settings:models.embeddingModels.providerId')}</th>
              <th>{t('common:model')}</th>
              <th>{t('settings:models.embeddingModels.dimension')}</th>
              <th>{t('common:actions')}</th>
            </tr>
          </thead>
          <tbody>
            {settings.embeddingModels.map((embeddingModel) => (
              <tr key={embeddingModel.id}>
                <td>{embeddingModel.id}</td>
                <td>{embeddingModel.providerId}</td>
                <td>{embeddingModel.model}</td>
                <td>{embeddingModel.dimension}</td>
                <td>
                  <div className="cc-settings-actions">
                    {!DEFAULT_EMBEDDING_MODELS.some(
                      (v) => v.id === embeddingModel.id,
                    ) && (
                      <button
                        onClick={() =>
                          handleDeleteEmbeddingModel(embeddingModel.id)
                        }
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
              <td colSpan={5}>
                <button
                  onClick={() => {
                    new AddEmbeddingModelModal(app, plugin).open()
                  }}
                >
                  {t('settings:models.embeddingModels.addCustom')}
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
