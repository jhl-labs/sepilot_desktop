import { getJson, makeHttp } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface FileSearchMatch {
  path: string
  basename: string
  isDirectory: boolean
}

export interface UploadedFileSummary {
  id: string
  filename: string
  mimeType: string
  size: number
  uploadedAt: string
}

interface DaemonErrorBody {
  error?: {
    code?: unknown
    message?: unknown
  }
  code?: unknown
  message?: unknown
}

export class FilesApiError extends Error {
  readonly operation: string
  readonly status: number
  readonly code: string
  readonly daemonMessage: string

  constructor(operation: string, status: number, code: string, daemonMessage: string) {
    super(`${operation} failed (${status}) [${code}]: ${daemonMessage}`)
    this.name = 'FilesApiError'
    this.operation = operation
    this.status = status
    this.code = code
    this.daemonMessage = daemonMessage
  }
}

async function filesApiErrorFromResponse(
  operation: string,
  response: Response,
): Promise<FilesApiError> {
  let body: DaemonErrorBody | null = null
  try {
    body = (await response.json()) as DaemonErrorBody
  } catch {
  }

  const nested = body?.error
  const rawCode = nested?.code ?? body?.code
  const rawMessage = nested?.message ?? body?.message
  const code = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : 'UNKNOWN'
  const daemonMessage =
    typeof rawMessage === 'string' && rawMessage.trim()
      ? rawMessage.trim()
      : `HTTP ${response.status}`

  return new FilesApiError(operation, response.status, code, daemonMessage)
}

export interface FilesApi {
  search: (cwd: string, query: string, limit?: number) => Promise<FileSearchMatch[]>
  upload: (files: File[]) => Promise<UploadedFileSummary[]>
  download: (id: string, signal?: AbortSignal) => Promise<Blob>
  remove: (id: string) => Promise<void>
}

export async function createFilesApi(transport: Transport): Promise<FilesApi> {
  const cfg = await transport.getConfig()
  const http = await makeHttp(transport)
  return {
    search: async (cwd, query, limit) => {
      const params = new URLSearchParams({ cwd })
      if (query) params.set('q', query)
      if (limit != null) params.set('limit', String(limit))
      const body = await getJson<
        { matches?: FileSearchMatch[] } | { data?: { matches?: FileSearchMatch[] } }
      >(http, `/api/v1/files/search?${params.toString()}`, 'files')
      const matches =
        ('data' in body ? body.data?.matches : (body as { matches?: FileSearchMatch[] }).matches) ??
        []
      return matches
    },
    upload: async (files) => {
      const fd = new FormData()
      for (const f of files) fd.append('files', f, f.name)
      const headers: HeadersInit = {}
      if (cfg.daemonToken) headers.authorization = `Bearer ${cfg.daemonToken}`
      const res = await fetch(`${cfg.daemonOrigin}/api/v1/files/upload`, {
        method: 'POST',
        headers,
        body: fd,
      })
      if (!res.ok) {
        throw await filesApiErrorFromResponse('files.upload', res)
      }
      const body = (await res.json()) as
        | { data?: { files?: UploadedFileSummary[] } }
        | { files?: UploadedFileSummary[] }
      const list =
        ('data' in body ? body.data?.files : (body as { files?: UploadedFileSummary[] }).files) ??
        []
      return list
    },
    download: async (id, signal) => {
      const headers: HeadersInit = cfg.daemonToken
        ? { authorization: `Bearer ${cfg.daemonToken}` }
        : {}
      const res = await fetch(
        `${cfg.daemonOrigin}/api/v1/files/${encodeURIComponent(id)}/download`,
        { headers, signal },
      )
      if (!res.ok) {
        throw new Error(`files.download failed (${res.status})`)
      }
      return res.blob()
    },
    remove: async (id) => {
      const headers: HeadersInit = cfg.daemonToken
        ? { authorization: `Bearer ${cfg.daemonToken}` }
        : {}
      const res = await fetch(`${cfg.daemonOrigin}/api/v1/files/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok && res.status !== 404) {
        throw new Error(`files.remove failed (${res.status})`)
      }
    },
  }
}
