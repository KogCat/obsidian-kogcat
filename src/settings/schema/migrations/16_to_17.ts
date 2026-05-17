import { SettingMigration } from '../setting.types'

// KogCat Phase 1 P0 — adds calibration layer settings (spec §7.2 #3).
// Pure additive; no field renames or removals from v16.
export const migrateFrom16To17: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 17

  if (typeof newData.kogcatEnabled !== 'boolean') newData.kogcatEnabled = true
  if (typeof newData.kogcatShowToggleBar !== 'boolean')
    newData.kogcatShowToggleBar = true
  if (typeof newData.kogcatLlmConsented !== 'boolean')
    newData.kogcatLlmConsented = false
  if (typeof newData.omCorePath !== 'string') newData.omCorePath = ''
  if (typeof newData.omCorePort !== 'number') newData.omCorePort = 18271
  if (typeof newData.lastCoreCheckTime !== 'number')
    newData.lastCoreCheckTime = 0
  if (typeof newData.licenseKey !== 'string') newData.licenseKey = ''

  return newData
}
