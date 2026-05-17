import { Notice } from 'obsidian'

import { openPathWithDefaultApp } from './utils/openPathWithDefaultApp'

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}))
jest.mock(
  'electron',
  () => ({
    shell: {
      openPath: jest.fn(),
    },
  }),
  { virtual: true },
)

describe('openPathWithDefaultApp', () => {
  let consoleErrorSpy: jest.SpyInstance
  const openPath = (
    jest.requireMock('electron') as { shell: { openPath: jest.Mock } }
  ).shell.openPath

  beforeEach(() => {
    ;(Notice as unknown as jest.Mock).mockClear()
    openPath.mockReset()
    openPath.mockResolvedValue('')
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  test('preserves App as the openWithDefaultApp receiver', async () => {
    const app = {
      openWithDefaultApp: jest.fn(function (this: unknown) {
        expect(this).toBe(app)
        return Promise.resolve()
      }),
    }

    await openPathWithDefaultApp(app, '/tmp/om-core.log')

    expect(app.openWithDefaultApp).toHaveBeenCalledWith('/tmp/om-core.log')
    expect(openPath).not.toHaveBeenCalled()
  })

  test('falls back to Electron shell when App opener is missing', async () => {
    await openPathWithDefaultApp({}, '/tmp/om-core.log')

    expect(openPath).toHaveBeenCalledWith('/tmp/om-core.log')
    expect(Notice).not.toHaveBeenCalled()
  })

  test('falls back to Electron shell when App opener fails', async () => {
    const app = {
      openWithDefaultApp: jest.fn(async () => {
        throw new Error('open failed')
      }),
    }

    await openPathWithDefaultApp(app, '/tmp/om-core.log')

    expect(openPath).toHaveBeenCalledWith('/tmp/om-core.log')
    expect(Notice).not.toHaveBeenCalled()
  })

  test('reports the log path instead of rejecting when every opener fails', async () => {
    const app = {
      openWithDefaultApp: jest.fn(async () => {
        throw new Error('open failed')
      }),
    }
    openPath.mockResolvedValue('shell failed')

    await expect(
      openPathWithDefaultApp(app, '/tmp/om-core.log'),
    ).resolves.toBeUndefined()

    expect(Notice).toHaveBeenCalledWith('Log: /tmp/om-core.log')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
