import React, { useCallback, useMemo } from 'react'

import { ChatAssistantMessage, ChatMessage } from '../../types/chat'
import {
  ParsedTagContent,
  parseTagContents,
} from '../../utils/chat/parse-tag-content'

import AssistantMessageReasoning from './AssistantMessageReasoning'
import MarkdownCodeComponent from './MarkdownCodeComponent'
import MarkdownReferenceBlock from './MarkdownReferenceBlock'
import { ObsidianMarkdown } from './ObsidianMarkdown'
import { getSmtcmpBlockRenderMode } from './assistant-message-render-mode'

export default function AssistantMessageContent({
  content,
  contextMessages,
  handleApply,
  isApplying,
}: {
  content: ChatAssistantMessage['content']
  contextMessages: ChatMessage[]
  handleApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  isApplying: boolean
}) {
  const onApply = useCallback(
    (blockToApply: string) => {
      handleApply(blockToApply, contextMessages)
    },
    [handleApply, contextMessages],
  )

  return (
    <AssistantTextRenderer onApply={onApply} isApplying={isApplying}>
      {content}
    </AssistantTextRenderer>
  )
}

const AssistantTextRenderer = React.memo(function AssistantTextRenderer({
  onApply,
  isApplying,
  children,
}: {
  onApply: (blockToApply: string) => void
  children: string
  isApplying: boolean
}) {
  const blocks: ParsedTagContent[] = useMemo(
    () => parseTagContents(children),
    [children],
  )

  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'string' ? (
          <div key={index}>
            <ObsidianMarkdown content={block.content} scale="sm" />
          </div>
        ) : block.type === 'think' ? (
          <AssistantMessageReasoning key={index} reasoning={block.content} />
        ) : (
          <SmtcmpBlockRenderer
            key={index}
            block={block}
            onApply={onApply}
            isApplying={isApplying}
          />
        ),
      )}
    </>
  )
})

function SmtcmpBlockRenderer({
  block,
  onApply,
  isApplying,
}: {
  block: Extract<ParsedTagContent, { type: 'smtcmp_block' }>
  onApply: (blockToApply: string) => void
  isApplying: boolean
}) {
  const mode = getSmtcmpBlockRenderMode(block)

  if (mode === 'markdown') {
    return (
      <div>
        <ObsidianMarkdown content={block.content} scale="sm" />
      </div>
    )
  }

  if (mode === 'reference') {
    return (
      <MarkdownReferenceBlock
        filename={block.filename!}
        startLine={block.startLine!}
        endLine={block.endLine!}
      />
    )
  }

  return (
    <MarkdownCodeComponent
      onApply={onApply}
      isApplying={isApplying}
      language={block.language}
      filename={block.filename}
    >
      {block.content}
    </MarkdownCodeComponent>
  )
}
