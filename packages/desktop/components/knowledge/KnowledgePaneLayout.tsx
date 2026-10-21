'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'sepilot.wiki.pane-widths.v1'
const DEFAULT_WIDTHS = { left: 240, right: 300 }
type Side = keyof typeof DEFAULT_WIDTHS

export function KnowledgePaneLayout({
  left,
  right,
  children,
  leftOpen,
  rightOpen,
  onCompact,
}: {
  left: ReactNode
  right: ReactNode
  children: ReactNode
  leftOpen: boolean
  rightOpen: boolean
  onCompact?: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const drag = useRef<{ side: Side; x: number; width: number } | null>(null)
  const [width, setWidth] = useState(1200)
  const [sizes, setSizes] = useState(DEFAULT_WIDTHS)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (stored && Number.isFinite(stored.left) && Number.isFinite(stored.right)) {
        setSizes({
          left: Math.max(160, Math.min(600, stored.left)),
          right: Math.max(160, Math.min(600, stored.right)),
        })
      }
    } catch {
    }
    const element = root.current
    if (!element) return
    let wasCompact = false
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= 0) return
      const nextWidth = entry.contentRect.width
      const nowCompact = nextWidth < 760
      if (nowCompact && !wasCompact) onCompact?.()
      wasCompact = nowCompact
      setWidth(nextWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onCompact])
  const compact = width < 760
  const available = Math.max(0, width - 332)
  const requested = (leftOpen ? sizes.left : 0) + (rightOpen ? sizes.right : 0)
  const actual = { ...sizes }
  if (requested > available && !compact) {
    if (leftOpen && rightOpen) {
      const extra = available - 320
      actual.left = Math.floor(160 + (extra * (sizes.left - 160)) / Math.max(1, requested - 320))
      actual.right = available - actual.left
    } else if (leftOpen) actual.left = available
    else if (rightOpen) actual.right = available
  }
  function resize(side: Side, next: number) {
    const other = side === 'left' ? (rightOpen ? actual.right : 0) : leftOpen ? actual.left : 0
    const value = Math.max(160, Math.min(600, width - other - 332, next))
    setSizes((previous) => {
      const result = { ...previous, [side]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
      } catch {
      }
      return result
    })
  }
  function separator(side: Side, visible: boolean) {
    return (
      <div
        hidden={!visible || compact}
        role="separator"
        aria-label={side === 'left' ? '왼쪽 관리 패널 너비 조절' : '오른쪽 Wiki 트리 너비 조절'}
        aria-orientation="vertical"
        aria-valuemin={160}
        aria-valuemax={Math.max(
          160,
          Math.min(
            600,
            width -
              (side === 'left' ? (rightOpen ? actual.right : 0) : leftOpen ? actual.left : 0) -
              332,
          ),
        )}
        aria-valuenow={actual[side]}
        tabIndex={0}
        className="w-1.5 cursor-col-resize touch-none select-none bg-border/50 hover:bg-primary/60 focus-visible:bg-primary focus-visible:outline-none"
        title="드래그 또는 방향키로 너비 조절 · 더블클릭으로 초기화"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          drag.current = { side, x: event.clientX, width: actual[side] }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start?.side === side)
            resize(side, start.width + (event.clientX - start.x) * (side === 'left' ? 1 : -1))
        }}
        onPointerUp={(event) => {
          drag.current = null
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onLostPointerCapture={() => {
          drag.current = null
        }}
        onDoubleClick={() => resize(side, DEFAULT_WIDTHS[side])}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            resize(
              side,
              actual[side] +
                (event.key === 'ArrowRight' ? 1 : -1) *
                  (side === 'left' ? 1 : -1) *
                  (event.shiftKey ? 40 : 16),
            )
          } else if (event.key === 'Enter' || event.key === 'Home') {
            event.preventDefault()
            resize(side, DEFAULT_WIDTHS[side])
          }
        }}
      />
    )
  }
  return (
    <div
      ref={root}
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
      aria-label="Wiki 패널 배치"
    >
      <div
        hidden={!leftOpen}
        aria-label="왼쪽 지식 관리"
        className={`${compact ? 'absolute inset-y-0 left-0 z-20 shadow-xl' : 'shrink-0'} overflow-y-auto overscroll-contain border-r bg-background`}
        style={{ width: compact ? Math.min(320, width * 0.85) : actual.left }}
      >
        {left}
      </div>
      {separator('left', leftOpen)}
      <div
        aria-label="Wiki 본문"
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
      {separator('right', rightOpen)}
      <div
        hidden={!rightOpen}
        aria-label="오른쪽 Wiki 트리"
        className={`${compact ? 'absolute inset-y-0 right-0 z-20 shadow-xl' : 'shrink-0'} overflow-y-auto overscroll-contain border-l bg-background`}
        style={{ width: compact ? Math.min(320, width * 0.85) : actual.right }}
      >
        {right}
      </div>
    </div>
  )
}
