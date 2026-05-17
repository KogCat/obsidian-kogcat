import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  PasteCommandType,
  TextNode,
} from 'lexical'
import { useEffect } from 'react'

import { Mentionable, MentionableUrl } from '../../../../../types/mentionable'
import {
  getMentionableName,
  serializeMentionable,
} from '../../../../../utils/chat/mentionable'

import { $createMentionNode } from './MentionNode'

const URL_MATCHER =
  /^((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/

type URLMatch = {
  index: number
  length: number
  text: string
  url: string
}

function findURLs(text: string): URLMatch[] {
  const urls: URLMatch[] = []

  let lastIndex = 0
  for (const word of text.split(' ')) {
    if (URL_MATCHER.test(word)) {
      urls.push({
        index: lastIndex,
        length: word.length,
        text: word,
        url: word.startsWith('http') ? word : `https://${word}`,
      })
    }

    lastIndex += word.length + 1 // +1 for space
  }

  return urls
}

function $textNodeTransform(node: TextNode) {
  if (!node.isSimpleText()) {
    return
  }

  const text = node.getTextContent()

  // First match only — transform re-runs on newly inserted (dirty) nodes.
  const urlMatches = findURLs(text)
  if (urlMatches.length === 0) {
    return
  }
  const urlMatch = urlMatches[0]

  const selection = $getSelection()

  // Don't transform while cursor sits at the end of the URL (still typing).
  if (
    $isRangeSelection(selection) &&
    selection.anchor.key === node.getKey() &&
    selection.focus.key === node.getKey() &&
    selection.anchor.offset === urlMatch.index + urlMatch.length &&
    selection.focus.offset === urlMatch.index + urlMatch.length
  ) {
    return
  }

  let targetNode
  if (urlMatch.index === 0) {
    ;[targetNode] = node.splitText(urlMatch.index + urlMatch.length)
  } else {
    ;[, targetNode] = node.splitText(
      urlMatch.index,
      urlMatch.index + urlMatch.length,
    )
  }

  const mentionable: MentionableUrl = {
    type: 'url',
    url: urlMatch.url,
  }

  const mentionNode = $createMentionNode(
    getMentionableName(mentionable),
    serializeMentionable(mentionable),
  )

  targetNode.replace(mentionNode)

  const spaceNode = $createTextNode(' ')
  mentionNode.insertAfter(spaceNode)

  spaceNode.select()
}

function $handlePaste(event: PasteCommandType) {
  const clipboardData =
    event instanceof ClipboardEvent ? event.clipboardData : null

  if (!clipboardData) return false

  const text = clipboardData.getData('text/plain')

  const urlMatches = findURLs(text)
  if (urlMatches.length === 0) {
    return false
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  const nodes = []
  const addedMentionables: Mentionable[] = []
  let lastIndex = 0

  urlMatches.forEach((urlMatch) => {
    if (urlMatch.index > lastIndex) {
      nodes.push($createTextNode(text.slice(lastIndex, urlMatch.index)))
    }

    const mentionable: MentionableUrl = {
      type: 'url',
      url: urlMatch.url,
    }

    nodes.push(
      $createMentionNode(urlMatch.text, serializeMentionable(mentionable)),
    )
    addedMentionables.push(mentionable)

    lastIndex = urlMatch.index + urlMatch.length

    if (lastIndex >= text.length || text[lastIndex] !== ' ') {
      nodes.push($createTextNode(' '))
    }
  })

  if (lastIndex < text.length) {
    nodes.push($createTextNode(text.slice(lastIndex)))
  }

  selection.insertNodes(nodes)
  return true
}

export default function AutoLinkMentionPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.registerCommand(PASTE_COMMAND, $handlePaste, COMMAND_PRIORITY_LOW)

    editor.registerNodeTransform(TextNode, $textNodeTransform)
  }, [editor])

  return null
}
