import {
  getSmtcmpBlockRenderMode,
  type SmtcmpBlockRenderInput,
} from './assistant-message-render-mode'

describe('getSmtcmpBlockRenderMode', () => {
  test('renders filename-less markdown smtcmp blocks as normal assistant text', () => {
    const block: SmtcmpBlockRenderInput = {
      language: 'markdown',
      filename: undefined,
      startLine: undefined,
      endLine: undefined,
    }

    expect(getSmtcmpBlockRenderMode(block)).toBe('markdown')
  })

  test('keeps file-backed markdown smtcmp blocks as actionable code blocks', () => {
    const block: SmtcmpBlockRenderInput = {
      language: 'markdown',
      filename: 'note.md',
      startLine: undefined,
      endLine: undefined,
    }

    expect(getSmtcmpBlockRenderMode(block)).toBe('code')
  })

  test('keeps non-markdown smtcmp blocks as code blocks', () => {
    const block: SmtcmpBlockRenderInput = {
      language: 'typescript',
      filename: undefined,
      startLine: undefined,
      endLine: undefined,
    }

    expect(getSmtcmpBlockRenderMode(block)).toBe('code')
  })
})
