import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { WikiNode } from '@/lib/store/wiki-store'

export interface WikiSearchHit extends WikiNode {
  snippet: string
}

export interface WikiPortableBackup {
  format: 'sepilotd.wiki.backup'
  formatVersion: 1
  exportedAt: number
  nodes: WikiNode[]
}

export type WikiFolderEntry =
  | { kind: 'directory'; relativePath: string }
  | { kind: 'file'; relativePath: string; content: string }

export interface WikiFolderExport {
  directoryName: string
  entries: WikiFolderEntry[]
}

export type WikiImportStrategy = 'copy' | 'merge' | 'replace'

export type WikiImportSource =
  | { type: 'backup'; archive: WikiPortableBackup }
  | {
      type: 'markdown'
      files: Array<{ name: string; content: string }>
      parentId?: string | null
    }
  | {
      type: 'folder'
      rootName: string
      entries: WikiFolderEntry[]
      parentId?: string | null
    }

export interface WikiImportRequest {
  source: WikiImportSource
  strategy?: WikiImportStrategy
  confirmed?: boolean
}

export interface WikiImportApplyRequest extends WikiImportRequest {
  previewToken: string
}

export interface WikiImportConflict {
  id: string
  title: string
  reason: 'id_exists'
}

export interface WikiImportPreview {
  previewToken: string
  strategy: WikiImportStrategy
  sourceType: WikiImportSource['type']
  incomingCount: number
  createCount: number
  updateCount: number
  deleteCount: number
  conflicts: WikiImportConflict[]
  warnings: string[]
}

export interface WikiImportResult extends WikiImportPreview {
  importedNodeIds: string[]
}

export interface WikiApi {
  tree: () => Promise<WikiNode[]>
  upsertNode: (
    input: Partial<WikiNode> & Pick<WikiNode, 'title'>,
  ) => Promise<WikiNode>
  removeNode: (id: string) => Promise<void>
  search: (query: string, limit?: number) => Promise<WikiSearchHit[]>
  exportBackup: () => Promise<WikiPortableBackup>
  exportFolder: () => Promise<WikiFolderExport>
  previewImport: (input: WikiImportRequest) => Promise<WikiImportPreview>
  importContent: (input: WikiImportApplyRequest) => Promise<WikiImportResult>
}

export async function createWikiApi(transport: Transport): Promise<WikiApi> {
  const http = await makeHttp(transport)
  return {
    tree: () => getJson<WikiNode[]>(http, '/wiki/tree', 'wiki'),
    upsertNode: (input) =>
      sendJson<WikiNode>(http, 'POST', '/wiki/nodes', input, 'wiki'),
    removeNode: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/wiki/nodes/${encodeURIComponent(id)}`,
        {},
        'wiki',
      ),
    search: (query, limit) => {
      const params = new URLSearchParams({ q: query })
      if (limit != null) params.set('limit', String(limit))
      return getJson<WikiSearchHit[]>(
        http,
        `/wiki/search?${params.toString()}`,
        'wiki',
      )
    },
    exportBackup: () =>
      getJson<WikiPortableBackup>(http, '/wiki/export', 'wiki'),
    exportFolder: () =>
      getJson<WikiFolderExport>(http, '/wiki/export/folder', 'wiki'),
    previewImport: (input) =>
      sendJson<WikiImportPreview>(
        http,
        'POST',
        '/wiki/import/preview',
        input,
        'wiki',
      ),
    importContent: (input) =>
      sendJson<WikiImportResult>(
        http,
        'POST',
        '/wiki/import',
        input,
        'wiki',
      ),
  }
}
export { CapabilityUnavailableError }
