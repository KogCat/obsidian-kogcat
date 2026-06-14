import { App, Notice } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../../../contexts/settings-context'
import {
  BaseImageStatus,
  baseImageStatus,
} from '../../../core/om-core/baseImage'
import { OmCoreStatus } from '../../../core/om-core/lifecycle'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { KogCatIntroModal } from '../../modals/KogCatIntroModal'

type Props = {
  app: App
  plugin: SmartComposerPlugin
}

export function KogCatSection({ plugin }: Props) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'notice'])
  const [engineStatus, setEngineStatus] = useState<OmCoreStatus>(
    plugin.omCore?.getStatus() ?? { kind: 'stopped' },
  )
  const [baseImage, setBaseImage] = useState<BaseImageStatus | null>(null)

  useEffect(() => {
    const lifecycle = plugin.omCore
    if (!lifecycle) {
      setEngineStatus({ kind: 'stopped' })
      return
    }
    return lifecycle.subscribe(setEngineStatus)
  }, [plugin])

  // Base knowledge image status is display-only; om-core owns its lifecycle.
  useEffect(() => {
    if (engineStatus.kind !== 'running') {
      setBaseImage(null)
      return
    }
    const auth = plugin.omCore?.getAuth()
    if (!auth) return
    let cancelled = false
    void baseImageStatus(auth).then((s) => {
      if (!cancelled) setBaseImage(s)
    })
    return () => {
      cancelled = true
    }
  }, [engineStatus, plugin])

  const engineInfo = useMemo(
    () =>
      buildEngineInfo(
        engineStatus,
        plugin.omCore?.getEndpoint() ?? null,
        baseImage,
        t,
      ),
    [engineStatus, plugin, baseImage, t],
  )

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-desc">
        <a
          href="https://www.kogcat.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings:kogcat.learnMore')}
        </a>
      </div>

      <ObsidianSetting
        name={t('settings:kogcat.intro.name')}
        desc={t('settings:kogcat.intro.desc')}
      >
        <ObsidianButton
          text={t('settings:kogcat.intro.open')}
          onClick={() => {
            new KogCatIntroModal(plugin.app, plugin, {
              hasChatHistory: plugin.settings.kogcatLlmConsented,
            }).open()
          }}
        />
        <ObsidianButton
          text={t('settings:kogcat.intro.panel')}
          onClick={() => {
            void plugin.openReviewView()
          }}
        />
      </ObsidianSetting>

      <div className={`kogcat-engine-card is-${engineStatus.kind}`}>
        <div className="kogcat-engine-card__header">
          <span className="kogcat-engine-card__dot" />
          <div>
            <div className="kogcat-engine-card__title">
              {t('settings:kogcat.engineStatus.title')}
            </div>
            <div className="kogcat-engine-card__state">{engineInfo.state}</div>
          </div>
        </div>
        <div className="kogcat-engine-card__grid">
          {engineInfo.rows.map((row) => (
            <div key={row.label} className="kogcat-engine-card__row">
              <span>{row.label}</span>
              <code>{row.value}</code>
            </div>
          ))}
        </div>
        <div className="kogcat-engine-card__actions">
          <ObsidianButton
            text={t('settings:kogcat.engine.restart')}
            onClick={async () => {
              try {
                new Notice(t('notice:engine.restarting'))
                await plugin.restartOmCore()
                new Notice(t('notice:engine.restartReady'))
              } catch (e) {
                new Notice(
                  t('notice:engine.restartFailed', {
                    message: (e as Error).message,
                  }),
                )
              }
            }}
          />
          <ObsidianButton
            text={t('settings:kogcat.engine.checkUpdate')}
            onClick={async () => {
              const result = await plugin.checkOmCoreUpdate()
              if (!result) {
                new Notice(t('notice:engine.updateSkipped'))
              } else if (result.needsUpdate) {
                new Notice(
                  t('notice:engine.updateAvailable', {
                    version: result.latest,
                  }),
                )
              } else {
                new Notice(
                  t('notice:engine.updateUpToDate', {
                    version: result.latest,
                  }),
                )
              }
            }}
          />
          <ObsidianButton
            text={t('settings:kogcat.engine.openLog')}
            onClick={async () => {
              try {
                await plugin.openOmCoreLog()
              } catch (e) {
                new Notice(
                  t('notice:engine.openLogFailed', {
                    message: (e as Error).message,
                  }),
                )
              }
            }}
          />
        </div>
      </div>

      <ObsidianSetting
        name={t('settings:kogcat.hotkey.name')}
        desc={t('settings:kogcat.hotkey.desc')}
      >
        <ObsidianButton
          text={t('settings:kogcat.hotkey.open')}
          onClick={() => {
            const setting = (
              plugin.app as unknown as {
                setting?: {
                  open?: () => void
                  openTabById?: (
                    id: string,
                  ) => { setQuery?: (q: string) => void } | undefined
                }
              }
            ).setting
            setting?.open?.()
            setting?.openTabById?.('hotkeys')?.setQuery?.('KogCat')
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings:language.name')}
        desc={t('settings:language.desc')}
      >
        <ObsidianDropdown
          value={settings.locale}
          options={{
            auto: t('settings:language.options.auto'),
            en: t('settings:language.options.en'),
            zh: t('settings:language.options.zh'),
          }}
          onChange={async (value) => {
            if (value === 'auto' || value === 'en' || value === 'zh') {
              await setSettings({ ...settings, locale: value })
            }
          }}
        />
      </ObsidianSetting>
    </div>
  )
}

function buildEngineInfo(
  status: OmCoreStatus,
  endpoint: string | null,
  baseImage: BaseImageStatus | null,
  t: ReturnType<typeof useTranslation>['t'],
): {
  state: string
  rows: { label: string; value: string }[]
} {
  if (status.kind === 'running') {
    const rows = [
      {
        label: t('settings:kogcat.engineStatus.version'),
        value: status.version ?? '-',
      },
      {
        label: t('settings:kogcat.engineStatus.pid'),
        value: String(status.pid),
      },
      {
        label: t('settings:kogcat.engineStatus.transport'),
        value: status.transport.kind,
      },
      {
        label: t('settings:kogcat.engineStatus.endpoint'),
        value: endpoint ?? '-',
      },
    ]
    // Skip on unknown — older sidecar without the base-image endpoint.
    if (baseImage && baseImage.state !== 'unknown') {
      rows.push({
        label: t('settings:kogcat.engineStatus.baseImage'),
        value:
          baseImage.state === 'installed'
            ? (baseImage.installed_version ??
              t('settings:kogcat.engineStatus.baseImageInstalled'))
            : t('settings:kogcat.engineStatus.baseImageAbsent'),
      })
    }
    return {
      state: t('settings:kogcat.engineStatus.running'),
      rows,
    }
  }
  if (status.kind === 'failed') {
    return {
      state: t('settings:kogcat.engineStatus.failed'),
      rows: [
        {
          label: t('settings:kogcat.engineStatus.message'),
          value: status.message,
        },
      ],
    }
  }
  return {
    state: t(`settings:kogcat.engineStatus.${status.kind}`),
    rows: [
      {
        label: t('settings:kogcat.engineStatus.endpoint'),
        value: endpoint ?? '-',
      },
    ],
  }
}
