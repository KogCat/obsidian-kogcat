import { App } from 'obsidian'
import React from 'react'

import { KOGCAT_DEMO_TEXT } from '../../core/kogcat/demo'
import { t, useTranslation } from '../../i18n'
import SmartComposerPlugin from '../../main'
import { hasUsableProvider } from '../../utils/llm/hasUsableProvider'
import { ReactModal } from '../common/ReactModal'
import { AddProviderModal } from '../settings/modals/ProviderFormModal'

type IntroProps = {
  plugin: SmartComposerPlugin
  hasChatHistory: boolean
  onClose: () => void
}

export class KogCatIntroModal extends ReactModal<IntroProps> {
  constructor(
    app: App,
    plugin: SmartComposerPlugin,
    opts: { hasChatHistory: boolean },
  ) {
    super({
      app,
      Component: KogCatIntroComponent,
      props: { plugin, hasChatHistory: opts.hasChatHistory },
      options: { title: t('modal:kogcatIntro.title') },
    })
  }
}

function KogCatIntroComponent({ plugin, hasChatHistory, onClose }: IntroProps) {
  const { t } = useTranslation(['modal', 'calibration', 'common'])
  const needsProvider = !hasUsableProvider(plugin.settings)
  const tryDemo = () => {
    onClose()
    void plugin.runReview(KOGCAT_DEMO_TEXT, t('calibration:labels.demo'))
  }
  const setupProvider = () => {
    onClose()
    new AddProviderModal(plugin.app, plugin).open()
  }
  return (
    <div className="kogcat-intro" style={{ lineHeight: 1.6 }}>
      <p style={{ fontWeight: 600, fontSize: 'var(--font-ui-medium)' }}>
        {t('modal:kogcatIntro.lead')}
      </p>
      <p style={{ color: 'var(--text-muted)' }}>
        {t('modal:kogcatIntro.body')}
      </p>

      <ul style={{ paddingLeft: '1.1rem', color: 'var(--text-muted)' }}>
        <li>{t('modal:kogcatIntro.points.local')}</li>
        <li>{t('modal:kogcatIntro.points.byoKey')}</li>
        <li>{t('modal:kogcatIntro.points.clean')}</li>
      </ul>

      <p>
        {t('modal:kogcatIntro.usagePrefix')}
        <b>{t('modal:kogcatIntro.usageMain')}</b>
        {t('modal:kogcatIntro.usageSuffix')}
      </p>

      {needsProvider && (
        <p
          style={{
            color: 'var(--text-accent)',
            fontSize: 'var(--font-ui-smaller)',
          }}
        >
          {t('modal:kogcatIntro.providerNote')}
        </p>
      )}

      {hasChatHistory && (
        <p
          style={{
            color: 'var(--text-faint)',
            fontSize: 'var(--font-ui-smaller)',
          }}
        >
          {t('modal:kogcatIntro.chatHistoryNote')}
        </p>
      )}

      <div className="modal-button-container">
        <button
          className={needsProvider ? 'mod-cta' : ''}
          onClick={setupProvider}
        >
          {t('modal:kogcatIntro.setupProvider')}
        </button>
        <button className={needsProvider ? '' : 'mod-cta'} onClick={tryDemo}>
          {t('modal:kogcatIntro.tryDemo')}
        </button>
        <button className="mod-cancel" onClick={onClose}>
          {t('common:ok')}
        </button>
      </div>
    </div>
  )
}
