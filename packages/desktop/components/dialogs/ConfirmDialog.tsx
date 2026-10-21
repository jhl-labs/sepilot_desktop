'use client'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useConfirmStore } from '@/lib/store/confirm-store'
import { resolveConfirm } from '@/lib/utils/confirm'
import { useModalFocusLayer } from '@/lib/hooks/use-modal-focus-layer'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

export function ConfirmDialog() {
  const head = useConfirmStore((s) => s.queue[0])
  const panelRef = useRef<HTMLDivElement>(null)
  const isTopModalLayer = useModalFocusLayer(Boolean(head))

  useModalViewportLock(Boolean(head))

  useEffect(() => {
    if (!head) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      if (!isTopModalLayer()) return
      const firstControl = panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')
      ;(firstControl ?? panelRef.current)?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.requestAnimationFrame(() => opener?.focus())
    }
  }, [head, isTopModalLayer])

  useEffect(() => {
    if (!head) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModalLayer()) return
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault()
        resolveConfirm(head.id, false)
        return
      }
      if (event.key !== 'Tab') return

      const controls = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((node) => node.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [head, isTopModalLayer])

  if (!head) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={head.title ?? '확인'}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={() => resolveConfirm(head.id, false)}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">{head.title ?? '확인'}</h2>
        </header>
        <div
          role="region"
          aria-label="확인 내용"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4"
        >
          <p className="whitespace-pre-line text-sm text-muted-foreground">{head.message}</p>
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => resolveConfirm(head.id, false)}>
            {head.cancelLabel ?? '취소'}
          </Button>
          <Button
            variant={head.destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={() => resolveConfirm(head.id, true)}
          >
            {head.confirmLabel ?? '확인'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
