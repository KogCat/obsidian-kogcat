import { App, TFile } from 'obsidian'
import { useTranslation } from 'react-i18next'

import { t as tFn } from '../../../i18n'
import { ReactModal } from '../../common/ReactModal'

type IncludedFilesModalComponentProps = {
  files: TFile[]
  patterns: string[]
}

export class IncludedFilesModal extends ReactModal<IncludedFilesModalComponentProps> {
  constructor(app: App, files: TFile[], patterns: string[]) {
    super({
      app: app,
      Component: IncludedFilesModalComponent,
      props: { files, patterns },
      options: {
        title: tFn('modal:includedFiles.title', { count: files.length }),
      },
    })
  }
}

function IncludedFilesModalComponent({
  files,
  patterns,
}: IncludedFilesModalComponentProps) {
  const { t } = useTranslation('modal')
  return patterns.length === 0 ? (
    <div>{t('includedFiles.noPatterns')}</div>
  ) : files.length === 0 ? (
    <div>{t('includedFiles.empty')}</div>
  ) : (
    <ul>
      {files.map((file) => (
        <li key={file.path}>{file.path}</li>
      ))}
    </ul>
  )
}
