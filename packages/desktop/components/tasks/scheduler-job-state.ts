import type { SchedulerJob } from '@/lib/api/scheduler'
import { schedulerMissedEvidence } from '@sepilotd/api-client'

export function isSchedulerTerminal(job: SchedulerJob): boolean {
  return job.status === 'completed' || job.status === 'cancelled'
}

export function isSchedulerFailed(job: SchedulerJob): boolean {
  return job.status === 'failed' || Boolean(job.lastError)
}

export function isSchedulerActive(job: SchedulerJob): boolean {
  return job.enabled && !isSchedulerTerminal(job) && job.status !== 'failed'
}

export function isSchedulerPaused(job: SchedulerJob): boolean {
  return !job.enabled && !isSchedulerTerminal(job) && job.status !== 'failed'
}

export function schedulerStatusLabel(job: SchedulerJob): string {
  if (schedulerMissedEvidence(job)) return '실행 시각을 놓침'
  if (job.status === 'completed') return '완료'
  if (job.status === 'cancelled') return '취소됨'
  if (job.status === 'running') return '실행 중'
  if (job.status === 'failed') return '실패'
  if (job.lastError) return '경고'
  if (!job.enabled) return '일시중지'
  return '활성'
}

export function schedulerQueueCounts(jobs: SchedulerJob[]): {
  total: number
  active: number
  paused: number
  running: number
  failed: number
  terminal: number
} {
  return {
    total: jobs.length,
    active: jobs.filter(isSchedulerActive).length,
    paused: jobs.filter(isSchedulerPaused).length,
    running: jobs.filter((job) => job.status === 'running').length,
    failed: jobs.filter(isSchedulerFailed).length,
    terminal: jobs.filter(isSchedulerTerminal).length,
  }
}

function displayGroup(job: SchedulerJob): number {
  if (job.status === 'running') return 0
  if (isSchedulerActive(job)) return 1
  if (isSchedulerPaused(job)) return 2
  if (isSchedulerFailed(job)) return 3
  return 4
}

export function sortSchedulerJobsForDisplay(jobs: SchedulerJob[]): SchedulerJob[] {
  return [...jobs].sort((a, b) => {
    const groupDelta = displayGroup(a) - displayGroup(b)
    if (groupDelta !== 0) return groupDelta
    if (isSchedulerTerminal(a) && isSchedulerTerminal(b)) {
      return (b.lastRunAt ?? b.updatedAt) - (a.lastRunAt ?? a.updatedAt)
    }
    return a.nextRunAt - b.nextRunAt
  })
}
