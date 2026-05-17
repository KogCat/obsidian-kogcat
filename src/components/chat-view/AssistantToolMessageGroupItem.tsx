import {
  AssistantToolMessageGroup,
  ChatMessage,
  ChatToolMessage,
} from '../../types/chat'

import AssistantMessageAnnotations from './AssistantMessageAnnotations'
import AssistantMessageContent from './AssistantMessageContent'
import AssistantMessageReasoning from './AssistantMessageReasoning'
import AssistantToolMessageGroupActions from './AssistantToolMessageGroupActions'
import { CogAdvisorCard } from './CogCalibrationStatus'
import { resolveKogcatContent } from './kogcat-content-resolver'
import ToolMessage from './ToolMessage'
import { KogCatMessageState } from './useKogCatCalibration'

export type AssistantToolMessageGroupItemProps = {
  messages: AssistantToolMessageGroup
  contextMessages: ChatMessage[]
  conversationId: string
  isApplying: boolean // TODO: isApplying should be a boolean for each assistant message
  onApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  onToolMessageUpdate: (message: ChatToolMessage) => void
  // KogCat (spec §3.1) — calibration state per assistant message id.
  kogcatStates?: Map<string, KogCatMessageState>
  onKogcatToggleAdvisor?: (messageId: string) => void
}

export default function AssistantToolMessageGroupItem({
  messages,
  contextMessages,
  conversationId,
  isApplying,
  onApply,
  onToolMessageUpdate,
  kogcatStates,
  onKogcatToggleAdvisor,
}: AssistantToolMessageGroupItemProps) {
  return (
    <div className="cc-assistant-tool-message-group">
      {messages.map((message) => {
        if (message.role !== 'assistant') {
          return (
            <div key={message.id}>
              <ToolMessage
                message={message}
                conversationId={conversationId}
                onMessageUpdate={onToolMessageUpdate}
              />
            </div>
          )
        }

        const kogcatState = kogcatStates?.get(message.id)
        const hasKogcatAdvisor = kogcatState?.view.kind === 'advisor'
        return message.reasoning || message.annotations || message.content ? (
          <div key={message.id} className="cc-chat-messages-assistant">
            <div
              className={`cc-chat-assistant-bubble-stack${
                hasKogcatAdvisor
                  ? ' cc-chat-assistant-bubble-stack--has-advisor'
                  : ''
              }`}
            >
              <div className="cc-chat-assistant-bubble">
                {message.reasoning && (
                  <AssistantMessageReasoning reasoning={message.reasoning} />
                )}
                {message.annotations && (
                  <AssistantMessageAnnotations
                    annotations={message.annotations}
                  />
                )}
                <AssistantMessageContent
                  content={resolveKogcatContent(message.content, kogcatState)}
                  contextMessages={contextMessages}
                  handleApply={onApply}
                  isApplying={isApplying}
                />
              </div>
              <CogAdvisorCard
                view={kogcatState?.view ?? { kind: 'idle' }}
                showAdvisor={kogcatState?.showAdvisor ?? false}
                onToggleAdvisor={
                  onKogcatToggleAdvisor
                    ? () => onKogcatToggleAdvisor(message.id)
                    : undefined
                }
              />
            </div>
          </div>
        ) : null
      })}
      {messages.length > 0 && (
        <AssistantToolMessageGroupActions
          messages={messages}
          kogcatState={getLatestKogcatState(messages, kogcatStates)}
          onKogcatToggleAdvisor={
            onKogcatToggleAdvisor
              ? () => {
                  const messageId = getLatestAssistantMessageId(messages)
                  if (messageId) onKogcatToggleAdvisor(messageId)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function getLatestAssistantMessageId(
  messages: AssistantToolMessageGroup,
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return messages[i].id
  }
  return null
}

function getLatestKogcatState(
  messages: AssistantToolMessageGroup,
  states?: Map<string, KogCatMessageState>,
): KogCatMessageState | undefined {
  const messageId = getLatestAssistantMessageId(messages)
  return messageId ? states?.get(messageId) : undefined
}
