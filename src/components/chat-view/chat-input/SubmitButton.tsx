import { CircleStop, CornerDownLeftIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function SubmitButton({
  isGenerating = false,
  onClick,
}: {
  isGenerating?: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('chat')
  const label = isGenerating ? t('input.stop') : t('input.send')
  return (
    <button
      type="button"
      className="cc-chat-user-input-submit-button cc-chat-user-input-submit-button--primary"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <div className="cc-chat-user-input-submit-button-icons">
        {isGenerating ? (
          <CircleStop size={12} />
        ) : (
          <CornerDownLeftIcon size={12} />
        )}
      </div>
    </button>
  )
}
