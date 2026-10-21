import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { DaemonSchedulerDeliveryOutboxSummary } from '@sepilotd/api-client'

type SchedulerJobKind = 'oneshot' | 'recurring'
type SchedulerJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
type SchedulerJobRunStatus = 'running' | 'success' | 'failed'

export interface SchedulerJob {
  id: string
  name: string
  kind: SchedulerJobKind
  cron: string | null
  runAt: number | null
  nextRunAt: number
  lastRunAt: number | null
  timezone: string | null
  instruction: string
  channelType: string | null
  channelTarget: string | null
  replyToMessageId: string | null
  parentSessionId: string | null
  enabled: boolean
  unattended: boolean
  status: SchedulerJobStatus
  attempt: number
  maxAttempts: number
  retryBackoffMs: number
  lastError: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface SchedulerJobRun {
  id: string
  jobId: string
  agentSessionId?: string | null
  startedAt: number
  finishedAt: number | null
  status: SchedulerJobRunStatus
  attempt: number
  durationMs: number | null
  error: string | null
  outputExcerpt: string | null
}

interface SchedulerJobInput {
  id?: string
  name: string
  cron?: string
  when?: string
  runAt?: number
  instruction?: string
  timezone?: string
  nextRunAt?: number
  enabled?: boolean
  maxAttempts?: number
  retryBackoffMs?: number
  parentSessionId?: string | null
  metadata?: Record<string, unknown> | null
}

interface SchedulerWatchSnapshot {
  type: 'snapshot'
  jobs: SchedulerJob[]
}

interface SchedulerWatchHeartbeat {
  type: 'heartbeat'
  timestamp: string
}

type SchedulerWatchPayload =
  | SchedulerWatchSnapshot
  | SchedulerWatchHeartbeat

async function* parseSchedulerSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<SchedulerWatchPayload> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      let payload = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) payload += line.slice(6)
      }
      if (!payload) continue
      try {
        yield JSON.parse(payload) as SchedulerWatchPayload
      } catch {
      }
    }
  }
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export interface SchedulerApi {
  list: () => Promise<SchedulerJob[]>
  deliveryStatus: () => Promise<DaemonSchedulerDeliveryOutboxSummary>
  getJob: (id: string) => Promise<SchedulerJob>
  runs: (id: string, limit?: number) => Promise<SchedulerJobRun[]>
  upsert: (j: SchedulerJobInput) => Promise<SchedulerJob>
  run: (id: string) => Promise<void>
  pause: (id: string) => Promise<SchedulerJob>
  resume: (id: string) => Promise<SchedulerJob>
  setUnattended: (id: string, unattended: boolean) => Promise<SchedulerJob>
  remove: (id: string) => Promise<void>
  watch: (
    onEvent: (event: SchedulerWatchPayload) => void | Promise<void>,
  ) => { close: () => void; done: Promise<void> }
}

export async function createSchedulerApi(transport: Transport): Promise<SchedulerApi> {
  const baseHttp = await makeHttp(transport)
  const http = {
    ...baseHttp,
    headers: () => {
      const headers = new Headers(baseHttp.headers())
      headers.set('x-sepilotd-surface', 'desktop')
      return headers
    },
  }
  const enc = encodeURIComponent
  return {
    list: () => getJson<SchedulerJob[]>(http, '/scheduler/jobs', 'scheduler'),
    deliveryStatus: async () => {
      const response = await getJson<{ data: DaemonSchedulerDeliveryOutboxSummary }>(
        http,
        '/api/v1/scheduled-tasks/delivery-status',
        'scheduler-delivery-status',
      )
      return response.data
    },
    getJob: (id) => getJson<SchedulerJob>(http, `/scheduler/jobs/${enc(id)}`, 'scheduler'),
    runs: (id, limit) =>
      getJson<SchedulerJobRun[]>(
        http,
        `/scheduler/jobs/${enc(id)}/runs${limit ? `?limit=${limit}` : ''}`,
        'scheduler',
      ),
    upsert: (j) => sendJson<SchedulerJob>(http, 'POST', '/scheduler/jobs', j, 'scheduler'),
    run: (id) => sendJson<void>(
      http,
      'POST',
      `/scheduler/jobs/${enc(id)}/run`,
      { waitForCompletion: false },
      'scheduler',
    ),
    pause: (id) => sendJson<SchedulerJob>(http, 'POST', `/scheduler/jobs/${enc(id)}/pause`, {}, 'scheduler'),
    resume: (id) => sendJson<SchedulerJob>(http, 'POST', `/scheduler/jobs/${enc(id)}/resume`, {}, 'scheduler'),
    setUnattended: (id, unattended) =>
      sendJson<SchedulerJob>(http, 'POST', `/scheduler/jobs/${enc(id)}/unattended`, { unattended }, 'scheduler'),
    remove: (id) =>
      sendJson<void>(http, 'DELETE', `/scheduler/jobs/${enc(id)}`, {}, 'scheduler'),
    watch: (onEvent) => {
      const controller = new AbortController()
      const done = (async () => {
        let failures = 0
        while (!controller.signal.aborted) {
          let terminal = false
          try {
            const response = await fetch(http.url('/scheduler/jobs/watch'), {
              headers: http.headers(), signal: controller.signal,
            })
            terminal = response.status >= 400 && response.status < 500 && response.status !== 429
            if (response.status === 404) throw new CapabilityUnavailableError('scheduler')
            if (!response.ok) throw new Error(`/scheduler/jobs/watch failed (${response.status})`)
            if (!response.body) throw new Error('scheduler watch response body is unavailable')
            for await (const event of parseSchedulerSse(response.body, controller.signal)) {
              if (controller.signal.aborted) return
              if (event.type === 'snapshot') failures = 0
              await onEvent(event)
            }
          } catch (error) {
            if (controller.signal.aborted) return
            if (terminal) throw error
          }
          if (controller.signal.aborted) return
          const delay = Math.min(15000, 500 * 2 ** Math.min(failures++, 5)) * (0.8 + Math.random() * 0.4)
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve() }
            const timer = setTimeout(finish, delay)
            controller.signal.addEventListener('abort', finish, { once: true })
          })
        }
      })()

      return {
        close: () => controller.abort(),
        done,
      }
    },
  }
}
export { CapabilityUnavailableError }
