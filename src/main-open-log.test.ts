import { Notice } from 'obsidian'

import { openPathWithDefaultApp } from './utils/openPathWithDefaultApp'

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}))
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
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
  const openPath = jest.requireMock('electron').shell.openPath
  const existsSync = jest.requireMock('fs').existsSync

  beforeEach(() => {
    ;(Notice as unknown as jest.Mock).mockClear()
    openPath.mockReset()
    openPath.mockResolvedValue('')
    existsSync.mockReset()
    existsSync.mockReturnValue(true)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  test('notices "not ready" without opening when the file is missing', async () => {
    existsSync.mockReturnValue(false)

    await openPathWithDefaultApp({}, '/tmp/om-core.log')

    expect(openPath).not.toHaveBeenCalled()
    expect(Notice).toHaveBeenCalledWith(
      'Log not created yet (engine not running, or just started)',
    )
  })

  test('opens via Electron shell when the file exists', async () => {
    await openPathWithDefaultApp({}, '/tmp/om-core.log')

    expect(openPath).toHaveBeenCalledWith('/tmp/om-core.log')
    expect(Notice).not.toHaveBeenCalled()
  })

  test('falls back to App opener (bound receiver) when Electron shell fails', async () => {
    openPath.mockResolvedValue('shell failed')
    const app = {
      openWithDefaultApp: jest.fn(function (this: unknown) {
        expect(this).toBe(app)
        return Promise.resolve()
      }),
    }

    await openPathWithDefaultApp(app, '/tmp/om-core.log')

    expect(app.openWithDefaultApp).toHaveBeenCalledWith('/tmp/om-core.log')
    expect(Notice).not.toHaveBeenCalled()
  })

  test('reports the log path when every opener fails', async () => {
    openPath.mockResolvedValue('shell failed')
    const app = {
      openWithDefaultApp: jest.fn(async () => {
        throw new Error('open failed')
      }),
    }

    await expect(
      openPathWithDefaultApp(app, '/tmp/om-core.log'),
    ).resolves.toBeUndefined()

    expect(Notice).toHaveBeenCalledWith('Log: /tmp/om-core.log')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
