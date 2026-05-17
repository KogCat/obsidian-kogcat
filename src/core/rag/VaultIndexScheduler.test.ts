import { VaultIndexScheduler } from './VaultIndexScheduler'

describe('VaultIndexScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('does not schedule a vault scan on startup by default', () => {
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn(() => ({ name: 'event' })),
        },
      } as never,
      getRAGEngine: jest.fn(),
      registerEvent: jest.fn(),
    })

    scheduler.start()

    expect(scheduler.getStatus()).toEqual({ kind: 'idle' })
  })

  test('can schedule a vault scan on startup when explicitly enabled', () => {
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn(() => ({ name: 'event' })),
        },
      } as never,
      getRAGEngine: jest.fn(),
      registerEvent: jest.fn(),
      scheduleOnStart: true,
    })

    scheduler.start()

    expect(scheduler.getStatus()).toEqual({
      kind: 'scheduled',
      reason: 'startup',
    })
    scheduler.cleanup()
  })

  test('schedules and runs an incremental index update for markdown changes', async () => {
    const handlers = new Map<string, (...args: never[]) => void>()
    const updateFilesIndex = jest.fn(async () => undefined)
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn((name: string, handler: (...args: never[]) => void) => {
            handlers.set(name, handler)
            return { name }
          }),
        },
      } as never,
      getRAGEngine: jest.fn(async () => ({ updateFilesIndex }) as never),
      registerEvent: jest.fn(),
      debounceMs: 10,
      scheduleOnStart: false,
    })

    scheduler.start()
    handlers.get('modify')?.({
      path: 'notes/a.md',
      extension: 'md',
      stat: { mtime: Date.now() },
    } as never)

    expect(scheduler.getStatus()).toEqual({
      kind: 'scheduled',
      reason: 'modify',
    })

    await scheduler.runNow()

    expect(updateFilesIndex).toHaveBeenCalledWith(
      ['notes/a.md'],
      expect.any(Function),
    )
    expect(scheduler.getStatus()).toEqual({ kind: 'idle' })
  })

  test('ignores stale markdown modify events during the startup settle window', () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const handlers = new Map<string, (...args: never[]) => void>()
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn((name: string, handler: (...args: never[]) => void) => {
            handlers.set(name, handler)
            return { name }
          }),
        },
      } as never,
      getRAGEngine: jest.fn(),
      registerEvent: jest.fn(),
      debounceMs: 10,
      scheduleOnStart: false,
    })

    scheduler.start()
    handlers.get('modify')?.({
      path: 'notes/old.md',
      extension: 'md',
      stat: { mtime: 1_000 },
    } as never)

    expect(scheduler.getStatus()).toEqual({ kind: 'idle' })
  })

  test('schedules recent markdown modify events during the startup settle window', () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const handlers = new Map<string, (...args: never[]) => void>()
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn((name: string, handler: (...args: never[]) => void) => {
            handlers.set(name, handler)
            return { name }
          }),
        },
      } as never,
      getRAGEngine: jest.fn(),
      registerEvent: jest.fn(),
      debounceMs: 10,
      scheduleOnStart: false,
    })

    scheduler.start()
    handlers.get('modify')?.({
      path: 'notes/recent.md',
      extension: 'md',
      stat: { mtime: 10_000 },
    } as never)

    expect(scheduler.getStatus()).toEqual({
      kind: 'scheduled',
      reason: 'modify',
    })
    scheduler.cleanup()
  })

  test('ignores non-markdown file changes', async () => {
    const handlers = new Map<string, (...args: never[]) => void>()
    const updateFilesIndex = jest.fn(async () => undefined)
    const scheduler = new VaultIndexScheduler({
      app: {
        vault: {
          on: jest.fn((name: string, handler: (...args: never[]) => void) => {
            handlers.set(name, handler)
            return { name }
          }),
        },
      } as never,
      getRAGEngine: jest.fn(async () => ({ updateFilesIndex }) as never),
      registerEvent: jest.fn(),
      debounceMs: 10,
      scheduleOnStart: false,
    })

    scheduler.start()
    updateFilesIndex.mockClear()
    handlers.get('modify')?.({
      path: 'attachments/image.png',
      extension: 'png',
    } as never)

    expect(scheduler.getStatus()).toEqual({ kind: 'idle' })
    expect(updateFilesIndex).not.toHaveBeenCalled()
  })
})
