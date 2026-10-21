import { createHttpError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export type MemorySource = 'conversation' | 'document' | 'skill' | 'user'

export type MemorySearchType = 'semantic' | 'keyword' | 'hybrid'

export interface MemoryEntry {
  id: string
  content: string
  source: MemorySource
  tags: string[]
  score?: number
}

export interface FileMemorySection {
  title: string
  content: string
}

export interface FileMemorySnapshot {
  memoryPath: string
  todayNotePath: string
  yesterdayNotePath: string
  longTermMemory: string
  todayNote: string
  yesterdayNote: string
  sections: FileMemorySection[]
}

type MemorySemanticStatusKind =
  | 'disabled'
  | 'ready'
  | 'backfilling'
  | 'degraded'
  | 'reindex_required'

export interface MemorySemanticStatus {
  status: MemorySemanticStatusKind
  configuredProviderId?: string
  configuredModel?: string
  indexedProviderId?: string
  indexedModel?: string
  dimensions?: number
  pendingCount: number
  failedCount: number
  vecAvailable: boolean
  vectorBackend:
    | 'sqlite-vec'
    | 'sqlite-scan'
    | 'qdrant'
    | 'opensearch'
    | 'elasticsearch'
    | 'meilisearch'
    | 'custom-api'
  backendAvailable: boolean
  lastError?: string
}

interface MemorySearchOptions {
  limit?: number
  type?: MemorySearchType
}

interface MemoryCreateInput {
  content: string
  source?: MemorySource
  tags?: string[]
}

interface MemoryDeleteOptions {
  reason?: string
}

interface MemoryReindexResult {
  started: boolean
  status: MemorySemanticStatus
}

export interface MemoryApi {
  status: () => Promise<MemorySemanticStatus>
  recent: (limit?: number) => Promise<MemoryEntry[]>
  search: (query: string, options?: MemorySearchOptions) => Promise<MemoryEntry[]>
  file: () => Promise<FileMemorySnapshot>
  create: (input: MemoryCreateInput) => Promise<{ id: string }>
  deleteEntry: (id: string, options?: MemoryDeleteOptions) => Promise<void>
  reindex: () => Promise<MemoryReindexResult>
}

function unwrap<T>(body: T | { data?: T }): T {
  if (
    body
    && typeof body === 'object'
    && 'data' in (body as { data?: T })
    && (body as { data?: T }).data !== undefined
  ) {
    return (body as { data: T }).data
  }
  return body as T
}

export async function createMemoryApi(transport: Transport): Promise<MemoryApi> {
  const http = await makeHttp(transport, { memoryScope: true })
  return {
    status: async () => {
      const body = await getJson<MemorySemanticStatus | { data: MemorySemanticStatus }>(
        http,
        '/api/v1/memory/status',
        'memory',
      )
      return unwrap(body)
    },
    search: async (query, options) => {
      const params = new URLSearchParams({ query })
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.type) params.set('type', options.type)
      const body = await getJson<MemoryEntry[] | { data: MemoryEntry[] }>(
        http,
        `/api/v1/memory/search?${params.toString()}`,
        'memory',
      )
      return unwrap(body)
    },
    recent: async (limit = 20) => {
      const params = new URLSearchParams({ limit: String(limit) })
      const body = await getJson<MemoryEntry[] | { data: MemoryEntry[] }>(
        http,
        `/api/v1/memory/recent?${params.toString()}`,
        'memory',
      )
      return unwrap(body)
    },
    file: async () => {
      const body = await getJson<FileMemorySnapshot | { data: FileMemorySnapshot }>(
        http,
        '/api/v1/memory/file',
        'memory',
      )
      return unwrap(body)
    },
    create: async (input) => {
      const body = await sendJson<{ id: string } | { data: { id: string } }>(
        http,
        'POST',
        '/api/v1/memory',
        input,
        'memory',
      )
      return unwrap(body)
    },
    deleteEntry: async (id, options) => {
      const response = await fetch(
        http.url('/api/v1/memory/delete'),
        {
          method: 'POST',
          headers: http.headers(),
          body: JSON.stringify({
            id,
            reason: options?.reason,
            includeAllScopes: true,
          }),
        },
      )
      if (response.status === 404) return
      if (!response.ok) throw await createHttpError('/api/v1/memory/delete', response)
    },
    reindex: async () => {
      const body = await sendJson<
        MemoryReindexResult | { data: MemoryReindexResult }
      >(http, 'POST', '/api/v1/memory/reindex', {}, 'memory')
      return unwrap(body)
    },
  }
}
