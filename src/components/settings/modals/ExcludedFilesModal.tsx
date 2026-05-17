import { App, TFile } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { t as tFn } from '../../../i18n'
import { ReactModal } from '../../common/ReactModal'

type ExcludedFilesModalComponentProps = {
  files: TFile[]
}

export class ExcludedFilesModal extends ReactModal<ExcludedFilesModalComponentProps> {
  constructor(app: App, files: TFile[]) {
    super({
      app: app,
      Component: ExcludedFilesModalComponent,
      props: { files },
      options: {
        title: tFn('modal:excludedFiles.title', { count: files.length }),
      },
    })
  }
}

function ExcludedFilesModalComponent({
  files,
}: ExcludedFilesModalComponentProps) {
  const { t } = useTranslation('modal')
  return files.length === 0 ? (
    <div>{t('excludedFiles.empty')}</div>
  ) : (
    <ul>
      {files.map((file) => (
        <li key={file.path}>{file.path}</li>
      ))}
    </ul>
  )
}
