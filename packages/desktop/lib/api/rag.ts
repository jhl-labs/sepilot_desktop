import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { RagFolder, RagDocument } from '@/lib/store/rag-store'

export type RagSearchMode =
  | 'hybrid'
  | 'hybrid-backfilling'
  | 'keyword-fallback'
  | 'degraded'
  | 'memory-vector'

export interface SearchHit {
  documentId: string
  folderId: string
  title: string
  score: number
  snippet: string
  path?: string
  searchMode?: RagSearchMode
}

export interface RagDocumentContent extends RagDocument {
  body: string
}

export interface RagVectorDbInfo {
  engine:
    | 'memory'
    | 'sqlite-vec'
    | 'sqlite-scan'
    | 'qdrant'
    | 'opensearch'
    | 'elasticsearch'
    | 'meilisearch'
    | 'custom-api'
  vectorBackend?:
    | 'sqlite-vec'
    | 'sqlite-scan'
    | 'qdrant'
    | 'opensearch'
    | 'elasticsearch'
    | 'meilisearch'
    | 'custom-api'
  backendAvailable?: boolean
  vecAvailable?: boolean
  status?: 'disabled' | 'ready' | 'backfilling' | 'degraded' | 'reindex_required'
  configuredProviderId?: string
  configuredModel?: string
  indexedProviderId?: string
  indexedModel?: string
  dimension: number
  documents: number
  pendingCount?: number
  failedCount?: number
  lastError?: string
}

export interface RagSyncResult {
  ok: boolean
  folders: number
  indexed: number
  deleted: number
  skipped: number
  errors: Array<{ folderId: string; path?: string; error: string }>
}

interface RagConnectionTestResult {
  ok: boolean
  target: 'vector-backend' | 'rerank'
  backend?: string
  url?: string
  status?: number
  durationMs: number
  message: string
}

export interface RagApi {
  listFolders: () => Promise<RagFolder[]>
  listDocuments: (folderId: string) => Promise<RagDocument[]>
  getDocument: (id: string) => Promise<RagDocumentContent>
  upsertFolder: (input: {
    id?: string
    name: string
    sourceType?: 'manual' | 'git' | 'web'
    tlsVerify?: boolean
    caCert?: string
    path?: string
    include?: string[]
    exclude?: string[]
  }) => Promise<RagFolder>
  removeFolder: (id: string) => Promise<void>
  upsertDocument: (input: {
    id?: string
    folderId: string
    title: string
    body: string
    path?: string
    sourceFileId?: string
    size?: number
  }) => Promise<RagDocument>
  removeDocument: (id: string) => Promise<void>
  search: (q: string, limit?: number) => Promise<SearchHit[]>
  sync: () => Promise<RagSyncResult>
  vectorDbInfo: () => Promise<RagVectorDbInfo>
  testVectorDbConnection: () => Promise<RagConnectionTestResult>
  testRerankConnection: () => Promise<RagConnectionTestResult>
}

export async function createRagApi(transport: Transport): Promise<RagApi> {
  const http = await makeHttp(transport)
  return {
    listFolders: () => getJson<RagFolder[]>(http, '/rag/folders', 'rag'),
    listDocuments: (folderId) =>
      getJson<RagDocument[]>(http, `/rag/documents?folder=${encodeURIComponent(folderId)}`, 'rag'),
    getDocument: (id) =>
      getJson<RagDocumentContent>(http, `/rag/documents/${encodeURIComponent(id)}`, 'rag'),
    upsertFolder: (input) => sendJson<RagFolder>(http, 'POST', '/rag/folders', input, 'rag'),
    removeFolder: (id) =>
      sendJson<void>(http, 'DELETE', `/rag/folders/${encodeURIComponent(id)}`, {}, 'rag'),
    upsertDocument: (input) => sendJson<RagDocument>(http, 'POST', '/rag/documents', input, 'rag'),
    removeDocument: (id) =>
      sendJson<void>(http, 'DELETE', `/rag/documents/${encodeURIComponent(id)}`, {}, 'rag'),
    search: (q, limit) =>
      getJson<SearchHit[]>(
        http,
        `/rag/search?q=${encodeURIComponent(q)}${limit ? `&limit=${encodeURIComponent(String(limit))}` : ''}`,
        'rag',
      ),
    sync: () => sendJson<RagSyncResult>(http, 'POST', '/rag/sync', {}, 'rag'),
    vectorDbInfo: () => getJson<RagVectorDbInfo>(http, '/rag/vector-db', 'rag'),
    testVectorDbConnection: () =>
      sendJson<RagConnectionTestResult>(http, 'POST', '/rag/vector-db/test', {}, 'rag'),
    testRerankConnection: () =>
      sendJson<RagConnectionTestResult>(http, 'POST', '/rag/rerank/test', {}, 'rag'),
  }
}
