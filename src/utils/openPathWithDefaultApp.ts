import fs from 'fs'

import { Notice } from 'obsidian'

import { t } from '../i18n'

// Open an absolute log path in the OS default app; notice-only on failure.
export async function openPathWithDefaultApp(
  app: unknown,
  logPath: string,
): Promise<void> {
  if (!fs.existsSync(logPath)) {
    new Notice(t('notice:engine.logNotReady'))
    return
  }

  // Electron shell handles absolute OS paths; '' = success, non-empty = error.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron shell via lazy require, desktop-only
    const electron = require('electron') as {
      shell?: { openPath?: (path: string) => Promise<string> }
    }
    const errorMessage = await electron.shell?.openPath?.(logPath)
    if (errorMessage === '') return
  } catch {
    // Fall through to Obsidian's opener.
  }

  const opener = (app as { openWithDefaultApp?: (p: string) => Promise<void> })
    .openWithDefaultApp
  if (opener) {
    try {
      await opener.call(app, logPath)
      return
    } catch {
      // Fall through to the path notice.
    }
  }

  new Notice(t('notice:engine.logLocation', { path: logPath }))
}
