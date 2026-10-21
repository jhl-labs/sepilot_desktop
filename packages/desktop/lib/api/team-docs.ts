import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface TeamDocsConfigInput {
  id?: string
  name: string
  description?: string
  serverType?: 'github.com' | 'ghes'
  ghesUrl?: string
  token: string
  owner: string
  repo: string
  branch?: string
  docsPath?: string
  enabled?: boolean
  autoSync?: boolean
  syncInterval?: number
}

export interface TeamDocsConfig {
  id: string
  name: string
  description: string
  serverType: 'github.com' | 'ghes'
  ghesUrl: string
  token: string
  owner: string
  repo: string
  branch: string
  docsPath: string
  enabled: boolean
  autoSync: boolean
  syncInterval: number
  lastTestedAt: number | null
  lastSyncAt: number | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncError: string | null
  syncedDocuments: number
  updatedAt: number
}

export interface TeamDocsDocument {
  path: string
  sha: string | null
  size: number
  syncedAt: number
}

export interface TeamDocsDocumentContent extends TeamDocsDocument {
  content: string
}

interface TeamDocsActionResult {
  success: boolean
  message: string
  config: TeamDocsConfig | null
}

interface TeamDocsSyncAllResult {
  success: boolean
  total: number
  succeeded: number
  failed: number
  items: TeamDocsConfig[]
}

export interface TeamDocsWatchSnapshot {
  type: 'snapshot'
  items: TeamDocsConfig[]
  documentsByConfigId: Record<string, TeamDocsDocument[]>
}

interface TeamDocsWatchHeartbeat {
  type: 'heartbeat'
  timestamp: string
}

type TeamDocsWatchPayload =
  | TeamDocsWatchSnapshot
  | TeamDocsWatchHeartbeat

async function* parseTeamDocsSse(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<TeamDocsWatchPayload> {
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
        yield JSON.parse(payload) as TeamDocsWatchPayload
      } catch {
      }
    }
  }
}

export interface TeamDocsApi {
  list: () => Promise<TeamDocsConfig[]>
  upsert: (next: TeamDocsConfigInput) => Promise<TeamDocsConfig>
  remove: (id: string) => Promise<void>
  listDocuments: (id: string) => Promise<TeamDocsDocument[]>
  getDocument: (id: string, path: string) => Promise<TeamDocsDocumentContent>
  testConnection: (id: string) => Promise<TeamDocsActionResult>
  sync: (id: string) => Promise<TeamDocsActionResult>
  syncAll: () => Promise<TeamDocsSyncAllResult>
  watch: (
    onEvent: (event: TeamDocsWatchPayload) => void | Promise<void>,
  ) => { close: () => void; done: Promise<void> }
}

export async function createTeamDocsApi(
  transport: Transport,
): Promise<TeamDocsApi> {
  const http = await makeHttp(transport)
  return {
    list: () => getJson<TeamDocsConfig[]>(http, '/team-docs', 'team-docs'),
    upsert: (next) =>
      sendJson<TeamDocsConfig>(http, 'POST', '/team-docs', next, 'team-docs'),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/team-docs/${encodeURIComponent(id)}`,
        {},
        'team-docs',
      ),
    listDocuments: (id) =>
      getJson<TeamDocsDocument[]>(
        http,
        `/team-docs/${encodeURIComponent(id)}/documents`,
        'team-docs',
      ),
    getDocument: (id, path) =>
      getJson<TeamDocsDocumentContent>(
        http,
        `/team-docs/${encodeURIComponent(id)}/document?path=${encodeURIComponent(path)}`,
        'team-docs',
      ),
    testConnection: (id) =>
      sendJson<TeamDocsActionResult>(
        http,
        'POST',
        `/team-docs/${encodeURIComponent(id)}/test-connection`,
        {},
        'team-docs',
      ),
    sync: (id) =>
      sendJson<TeamDocsActionResult>(
        http,
        'POST',
        `/team-docs/${encodeURIComponent(id)}/sync`,
        {},
        'team-docs',
      ),
    syncAll: () =>
      sendJson<TeamDocsSyncAllResult>(
        http,
        'POST',
        '/team-docs/sync-all',
        {},
        'team-docs',
      ),
    watch: (onEvent) => {
      const controller = new AbortController()
      const done = (async () => {
        try {
          const response = await fetch(http.url('/team-docs/watch'), {
            headers: http.headers(),
            signal: controller.signal,
          })
          if (response.status === 404) {
            throw new CapabilityUnavailableError('team-docs')
          }
          if (!response.ok) {
            throw new Error(`/team-docs/watch failed (${response.status})`)
          }
          if (!response.body) {
            throw new Error('team docs watch response body is unavailable')
          }
          for await (const event of parseTeamDocsSse(response.body)) {
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
