import {
  DaemonClient,
  type ChatStreamOptions,
  type DaemonChatBackgroundListResult,
  type DaemonChatBackgroundStartResult,
  type DaemonChatBackgroundStatusResult,
  type SessionInboxItem,
  type WorkItem,
} from '@sepilotd/api-client'
import type { Transport } from '@/lib/transport/transport-adapter'
import { resolveDaemonMemoryScope } from './_memory-scope'

export type { SessionInboxItem, WorkItem }

export type BackgroundChatOptions = Omit<ChatStreamOptions, 'lastEventId' | 'textDeltaMode'>

export interface WorkListResult {
  items: WorkItem[]
  unavailable: string[]
  truncated: string[]
}

export interface ManagedProcessOutput {
  status: string
  stdout: string
  stderr: string
  screen?: string
  nextStdoutOffset: number
  nextStderrOffset: number
}

export interface BackgroundWorkApi {
  listWork(): Promise<WorkListResult>
  backgroundChatJobs(): Promise<DaemonChatBackgroundListResult>
  backgroundChatStatus(jobId: string): Promise<DaemonChatBackgroundStatusResult>
  startBackgroundChat(
    message: string,
    sessionId: string | undefined,
    options?: BackgroundChatOptions,
  ): Promise<DaemonChatBackgroundStartResult>
  cancel(item: WorkItem): Promise<void>
  readProcess(
    id: string,
    offsets?: { stdoutOffset?: number; stderrOffset?: number },
  ): Promise<ManagedProcessOutput>
  listInbox(sessionId: string): Promise<SessionInboxItem[]>
  openInboxResult(sessionId: string, seq: number): Promise<{ sessionId: string }>
  acknowledgeInbox(sessionId: string, seq: number): Promise<void>
}

const TERMINAL_STATUSES = new Set([
  'completed',
  'succeeded',
  'success',
  'done',
  'failed',
  'error',
  'cancelled',
  'canceled',
  'exited',
  'stopped',
  'killed',
  'paused',
  'dead',
])

export function isTerminalWorkStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase())
}

export function workCancelAction(item: WorkItem): 'cancel' | 'stop' | 'pause' | null {
  if (isTerminalWorkStatus(item.status)) return null
  switch (item.kind) {
    case 'chat':
    case 'run':
    case 'job':
      return 'cancel'
    case 'process':
    case 'service':
      return 'stop'
    case 'schedule':
      return 'pause'
    default:
      return null
  }
}

export function createBackgroundWorkApiFromClient(client: DaemonClient): BackgroundWorkApi {
  return {
    listWork: () => client.listWork(),
    backgroundChatJobs: () => client.backgroundChatJobs(),
    backgroundChatStatus: (jobId) => client.backgroundChatStatus(jobId),
    startBackgroundChat: (message, sessionId, options) =>
      client.startBackgroundChat(message, sessionId, options),
    async cancel(item) {
      switch (item.kind) {
        case 'chat':
          await client.cancelBackgroundChat(item.id)
          return
        case 'run':
          await client.cancelActiveRun(item.id)
          return
        case 'process':
          await client.stopManagedProcess(item.id)
          return
        case 'schedule':
          await client.pauseSchedulerJob(item.id)
          return
        case 'service':
          await client.stopService(item.id)
          return
        case 'job':
          await client.request(`/api/v1/jobs/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
          return
        default:
          throw new Error('Approvals are decided from the approval prompt, not cancelled')
      }
    },
    readProcess: (id, offsets) => client.readManagedProcess(id, offsets),
    async listInbox(sessionId) {
      const result = await client.listSessionInbox(sessionId, { unreadOnly: true, limit: 20 })
      return result.items
    },
    openInboxResult: (sessionId, seq) => client.openSessionInboxResult(sessionId, seq),
    async acknowledgeInbox(sessionId, seq) {
      await client.acknowledgeSessionInbox(sessionId, seq)
    },
  }
}

export async function createBackgroundWorkApi(transport: Transport): Promise<BackgroundWorkApi> {
  const config = await transport.getConfig()
  const client = new DaemonClient({
    baseUrl: config.daemonOrigin,
    token: config.daemonToken,
    surface: 'desktop',
    memoryScope: () => resolveDaemonMemoryScope(config.daemonOrigin, config.daemonToken),
  })
  return createBackgroundWorkApiFromClient(client)
}
