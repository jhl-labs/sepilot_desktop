'use client'
import { useState } from 'react'
import { useSessionStore } from '@/lib/store/session-store'
import { useTransport } from '@/components/providers/transport-provider'
import { sendJson, makeHttp } from '@/lib/api/_http'
import { Button } from '@/components/ui/button'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

export function CompressConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const transport = useTransport()
  const activeId = useSessionStore((s) => s.activeId)
  const [running, setRunning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function run(): Promise<void> {
    if (!activeId) return
    setRunning(true)
    setMsg(null)
    try {
      const http = await makeHttp(transport)
      await sendJson<void>(
        http,
        'POST',
        `/sessions/${encodeURIComponent(activeId)}/compress`,
        {},
        'sessions',
      )
      setMsg('압축 완료')
    } catch (e) {
      setMsg(`오류: ${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  useEscapeToClose(open, () => onOpenChange(false))
  useModalViewportLock(open)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="대화 압축"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">대화 압축</h2>
        </header>
        <div
          role="region"
          aria-label="대화 압축 안내"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 text-sm [scrollbar-gutter:stable]"
        >
          <p className="text-muted-foreground">
            현재 대화의 컨텍스트를 daemon에 압축 요청합니다.
          </p>
          {msg && <p className="mt-2 text-xs">{msg}</p>}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            size="sm"
            disabled={!activeId || running}
            onClick={() => void run()}
          >
            {running ? '진행 중…' : '압축'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
