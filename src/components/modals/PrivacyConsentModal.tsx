import { App } from 'obsidian'

import { t } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

// KogCat privacy consent (spec §4 / §7.2 P1 #18 / §9.8 default).
// Triggered the first time the user asks KogCat for an advisor answer. Once accepted,
// settings.kogcatLlmConsented is set true and the modal stays dormant. Decline
// returns false so the caller can abort the action.

export type PrivacyConsentOptions = {
  onAgree: () => void
  onCancel?: () => void
}

type ComponentProps = {
  onAgree: () => void
  onCancel?: () => void
  onClose: () => void
}

export class PrivacyConsentModal extends ReactModal<ComponentProps> {
  private settled = false
  private readonly handleCancel?: () => void

  constructor(app: App, options: PrivacyConsentOptions) {
    super({
      app,
      Component: PrivacyConsentModalComponent,
      props: {
        onAgree: () => {
          this.settled = true
          options.onAgree()
        },
        onCancel: () => {
          this.settled = true
          options.onCancel?.()
        },
      },
      options: { title: t('privacy:title') },
    })
    this.handleCancel = options.onCancel
  }

  onClose(): void {
    super.onClose()
    if (!this.settled) {
      this.settled = true
      this.handleCancel?.()
    }
  }
}

function PrivacyConsentModalComponent({
  onAgree,
  onCancel,
  onClose,
}: ComponentProps) {
  return (
    <div>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {t('privacy:body')}
      </div>
      <div className="modal-button-container">
        <button
          className="mod-cta"
          onClick={() => {
            onAgree()
            onClose()
          }}
        >
          {t('privacy:cta.agree')}
        </button>
        <button
          className="mod-cancel"
          onClick={() => {
            onCancel?.()
            onClose()
          }}
        >
          {t('privacy:cta.cancel')}
        </button>
      </div>
    </div>
  )
}

// Helper: gate any LLM-touching action behind the consent flag. Resolves true
// when the action may proceed.
export function ensureLlmConsent(args: {
  app: App
  consented: boolean
  setConsented: (value: boolean) => void | Promise<void>
}): Promise<boolean> {
  if (args.consented) return Promise.resolve(true)
  return new Promise((resolve) => {
    new PrivacyConsentModal(args.app, {
      onAgree: () => {
        void Promise.resolve(args.setConsented(true)).then(() => resolve(true))
      },
      onCancel: () => resolve(false),
    }).open()
  })
}
