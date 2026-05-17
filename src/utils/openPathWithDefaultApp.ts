import { Notice } from 'obsidian'

import { t } from '../i18n'

export async function openPathWithDefaultApp(
  app: unknown,
  logPath: string,
): Promise<void> {
  const opener = (
    app as {
      openWithDefaultApp?: (p: string) => Promise<void>
    }
  ).openWithDefaultApp
  if (opener) {
    try {
      await opener.call(app, logPath)
      return
    } catch {
      // Fall through to Electron's shell opener below.
    }
  }

  try {
    const electron = require('electron') as {
      shell?: {
        openPath?: (path: string) => Promise<string>
      }
    }
    const errorMessage = await electron.shell?.openPath?.(logPath)
    if (!errorMessage) return
  } catch {
    // Fall through to the path notice.
  }

  new Notice(t('notice:engine.logLocation', { path: logPath }))
}
