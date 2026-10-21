import React, { useCallback, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <button className="code-copy-btn" onClick={handleCopy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function PreSlot({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const codeText = ref.current?.textContent ?? extractText(children)

  return (
    <div className="code-block-wrapper">
      <CopyButton text={codeText} />
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </div>
  )
}

const components: Components = {
  pre: PreSlot,
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    )
  },
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node) && node.props) {
    return extractText((node.props as { children?: React.ReactNode }).children ?? '')
  }
  return ''
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
