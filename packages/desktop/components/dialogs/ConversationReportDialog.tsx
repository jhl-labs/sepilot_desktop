'use client'
import { useMemo } from 'react'
import { useSessionStore } from '@/lib/store/session-store'
import { useChatStore } from '@/lib/store/chat-store'
import { Button } from '@/components/ui/button'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

export function ConversationReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const session = useSessionStore(
    (s) => s.sessions.find((x) => x.id === s.activeId) ?? null,
  )
  const messages = useChatStore((s) => s.messages)
  const text = useMemo(
    () =>
      `# ${session?.title ?? '대화'}\n\n` +
      messages.map((m) => `## ${m.role}\n\n${m.content}`).join('\n\n'),
    [session, messages],
  )

  async function copy(): Promise<void> {
    if (typeof navigator !== 'undefined') await navigator.clipboard.writeText(text)
  }

  useEscapeToClose(open, () => onOpenChange(false))
  useModalViewportLock(open)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="대화 리포트"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">대화 리포트</h2>
        </header>
        <div
          role="region"
          aria-label="대화 리포트 내용"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4"
        >
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
            {text}
          </pre>
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button size="sm" onClick={() => void copy()}>
            클립보드 복사
          </Button>
        </footer>
      </div>
    </div>
  )
}
