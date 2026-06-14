import { ContentPart, RequestMessage } from '../../types/llm/request'

/**
 * Concatenates message contents, handling both string and ContentPart[] formats.
 * Returns either a string or ContentPart[] depending on the message role.
 */
function concatenateMessageContent(
  prevContent: string | ContentPart[],
  currentContent: string | ContentPart[],
): string | ContentPart[] {
  const prevParts: ContentPart[] =
    typeof prevContent === 'string'
      ? [{ type: 'text', text: prevContent }]
      : prevContent
  const currParts: ContentPart[] =
    typeof currentContent === 'string'
      ? [{ type: 'text', text: currentContent }]
      : currentContent

  const merged = [...prevParts, ...currParts].filter(
    (part) => !(part.type === 'text' && part.text.trim().length === 0),
  )
  if (merged.every((part) => part.type === 'text')) {
    return merged.map((part) => part.text).join('\n\n')
  }
  return merged
}

/**
 * Normalizes messages for LLM APIs that require strict user/assistant
 * alternation: merges consecutive same-role messages and consolidates all
 * system messages into one entry at the start.
 */
export function formatMessages(messages: RequestMessage[]): RequestMessage[] {
  const formattedMessages: RequestMessage[] = []

  const systemMessages = messages.filter((msg) => msg.role === 'system')
  const nonSystemMessages = messages.filter((msg) => msg.role !== 'system')

  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages
      .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
      .filter((content) => content.trim().length > 0)
      .join('\n\n')

    if (combinedSystemContent.trim().length > 0) {
      formattedMessages.push({
        role: 'system',
        content: combinedSystemContent,
      })
    }
  }

  for (const currentMessage of nonSystemMessages) {
    const prevMessage = formattedMessages[formattedMessages.length - 1]

    if (prevMessage && prevMessage.role === currentMessage.role) {
      prevMessage.content = concatenateMessageContent(
        prevMessage.content,
        currentMessage.content,
      )
    } else {
      formattedMessages.push(currentMessage)
    }
  }

  return formattedMessages
}
