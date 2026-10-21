'use client'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Image,
  LoaderCircle,
  Sparkles,
  Video,
  XCircle,
} from 'lucide-react'
import { useImageGenStore } from '@/lib/store/image-gen-store'
import type { ImageJob, JobStatus } from '@/lib/api/image-gen'
import { cn } from '@/lib/utils/cn'

const STATUS_META: Record<
  JobStatus,
  {
    label: string
    icon: typeof Clock3
    className: string
  }
> = {
  queued: {
    label: '대기',
    icon: Clock3,
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  running: {
    label: '진행',
    icon: LoaderCircle,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  succeeded: {
    label: '완료',
    icon: CheckCircle2,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    label: '실패',
    icon: AlertCircle,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  cancelled: {
    label: '취소',
    icon: XCircle,
    className: 'border-border bg-muted/50 text-muted-foreground',
  },
}

function shortPrompt(prompt: string): string {
  const text = prompt.trim()
  if (!text) return 'Untitled image job'
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function jobOutputSummary(job: ImageJob): string {
  const videos = job.outputs.filter(
    (output) => output.kind === 'video' || output.mime?.startsWith('video/'),
  ).length
  const images = Math.max(0, job.outputs.length - videos)
  if (images > 0 && videos > 0) return `이미지 ${images} · 비디오 ${videos}`
  if (videos > 0) return `비디오 ${videos}`
  if (images > 0) return `이미지 ${images}`
  return job.status === 'running'
    ? `${Math.round(job.progress * 100)}%`
    : STATUS_META[job.status].label
}

function StatusPill({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        meta.className,
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {meta.label}
    </span>
  )
}

function JobRow({ job }: { job: ImageJob }) {
  return (
    <li className="rounded-md border border-border/60 bg-background px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={job.status} />
        <span className="text-[11px] text-muted-foreground">{formatTime(job.createdAt)}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-5">{shortPrompt(job.prompt)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{job.providerId ?? 'provider'}</span>
        <span>{jobOutputSummary(job)}</span>
      </div>
      {job.status === 'running' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(4, Math.min(100, Math.round(job.progress * 100)))}%` }}
          />
        </div>
      ) : null}
      {job.error ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] text-destructive">{job.error}</p>
      ) : null}
    </li>
  )
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'amber' | 'emerald' | 'red'
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-500/25 bg-sky-500/10'
      : tone === 'amber'
        ? 'border-amber-500/25 bg-amber-500/10'
        : tone === 'emerald'
          ? 'border-emerald-500/25 bg-emerald-500/10'
          : 'border-destructive/25 bg-destructive/10'

  return (
    <div className={cn('rounded-md border px-2.5 py-2', toneClass)}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function CanvasActivityRail() {
  const jobs = useImageGenStore((state) => state.jobs)
  const queued = jobs.filter((job) => job.status === 'queued')
  const running = jobs.filter((job) => job.status === 'running')
  const succeeded = jobs.filter((job) => job.status === 'succeeded')
  const failed = jobs.filter((job) => job.status === 'failed')
  const recent = jobs.slice(0, 8)
  const active = [...running, ...queued].slice(0, 4)
  const recentCompleted = succeeded.slice(0, 5)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Canvas 작업 현황</h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {jobs.length > 0 ? `${jobs.length}개 작업 추적 중` : '현재 큐가 비어 있습니다'}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="대기" value={queued.length} tone="sky" />
          <MetricTile label="진행" value={running.length} tone="amber" />
          <MetricTile label="결과" value={succeeded.length} tone="emerald" />
          <MetricTile label="오류" value={failed.length} tone="red" />
        </div>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground">진행 큐</h3>
            <span className="text-[11px] text-muted-foreground">{active.length}</span>
          </div>
          {active.length > 0 ? (
            <ul className="space-y-2">
              {active.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              실행 중인 Canvas 작업 없음
            </div>
          )}
        </section>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground">최근 결과</h3>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Image className="h-3 w-3" />
              <Video className="h-3 w-3" />
            </div>
          </div>
          {recentCompleted.length > 0 ? (
            <ul className="space-y-2">
              {recentCompleted.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
              아직 완료된 결과 없음
            </div>
          )}
        </section>

        {failed.length > 0 ? (
          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-foreground">최근 오류</h3>
              <span className="text-[11px] text-destructive">{failed.length}</span>
            </div>
            <ul className="space-y-2">
              {failed.slice(0, 3).map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          </section>
        ) : null}

        {recent.length === 0 ? (
          <div className="mt-4 rounded-md border border-border/60 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
            작업 없음
          </div>
        ) : null}
      </div>
    </div>
  )
}
