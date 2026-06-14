import { App } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { t as tFn } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

export class InstallerUpdateRequiredModal extends ReactModal<
  Record<string, never>
> {
  constructor(app: App) {
    super({
      app: app,
      Component: InstallerUpdateRequiredModalComponent,
      props: {},
      options: {
        title: tFn('modal:installerUpdateRequired.title'),
      },
    })
  }
}

function InstallerUpdateRequiredModalComponent() {
  const { t } = useTranslation('modal')
  return (
    <div>
      <div>{t('installerUpdateRequired.message')}</div>
      <div>
        <div className="modal-button-container">
          <button
            className="mod-cta"
            onClick={() => {
              window.open('https://obsidian.md/download')
            }}
          >
            {t('installerUpdateRequired.cta')}
          </button>
        </div>
      </div>
    </div>
  )
}
