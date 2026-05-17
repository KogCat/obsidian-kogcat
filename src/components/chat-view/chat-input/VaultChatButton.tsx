import * as Tooltip from '@radix-ui/react-tooltip'
import {
  ArrowBigUp,
  ChevronUp,
  Command,
  CornerDownLeftIcon,
} from 'lucide-react'
import { Platform } from 'obsidian'
import { useTranslation } from 'react-i18next'

export function VaultChatButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('chat')
  return (
    <>
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div
              className="cc-chat-user-input-submit-button"
              onClick={onClick}
              aria-label={t('header.chatWithVault')}
              title={t('header.chatWithVault')}
            >
              <div className="cc-chat-user-input-submit-button-icons">
                {Platform.isMacOS ? (
                  <Command size={10} />
                ) : (
                  <ChevronUp size={12} />
                )}
                {/* TODO: Replace with a custom icon */}
                <ArrowBigUp size={12} />
                <CornerDownLeftIcon size={12} />
              </div>
            </div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="cc-tooltip-content" sideOffset={5}>
              {t('header.chatWithVaultTooltip')}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </>
  )
}
