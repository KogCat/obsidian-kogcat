import { Edit, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { TemplateManager } from '../../../database/json/template/TemplateManager'
import { TemplateMetadata } from '../../../database/json/template/types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  CreateTemplateModal,
  EditTemplateModal,
} from '../../modals/TemplateFormModal'

type TemplateSectionProps = {
  app: App
}

export function TemplateSection({ app }: TemplateSectionProps) {
  const templateManager = useMemo(() => new TemplateManager(app), [app])
  const { t } = useTranslation([
    'settings',
    'modal',
    'notice',
    'common',
    'template',
    'error',
  ])

  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchTemplateList = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplateList(await templateManager.listMetadata())
    } catch (error) {
      console.error('Failed to fetch template list:', error)
      new Notice(t('error:templateLoadList'))
      setTemplateList([])
    } finally {
      setIsLoading(false)
    }
  }, [templateManager, t])

  const handleCreate = useCallback(() => {
    new CreateTemplateModal({
      app,
      selectedSerializedNodes: null,
      onSubmit: fetchTemplateList,
    }).open()
  }, [fetchTemplateList, app])

  const handleEdit = useCallback(
    (template: TemplateMetadata) => {
      new EditTemplateModal({
        app,
        templateId: template.id,
        onSubmit: fetchTemplateList,
      }).open()
    },
    [fetchTemplateList, app],
  )

  const handleDelete = useCallback(
    (template: TemplateMetadata) => {
      new ConfirmModal(app, {
        title: t('modal:deleteTemplate.title'),
        message: t('modal:deleteTemplate.message', { name: template.name }),
        ctaText: t('modal:deleteTemplate.cta'),
        onConfirm: async () => {
          try {
            await templateManager.deleteTemplate(template.id)
            fetchTemplateList()
          } catch (error) {
            console.error('Failed to delete template:', error)
            new Notice(t('notice:template.deleteFailed'))
          }
        },
      }).open()
    },
    [templateManager, fetchTemplateList, app, t],
  )

  useEffect(() => {
    fetchTemplateList()
  }, [fetchTemplateList])

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('settings:templates.header')}</div>

      <div className="cc-settings-desc cc-settings-callout">
        <Trans
          i18nKey="settings:templates.howTo"
          components={{ strong: <strong />, code: <code /> }}
        />
      </div>

      <div className="cc-settings-sub-header-container">
        <div className="cc-settings-sub-header">
          {t('settings:templates.saved')}
        </div>
        <ObsidianButton
          text={t('settings:templates.addTemplate')}
          onClick={handleCreate}
        />
      </div>

      <div className="cc-templates-container">
        <div className="cc-templates-header">
          <div>{t('common:name')}</div>
          <div>{t('common:actions')}</div>
        </div>
        {isLoading ? (
          <div className="cc-templates-empty">
            {t('settings:templates.loading')}
          </div>
        ) : templateList.length > 0 ? (
          templateList.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              onDelete={() => {
                handleDelete(template)
              }}
              onEdit={() => {
                handleEdit(template)
              }}
            />
          ))
        ) : (
          <div className="cc-templates-empty">
            {t('settings:templates.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateItem({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateMetadata
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('template')
  return (
    <div className="cc-template">
      <div className="cc-template-row">
        <div className="cc-template-name">{template.name}</div>
        <div className="cc-template-actions">
          <button
            className="clickable-icon"
            aria-label={t('actions.edit')}
            onClick={onEdit}
          >
            <Edit size={16} />
          </button>
          <button
            className="clickable-icon"
            aria-label={t('actions.delete')}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
