import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface BackupItem {
  id: string
  createdAt: number
  sizeBytes: number
  path?: string
  sha256?: string
}

export interface RestoreResult {
  id: string
  restoredFiles: number
}

export interface BackupApi {
  list: () => Promise<BackupItem[]>
  create: () => Promise<BackupItem>
  restore: (id: string) => Promise<RestoreResult>
  remove: (id: string) => Promise<void>
}

export async function createBackupApi(transport: Transport): Promise<BackupApi> {
  const http = await makeHttp(transport)
  return {
    list: () => getJson<BackupItem[]>(http, '/backup', 'backup'),
    create: () => sendJson<BackupItem>(http, 'POST', '/backup', {}, 'backup'),
    restore: (id) =>
      sendJson<RestoreResult>(
        http,
        'POST',
        `/backup/${encodeURIComponent(id)}/restore`,
        {},
        'backup',
      ),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/backup/${encodeURIComponent(id)}`,
        {},
        'backup',
      ),
  }
}
