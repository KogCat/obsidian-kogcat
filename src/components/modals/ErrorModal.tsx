import { App } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { ReactModal } from '../common/ReactModal'

type ErrorModalOptions = {
  showReportBugButton?: boolean
  showSettingsButton?: boolean
}

type ErrorModalComponentProps = {
  app: App
  message: string
  log?: string
  onClose: () => void
  options: ErrorModalOptions
}

export class ErrorModal extends ReactModal<ErrorModalComponentProps> {
  constructor(
    app: App,
    title: string,
    message: string,
    log?: string,
    options: ErrorModalOptions = {},
  ) {
    super({
      app: app,
      Component: ErrorModalComponent,
      props: {
        app,
        message,
        log,
        options,
      },
      options: {
        title,
      },
    })
  }
}

function ErrorModalComponent({
  app,
  message,
  log,
  onClose,
  options,
}: ErrorModalComponentProps) {
  const { t } = useTranslation('modal')
  return (
    <div className="cc-error-modal-content">
      <div className="cc-error-modal-message">{message}</div>
      {log && <pre className="cc-error-modal-log">{log}</pre>}
      <div className="modal-button-container">
        {options.showReportBugButton && (
          <button
            className="mod-cta"
            onClick={() => {
              onClose()
              window.open(
                'https://github.com/KogCat/obsidian-kogcat/issues',
                '_blank',
              )
            }}
          >
            {t('error.reportBug')}
          </button>
        )}
        {options.showSettingsButton && (
          <button
            className="mod-cta"
            onClick={() => {
              onClose()
              // @ts-expect-error: setting property exists in Obsidian's App but is not typed
              app.setting.open()
              // @ts-expect-error: setting property exists in Obsidian's App but is not typed
              app.setting.openTabById('kogcat')
            }}
          >
            {t('error.openSettings')}
          </button>
        )}
        <button className="mod-cancel" onClick={onClose}>
          {t('error.cancel')}
        </button>
      </div>
    </div>
  )
}
