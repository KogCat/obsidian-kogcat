import { RefreshCw } from 'lucide-react'
import { Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { KogCatIcon } from '../icons/KogCatIcon'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { OmCoreStatus } from '../../core/om-core/lifecycle'

type EngineStateView = {
  status: OmCoreStatus
  endpoint: string | null
}

export function SidebarPanel() {
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation()
  const kogcatEnabled = settings.kogcatEnabled
  const answerMode = kogcatEnabled ? settings.kogcatAnswerMode : 'off'

  const [engine, setEngine] = useState<EngineStateView>({
    status: plugin.omCore?.getStatus() ?? { kind: 'stopped' },
    endpoint: plugin.omCore?.getEndpoint() ?? null,
  })

  const refresh = useCallback(() => {
    setEngine({
      status: plugin.omCore?.getStatus() ?? { kind: 'stopped' },
      endpoint: plugin.omCore?.getEndpoint() ?? null,
    })
  }, [plugin])

  useEffect(() => {
    if (!plugin.omCore) return
    refresh()
    const unsub = plugin.omCore.subscribe((status) => {
      setEngine({
        status,
        endpoint: plugin.omCore?.getEndpoint() ?? null,
      })
    })
    return unsub
  }, [plugin, refresh])

  return (
    <div className="ca-sidebar">
      <div className="ca-sidebar__header">
        <KogCatIcon size={16} />
        <span>{t('sidebar:title')}</span>
        <button
          type="button"
          className="ca-sidebar__icon-button"
          onClick={() => void refresh()}
          aria-label={t('sidebar:engine.refresh')}
          title={t('sidebar:engine.refresh')}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <EngineSection engine={engine} plugin={plugin} />
      <Section title={t('sidebar:section.answerMode')}>
        <div className="ca-sidebar__mode-control" role="group">
          <button
            type="button"
            className={answerMode === 'quick' ? 'is-active' : ''}
            onClick={() =>
              void setSettings({
                ...settings,
                kogcatEnabled: true,
                kogcatAnswerMode: 'quick',
              })
            }
          >
            {t('sidebar:answerMode.quick')}
          </button>
          <button
            type="button"
            className={answerMode === 'advisor' ? 'is-active' : ''}
            onClick={() =>
              void setSettings({
                ...settings,
                kogcatEnabled: true,
                kogcatAnswerMode: 'advisor',
              })
            }
          >
            {t('sidebar:answerMode.advisor')}
          </button>
          <button
            type="button"
            className={answerMode === 'off' ? 'is-active' : ''}
            onClick={() =>
              void setSettings({
                ...settings,
                kogcatEnabled: false,
              })
            }
          >
            {t('sidebar:answerMode.off')}
          </button>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="ca-sidebar__section">
      <div className="ca-sidebar__section-title">{title}</div>
      <div className="ca-sidebar__section-body">{children}</div>
    </div>
  )
}

function EngineSection({
  engine,
  plugin,
}: {
  engine: EngineStateView
  plugin: ReturnType<typeof usePlugin>
}) {
  const { t } = useTranslation()
  const { status, endpoint } = engine
  const labelByKind: Record<OmCoreStatus['kind'], string> = {
    stopped: t('sidebar:engine.stopped'),
    starting: t('sidebar:engine.starting'),
    running: t('sidebar:engine.running'),
    failed: t('sidebar:engine.failed'),
  }
  const dotClass =
    status.kind === 'running'
      ? 'ca-dot ca-dot--ok'
      : status.kind === 'failed'
        ? 'ca-dot ca-dot--err'
        : 'ca-dot ca-dot--idle'
  const detail =
    status.kind === 'running'
      ? `${endpoint ?? ''}${status.version ? ` · v${status.version}` : ''}`
      : status.kind === 'failed'
        ? status.message
        : ''
  return (
    <Section title={t('sidebar:section.engine')}>
      <div className="ca-sidebar__engine">
        <span className={dotClass} />
        <span className="ca-sidebar__engine-label">
          {labelByKind[status.kind]}
        </span>
        {detail && <span className="ca-sidebar__engine-detail">{detail}</span>}
      </div>
      <div className="ca-sidebar__engine-actions">
        <button
          type="button"
          onClick={() => {
            void plugin.restartOmCore()
            new Notice(t('notice:engine.restarting'))
          }}
        >
          {t('sidebar:engine.restart')}
        </button>
        <button type="button" onClick={() => void plugin.openOmCoreLog()}>
          {t('sidebar:engine.openLog')}
        </button>
      </div>
    </Section>
  )
}
