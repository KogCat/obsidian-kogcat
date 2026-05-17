import { migrateFrom20To21 } from './20_to_21'

describe('Migration from v20 to v21', () => {
  it('bumps version to 21', () => {
    const result = migrateFrom20To21({ version: 20 })
    expect(result.version).toBe(21)
  })

  it('bumps minSimilarity 0 → 0.4 when on the old default', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0, limit: 10, chunkSize: 1000 },
    })
    expect((result.ragOptions as { minSimilarity: number }).minSimilarity).toBe(
      0.4,
    )
  })

  it('bumps limit 10 → 5 when on the old default', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0, limit: 10, chunkSize: 1000 },
    })
    expect((result.ragOptions as { limit: number }).limit).toBe(5)
  })

  it('leaves chunkSize untouched (requires reindex to take effect)', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0, limit: 10, chunkSize: 1000 },
    })
    expect((result.ragOptions as { chunkSize: number }).chunkSize).toBe(1000)
  })

  it('preserves user-customized minSimilarity', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0.7, limit: 10 },
    })
    expect((result.ragOptions as { minSimilarity: number }).minSimilarity).toBe(
      0.7,
    )
    // limit was on old default, still bumped independently
    expect((result.ragOptions as { limit: number }).limit).toBe(5)
  })

  it('preserves user-customized limit', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0, limit: 25 },
    })
    expect((result.ragOptions as { limit: number }).limit).toBe(25)
    expect((result.ragOptions as { minSimilarity: number }).minSimilarity).toBe(
      0.4,
    )
  })

  it('leaves both alone when fully customized', () => {
    const result = migrateFrom20To21({
      version: 20,
      ragOptions: { minSimilarity: 0.6, limit: 8 },
    })
    expect((result.ragOptions as { minSimilarity: number }).minSimilarity).toBe(
      0.6,
    )
    expect((result.ragOptions as { limit: number }).limit).toBe(8)
  })

  it('does nothing when ragOptions is missing', () => {
    const result = migrateFrom20To21({ version: 20 })
    expect(result.ragOptions).toBeUndefined()
  })

  it('does not mutate the input object', () => {
    const input = {
      version: 20,
      ragOptions: { minSimilarity: 0, limit: 10 },
    }
    migrateFrom20To21(input)
    expect(input.version).toBe(20)
    expect(input.ragOptions.minSimilarity).toBe(0)
    expect(input.ragOptions.limit).toBe(10)
  })
})
