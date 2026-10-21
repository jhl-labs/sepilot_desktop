import type { Transport } from '@/lib/transport/transport-adapter'
import { getJson, makeHttp, sendJson } from './_http'

export interface GitConnection {
  source: string
  branch: string
  docs: boolean
  wiki: boolean
}
export interface GitChange {
  key: string
  title: string
  local: string | null
  remote: string | null
  action: 'upload' | 'download' | 'conflict'
}
export interface GitPreview {
  id: string
  changes: GitChange[]
}
export interface GitStatus {
  connection: GitConnection | null
  busy: boolean
  lastSync: number | null
  error: string | null
  preview: GitPreview | null
}
export async function createDocsGitApi(transport: Transport) {
  const http = await makeHttp(transport)
  return {
    status: () => getJson<GitStatus>(http, '/docs-git', 'docs-git'),
    connect: (input: GitConnection) =>
      sendJson<GitStatus>(http, 'POST', '/docs-git/connect', input, 'docs-git'),
    disconnect: () => sendJson<GitStatus>(http, 'POST', '/docs-git/disconnect', {}, 'docs-git'),
    preview: () => sendJson<GitPreview>(http, 'POST', '/docs-git/preview', {}, 'docs-git'),
    sync: (id: string, resolutions: Record<string, 'local' | 'remote'>) =>
      sendJson<GitStatus>(http, 'POST', '/docs-git/sync', { id, resolutions }, 'docs-git'),
  }
}
