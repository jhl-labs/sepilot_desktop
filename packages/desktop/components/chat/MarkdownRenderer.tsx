'use client'
import { UploadedMarkdownImage, uploadedMarkdownImageId } from './UploadedMarkdownImage'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import { PreviewLink } from './PreviewLink'
import { previewTarget } from '@/lib/store/preview-store'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils/cn'
import { MermaidBlock } from './MermaidBlock'
import { PlotlyBlock, looksLikePlotly } from './PlotlyBlock'

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'video',
    'audio',
    'source',
    'picture',
    'details',
    'summary',
    'kbd',
    'mark',
    'sub',
    'sup',
    'del',
    'ins',
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    video: [
      'src',
      'poster',
      'controls',
      'preload',
      'loop',
      'muted',
      'playsinline',
      'width',
      'height',
    ],
    audio: ['src', 'controls', 'preload', 'loop', 'muted'],
    source: ['src', 'srcset', 'type', 'media', 'sizes'],
    img: [
      ...((defaultSchema.attributes?.img as Array<string | [string, ...unknown[]]>) ?? []),
      'loading',
      'decoding',
      'referrerpolicy',
    ],
    a: [
      ...((defaultSchema.attributes?.a as Array<string | [string, ...unknown[]]>) ?? []),
      'target',
      'rel',
    ],
    details: ['open'],
  },
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    src: ['http', 'https', 'data', 'blob'],
    href: ['http', 'https', 'mailto', 'file'],
    poster: ['http', 'https', 'data', 'blob'],
  },
}

interface Props {
  content: string
  baseDirectory?: string
  inline?: boolean
  streaming?: boolean
}

export function MarkdownRenderer({
  content,
  inline = false,
  streaming = false,
  baseDirectory,
}: Props) {
  return (
    <div
      className={cn(
        'chat-md [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        inline && 'chat-md-inline',
      )}
    >
      <ReactMarkdown
        urlTransform={(url, key) => key === 'href' && previewTarget(url)?.kind === 'file' ? url : defaultUrlTransform(url)}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA],
          rehypeKatex,
        ]}
        components={{
          h1: (props) => (
            <h1 className="mb-1.5 mt-2.5 text-base font-semibold" {...props} />
          ),
          h2: (props) => (
            <h2 className="mb-1.5 mt-2.5 text-sm font-semibold" {...props} />
          ),
          h3: (props) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold" {...props} />
          ),
          p: (props) => <p className="mb-1.5 leading-[1.55]" {...props} />,
          ul: (props) => (
            <ul className="mb-1.5 ml-4 list-disc space-y-0.5" {...props} />
          ),
          ol: (props) => (
            <ol className="mb-1.5 ml-4 list-decimal space-y-0.5" {...props} />
          ),
          li: (props) => <li className="leading-[1.55]" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="my-1.5 border-l-2 border-muted-foreground/40 pl-2.5 text-muted-foreground"
              {...props}
            />
          ),
          hr: (props) => (
            <hr className="my-2 border-muted-foreground/20" {...props} />
          ),
          a: ({ href, children }) => <PreviewLink href={href} baseDirectory={baseDirectory}>{children}</PreviewLink>,
          table: (props) => (
            <div className="my-1.5 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b border-border bg-muted/50 px-2 py-1 text-left font-semibold"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border-b border-border/40 px-2 py-0.5" {...props} />
          ),
          code: ({ className, children, ...rest }) => {
            const match = /language-(\w+)/.exec(className ?? '')
            const language = match?.[1]?.toLowerCase()
            const text = String(children ?? '').replace(/\n$/, '')
            const isInlineCode =
              !className && !text.includes('\n') && text.length < 80
            if (isInlineCode) {
              if (!streaming && /^(?:\.{0,2}\/|\/|[a-z]:[\\/])[^\n]+\.[a-z\d]{1,12}(?::\d+(?::\d+)?)?$/i.test(text)) {
                return <PreviewLink href={text} baseDirectory={baseDirectory}><code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code></PreviewLink>
              }
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                  {...rest}
                >
                  {children}
                </code>
              )
            }
            if (language === 'mermaid') {
              return <MermaidBlock code={text} streaming={streaming} />
            }
            if (language === 'plotly') {
              return <PlotlyBlock source={text} streaming={streaming} />
            }
            if (language === 'json' && !streaming && looksLikePlotly(text)) {
              return <PlotlyBlock source={text} streaming={streaming} />
            }
            return <CodeBlock language={match?.[1]} text={text} />
          },
          pre: ({ children }) => <>{children}</>,
          img: ({ src, alt, ...rest }) =>
            typeof src === 'string' && uploadedMarkdownImageId(src) ? (
              <UploadedMarkdownImage fileId={uploadedMarkdownImageId(src)!} alt={alt ?? ''} />
            ) : typeof src === 'string' ? (
              <img
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="my-1.5 h-auto max-h-[480px] max-w-full rounded-md border border-border"
                {...rest}
              />
            ) : null,
          video: ({ src, poster, children, ...rest }) => (
            <video
              src={typeof src === 'string' ? src : undefined}
              poster={typeof poster === 'string' ? poster : undefined}
              controls
              preload="metadata"
              className="my-1.5 max-h-[480px] w-full rounded-md border border-border bg-black"
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
              className="my-1.5 w-full"
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

function CodeBlock({ language, text }: { language?: string; text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
    }
  }
  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border bg-muted/40">
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
      <pre className="overflow-x-auto px-2.5 py-1.5 text-[11px] leading-5">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  )
}
