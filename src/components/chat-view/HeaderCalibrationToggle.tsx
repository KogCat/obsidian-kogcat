import { Brain } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../../contexts/settings-context'

export function HeaderCalibrationToggle() {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation('chat')
  const enabled = settings.kogcatEnabled

  const onClick = useCallback(() => {
    void setSettings({ ...settings, kogcatEnabled: !enabled })
  }, [settings, setSettings, enabled])

  const label = enabled ? t('header.calibrationOn') : t('header.calibrationOff')

  return (
    <button
      onClick={onClick}
      className={`clickable-icon cc-kogcat-toggle${enabled ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
    >
      <Brain size={18} />
    </button>
  )
}
