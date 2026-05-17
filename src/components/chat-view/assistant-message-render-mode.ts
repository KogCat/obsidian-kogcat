import { ParsedTagContent } from '../../utils/chat/parse-tag-content'

export type SmtcmpBlockRenderInput = Pick<
  Extract<ParsedTagContent, { type: 'smtcmp_block' }>,
  'language' | 'filename' | 'startLine' | 'endLine'
>

export function getSmtcmpBlockRenderMode(
  block: SmtcmpBlockRenderInput,
): 'markdown' | 'reference' | 'code' {
  if (block.startLine && block.endLine && block.filename) {
    return 'reference'
  }

  const language = block.language?.toLowerCase()
  if (
    !block.filename &&
    (!language || language === 'markdown' || language === 'md')
  ) {
    return 'markdown'
  }

  return 'code'
}
