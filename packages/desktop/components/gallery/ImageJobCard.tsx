'use client'
import { useEffect, useState } from 'react'
import { Download, Square, Trash2 } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { createImageGenApi, type ImageJob } from '@/lib/api/image-gen'
import { Button } from '@/components/ui/button'

const STATUS_LABEL: Record<ImageJob['status'], string> = {
  queued: '대기',
  running: '진행',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소',
}

export function ImageJobCard({
  job,
  onCancel,
  onDelete,
  onDownload,
  onPreview,
  previewLabel = 'Canvas에서 편집',
}: {
  job: ImageJob
  onCancel?: () => void
  onDelete?: () => void
  onDownload?: (fileId: string) => void
  onPreview?: (job: ImageJob, urls: string[], outputIndex: number) => void
  previewLabel?: string
}) {
  const transport = useTransport()
  const [urls, setUrls] = useState<string[]>([])
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let revoked: string[] = []
    let cancelled = false
    setLoadFailed(false)
    setUrls([])
    if (job.status !== 'succeeded') return
    void (async () => {
      const api = await createImageGenApi(transport)
      const blobs = await Promise.all(job.outputs.map((o) => api.fileFetch(o.id).catch(() => null)))
      if (cancelled) return
      const u = blobs.flatMap((b) => (b ? [URL.createObjectURL(b)] : []))
      revoked = u
      setUrls(u)
      setLoadFailed(job.outputs.length > 0 && u.length === 0)
    })()
    return () => {
      cancelled = true
      revoked.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [job, transport])

  const statusColor =
    job.status === 'failed'
      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
      : job.status === 'succeeded'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : job.status === 'running'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
          : 'border-border bg-muted text-muted-foreground'

  return (
    <article className="flex min-h-0 flex-col gap-2 rounded-md border border-border bg-background p-2 text-xs">
      <header className="flex items-start justify-between gap-2">
        <span className="line-clamp-1 font-medium" title={job.prompt}>
          {job.prompt || '(no prompt)'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] leading-none ${statusColor}`}
          >
            {STATUS_LABEL[job.status]}
            {job.status === 'running' ? ` · ${Math.round(job.progress * 100)}%` : ''}
          </span>
          {onDelete ? (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onDelete}
              aria-label="생성 이미지 삭제"
              title="생성 이미지 삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </header>
      {job.error && (
        <p className="line-clamp-3 rounded border border-red-500/20 bg-red-500/5 p-1.5 text-[11px] leading-snug text-red-600 dark:text-red-300">
          {job.error}
        </p>
      )}
      {urls.length > 0 ? (
        <div className={`grid gap-1 ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {urls.map((u, i) => {
            const fileId = job.outputs[i]?.id ?? ''
            const output = job.outputs[i]
            const isVideo = output?.kind === 'video' || output?.mime?.startsWith('video/')
            return (
              <div key={u} className="overflow-hidden rounded-md border border-border bg-muted/30">
                {onPreview ? (
                  <button
                    type="button"
                    onClick={() => onPreview(job, urls, i)}
                    className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={previewLabel}
                    title={previewLabel}
                  >
                    {isVideo ? (
                      <video src={u} muted playsInline className="h-full w-full object-contain" />
                    ) : (
                      <img src={u} alt="" className="h-full w-full object-contain" />
                    )}
                  </button>
                ) : isVideo ? (
                  <video
                    src={u}
                    muted
                    playsInline
                    className="aspect-square w-full bg-muted/60 object-contain"
                  />
                ) : (
                  <img src={u} alt="" className="aspect-square w-full bg-muted/60 object-contain" />
                )}
                <div className="border-t border-border bg-background">
                  {onDownload ? (
                    <button
                      type="button"
                      className="flex h-8 w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => onDownload(fileId)}
                      aria-label="다운로드"
                      title="다운로드"
                    >
                      <Download className="h-3 w-3" />
                      <span>다운로드</span>
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
          {job.status === 'succeeded'
            ? loadFailed
              ? '미리보기 로드 실패'
              : '미리보기 준비 중…'
            : job.status === 'running'
              ? `${Math.round(job.progress * 100)}% 생성 중…`
              : STATUS_LABEL[job.status]}
        </div>
      )}
      {onCancel ? (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-6 text-[10px]">
            <Square className="mr-1 h-2.5 w-2.5 fill-current" />
            취소
          </Button>
        </div>
      ) : null}
    </article>
  )
}
