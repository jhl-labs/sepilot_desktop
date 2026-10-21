'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

const VIEWPORT_GUTTER = 8
const TRIGGER_GAP = 4

interface MenuPosition {
  top: number
  left: number
  maxHeight: number
  ready: boolean
}

export interface ViewportActionMenuItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
  onSelect: () => void
}

export interface ViewportActionMenuProps {
  ariaLabel: string
  trigger: React.ReactNode
  items: readonly ViewportActionMenuItem[]
  disabled?: boolean
  align?: 'start' | 'end'
  triggerAriaLabel?: string
  triggerTitle?: string
  triggerClassName?: string
  triggerVariant?: ButtonProps['variant']
  triggerSize?: ButtonProps['size']
  menuClassName?: string
}

function enabledMenuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return []
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  )
}

function focusWithoutScrolling(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true })
}

export function ViewportActionMenu({
  ariaLabel,
  trigger,
  items,
  disabled = false,
  align = 'end',
  triggerAriaLabel = ariaLabel,
  triggerTitle,
  triggerClassName,
  triggerVariant = 'ghost',
  triggerSize = 'sm',
  menuClassName,
}: ViewportActionMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState<MenuPosition | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const initialFocusRef = React.useRef<'first' | 'last'>('first')
  const menuId = React.useId()

  const closeMenu = React.useCallback((restoreFocus = true) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) focusWithoutScrolling(triggerRef.current)
  }, [])

  const openMenu = React.useCallback((initialFocus: 'first' | 'last' = 'first') => {
    initialFocusRef.current = initialFocus
    setOpen(true)
  }, [])

  React.useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeMenu()
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [closeMenu, open])

  React.useLayoutEffect(() => {
    if (!open) return

    function updatePosition() {
      const triggerElement = triggerRef.current
      const menuElement = menuRef.current
      if (!triggerElement || !menuElement) return

      const triggerRect = triggerElement.getBoundingClientRect()
      const menuRect = menuElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const viewportMenuHeight = Math.max(0, viewportHeight - VIEWPORT_GUTTER * 2)
      const naturalHeight = Math.min(
        Math.max(menuElement.scrollHeight, menuRect.height),
        viewportMenuHeight,
      )
      const availableBelow = Math.max(
        0,
        viewportHeight - VIEWPORT_GUTTER - triggerRect.bottom - TRIGGER_GAP,
      )
      const availableAbove = Math.max(
        0,
        triggerRect.top - TRIGGER_GAP - VIEWPORT_GUTTER,
      )
      const placeBelow =
        naturalHeight <= availableBelow
        || (naturalHeight > availableAbove && availableBelow >= availableAbove)
      const availableHeight = placeBelow ? availableBelow : availableAbove
      const maxHeight = Math.min(naturalHeight, availableHeight)
      const top = placeBelow
        ? Math.min(
            triggerRect.bottom + TRIGGER_GAP,
            Math.max(VIEWPORT_GUTTER, viewportHeight - VIEWPORT_GUTTER - maxHeight),
          )
        : Math.max(VIEWPORT_GUTTER, triggerRect.top - TRIGGER_GAP - maxHeight)

      const desiredLeft = align === 'start'
        ? triggerRect.left
        : triggerRect.right - menuRect.width
      const maxLeft = Math.max(
        VIEWPORT_GUTTER,
        viewportWidth - VIEWPORT_GUTTER - menuRect.width,
      )
      const left = Math.min(Math.max(VIEWPORT_GUTTER, desiredLeft), maxLeft)

      setPosition({ top, left, maxHeight, ready: true })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, items.length, open])

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const enabledItems = enabledMenuItems(menuRef.current)
      const target = initialFocusRef.current === 'last'
        ? enabledItems.at(-1) ?? null
        : enabledItems[0] ?? null
      focusWithoutScrolling(target ?? menuRef.current)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (!open) openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const enabledItems = enabledMenuItems(menuRef.current)
    if (enabledItems.length === 0) return
    const currentIndex = enabledItems.findIndex((item) => item === document.activeElement)
    let nextIndex: number | null = null

    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % enabledItems.length
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0
        ? enabledItems.length - 1
        : (currentIndex - 1 + enabledItems.length) % enabledItems.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = enabledItems.length - 1
    } else if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target
      if (target instanceof HTMLButtonElement && target.getAttribute('role') === 'menuitem') {
        event.preventDefault()
        target.click()
      }
      return
    } else {
      return
    }

    event.preventDefault()
    focusWithoutScrolling(enabledItems[nextIndex])
  }

  return (
    <span className="inline-flex">
      <Button
        ref={triggerRef}
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={cn('motion-reduce:transition-none', triggerClassName)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={triggerTitle}
        onClick={() => {
          if (open) closeMenu()
          else openMenu('first')
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {trigger}
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              tabIndex={-1}
              onKeyDown={handleMenuKeyDown}
              className={cn(
                'fixed z-[80] w-max min-w-56 max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none [scrollbar-gutter:stable]',
                menuClassName,
              )}
              style={{
                top: position?.top ?? VIEWPORT_GUTTER,
                left: position?.left ?? VIEWPORT_GUTTER,
                maxHeight: position?.maxHeight,
                visibility: position?.ready ? 'visible' : 'hidden',
              }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none"
                  onClick={() => {
                    closeMenu()
                    item.onSelect()
                  }}
                >
                  {item.icon ? (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 whitespace-nowrap">
                    <span className="block text-xs font-medium">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block whitespace-nowrap text-[10px] leading-4 text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
