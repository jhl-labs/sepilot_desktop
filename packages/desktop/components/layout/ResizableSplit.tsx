'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

const KEYBOARD_STEP = 0.05
const KEYBOARD_LARGE_STEP = 0.1

interface ResizableSplitProps {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftFraction?: number
  minFraction?: number
  storageKey: string
  minBreakpointPx?: number
  className?: string
}

export function ResizableSplit({
  left,
  right,
  defaultLeftFraction = 0.5,
  minFraction = 0.2,
  storageKey,
  minBreakpointPx = 1100,
  className,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [leftFraction, setLeftFraction] = useState<number>(defaultLeftFraction)
  const [dragging, setDragging] = useState(false)

  const clampFraction = useCallback(
    (fraction: number) => Math.max(minFraction, Math.min(1 - minFraction, fraction)),
    [minFraction],
  )

  const persistFraction = useCallback(
    (fraction: number) => {
      try {
        window.localStorage.setItem(storageKey, String(fraction))
      } catch {
      }
    },
    [storageKey],
  )

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0 && n < 1) setLeftFraction(clampFraction(n))
      }
    } catch {
    }
  }, [clampFraction, storageKey])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])

  const commitFraction = useCallback(
    (clientX: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const raw = (clientX - rect.left) / rect.width
      setLeftFraction(clampFraction(raw))
    },
    [clampFraction],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      commitFraction(e.clientX)
    },
    [dragging, commitFraction],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      setDragging(false)
      persistFraction(leftFraction)
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    },
    [dragging, leftFraction, persistFraction],
  )

  const resetFraction = useCallback(() => {
    setLeftFraction(clampFraction(defaultLeftFraction))
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
    }
  }, [clampFraction, defaultLeftFraction, storageKey])

  const onDoubleClick = useCallback(() => {
    resetFraction()
  }, [resetFraction])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP
      let next: number | null = null
      if (event.key === 'ArrowLeft') next = leftFraction - step
      else if (event.key === 'ArrowRight') next = leftFraction + step
      else if (event.key === 'Home') next = minFraction
      else if (event.key === 'End') next = 1 - minFraction
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        resetFraction()
        return
      }
      if (next === null) return
      event.preventDefault()
      const clamped = clampFraction(next)
      setLeftFraction(clamped)
      persistFraction(clamped)
    },
    [clampFraction, leftFraction, minFraction, persistFraction, resetFraction],
  )

  const stacked = containerWidth > 0 && containerWidth < minBreakpointPx
  const leftPercent = Math.round(leftFraction * 100)
  const minPercent = Math.round(minFraction * 100)
  const maxPercent = Math.round((1 - minFraction) * 100)

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-full min-h-0 w-full',
        stacked ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-col',
          stacked ? 'h-1/2 border-b border-border' : 'h-full border-r border-border',
        )}
        style={stacked ? undefined : { width: `${leftFraction * 100}%` }}
      >
        {left}
      </div>
      {!stacked ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="패널 너비 조절"
          aria-valuemin={minPercent}
          aria-valuemax={maxPercent}
          aria-valuenow={leftPercent}
          aria-valuetext={`왼쪽 패널 ${leftPercent}%`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onKeyDown={onKeyDown}
          title="드래그 또는 화살표 키로 너비 조절 · Enter/더블클릭으로 초기화"
          className={cn(
            'group relative z-10 flex h-full w-1.5 shrink-0 cursor-col-resize select-none items-center justify-center outline-none',
            'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
            'hover:before:bg-primary/60',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            dragging && 'before:bg-primary',
            'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2',
          )}
        >
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full bg-border transition-colors',
              'group-hover:bg-primary/70',
              dragging && 'bg-primary',
            )}
          />
        </div>
      ) : null}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={stacked ? undefined : { width: `${(1 - leftFraction) * 100}%` }}
      >
        {right}
      </div>
    </div>
  )
}
