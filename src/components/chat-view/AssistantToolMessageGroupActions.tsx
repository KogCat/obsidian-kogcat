import * as Tooltip from '@radix-ui/react-tooltip'
import { Check, CopyIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AssistantToolMessageGroup } from '../../types/chat'

import { CogCalibrationStatus } from './CogCalibrationStatus'
import { getToolMessageContent } from './ToolMessage'
import { KogCatMessageState } from './useKogCatCalibration'

function CopyButton({ messages }: { messages: AssistantToolMessageGroup }) {
  const [copied, setCopied] = useState(false)

  const content = useMemo(() => {
    return messages
      .map((message) => {
        switch (message.role) {
          case 'assistant':
            return message.content === '' ? null : message.content
          case 'tool':
            return getToolMessageContent(message)
        }
      })
      .filter(Boolean)
      .join('\n\n')
  }, [messages])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 1500)
  }

  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={copied ? undefined : handleCopy}
            className="clickable-icon"
          >
            {copied ? <Check size={12} /> : <CopyIcon size={12} />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="cc-tooltip-content">
            Copy message
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export default function AssistantToolMessageGroupActions({
  messages,
  kogcatState,
  onKogcatToggleAdvisor,
}: {
  messages: AssistantToolMessageGroup
  kogcatState?: KogCatMessageState
  onKogcatToggleAdvisor?: () => void
}) {
  return (
    <div className="cc-assistant-message-actions">
      {kogcatState && (
        <CogCalibrationStatus
          view={kogcatState.view}
          showAdvisor={kogcatState.showAdvisor}
          onToggleAdvisor={onKogcatToggleAdvisor}
        />
      )}
      <CopyButton messages={messages} />
    </div>
  )
}
