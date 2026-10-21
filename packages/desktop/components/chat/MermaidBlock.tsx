'use client'
import { useEffect, useRef, useState } from 'react'

let mermaidIdCounter = 0

interface MermaidBlockProps {
  code: string
  streaming?: boolean
}

export function MermaidBlock({ code, streaming }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (streaming) {
      setError(null)
      setSvg(null)
      return
    }
    let cancelled = false
    const id = `mermaid-${++mermaidIdCounter}`

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const isDark =
          typeof document !== 'undefined'
          && document.documentElement.classList.contains('dark')
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          fontFamily: 'inherit',
          securityLevel: 'strict',
        })
        const { svg: rendered } = await mermaid.render(id, code.trim())
        if (cancelled) return
        setSvg(rendered)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'mermaid render failed')
        setSvg(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, streaming])

  if (streaming) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
        <code>{code}</code>
      </pre>
    )
  }

  if (error) {
    return (
      <div className="my-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
          Mermaid 렌더링 실패
        </div>
        <div className="mb-2 text-[11px] text-amber-700/80 dark:text-amber-300/80">
          {error}
        </div>
        <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-2 rounded-md border border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
        Mermaid 다이어그램 렌더링 중…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-2 flex justify-center overflow-x-auto rounded-md border border-border bg-background p-3 [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
