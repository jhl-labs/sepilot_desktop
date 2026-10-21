'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils/cn'
import { MermaidBlock } from '@/components/chat/MermaidBlock'
import { PlotlyBlock, looksLikePlotly } from '@/components/chat/PlotlyBlock'

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'video',
    'audio',
    'source',
    'picture',
    'span',
  ],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']],
    pre: [...(defaultSchema.attributes?.pre ?? []), ['className']],
  },
}

interface Props {
  content: string
}

export function WritingPreview({ content }: Props) {
  return (
    <div className={cn('markdown-body writing-preview-body px-6 py-4')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, SANITIZE_SCHEMA],
          [rehypeHighlight, { ignoreMissing: true, detect: true }],
          rehypeKatex,
        ]}
        components={{
          code: ({ className, children, ...rest }) => {
            const match = /language-(\w+)/.exec(className ?? '')
            const language = match?.[1]?.toLowerCase()
            const text = String(children ?? '').replace(/\n$/, '')
            const isInlineCode =
              !className && !text.includes('\n') && text.length < 80
            if (isInlineCode) {
              return (
                <code className="px-1 py-0.5 rounded font-mono text-[0.9em]" {...rest}>
                  {children}
                </code>
              )
            }
            if (language === 'mermaid') {
              return <MermaidBlock code={text} streaming={false} />
            }
            if (language === 'plotly') {
              return <PlotlyBlock source={text} streaming={false} />
            }
            if (language === 'json' && looksLikePlotly(text)) {
              return <PlotlyBlock source={text} streaming={false} />
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            )
          },
          pre: ({ children, ...rest }) => {
            const child = Array.isArray(children) ? children[0] : children
            const language =
              typeof child === 'object' && child && 'props' in child
                ? extractLanguage((child as { props: { className?: string } }).props.className)
                : undefined
            return (
              <CodeBlock language={language}>
                <pre {...rest}>{children}</pre>
              </CodeBlock>
            )
          },
          img: ({ src, alt, ...rest }) =>
            typeof src === 'string' ? (
              <img
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                {...rest}
              />
            ) : null,
          video: ({ src, poster, children, ...rest }) => (
            <video
              src={typeof src === 'string' ? src : undefined}
              poster={typeof poster === 'string' ? poster : undefined}
              controls
              preload="metadata"
              {...rest}
            >
              {children}
            </video>
          ),
          audio: ({ src, ...rest }) => (
            <audio
              src={typeof src === 'string' ? src : undefined}
              controls
              preload="metadata"
              {...rest}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function extractLanguage(className: string | undefined): string | undefined {
  if (!className) return undefined
  const m = /language-(\w+)/.exec(className)
  return m?.[1]
}

function CodeBlock({
  language,
  children,
}: {
  language?: string
  children: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  async function copy(): Promise<void> {
    try {
      const root = document.activeElement?.closest('.writing-codeblock-wrap')
      const text = root?.querySelector('pre')?.textContent ?? ''
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
    }
  }
  return (
    <div className="writing-codeblock-wrap my-3 overflow-hidden rounded-md border border-border bg-[#f6f8fa] dark:bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border bg-background/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{language ?? 'text'}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted"
          aria-label="copy code"
          title={copied ? '복사됨' : '복사'}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>{copied ? '복사됨' : '복사'}</span>
        </button>
      </div>
      {children}
    </div>
  )
}
