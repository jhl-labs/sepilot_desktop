import type {
  DaemonAgentDescriptor,
  DaemonRoleBot,
  DaemonAgentGraphSnapshot,
  DaemonUserAgentInput,
} from '@sepilotd/api-client'
import { makeDaemonRequestContext } from './_daemon'
import type { Transport } from '@/lib/transport/transport-adapter'

interface ApiEnvelope<T> {
  data?: T
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as ApiEnvelope<T>).data
    if (data !== undefined) return data
  }
  return payload as T
}

export interface AgentsApi {
  bots: () => Promise<DaemonRoleBot[]>
  list: () => Promise<DaemonAgentDescriptor[]>
  graphs: () => Promise<DaemonAgentGraphSnapshot[]>
  create: (input: DaemonUserAgentInput) => Promise<DaemonAgentDescriptor>
  remove: (id: string) => Promise<void>
}

export async function createAgentsApi(transport: Transport): Promise<AgentsApi> {
  const daemon = await makeDaemonRequestContext(transport)

  async function errorText(response: Response, path: string): Promise<string> {
    const fallback = `${path} failed (${response.status})`
    const raw = await response.text().catch(() => '')
    if (!raw.trim()) return fallback
    try {
      const payload = JSON.parse(raw) as {
        error?: { code?: unknown; message?: unknown } | string
      }
      if (typeof payload.error === 'string') return `${fallback}: ${payload.error}`
      const code = typeof payload.error?.code === 'string' ? payload.error.code : undefined
      const message =
        typeof payload.error?.message === 'string' ? payload.error.message : undefined
      if (code && message) return `${fallback}: ${code}: ${message}`
      if (message) return `${fallback}: ${message}`
    } catch {
    }
    return `${fallback}: ${raw.trim()}`
  }

  async function requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(daemon.url(path), {
      method,
      headers: daemon.headers(),
      body: body == null ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(await errorText(response, path))
    }
    if (response.status === 204) return undefined as T
    const payload = (await response.json()) as T | ApiEnvelope<T>
    return unwrap(payload)
  }

  return {
    bots: () => requestJson<DaemonRoleBot[]>('GET', '/bots'),
    list: () => requestJson<DaemonAgentDescriptor[]>('GET', '/agents'),
    graphs: () => requestJson<DaemonAgentGraphSnapshot[]>('GET', '/agents/graphs'),
    create: (input) => requestJson<DaemonAgentDescriptor>('POST', '/agents', input),
    remove: (id) => requestJson<void>('DELETE', `/agents/${encodeURIComponent(id)}`),
  }
}
