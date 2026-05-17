import fs from 'fs'
import path from 'path'

const styles = fs.readFileSync(
  path.join(__dirname, '../../../styles.css'),
  'utf8',
)
const chatSource = fs.readFileSync(path.join(__dirname, './Chat.tsx'), 'utf8')
const mainSource = fs.readFileSync(path.join(__dirname, '../../main.ts'), 'utf8')
const userMessageItemSource = fs.readFileSync(
  path.join(__dirname, './UserMessageItem.tsx'),
  'utf8',
)
const chatUserInputSource = fs.readFileSync(
  path.join(__dirname, './chat-input/ChatUserInput.tsx'),
  'utf8',
)
const headerOmCoreStatusSource = fs.readFileSync(
  path.join(__dirname, './HeaderOmCoreStatus.tsx'),
  'utf8',
)
const headerVaultIndexStatusSource = fs.existsSync(
  path.join(__dirname, './HeaderVaultIndexStatus.tsx'),
)
  ? fs.readFileSync(
      path.join(__dirname, './HeaderVaultIndexStatus.tsx'),
      'utf8',
    )
  : ''
const headerKogCatButtonSource = fs.existsSync(
  path.join(__dirname, './HeaderKogCatButton.tsx'),
)
  ? fs.readFileSync(path.join(__dirname, './HeaderKogCatButton.tsx'), 'utf8')
  : ''
const submitButtonSource = fs.readFileSync(
  path.join(__dirname, './chat-input/SubmitButton.tsx'),
  'utf8',
)
const assistantToolMessageGroupSource = fs.readFileSync(
  path.join(__dirname, './AssistantToolMessageGroupItem.tsx'),
  'utf8',
)
const assistantMessageReasoningSource = fs.readFileSync(
  path.join(__dirname, './AssistantMessageReasoning.tsx'),
  'utf8',
)
const sidebarPanelSource = fs.readFileSync(
  path.join(__dirname, '../sidebar/SidebarPanel.tsx'),
  'utf8',
)

function ruleBody(selector: string): string {
  const match = styles.match(
    new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{([^}]*)}`,
    ),
  )
  return match?.[1] ?? ''
}

describe('chat layout styles', () => {
  test('presents KogCat with a readable service status pill in the header', () => {
    expect(chatSource).toContain('>KogCat<')
    expect(headerOmCoreStatusSource).toContain('cc-om-core-status')
    expect(headerOmCoreStatusSource).toContain('Ready')
    expect(headerOmCoreStatusSource).toContain('Starting')
    expect(headerOmCoreStatusSource).toContain('Offline')
    expect(headerOmCoreStatusSource).toContain('Error')
    expect(ruleBody('.cc-om-core-status')).toContain('border-radius: 999px')
    expect(ruleBody('.cc-om-core-status-dot')).toContain('border-radius: 50%')
  })

  test('shows vault index freshness in the header', () => {
    expect(chatSource).toContain('<HeaderVaultIndexStatus />')
    expect(headerVaultIndexStatusSource).toContain('cc-vault-index-status')
    expect(headerVaultIndexStatusSource).toContain('Index ready')
    expect(headerVaultIndexStatusSource).toContain('Indexing')
    expect(headerVaultIndexStatusSource).toContain('Index failed')
    expect(ruleBody('.cc-vault-index-status-dot')).toContain(
      'border-radius: 50%',
    )
  })

  test('keeps header actions focused on chat and KogCat controls', () => {
    const newChatIndex = chatSource.indexOf("aria-label={t('chat:header.newChat')}")
    const kogcatIndex = chatSource.indexOf('<HeaderKogCatButton />')
    const historyIndex = chatSource.indexOf('<ChatListDropdown')

    expect(newChatIndex).toBeGreaterThanOrEqual(0)
    expect(kogcatIndex).toBeGreaterThan(newChatIndex)
    expect(historyIndex).toBeGreaterThan(kogcatIndex)
    expect(chatSource).not.toContain('<HeaderToolsButton />')
    expect(chatSource).not.toContain('TemplateSectionModal')
  })

  test('uses the KogCat cat mark and popover for the KogCat header entry', () => {
    expect(mainSource).toContain("addIcon(KOGCAT_ICON_ID")
    expect(mainSource).toContain("addRibbonIcon(KOGCAT_ICON_ID")
    expect(headerKogCatButtonSource).toContain('KogCatIcon')
    expect(sidebarPanelSource).toContain('KogCatIcon')
    expect(headerKogCatButtonSource).not.toContain('Brain')
    expect(sidebarPanelSource).not.toContain('Brain')
    expect(headerKogCatButtonSource).toContain('Popover.Root')
    expect(headerKogCatButtonSource).toContain('<SidebarPanel />')
  })

  test('keeps KogCat panel focused on answer mode and engine controls', () => {
    expect(sidebarPanelSource).toContain('kogcatEnabled')
    expect(sidebarPanelSource).toContain('kogcatAnswerMode')
    expect(sidebarPanelSource).toContain("t('sidebar:answerMode.quick')")
    expect(sidebarPanelSource).toContain("t('sidebar:answerMode.advisor')")
    expect(sidebarPanelSource).toContain('restartOmCore')
    expect(sidebarPanelSource).toContain('openOmCoreLog')
    expect(sidebarPanelSource).not.toContain("t('sidebar:section.recent')")
    expect(sidebarPanelSource).not.toContain("t('sidebar:section.pending')")
    expect(sidebarPanelSource).not.toContain('listRecent')
    expect(sidebarPanelSource).not.toContain('listPending')
  })

  test('moves stop generation into the composer submit button', () => {
    expect(chatSource).not.toContain('cc-stop-gen-btn')
    expect(chatSource).toContain('isGenerating={submitChatMutation.isPending}')
    expect(chatSource).toContain('onAbortGeneration={abortActiveStreams}')
    expect(chatUserInputSource).toContain('isGenerating')
    expect(chatUserInputSource).toContain('onAbortGeneration')
    expect(submitButtonSource).toContain('CircleStop')
    expect(submitButtonSource).toContain("t('input.stop')")
  })

  test('keeps the current input outside of the scrollable chat body', () => {
    const chatBodyStart = chatSource.indexOf('<div className="cc-chat-body">')
    const chatInputStart = chatSource.indexOf('<ChatUserInput')
    const bodyBeforeInput = chatSource.slice(chatBodyStart, chatInputStart)
    const openDivs = bodyBeforeInput.match(/<div\b/g)?.length ?? 0
    const closeDivs = bodyBeforeInput.match(/<\/div>/g)?.length ?? 0

    expect(chatBodyStart).toBeGreaterThanOrEqual(0)
    expect(chatInputStart).toBeGreaterThan(chatBodyStart)
    expect(openDivs - closeDivs).toBe(0)
  })

  test('stacks messages above the input inside the chat body', () => {
    expect(ruleBody('.cc-chat-body')).toContain('flex-direction: column')
  })

  test('allows the message list to shrink and scroll inside the flex body', () => {
    expect(ruleBody('.cc-chat-body > .cc-chat-messages')).toContain(
      'min-height: 0',
    )
  })

  test('renders historical user messages as stable read-only bubbles', () => {
    expect(userMessageItemSource).not.toContain('<ChatUserInput')
    expect(userMessageItemSource).not.toContain('<button')
    expect(userMessageItemSource).not.toContain('onClick={onFocus}')
    expect(userMessageItemSource).not.toContain('tabIndex')
    expect(userMessageItemSource).toContain('cc-chat-user-bubble')
    expect(ruleBody('.cc-chat-user-bubble')).toContain('width: fit-content')
    expect(ruleBody('.cc-chat-user-bubble')).toContain('min-height: 0')
    expect(ruleBody('.cc-chat-user-bubble')).toContain('user-select: text')
    expect(ruleBody('.cc-chat-user-bubble')).toContain(
      'border-radius: var(--cc-chat-bubble-radius)',
    )
    expect(ruleBody('.cc-chat-user-bubble')).toContain(
      'padding: var(--cc-chat-bubble-padding-y) var(--cc-chat-bubble-padding-x)',
    )
  })

  test('keeps current-file as hidden context instead of visible input chrome', () => {
    expect(chatUserInputSource).toContain('visibleMentionables')
    expect(chatUserInputSource).toContain("m.type !== 'current-file'")
  })

  test('wraps assistant replies in a selectable response bubble', () => {
    expect(assistantToolMessageGroupSource).toContain(
      'cc-chat-assistant-bubble',
    )
    expect(ruleBody('.cc-chat-assistant-bubble')).toContain(
      'background: var(--background-secondary)',
    )
    expect(ruleBody('.cc-chat-assistant-bubble')).toContain('user-select: text')
    expect(ruleBody('.cc-chat-assistant-bubble')).toContain(
      'border-radius: var(--cc-chat-bubble-radius)',
    )
    expect(ruleBody('.cc-chat-assistant-bubble')).toContain(
      'padding: var(--cc-chat-bubble-padding-y) var(--cc-chat-bubble-padding-x)',
    )
  })

  test('keeps reasoning collapsed until the user opens it', () => {
    expect(assistantMessageReasoningSource).toContain(
      'const [isExpanded, setIsExpanded] = useState(false)',
    )
    expect(assistantMessageReasoningSource).not.toContain(
      'setIsExpanded(true)',
    )
  })

  test('uses a restrained typography scale for assistant markdown', () => {
    expect(ruleBody('.cc-chat-container')).toContain(
      '--cc-chat-text-body: var(--font-ui-small)',
    )
    expect(ruleBody('.cc-chat-container')).toContain(
      '--cc-chat-text-caption: var(--font-ui-smaller)',
    )
    expect(ruleBody('.cc-chat-container')).toContain(
      '--cc-chat-text-muted: var(--text-muted)',
    )
    expect(ruleBody('.cc-markdown-rendered')).toContain(
      'font-size: var(--cc-markdown-body-size)',
    )
    expect(ruleBody('.cc-markdown-rendered h1')).toContain(
      'font-size: var(--cc-markdown-heading-1-size)',
    )
    expect(ruleBody('.cc-markdown-rendered h2')).toContain(
      'font-size: var(--cc-markdown-heading-2-size)',
    )
    expect(ruleBody('.cc-markdown-rendered blockquote')).toContain(
      'color: var(--cc-chat-text-muted)',
    )
    expect(ruleBody('.cc-assistant-message-metadata-toggle')).toContain(
      'font-size: var(--cc-chat-text-caption)',
    )
  })

  test('aligns the current composer with the message bubble shape', () => {
    expect(ruleBody('.cc-chat-user-input-container')).toContain(
      'border-radius: var(--cc-chat-bubble-radius)',
    )
    expect(ruleBody('.cc-chat-user-input-container')).toContain(
      'padding: var(--cc-chat-composer-padding)',
    )
  })

  test('uses responsive message widths for narrow Obsidian panes', () => {
    expect(styles).toContain('@media (max-width: 520px)')
    expect(ruleBody('.cc-chat-user-bubble')).toContain(
      'max-width: var(--cc-chat-user-bubble-width)',
    )
    expect(ruleBody('.cc-chat-assistant-bubble')).toContain(
      'max-width: var(--cc-chat-assistant-bubble-width)',
    )
  })
})
