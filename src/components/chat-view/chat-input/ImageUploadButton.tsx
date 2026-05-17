import { ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ImageUploadButton({
  onUpload,
}: {
  onUpload: (files: File[]) => void
}) {
  const { t } = useTranslation('chat')
  const label = t('header.addImage')
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      onUpload(files)
    }
  }

  return (
    <label
      className="cc-chat-user-input-submit-button"
      aria-label={label}
      title={label}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="cc-chat-user-input-submit-button-icons">
        <ImageIcon size={12} />
      </div>
    </label>
  )
}
