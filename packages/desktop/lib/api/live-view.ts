import { getJson, makeHttp, sendJson } from './_http'
import { readSseEvents } from './_sse'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { LiveView, LiveViewStill } from '@sepilotd/api-client'

export interface LiveViewFrame {
  image: string
  url?: string
  title?: string
}

export async function createLiveViewApi(transport: Transport | null) {
  if (!transport) throw new Error('live views need a daemon transport')
  const http = await makeHttp(transport)
  return {
    list: (sessionId: string) =>
      getJson<LiveView[]>(http, `/api/v1/views?sessionId=${encodeURIComponent(sessionId)}`, 'views'),
    still: (id: string) =>
      getJson<LiveViewStill>(http, `/api/v1/views/${encodeURIComponent(id)}/still`, 'views'),
    control: (connectionId: string, sessionId: string, mode: 'human' | 'agent') =>
      sendJson(http, 'POST', '/api/v1/browser/control', { id: connectionId, sessionId, mode }, 'browser'),
    frames(id: string, onFrame: (frame: LiveViewFrame) => void): () => void {
      const controller = new AbortController()
      void (async () => {
        const response = await fetch(http.url(`/api/v1/views/${encodeURIComponent(id)}/frames`), {
          headers: http.headers(),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) return
        await readSseEvents<LiveViewFrame>(response.body, 'frame', onFrame)
      })().catch(() => {})
      return () => controller.abort()
    },
  }
}
