import type {
  SepilotAppMutation,
  SepilotAppMutationIssue,
  SepilotReadableAppRecord,
  SepilotReadableAppSearchResult,
  SepilotReadableAppSummary,
} from '@sepilotd/api-client'
import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

interface DaemonToolResult {
  status: 'success' | 'error'
  output: string
  durationMs: number
  code?: string
}

interface DaemonToolEnvelope {
  data: DaemonToolResult
}

export interface AppsMutationResult {
  dryRun: boolean
  written: boolean
  applied: string[]
  issues: SepilotAppMutationIssue[]
  app: SepilotReadableAppRecord
}

export interface AppsWriteInput {
  mode?: 'patch' | 'replace'
  data?: Record<string, unknown>
  patch?: Record<string, unknown>
}

export interface AppsApi {
  list: (options?: { limit?: number; offset?: number; reference?: string }) => Promise<SepilotReadableAppSummary[]>
  read: (id: string, options?: { includeHtml?: boolean }) => Promise<SepilotReadableAppRecord>
  search: (
    query: string,
    options?: {
      type?: 'hybrid' | 'keyword' | 'semantic'
      limit?: number
      includeHtml?: boolean
      interAppReadableOnly?: boolean
    },
  ) => Promise<SepilotReadableAppSearchResult[]>
  mutate: (
    id: string,
    mutations: SepilotAppMutation[],
    options?: { dryRun?: boolean },
  ) => Promise<AppsMutationResult>
  write: (id: string, input: AppsWriteInput) => Promise<SepilotReadableAppRecord>
}

export class DaemonAppsToolError extends Error {
  constructor(public result: DaemonToolResult) {
    super(result.code ? `${result.code}: ${result.output}` : result.output)
    this.name = 'DaemonAppsToolError'
  }

  parsedOutput<T>(): T | null {
    try {
      return JSON.parse(this.result.output) as T
    } catch {
      return null
    }
  }
}

function parseToolOutput<T>(result: DaemonToolResult): T {
  if (result.status === 'error') {
    throw new DaemonAppsToolError(result)
  }
  try {
    return JSON.parse(result.output) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Apps tool returned invalid JSON: ${message}`)
  }
}

export async function createAppsApi(transport: Transport): Promise<AppsApi> {
  const http = await makeHttp(transport)
  const enc = encodeURIComponent
  const getTool = async <T>(path: string): Promise<T> => {
    const envelope = await getJson<DaemonToolEnvelope>(http, path, 'apps')
    return parseToolOutput<T>(envelope.data)
  }
  const sendTool = async <T>(method: string, path: string, body: unknown): Promise<T> => {
    const envelope = await sendJson<DaemonToolEnvelope>(http, method, path, body, 'apps')
    return parseToolOutput<T>(envelope.data)
  }

  const v1 = '/api/v1'
  return {
    list: (options) => {
      const query = new URLSearchParams()
      if (options?.limit !== undefined) query.set('limit', String(options.limit))
      if (options?.offset !== undefined) query.set('offset', String(options.offset))
      if (options?.reference !== undefined) query.set('reference', options.reference)
      return getTool<SepilotReadableAppSummary[]>(`${v1}/apps${query.size ? `?${query}` : ''}`)
    },
    read: (id, options) =>
      getTool<SepilotReadableAppRecord>(
        `${v1}/apps/${enc(id)}${options?.includeHtml ? '?includeHtml=true' : ''}`,
      ),
    search: (query, options) =>
      sendTool<SepilotReadableAppSearchResult[]>('POST', `${v1}/apps/search`, {
        query,
        ...options,
      }),
    mutate: (id, mutations, options) =>
      sendTool<AppsMutationResult>('POST', `${v1}/apps/${enc(id)}/mutate`, {
        mutations,
        dryRun: options?.dryRun,
      }),
    write: (id, input) =>
      sendTool<SepilotReadableAppRecord>('PUT', `${v1}/apps/${enc(id)}/data`, input),
  }
}

export { CapabilityUnavailableError }
