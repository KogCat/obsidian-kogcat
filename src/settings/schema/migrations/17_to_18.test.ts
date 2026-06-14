import { migrateFrom17To18 } from './17_to_18'

describe('Migration from v17 to v18', () => {
  it('bumps version to 18', () => {
    const result = migrateFrom17To18({ version: 17 })
    expect(result.version).toBe(18)
  })
})
