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

const VIEWPORT_GUTTER = 8
const ANCHOR_GAP = 8
const MIN_PALETTE_WIDTH = 280
const MIN_USABLE_PALETTE_HEIGHT = 120
const PREFERRED_PALETTE_HEIGHT = 320

interface PalettePosition {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'above' | 'below' | 'overlay'
  ready: boolean
}

interface ViewportBounds {
  top: number
  left: number
  right: number
  bottom: number
}

function getViewportBounds(): ViewportBounds {
  const viewport = window.visualViewport
  const top = viewport?.offsetTop ?? 0
  const left = viewport?.offsetLeft ?? 0
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
  }
}

function positionsMatch(left: PalettePosition, right: PalettePosition): boolean {
  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.maxHeight === right.maxHeight &&
    left.placement === right.placement &&
    left.ready === right.ready
  )
}

export function FloatingPaletteSurface({
  anchorRef,
  ariaLabel,
  children,
  footer,
  className,
}: {
  anchorRef: RefObject<HTMLElement | null>
  ariaLabel: string
  children: ReactNode
  footer: ReactNode
  className?: string
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PalettePosition>({
    top: VIEWPORT_GUTTER,
    left: VIEWPORT_GUTTER,
    width: 0,
    maxHeight: PREFERRED_PALETTE_HEIGHT,
    placement: 'above',
    ready: false,
  })

  const measure = useCallback(() => {
    const anchor = anchorRef.current
    const surface = surfaceRef.current
    if (!anchor || !surface) return

    const viewport = getViewportBounds()
    const anchorRect = anchor.getBoundingClientRect()
    const availableWidth = Math.max(0, viewport.right - viewport.left - VIEWPORT_GUTTER * 2)
    const width = Math.min(
      Math.max(anchorRect.width, Math.min(MIN_PALETTE_WIDTH, availableWidth)),
      availableWidth,
    )
    const left = Math.min(
      Math.max(anchorRect.left, viewport.left + VIEWPORT_GUTTER),
      viewport.right - VIEWPORT_GUTTER - width,
    )
    const spaceAbove = Math.max(0, anchorRect.top - viewport.top - VIEWPORT_GUTTER - ANCHOR_GAP)
    const spaceBelow = Math.max(
      0,
      viewport.bottom - anchorRect.bottom - VIEWPORT_GUTTER - ANCHOR_GAP,
    )
    const measuredHeight = surface.scrollHeight || surface.getBoundingClientRect().height
    const desiredHeight = Math.min(
      measuredHeight || PREFERRED_PALETTE_HEIGHT,
      PREFERRED_PALETTE_HEIGHT,
    )
    const requiredExternalSpace = Math.min(MIN_USABLE_PALETTE_HEIGHT, desiredHeight)
    const useViewportOverlay = Math.max(spaceAbove, spaceBelow) < requiredExternalSpace
    const placement = useViewportOverlay
      ? 'overlay'
      : spaceAbove >= desiredHeight || spaceAbove >= spaceBelow
        ? 'above'
        : 'below'
    const viewportHeight = Math.max(0, viewport.bottom - viewport.top - VIEWPORT_GUTTER * 2)
    const maxHeight =
      placement === 'overlay' ? viewportHeight : placement === 'above' ? spaceAbove : spaceBelow
    const renderedHeight = Math.min(desiredHeight, maxHeight)
    const top =
      placement === 'above'
        ? Math.max(viewport.top + VIEWPORT_GUTTER, anchorRect.top - ANCHOR_GAP - renderedHeight)
        : placement === 'below'
          ? anchorRect.bottom + ANCHOR_GAP
          : Math.min(
              Math.max(
                viewport.top + VIEWPORT_GUTTER,
                anchorRect.top - ANCHOR_GAP - renderedHeight,
              ),
              viewport.bottom - VIEWPORT_GUTTER - renderedHeight,
            )
    const next: PalettePosition = {
      top,
      left,
      width,
      maxHeight,
      placement,
      ready: true,
    }
    setPosition((current) => (positionsMatch(current, next) ? current : next))
  }, [anchorRef])

  useLayoutEffect(() => {
    measure()
  })

  useEffect(() => {
    measure()
    const viewport = window.visualViewport
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    if (surfaceRef.current) observer?.observe(surfaceRef.current)
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
  }, [anchorRef, measure])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={surfaceRef}
      role="listbox"
      aria-label={ariaLabel}
      data-placement={position.placement}
      className={cn(
        'fixed z-[70] flex min-w-0 flex-col overflow-hidden rounded-xl border bg-popover shadow-lg',
        className,
      )}
      style={{
        top: position.top,
        left: position.left,
        width: position.width || 'calc(100vw - 1rem)',
        maxHeight: position.maxHeight,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
    >
      {children}
      <div
        data-testid="floating-palette-footer"
        className="shrink-0 whitespace-nowrap border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground"
      >
        {footer}
      </div>
    </div>,
    document.body,
  )
}
