import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { DaemonNotificationItem } from '@sepilotd/api-client'
import type { Transport } from '@/lib/transport/transport-adapter'

export type NotificationItem = DaemonNotificationItem

export interface NotificationSettings {
  channels: { id: string; enabled: boolean }[]
}

interface NotificationDraft {
  id?: string
  title: string
  body?: string
  url?: string | null
}

interface NotificationsWatchSnapshot {
  type: 'snapshot'
  items: NotificationItem[]
}

interface NotificationsWatchItem {
  type: 'item'
  item: NotificationItem
}

interface NotificationsWatchHeartbeat {
  type: 'heartbeat'
  timestamp: string
}

type NotificationsWatchPayload =
  | NotificationsWatchSnapshot
  | NotificationsWatchItem
  | NotificationsWatchHeartbeat

async function* parseNotificationsSse(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<NotificationsWatchPayload> {
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
        yield JSON.parse(payload) as NotificationsWatchPayload
      } catch {
      }
    }
  }
}

export interface NotificationsApi {
  list: () => Promise<NotificationItem[]>
  publish: (next: NotificationDraft) => Promise<NotificationItem>
  markRead: (id: string) => Promise<void>
  getSettings: () => Promise<NotificationSettings>
  setSettings: (next: NotificationSettings) => Promise<NotificationSettings>
  watch: (
    onEvent: (event: NotificationsWatchPayload) => void | Promise<void>,
  ) => { close: () => void; done: Promise<void> }
}

export async function createNotificationsApi(
  transport: Transport,
): Promise<NotificationsApi> {
  const http = await makeHttp(transport)
  return {
    list: () =>
      getJson<NotificationItem[]>(http, '/notifications', 'notifications'),
    publish: (next) =>
      sendJson<NotificationItem>(
        http,
        'POST',
        '/notifications',
        {
          id: next.id,
          title: next.title,
          body: next.body ?? '',
          url: next.url ?? null,
        },
        'notifications',
      ),
    markRead: (id) =>
      sendJson<void>(
        http,
        'POST',
        `/notifications/${encodeURIComponent(id)}/read`,
        {},
        'notifications',
      ),
    getSettings: () =>
      getJson<NotificationSettings>(
        http,
        '/notifications/settings',
        'notifications',
      ),
    setSettings: (next) =>
      sendJson<NotificationSettings>(
        http,
        'PUT',
        '/notifications/settings',
        next,
        'notifications',
      ),
    watch: (onEvent) => {
      const controller = new AbortController()
      const done = (async () => {
        try {
          const response = await fetch(http.url('/notifications/watch'), {
            headers: http.headers(),
            signal: controller.signal,
          })
          if (response.status === 404) {
            throw new CapabilityUnavailableError('notifications')
          }
          if (!response.ok) {
            throw new Error(`/notifications/watch failed (${response.status})`)
          }
          if (!response.body) {
            throw new Error('notifications watch response body is unavailable')
          }
          for await (const event of parseNotificationsSse(response.body)) {
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
  }
}
export { CapabilityUnavailableError }
