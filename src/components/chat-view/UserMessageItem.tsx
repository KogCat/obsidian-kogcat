import { ChatUserMessage } from '../../types/chat'
import { Mentionable } from '../../types/mentionable'

import { editorStateToPlainText } from './chat-input/utils/editor-state-to-plain-text'
import SimilaritySearchResults from './SimilaritySearchResults'

export type UserMessageItemProps = {
  message: ChatUserMessage
}

export default function UserMessageItem({ message }: UserMessageItemProps) {
  const messageText = getUserMessageText(message)
  const visibleMentionables = message.mentionables.filter(
    (mentionable) => mentionable.type !== 'current-file',
  )

  return (
    <div className="cc-chat-messages-user">
      <div className="cc-chat-user-bubble">
        {visibleMentionables.length > 0 && (
          <div className="cc-chat-user-bubble-context">
            {visibleMentionables.map((mentionable, index) => (
              <span
                key={`${getMentionableLabel(mentionable)}-${index}`}
                className="cc-chat-user-bubble-context-chip"
              >
                {getMentionableLabel(mentionable)}
              </span>
            ))}
          </div>
        )}
        {messageText && (
          <div className="cc-chat-user-bubble-text">{messageText}</div>
        )}
      </div>
      {message.similaritySearchResults && (
        <SimilaritySearchResults
          similaritySearchResults={message.similaritySearchResults}
        />
      )}
    </div>
  )
}

function getUserMessageText(message: ChatUserMessage): string {
  if (message.content) {
    return editorStateToPlainText(message.content).trim()
  }
  if (typeof message.promptContent === 'string') {
    return message.promptContent.trim()
  }
  if (Array.isArray(message.promptContent)) {
    return message.promptContent
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim()
  }
  return ''
}

function getMentionableLabel(mentionable: Mentionable): string {
  switch (mentionable.type) {
    case 'file':
      return mentionable.file.name
    case 'folder':
      return mentionable.folder.name
    case 'vault':
      return 'Vault'
    case 'current-file':
      return mentionable.file
        ? `${mentionable.file.name} current`
        : 'Current file'
    case 'block':
      return `${mentionable.file.name} ${mentionable.startLine}:${mentionable.endLine}`
    case 'url':
      return mentionable.url
    case 'image':
      return mentionable.name
  }
}
