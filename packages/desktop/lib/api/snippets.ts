import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { Snippet } from '@/lib/store/snippets-store'

export interface SnippetsApi {
  list: (q?: string) => Promise<Snippet[]>
  upsert: (s: Snippet) => Promise<Snippet>
  remove: (id: string) => Promise<void>
  gistStatus: () => Promise<{ connected: boolean; login: string | null }>
  pushGist: (id: string) => Promise<Snippet>
  pullGist: (id: string) => Promise<Snippet>
  unlinkGist: (id: string) => Promise<Snippet>
  importGist: (input: { gistId: string; file?: string; title?: string; tags?: string[] }) => Promise<Snippet>
}

export async function createSnippetsApi(
  transport: Transport,
): Promise<SnippetsApi> {
  const http = await makeHttp(transport)
  return {
    list: (q) =>
      getJson<Snippet[]>(
        http,
        q ? `/snippets?q=${encodeURIComponent(q)}` : '/snippets',
        'snippets',
      ),
    upsert: (s) => sendJson<Snippet>(http, 'POST', '/snippets', s, 'snippets'),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/snippets/${encodeURIComponent(id)}`,
        {},
        'snippets',
      ),
    gistStatus: () =>
      getJson<{ connected: boolean; login: string | null }>(
        http,
        '/snippets/gist/status',
        'snippets',
      ),
    pushGist: (id) =>
      sendJson<Snippet>(
        http,
        'POST',
        `/snippets/${encodeURIComponent(id)}/gist/push`,
        {},
        'snippets',
      ),
    pullGist: (id) =>
      sendJson<Snippet>(
        http,
        'POST',
        `/snippets/${encodeURIComponent(id)}/gist/pull`,
        {},
        'snippets',
      ),
    unlinkGist: (id) =>
      sendJson<Snippet>(
        http,
        'DELETE',
        `/snippets/${encodeURIComponent(id)}/gist`,
        {},
        'snippets',
      ),
    importGist: (input) =>
      sendJson<Snippet>(http, 'POST', '/snippets/gist/import', input, 'snippets'),
  }
}
