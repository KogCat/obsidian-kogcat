import { SettingMigration } from '../setting.types'

// KogCat external engine bypass — adds kogcatEngineExternal so power users (and
// the mock-om-core acceptance flow) can point the plugin at an already-running
// HTTP engine instead of having lifecycle spawn a binary. Pure additive.
export const migrateFrom17To18: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 18
  if (typeof newData.kogcatEngineExternal !== 'boolean') {
    newData.kogcatEngineExternal = false
  }
  return newData
}
