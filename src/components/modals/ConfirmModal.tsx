import { App } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { ReactModal } from '../common/ReactModal'

export type ConfirmModalOptions = {
  title: string
  message: string
  ctaText?: string
  onConfirm: () => void
  onCancel?: () => void
}

type ConfirmModalComponentProps = {
  message: string
  ctaText?: string
  onConfirm: () => void
  onCancel?: () => void
  onClose: () => void
}

export class ConfirmModal extends ReactModal<ConfirmModalComponentProps> {
  constructor(app: App, options: ConfirmModalOptions) {
    super({
      app: app,
      Component: ConfirmModalComponent,
      props: {
        message: options.message,
        ctaText: options.ctaText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
      },
      options: {
        title: options.title,
      },
    })
  }
}

function ConfirmModalComponent({
  message,
  ctaText,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmModalComponentProps) {
  const { t } = useTranslation('modal')
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
      <div className="modal-button-container">
        <button
          className="mod-warning"
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {ctaText ?? t('confirm.defaultCta')}
        </button>
        <button
          className="mod-cancel"
          onClick={() => {
            onClose()
            onCancel?.()
          }}
        >
          {t('confirm.cancel')}
        </button>
      </div>
    </div>
  )
}
