'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'

const FLOATING_SURFACE_GAP = 4
const FLOATING_SURFACE_GUTTER = 8

export type FloatingAppSurfaceAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'element'; element: HTMLElement; align: 'start' | 'end' }

interface FloatingAppSurfacePosition {
  top: number
  left: number
  maxHeight: number
  placement: 'above' | 'below'
  ready: boolean
}

function positionsMatch(
  left: FloatingAppSurfacePosition | null,
  right: FloatingAppSurfacePosition,
): boolean {
  if (!left) return false
  return (
    left.top === right.top &&
    left.left === right.left &&
    left.maxHeight === right.maxHeight &&
    left.placement === right.placement &&
    left.ready === right.ready
  )
}

export function FloatingAppSurface({
  anchor,
  ariaLabel,
  children,
  className,
  isMenu = true,
  surfaceRef,
  testId,
}: {
  anchor: FloatingAppSurfaceAnchor
  ariaLabel?: string
  children: ReactNode
  className?: string
  isMenu?: boolean
  surfaceRef?: RefObject<HTMLDivElement | null>
  testId?: string
}) {
  const internalSurfaceRef = useRef<HTMLDivElement | null>(null)
  const resolvedSurfaceRef = surfaceRef ?? internalSurfaceRef
  const [position, setPosition] = useState<FloatingAppSurfacePosition | null>(null)
  const positionRef = useRef<FloatingAppSurfacePosition | null>(null)

  const measure = useCallback(() => {
    const surface = resolvedSurfaceRef.current
    if (!surface) return

    const viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    const viewportRight = viewportLeft + viewportWidth
    const viewportBottom = viewportTop + viewportHeight
    const anchorRect =
      anchor.kind === 'element'
        ? anchor.element.getBoundingClientRect()
        : {
            top: anchor.y,
            right: anchor.x,
            bottom: anchor.y,
            left: anchor.x,
          }
    const surfaceRect = surface.getBoundingClientRect()
    const viewportSurfaceHeight = Math.max(0, viewportHeight - FLOATING_SURFACE_GUTTER * 2)
    const naturalSurfaceHeight = Math.min(
      Math.max(surface.scrollHeight, surfaceRect.height),
      viewportSurfaceHeight,
    )
    const availableBelow = Math.max(
      0,
      viewportBottom - FLOATING_SURFACE_GUTTER - anchorRect.bottom - FLOATING_SURFACE_GAP,
    )
    const availableAbove = Math.max(
      0,
      anchorRect.top - FLOATING_SURFACE_GAP - viewportTop - FLOATING_SURFACE_GUTTER,
    )
    const placeBelow =
      naturalSurfaceHeight <= availableBelow ||
      (naturalSurfaceHeight > availableAbove && availableBelow >= availableAbove)
    const maxHeight = Math.min(naturalSurfaceHeight, placeBelow ? availableBelow : availableAbove)
    const minTop = viewportTop + FLOATING_SURFACE_GUTTER
    const maxTop = Math.max(minTop, viewportBottom - FLOATING_SURFACE_GUTTER - maxHeight)
    const preferredTop = placeBelow
      ? anchorRect.bottom + FLOATING_SURFACE_GAP
      : anchorRect.top - FLOATING_SURFACE_GAP - maxHeight
    const top = Math.min(Math.max(minTop, preferredTop), maxTop)
    const surfaceWidth = Math.min(
      surfaceRect.width,
      Math.max(0, viewportWidth - FLOATING_SURFACE_GUTTER * 2),
    )
    const preferredLeft =
      anchor.kind === 'element' && anchor.align === 'end'
        ? anchorRect.right - surfaceWidth
        : anchorRect.left
    const minLeft = viewportLeft + FLOATING_SURFACE_GUTTER
    const maxLeft = Math.max(minLeft, viewportRight - FLOATING_SURFACE_GUTTER - surfaceWidth)
    const left = Math.min(Math.max(minLeft, preferredLeft), maxLeft)
    const next: FloatingAppSurfacePosition = {
      top,
      left,
      maxHeight,
      placement: placeBelow ? 'below' : 'above',
      ready: true,
    }
    if (positionsMatch(positionRef.current, next)) return
    positionRef.current = next
    setPosition(next)
  }, [anchor, resolvedSurfaceRef])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    measure()
    const viewport = window.visualViewport
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (anchor.kind === 'element') observer?.observe(anchor.element)
    if (resolvedSurfaceRef.current) observer?.observe(resolvedSurfaceRef.current)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
    }
  }, [measure])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={resolvedSurfaceRef}
      role={isMenu ? 'menu' : undefined}
      aria-label={ariaLabel}
      data-placement={position?.placement}
      data-testid={testId}
      className={cn(
        'fixed z-[70] max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
        className,
      )}
      style={{
        top: position?.top ?? FLOATING_SURFACE_GUTTER,
        left: position?.left ?? FLOATING_SURFACE_GUTTER,
        maxHeight: position?.maxHeight,
        visibility: position?.ready ? 'visible' : 'hidden',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
