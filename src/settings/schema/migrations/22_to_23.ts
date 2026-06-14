import { SettingMigration } from '../setting.types'

// Introduces `kogcatIntroSeen` — gates the first-run review-pass onboarding.
// Existing installs default to false so the intro shows once after upgrade.
export const migrateFrom22To23: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 23
  if (typeof newData.kogcatIntroSeen !== 'boolean') {
    newData.kogcatIntroSeen = false
  }
  return newData
}
