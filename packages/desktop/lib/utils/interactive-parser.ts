export interface InteractiveSelectData {
  type: 'interactive-select'
  title?: string
  options: string[]
}

export interface InteractiveInputData {
  type: 'interactive-input'
  title?: string
  placeholder?: string
  multiline?: boolean
}

export interface ToolResultData {
  type: 'tool-result'
  toolName: string
  status: 'success' | 'error'
  summary?: string
  details?: string
  duration?: number
}

export type InteractiveBlock =
  | InteractiveSelectData
  | InteractiveInputData
  | ToolResultData

interface ParsedSegment {
  type: 'text' | 'interactive'
  content: string | InteractiveBlock
}

export interface ParsedContent {
  segments: ParsedSegment[]
}

const BLOCK_REGEX
  = /:::(interactive-select|interactive-input|tool-result)\n([\s\S]*?):::/g

export function parseInteractiveContent(markdown: string): ParsedContent {
  const segments: ParsedSegment[] = []
  let lastIndex = 0
  BLOCK_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BLOCK_REGEX.exec(markdown)) !== null) {
    const blockType = match[1]!
    const blockContent = match[2]!
    const matchStart = match.index
    if (matchStart > lastIndex) {
      const before = markdown.slice(lastIndex, matchStart)
      if (before) segments.push({ type: 'text', content: before })
    }
    let parsed: InteractiveBlock | null = null
    if (blockType === 'interactive-select') {
      parsed = parseInteractiveSelect(blockContent)
    } else if (blockType === 'interactive-input') {
      parsed = parseInteractiveInput(blockContent)
    } else if (blockType === 'tool-result') {
      parsed = parseToolResult(blockContent)
    }
    if (parsed) segments.push({ type: 'interactive', content: parsed })
    lastIndex = BLOCK_REGEX.lastIndex
  }
  if (lastIndex < markdown.length) {
    const remainder = markdown.slice(lastIndex)
    if (remainder) segments.push({ type: 'text', content: remainder })
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', content: markdown })
  }
  return { segments }
}

function parseInteractiveSelect(content: string): InteractiveSelectData {
  let title: string | undefined
  const options: string[] = []
  let inOptions = false
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('title:')) {
      title = line.slice('title:'.length).trim() || undefined
    } else if (line === 'options:') {
      inOptions = true
    } else if (inOptions && line.startsWith('-')) {
      const opt = line.slice(1).trim()
      if (opt) options.push(opt)
    }
  }
  return { type: 'interactive-select', title, options }
}

function parseInteractiveInput(content: string): InteractiveInputData {
  let title: string | undefined
  let placeholder: string | undefined
  let multiline = false
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('title:')) {
      title = line.slice('title:'.length).trim() || undefined
    } else if (line.startsWith('placeholder:')) {
      placeholder = line.slice('placeholder:'.length).trim() || undefined
    } else if (line.startsWith('multiline:')) {
      const v = line.slice('multiline:'.length).trim().toLowerCase()
      multiline = v === 'true' || v === 'yes'
    }
  }
  return { type: 'interactive-input', title, placeholder, multiline }
}

function parseToolResult(content: string): ToolResultData {
  let toolName = ''
  let status: 'success' | 'error' = 'success'
  let summary: string | undefined
  let details: string | undefined
  let duration: number | undefined
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('toolName:')) {
      toolName = line.slice('toolName:'.length).trim()
    } else if (line.startsWith('status:')) {
      const v = line.slice('status:'.length).trim()
      status = v === 'error' ? 'error' : 'success'
    } else if (line.startsWith('summary:')) {
      summary = line.slice('summary:'.length).trim() || undefined
    } else if (line.startsWith('details:')) {
      details = line.slice('details:'.length).trim() || undefined
    } else if (line.startsWith('duration:')) {
      const n = Number.parseInt(line.slice('duration:'.length).trim(), 10)
      if (Number.isFinite(n)) duration = n
    }
  }
  return { type: 'tool-result', toolName, status, summary, details, duration }
}
