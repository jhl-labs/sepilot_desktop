'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  installDownloadedUpdate,
  onUpdateAvailable,
  onUpdateDownloaded,
  type UpdateEventPayload,
} from '@/lib/electron/bridge'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

export function UpdateNotificationDialog() {
  const [available, setAvailable] = useState<UpdateEventPayload | null>(null)
  const [downloaded, setDownloaded] = useState<UpdateEventPayload | null>(null)

  useEffect(() => {
    const offA = onUpdateAvailable((payload) => setAvailable(payload))
    const offD = onUpdateDownloaded((payload) => setDownloaded(payload))
    return () => {
      offA()
      offD()
    }
  }, [])

  const open = Boolean(available || downloaded)
  useEscapeToClose(open, () => {
    setAvailable(null)
    setDownloaded(null)
  })
  useModalViewportLock(open)

  if (!open) return null

  const releaseNotes = downloaded?.releaseNotes ?? available?.releaseNotes ?? null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="업데이트"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-background">
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">업데이트</h2>
        </header>
        <div
          role="region"
          aria-label="업데이트 정보"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-6 py-4 text-sm [scrollbar-gutter:stable]"
        >
          {available && !downloaded && <p>새 버전 {available.version} 다운로드 중…</p>}
          {downloaded && (
            <p>버전 {downloaded.version} 설치 준비 완료. 재시작이 필요합니다.</p>
          )}
          {releaseNotes ? (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-line text-muted-foreground">
              {releaseNotes}
            </div>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailable(null)
              setDownloaded(null)
            }}
          >
            나중에
          </Button>
          <Button
            size="sm"
            disabled={!downloaded}
            onClick={() => {
              void installDownloadedUpdate()
            }}
          >
            지금 설치
          </Button>
        </footer>
      </div>
    </div>
  )
}
