import { SettingMigration } from '../setting.types'

// Introduces `locale` for plugin UI translation. Existing installs default
// to 'auto' so behavior is unchanged unless the user explicitly picks a
// language in Settings → KogCat.
export const migrateFrom21To22: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 22
  if (typeof newData.locale !== 'string') {
    newData.locale = 'auto'
  }
  return newData
}
