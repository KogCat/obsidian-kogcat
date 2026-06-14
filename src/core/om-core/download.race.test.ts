const mockRequestUrl = jest.fn<Promise<{ json: unknown }>, [{ url: string }]>()
jest.mock('obsidian', () => ({
  App: jest.fn(),
  Notice: jest.fn(),
  Plugin: jest.fn(),
  requestUrl: (opts: { url: string }) => mockRequestUrl(opts),
}))

import { channelUrlsForDownload, fetchChannel } from './download'

// fetchChannel races all sources concurrently (Promise.any): first fulfilled
// (2xx) wins, all-reject → null. No geo/locale branching.
describe('fetchChannel concurrent race', () => {
  beforeEach(() => mockRequestUrl.mockReset())

  it('returns the live source when the other rejects', async () => {
    const [ali] = channelUrlsForDownload()
    mockRequestUrl.mockImplementation(({ url }) =>
      url === ali
        ? Promise.reject(new Error('down'))
        : Promise.resolve({ json: { schema_version: 3, releases: [] } }),
    )
    expect(await fetchChannel()).toEqual({ schema_version: 3, releases: [] })
  })

  it('returns the first fulfilled even if a slower source would also succeed', async () => {
    const [ali] = channelUrlsForDownload()
    mockRequestUrl.mockImplementation(({ url }) =>
      url === ali
        ? new Promise<{ json: unknown }>((r) =>
            setTimeout(() => r({ json: { tag: 'ali' } }), 50),
          )
        : Promise.resolve({ json: { tag: 'gh' } }),
    )
    expect(await fetchChannel()).toEqual({ tag: 'gh' })
  })

  it('returns null when all sources reject', async () => {
    mockRequestUrl.mockRejectedValue(new Error('down'))
    expect(await fetchChannel()).toBeNull()
  })
})
