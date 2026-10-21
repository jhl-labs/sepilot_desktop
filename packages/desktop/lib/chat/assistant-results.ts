import type { ChatMessage } from '@/lib/store/chat-store'
import type { AssistantDestination } from '@/lib/apps/assistant'

export interface AssistantResultLink {
  key: string
  label: string
  destination: AssistantDestination
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function assistantResultLinks(messages: readonly ChatMessage[]): AssistantResultLink[] {
  const links = new Map<string, AssistantResultLink>()
  for (const message of messages) {
    if (message.role === 'user') links.clear()
    if (message.role !== 'tool' || message.toolState !== 'success') continue
    const name = message.toolName ?? ''
    if (name.startsWith('memory.')) {
      links.set('memory', {
        key: 'memory',
        label: 'Memory 결과 확인',
        destination: { view: 'memory' },
      })
      continue
    }
    let output: Record<string, unknown> | null
    try {
      output = record(JSON.parse(message.content))
    } catch {
      continue
    }
    if (!output || output.ok === false || output.status === 'error') continue
    if (name === 'apps.read' || name === 'apps.write' || name === 'apps.mutate') {
      const app = name === 'apps.mutate' ? record(output.app) : output
      if (typeof app?.id !== 'string') continue
      const saved =
        name === 'apps.write' ||
        (name === 'apps.mutate' && output.written === true && output.dryRun === false)
      const preview = name === 'apps.mutate' && output.dryRun === true
      const label = `${typeof app.title === 'string' ? app.title : '앱'} · ${preview ? '변경 미리보기' : saved ? '저장됨' : '조회함'}`
      links.set(`app:${app.id}`, {
        key: `app:${app.id}`,
        label,
        destination: { view: 'office', appId: app.id },
      })
    } else if (
      [
        'schedule_create',
        'schedule_get',
        'schedule_update',
        'schedule_pause',
        'schedule_resume',
        'schedule_run_now',
      ].includes(name)
    ) {
      const job = record(output.job) ?? output
      const jobId =
        typeof job.jobId === 'string' ? job.jobId : typeof job.id === 'string' ? job.id : null
      if (!jobId) continue
      const status =
        job.status === 'running'
          ? '실행 중'
          : job.status === 'failed'
            ? '실패 확인'
            : job.status === 'completed'
              ? '결과 확인'
              : job.enabled === false
                ? '일시중지'
                : '예약·결과 확인'
      links.set(`job:${jobId}`, {
        key: `job:${jobId}`,
        label: `${typeof job.name === 'string' ? job.name : '작업'} · ${status}`,
        destination: { view: 'tasks', jobId },
      })
    }
  }
  return [...links.values()].slice(-8)
}
