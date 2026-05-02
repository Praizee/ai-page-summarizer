import { Readability } from '@mozilla/readability'
import type { ExtMessage, ExtResponse } from '../shared/types'
import { MAX_CONTENT_CHARS, AVG_WORDS_PER_MIN } from '../shared/utils'

chrome.runtime.onMessage.addListener(
  (msg: ExtMessage, _sender, sendResponse: (r: ExtResponse) => void) => {
    if (msg.type === 'EXTRACT_CONTENT') {
      sendResponse(extractContent())
      return false
    }
    if (msg.type === 'APPLY_HIGHLIGHTS') {
      applyHighlights(msg.sentences)
      sendResponse({ type: 'HIGHLIGHT_DONE' })
      return false
    }
  }
)

function extractContent(): ExtResponse {
  try {
    const docClone = document.cloneNode(true) as Document
    const reader = new Readability(docClone)
    const article = reader.parse()

    let text = ''
    let title = document.title

    if (article && article.textContent && article.textContent.trim().length > 200) {
      text = article.textContent
      title = article.title || document.title
    } else {
      // Fallback: try semantic containers first, then body
      const fallback =
        document.querySelector<HTMLElement>('main, article, [role="main"]') ??
        document.body
      text = fallback.innerText ?? ''
    }

    text = text.replace(/\s{3,}/g, '\n\n').trim()
    if (text.length > MAX_CONTENT_CHARS) {
      text = text.slice(0, MAX_CONTENT_CHARS)
    }

    if (text.length < 50) {
      return { type: 'ERROR', code: 'EXTRACTION_FAIL', message: 'Not enough readable content on this page.' }
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length
    const readingTime = Math.ceil(wordCount / AVG_WORDS_PER_MIN)

    return { type: 'CONTENT_RESULT', text, title, wordCount, readingTime }
  } catch {
    return { type: 'ERROR', code: 'EXTRACTION_FAIL', message: 'Failed to extract page content.' }
  }
}

let highlightStyleInjected = false

function applyHighlights(sentences: string[]) {
  if (!highlightStyleInjected) {
    const style = document.createElement('style')
    style.textContent =
      '.ai-highlight{background:#fef08a;border-radius:2px;padding:0 1px;color:inherit}'
    document.head.appendChild(style)
    highlightStyleInjected = true
  }

  for (const sentence of sentences) {
    highlightSentence(sentence.trim())
  }
}

function highlightSentence(sentence: string) {
  if (!sentence) return

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node: Text | null

  while ((node = walker.nextNode() as Text | null)) {
    const idx = node.nodeValue?.indexOf(sentence) ?? -1
    if (idx === -1) continue

    // Split the text node and wrap the matching portion in a <mark>
    const before = node.splitText(idx)
    const match = before.splitText(sentence.length)

    const mark = document.createElement('mark')
    mark.className = 'ai-highlight'
    // Use DOM methods only — never innerHTML — to prevent XSS
    mark.appendChild(document.createTextNode(before.nodeValue ?? ''))
    before.parentNode?.replaceChild(mark, before)

    // Only highlight first occurrence per sentence
    void match
    break
  }
}
