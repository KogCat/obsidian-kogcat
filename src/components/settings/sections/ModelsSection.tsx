import { App } from 'obsidian'
import React from 'react'
import { useTranslation } from 'react-i18next'

import SmartComposerPlugin from '../../../main'

import { ChatModelsSubSection } from './models/ChatModelsSubSection'
import { EmbeddingModelsSubSection } from './models/EmbeddingModelsSubSection'

type ModelsSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function ModelsSection({ app, plugin }: ModelsSectionProps) {
  const { t } = useTranslation('settings')
  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('models.header')}</div>
      <div className="cc-settings-desc">{t('models.desc')}</div>
      <ChatModelsSubSection app={app} plugin={plugin} />
      <EmbeddingModelsSubSection app={app} plugin={plugin} />
    </div>
  )
}
