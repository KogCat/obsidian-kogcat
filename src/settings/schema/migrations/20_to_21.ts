import { SettingMigration } from '../setting.types'

// Bump RAG retrieval defaults to match the KogCat advisor positioning
// (precision over recall): minSimilarity 0.0→0.4, limit 10→5. Only applied
// per-field when the saved value still exactly matches the old default, so
// users who deliberately tuned these keep their choices. chunkSize is left
// alone — changing it without a reindex would have no effect on existing
// chunks, which would be confusing.
export const migrateFrom20To21: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 21

  const rag = newData.ragOptions
  if (rag && typeof rag === 'object') {
    const next = { ...(rag as Record<string, unknown>) }
    if (next.minSimilarity === 0) {
      next.minSimilarity = 0.4
    }
    if (next.limit === 10) {
      next.limit = 5
    }
    newData.ragOptions = next
  }

  return newData
}
