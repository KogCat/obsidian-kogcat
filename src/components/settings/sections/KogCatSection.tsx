import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../../../contexts/settings-context'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'

type Props = {
  app: App
  plugin: SmartComposerPlugin
}

export function KogCatSection({ plugin }: Props) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'notice'])
  const [showAdvancedEngineSettings, setShowAdvancedEngineSettings] =
    useState(false)
  const answerModeValue = settings.kogcatEnabled
    ? settings.kogcatAnswerMode
    : 'off'

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('settings:kogcat.header')}</div>

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

      <ObsidianSetting
        name={t('settings:kogcat.answerMode.name')}
        desc={t('settings:kogcat.answerMode.desc')}
      >
        <ObsidianDropdown
          value={answerModeValue}
          options={{
            quick: t('settings:kogcat.answerMode.options.quick'),
            advisor: t('settings:kogcat.answerMode.options.advisor'),
            off: t('settings:kogcat.answerMode.options.off'),
          }}
          onChange={async (value) => {
            if (value === 'off') {
              await setSettings({ ...settings, kogcatEnabled: false })
              return
            }
            if (value === 'quick' || value === 'advisor') {
              await setSettings({
                ...settings,
                kogcatEnabled: true,
                kogcatAnswerMode: value,
              })
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings:kogcat.engine.name')}
        desc={t('settings:kogcat.engine.desc')}
      >
        <ObsidianButton
          text={t('settings:kogcat.engine.restart')}
          onClick={async () => {
            try {
              await plugin.restartOmCore()
              new Notice(t('notice:engine.restarting'))
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
                t('notice:engine.updateAvailable', { version: result.latest }),
              )
            } else {
              new Notice(
                t('notice:engine.updateUpToDate', { version: result.latest }),
              )
            }
          }}
        />
        <ObsidianButton
          text={t('settings:kogcat.engine.openLog')}
          onClick={async () => {
            try {
              await plugin.openOmCoreLog()
              new Notice(t('notice:engine.openingLog'))
            } catch (e) {
              new Notice(
                t('notice:engine.openLogFailed', {
                  message: (e as Error).message,
                }),
              )
            }
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings:kogcat.advanced.name')}
        desc={t('settings:kogcat.advanced.desc')}
      >
        <ObsidianButton
          text={
            showAdvancedEngineSettings
              ? t('settings:kogcat.advanced.hide')
              : t('settings:kogcat.advanced.show')
          }
          onClick={() => {
            setShowAdvancedEngineSettings(!showAdvancedEngineSettings)
          }}
        />
      </ObsidianSetting>

      {showAdvancedEngineSettings && (
        <>
          <ObsidianSetting
            name={t('settings:kogcat.external.name')}
            desc={t('settings:kogcat.external.desc', {
              port: settings.omCorePort,
            })}
          >
            <ObsidianToggle
              value={settings.kogcatEngineExternal}
              onChange={async (value) => {
                await setSettings({ ...settings, kogcatEngineExternal: value })
                // Re-attach immediately so user doesn't need to hit Restart.
                await plugin.restartOmCore()
              }}
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings:kogcat.binaryPath.name')}
            desc={t('settings:kogcat.binaryPath.desc')}
          >
            <ObsidianTextInput
              value={settings.omCorePath}
              placeholder={t('settings:kogcat.binaryPath.placeholder')}
              onChange={async (value) => {
                await setSettings({ ...settings, omCorePath: value.trim() })
              }}
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings:kogcat.port.name')}
            desc={t('settings:kogcat.port.desc')}
          >
            <ObsidianTextInput
              value={settings.omCorePort.toString()}
              onChange={async (value) => {
                const parsed = parseInt(value, 10)
                if (isNaN(parsed) || parsed < 1 || parsed > 65535) return
                await setSettings({ ...settings, omCorePort: parsed })
              }}
            />
          </ObsidianSetting>
        </>
      )}
    </div>
  )
}
