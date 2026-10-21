import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, Dispatch, DragEvent, KeyboardEvent, SetStateAction } from 'react'

interface UseChatComposerParams {
  sessionId?: string
  initialPrompt?: string
  input: string
  setInput: Dispatch<SetStateAction<string>>
  onSend: () => void | Promise<void>
  onClearTranscript: () => void
}

function getComposerInsertText(event: Event): string | null {
  const detail = (event as CustomEvent<{ text?: unknown }>).detail
  return typeof detail?.text === 'string' && detail.text.trim()
    ? detail.text
    : null
}

function isTextLikeFile(file: File): boolean {
  return file.type.startsWith('text/')
    || /\.(txt|md|ts|js|py|json|yaml|yml|sh|css|html|xml|csv|log)$/i.test(file.name)
}

async function describeDroppedFile(file: File): Promise<string> {
  if (isTextLikeFile(file)) {
    const content = await file.text()
    return `[File: ${file.name}]\n\`\`\`\n${content}\n\`\`\``
  }

  if (file.type.startsWith('image/')) {
    return `![${file.name || 'Dropped image'}](${URL.createObjectURL(file)})`
  }

  return `[File: ${file.name} (binary, ${(file.size / 1024).toFixed(1)} KB)]`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image data.'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image data.'))
    reader.readAsDataURL(file)
  })
}

function clipboardImageFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const items = Array.from(event.clipboardData?.items ?? [])
  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}

export function useChatComposer({
  sessionId,
  initialPrompt,
  input,
  setInput,
  onSend,
  onClearTranscript,
}: UseChatComposerParams) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      setInput(initialPrompt ?? '')
    }
  }, [initialPrompt, sessionId, setInput])

  useEffect(() => {
    const element = inputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [input])

  useEffect(() => {
    const handleInsertComposerText = (event: Event) => {
      const text = getComposerInsertText(event)
      if (!text) return
      setInput((prev) => (prev ? `${prev}\n\n${text}` : text))
      inputRef.current?.focus()
    }

    window.addEventListener('sepilot:insert-composer-text', handleInsertComposerText)
    return () => {
      window.removeEventListener('sepilot:insert-composer-text', handleInsertComposerText)
    }
  }, [setInput])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void onSend()
    }

    if (event.key === 'l' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onClearTranscript()
    }
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = clipboardImageFiles(event)
    if (images.length === 0) return

    event.preventDefault()
    const imageMarkdown = await Promise.all(
      images.map(async (file, index) => {
        const dataUrl = await readFileAsDataUrl(file)
        const label = file.name || `Pasted image ${index + 1}`
        return `![${label}](${dataUrl})`
      }),
    ).catch(() => [])
    if (imageMarkdown.length === 0) return

    setInput((prev) => (prev ? `${prev}\n\n` : '') + imageMarkdown.join('\n\n'))
    inputRef.current?.focus()
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)

    const files = Array.from(event.dataTransfer.files)
    const text = event.dataTransfer.getData('text/plain')

    if (files.length > 0) {
      const fileContents = await Promise.all(files.map(describeDroppedFile))
      setInput((prev) => (prev ? `${prev}\n\n` : '') + fileContents.join('\n\n'))
    } else if (text) {
      setInput((prev) => (prev ? `${prev}\n` : '') + text)
    }

    inputRef.current?.focus()
  }

  return {
    inputRef,
    isDragOver,
    handleKeyDown,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
