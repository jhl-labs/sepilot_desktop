import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface MessageSubscriptionConfig {
  enabled: boolean
  connectionType: 'polling' | 'websocket' | 'nats'
  pollingUrl: string
  websocketUrl: string
  pollingInterval: number
  authToken: string
  customHeaders: Record<string, string>
  natsUrl: string
  natsConsumerId: string
  natsConsumerSecret: string
  natsStreamName: string
  natsSubject: string
  natsBatchSize: number
  natsFetchTimeout: number
  maxQueueSize: number
  retentionDays: number
  autoProcess: boolean
  retryAttempts: number
  retryDelay: number
  useAIProcessing: boolean
  aiPromptTemplate: string
  thinkingMode: 'instant' | 'sequential'
  showNotification: boolean
}

interface MessageQueueStatus {
  pending: number
  processing: number
  completed: number
  failed: number
  totalProcessed: number
  lastPolled: number | null
  lastProcessed: number | null
}

interface SubscriptionStatus {
  isConnected: boolean
  lastPolled: number | null
  lastError: string | null
}

export interface MessageSubscriptionItem {
  hash: string
  id: string | null
  type: 'github_webhook' | 'community_post' | 'custom'
  source: string
  title: string
  body: string
  content: string
  metadata: Record<string, unknown>
  timestamp: number
  queuedAt: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  processedAt: number | null
  error: string | null
  retryCount: number
  conversationId: string | null
}

export interface MessageSubscriptionOverview {
  config: MessageSubscriptionConfig
  queueStatus: MessageQueueStatus
  status: SubscriptionStatus
  recentMessages: MessageSubscriptionItem[]
}

interface MessageSubscriptionRefreshResult {
  success: boolean
  count: number
  processed?: number
  error?: string
  overview: MessageSubscriptionOverview
}

interface MessageSubscriptionProcessResult {
  success: boolean
  processed: number
  overview: MessageSubscriptionOverview
}

interface MessageSubscriptionWatchSnapshot {
  type: 'snapshot'
  overview: MessageSubscriptionOverview
  messages: MessageSubscriptionItem[]
  groups: {
    pending: MessageSubscriptionItem[]
    processing: MessageSubscriptionItem[]
    completed: MessageSubscriptionItem[]
    failed: MessageSubscriptionItem[]
  }
}

interface MessageSubscriptionWatchHeartbeat {
  type: 'heartbeat'
  timestamp: string
}

type MessageSubscriptionWatchPayload =
  | MessageSubscriptionWatchSnapshot
  | MessageSubscriptionWatchHeartbeat

async function* parseMessageSubscriptionSse(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<MessageSubscriptionWatchPayload> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
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
        yield JSON.parse(payload) as MessageSubscriptionWatchPayload
      } catch {
      }
    }
  }
}

export interface MessageSubscriptionApi {
  getOverview: () => Promise<MessageSubscriptionOverview>
  saveConfig: (
    next: MessageSubscriptionConfig,
  ) => Promise<MessageSubscriptionOverview>
  start: () => Promise<MessageSubscriptionOverview>
  stop: () => Promise<MessageSubscriptionOverview>
  refresh: () => Promise<MessageSubscriptionRefreshResult>
  processPending: () => Promise<MessageSubscriptionProcessResult>
  listMessages: (
    status?: MessageSubscriptionItem['status'],
    limit?: number,
  ) => Promise<MessageSubscriptionItem[]>
  watch: (
    onEvent: (event: MessageSubscriptionWatchPayload) => void | Promise<void>,
  ) => { close: () => void; done: Promise<void> }
  reprocess: (hash: string) => Promise<MessageSubscriptionItem | null>
  remove: (hash: string) => Promise<void>
}

export async function createMessageSubscriptionApi(
  transport: Transport,
): Promise<MessageSubscriptionApi> {
  const http = await makeHttp(transport)
  return {
    getOverview: () =>
      getJson<MessageSubscriptionOverview>(
        http,
        '/message-subscription',
        'message-subscription',
      ),
    saveConfig: (next) =>
      sendJson<MessageSubscriptionOverview>(
        http,
        'PUT',
        '/message-subscription',
        next,
        'message-subscription',
      ),
    start: () =>
      sendJson<MessageSubscriptionOverview>(
        http,
        'POST',
        '/message-subscription/start',
        {},
        'message-subscription',
      ),
    stop: () =>
      sendJson<MessageSubscriptionOverview>(
        http,
        'POST',
        '/message-subscription/stop',
        {},
        'message-subscription',
      ),
    refresh: () =>
      sendJson<MessageSubscriptionRefreshResult>(
        http,
        'POST',
        '/message-subscription/refresh',
        {},
        'message-subscription',
      ),
    processPending: () =>
      sendJson<MessageSubscriptionProcessResult>(
        http,
        'POST',
        '/message-subscription/process',
        {},
        'message-subscription',
      ),
    listMessages: (status, limit) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (typeof limit === 'number') params.set('limit', String(limit))
      const suffix = params.toString() ? `?${params.toString()}` : ''
      return getJson<MessageSubscriptionItem[]>(
        http,
        `/message-subscription/messages${suffix}`,
        'message-subscription',
      )
    },
    watch: (onEvent) => {
      const controller = new AbortController()
      const done = (async () => {
        try {
          const response = await fetch(http.url('/message-subscription/watch'), {
            headers: http.headers(),
            signal: controller.signal,
          })
          if (response.status === 404) {
            throw new CapabilityUnavailableError('message-subscription')
          }
          if (!response.ok) {
            throw new Error(`/message-subscription/watch failed (${response.status})`)
          }
          if (!response.body) {
            throw new Error('message subscription watch response body is unavailable')
          }
          for await (const event of parseMessageSubscriptionSse(response.body)) {
            await onEvent(event)
          }
        } catch (error) {
          if (controller.signal.aborted) return
          throw error
        }
      })()

      return {
        close: () => controller.abort(),
        done,
      }
    },
    reprocess: (hash) =>
      sendJson<MessageSubscriptionItem | null>(
        http,
        'POST',
        `/message-subscription/messages/${encodeURIComponent(hash)}/reprocess`,
        {},
        'message-subscription',
      ),
    remove: (hash) =>
      sendJson<void>(
        http,
        'DELETE',
        `/message-subscription/messages/${encodeURIComponent(hash)}`,
        {},
        'message-subscription',
      ),
  }
}

export { CapabilityUnavailableError }
