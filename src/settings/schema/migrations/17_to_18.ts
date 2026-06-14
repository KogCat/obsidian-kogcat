import { SettingMigration } from '../setting.types'

// Retained schema step; no transport settings are introduced here.
export const migrateFrom17To18: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 18
  return newData
}
