'use client'
import { useState, type KeyboardEvent } from 'react'
import { publishQuickInput } from '@/lib/electron/bridge'
import { createTransport } from '@/lib/transport/transport-adapter'
import { createQuickInputApi } from '@/lib/api/quick-input'

export default function QuickInputPage() {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publish(): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const published = await publishQuickInput(trimmed)
      if (!published) {
        const transport = await createTransport()
        const api = await createQuickInputApi(transport)
        await api.publish(trimmed)
      }
      setText('')
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '알 수 없는 오류'
      setError(`메시지를 전송하지 못했습니다. ${detail}`)
    } finally {
      setSending(false)
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void publish()
    }
    if (e.key === 'Escape' && typeof window !== 'undefined') {
      window.close()
    }
  }

  return (
    <main className="flex h-screen flex-col gap-2 bg-background p-3">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={sending}
        aria-describedby={error ? 'quick-input-error' : undefined}
        placeholder={sending ? '전송 중…' : '메인 창으로 전송할 메시지 (Enter 전송, Esc 닫기)'}
        className="flex-1 resize-none rounded-md border border-border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div aria-live="polite" className="min-h-4 px-1 text-xs">
        {error ? (
          <p id="quick-input-error" className="text-red-500">
            {error} 입력 내용은 유지되었습니다.
          </p>
        ) : (
          <p className="text-muted-foreground">Enter로 전송 · Shift+Enter로 줄바꿈 · Esc로 닫기</p>
        )}
      </div>
    </main>
  )
}
