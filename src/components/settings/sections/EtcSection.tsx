import { App, Notice } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../../../contexts/settings-context'
import SmartComposerPlugin from '../../../main'
import { smartComposerSettingsSchema } from '../../../settings/schema/setting.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ConfirmModal } from '../../modals/ConfirmModal'

type EtcSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function EtcSection({ app }: EtcSectionProps) {
  const { setSettings } = useSettings()
  const { t } = useTranslation(['settings', 'modal', 'notice'])

  const handleResetSettings = () => {
    new ConfirmModal(app, {
      title: t('modal:resetSettings.title'),
      message: t('modal:resetSettings.message'),
      ctaText: t('modal:resetSettings.cta'),
      onConfirm: async () => {
        const defaultSettings = smartComposerSettingsSchema.parse({})
        await setSettings(defaultSettings)
        new Notice(t('notice:settings.resetDone'))
      },
    }).open()
  }

  return (
    <div className="cc-settings-section">
      <ObsidianSetting
        name={t('settings:etc.reset.name')}
        desc={t('settings:etc.reset.desc')}
      >
        <ObsidianButton
          text={t('settings:etc.reset.action')}
          warning
          onClick={handleResetSettings}
        />
      </ObsidianSetting>
    </div>
  )
}
