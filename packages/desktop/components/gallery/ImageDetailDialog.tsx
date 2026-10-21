'use client'
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import type { ImageJob } from '@/lib/api/image-gen'
import { Button } from '@/components/ui/button'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

interface Props {
  open: boolean
  job: ImageJob | null
  urls: string[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  onDownload?: (fileId: string) => void
}

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

export function ImageDetailDialog({
  open,
  job,
  urls,
  index,
  onIndexChange,
  onClose,
  onDownload,
}: Props) {
  useModalViewportLock(open && Boolean(job))
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!job || urls.length <= 1) return
      if (e.key === 'ArrowRight') {
        onIndexChange((index + 1) % urls.length)
      } else if (e.key === 'ArrowLeft') {
        onIndexChange((index - 1 + urls.length) % urls.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, job, urls.length, index, onIndexChange, onClose])

  if (!open || !job) return null

  const url = urls[index]
  const output = job.outputs[index]
  const fileId = output?.id ?? ''
  const isVideo = output?.kind === 'video' || output?.mime?.startsWith('video/')
  const hasMany = urls.length > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이미지 상세 보기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">이미지 상세 보기</h2>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div
          role="region"
          aria-label="이미지 상세 내용"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]"
        >
          <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-md bg-black/40">
            {url ? (
              isVideo ? (
                <video
                  src={url}
                  controls
                  className="max-h-[clamp(8rem,calc(100dvh-12rem),70dvh)] max-w-full object-contain"
                />
              ) : (
                <img
                  src={url}
                  alt={job.prompt || 'image'}
                  className="max-h-[clamp(8rem,calc(100dvh-12rem),70dvh)] max-w-full object-contain"
                />
              )
            ) : (
              <p className="text-xs text-muted-foreground">미리보기를 사용할 수 없습니다.</p>
            )}

            {hasMany ? (
              <>
                <button
                  type="button"
                  onClick={() => onIndexChange((index - 1 + urls.length) % urls.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 text-foreground hover:bg-background"
                  aria-label="이전"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onIndexChange((index + 1) % urls.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1 text-foreground hover:bg-background"
                  aria-label="다음"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {index + 1} / {urls.length}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {job.prompt || '(no prompt)'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                상태: <span className="font-medium text-foreground">{job.status}</span>
              </span>
              <span>생성: {formatTimestamp(job.createdAt)}</span>
              {fileId ? <span className="font-mono">file: {fileId.slice(0, 12)}…</span> : null}
            </div>
            {job.error ? <p className="text-[11px] text-red-500">{job.error}</p> : null}
          </div>
        </div>

        {onDownload && fileId ? (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
            <Button size="sm" variant="outline" onClick={() => onDownload(fileId)}>
              <Download className="mr-1 h-3.5 w-3.5" />
              다운로드
            </Button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}
