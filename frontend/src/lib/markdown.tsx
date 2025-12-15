import React from 'react'

interface MarkdownProps {
  content: string
  className?: string
}

/**
 * Lightweight markdown renderer for chat messages
 * Handles: **bold**, *italic*, `code`, lists, and line breaks
 */
export function Markdown({ content, className = '' }: MarkdownProps) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inList = false
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const processItalic = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let currentIndex = 0
    const italicRegex = /\*([^*\n]+?)\*|_([^_\n]+?)_/g
    const matches: Array<{ index: number; length: number; text: string }> = []

    italicRegex.lastIndex = 0
    let match
    while ((match = italicRegex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[1] || match[2],
      })
    }

    matches.forEach((match) => {
      if (match.index > currentIndex) {
        parts.push(text.slice(currentIndex, match.index))
      }
      parts.push(
        <em key={`${match.index}-italic`} className="italic">
          {match.text}
        </em>
      )
      currentIndex = match.index + match.length
    })

    if (currentIndex < text.length) {
      parts.push(text.slice(currentIndex))
    }

    return parts.length > 0 ? parts : text
  }

  const renderFormattedText = (text: string): React.ReactNode => {
    // Process bold first, then italic on remaining text
    const boldRegex = /\*\*([^*]+?)\*\*|__([^_]+?)__/g
    
    // Find bold matches
    const boldMatches: Array<{ index: number; length: number; text: string }> = []
    let match
    boldRegex.lastIndex = 0
    while ((match = boldRegex.exec(text)) !== null) {
      boldMatches.push({
        index: match.index,
        length: match[0].length,
        text: match[1] || match[2],
      })
    }

    // If we have bold matches, process text segments
    if (boldMatches.length > 0) {
      const segments: React.ReactNode[] = []
      let lastIndex = 0

      boldMatches.forEach((boldMatch, idx) => {
        // Add italic-formatted text before bold
        if (boldMatch.index > lastIndex) {
          segments.push(
            <React.Fragment key={`pre-bold-${idx}`}>
              {processItalic(text.slice(lastIndex, boldMatch.index))}
            </React.Fragment>
          )
        }

        // Add bold text (no italic inside bold)
        segments.push(
          <strong key={`bold-${idx}`} className="font-semibold">
            {boldMatch.text}
          </strong>
        )

        lastIndex = boldMatch.index + boldMatch.length
      })

      // Add remaining italic-formatted text
      if (lastIndex < text.length) {
        segments.push(
          <React.Fragment key="post-bold">
            {processItalic(text.slice(lastIndex))}
          </React.Fragment>
        )
      }

      return segments.length > 0 ? segments : text
    }

    // No bold, just process italic
    return processItalic(text)
  }

  const renderInlineMarkdown = (text: string): React.ReactNode => {
    // Process code blocks first (they can't contain other formatting)
    const codeRegex = /`([^`]+?)`/g
    const codeMatches: Array<{ index: number; length: number; text: string }> = []
    codeRegex.lastIndex = 0
    let match
    while ((match = codeRegex.exec(text)) !== null) {
      codeMatches.push({
        index: match.index,
        length: match[0].length,
        text: match[1],
      })
    }

    // Split text by code blocks
    if (codeMatches.length === 0) {
      return renderFormattedText(text)
    }

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    codeMatches.forEach((codeMatch, idx) => {
      // Add formatted text before code
      if (codeMatch.index > lastIndex) {
        parts.push(
          <React.Fragment key={`text-${idx}`}>
            {renderFormattedText(text.slice(lastIndex, codeMatch.index))}
          </React.Fragment>
        )
      }

      // Add code
      parts.push(
        <code
          key={`code-${idx}`}
          className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono"
        >
          {codeMatch.text}
        </code>
      )

      lastIndex = codeMatch.index + codeMatch.length
    })

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <React.Fragment key="text-final">
          {renderFormattedText(text.slice(lastIndex))}
        </React.Fragment>
      )
    }

    return parts.length > 0 ? parts : text
  }

  const closeList = () => {
    if (listItems.length > 0) {
      const ListTag = listType === 'ol' ? 'ol' : 'ul'
      elements.push(
        <ListTag
          key={`list-${elements.length}`}
          className={`${listType === 'ol' ? 'list-decimal' : 'list-disc'} list-inside my-2 space-y-1 ml-4`}
        >
          {listItems.map((item, i) => (
            <li key={i} className="pl-1">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ListTag>
      )
      listItems = []
    }
    listType = null
    inList = false
  }

  const processLine = (line: string, index: number) => {
    const trimmed = line.trim()

    // Check for unordered list item
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== 'ul') {
        closeList()
        inList = true
        listType = 'ul'
      }
      listItems.push(trimmed.replace(/^[-*]\s+/, ''))
      return
    }

    // Check for ordered list item
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        closeList()
        inList = true
        listType = 'ol'
      }
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''))
      return
    }

    // Close list if we were in one
    if (inList) {
      closeList()
    }

    // Empty line = paragraph break
    if (trimmed === '') {
      if (elements.length > 0) {
        elements.push(<br key={`br-${index}`} />)
      }
      return
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${index}`} className="my-1">
        {renderInlineMarkdown(trimmed)}
      </p>
    )
  }

  lines.forEach((line, index) => processLine(line, index))

  // Close any remaining list
  closeList()

  return (
    <div className={className}>
      {elements.length > 0 ? elements : <>{content}</>}
    </div>
  )
}
