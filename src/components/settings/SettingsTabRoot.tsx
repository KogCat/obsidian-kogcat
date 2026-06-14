import { App } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import SmartComposerPlugin from '../../main'

import { EtcSection } from './sections/EtcSection'
import { KogCatSection } from './sections/KogCatSection'
import { ModelsSection } from './sections/ModelsSection'
import { PlanConnectionsSection } from './sections/PlanConnectionsSection'
import { ProvidersSection } from './sections/ProvidersSection'

type SettingsTabRootProps = {
  app: App
  plugin: SmartComposerPlugin
}

type TabKey = 'basic' | 'models' | 'other'

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  const { t } = useTranslation('settings')
  const [tab, setTab] = useState<TabKey>('basic')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'basic', label: t('settings:tabs.basic') },
    { key: 'models', label: t('settings:tabs.models') },
    { key: 'other', label: t('settings:tabs.other') },
  ]

  return (
    <div className="kogcat-settings">
      <nav className="kogcat-settings-tabs" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            className={`kogcat-settings-tab${tab === tb.key ? ' is-active' : ''}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      <div className="kogcat-settings-panel" role="tabpanel">
        {tab === 'basic' && <KogCatSection app={app} plugin={plugin} />}
        {tab === 'models' && (
          <>
            <PlanConnectionsSection app={app} plugin={plugin} />
            <ProvidersSection app={app} plugin={plugin} />
            <ModelsSection app={app} plugin={plugin} />
          </>
        )}
        {tab === 'other' && <EtcSection app={app} plugin={plugin} />}
      </div>
    </div>
  )
}
