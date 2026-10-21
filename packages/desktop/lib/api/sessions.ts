import type {
  DaemonSessionMeta,
  DaemonSessionList,
  DaemonSessionsWatchPayload,
} from '@sepilotd/api-client/daemon/types'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { SessionSummary } from '@/lib/store/session-store'
import { normalizeSessionPersonaIds } from '@/lib/store/session-store'
import { getDesktopApi } from '@/lib/electron/bridge'
import { makeDaemonRequestContext } from './_daemon'

interface BranchSessionResult {
  branchId: string
  sourceId: string
  copiedEvents: number
}

export interface SessionsApi {
  list: (query?: string) => Promise<SessionSummary[]>
  watch: (
    onSnapshot: (sessions: SessionSummary[]) => void,
  ) => Promise<(() => void) | null>
  create: (title?: string, cwd?: string) => Promise<SessionSummary>
  updateWorkspace: (id: string, cwd: string | null) => Promise<SessionSummary>
  updateWorkspaceIsolation: (id: string, isolation: 'policy' | 'strict') => Promise<SessionSummary>
  updatePersonas: (id: string, personaIds: string[]) => Promise<SessionSummary>
  transcriptTurn: (
    id: string,
    input: {
      userContent: string
      assistantContent?: string
      title?: string
      provider?: string
      model?: string
      cwd?: string
      tags?: string[]
    },
  ) => Promise<SessionSummary>
  remove: (id: string) => Promise<void>
  exportMarkdown: (id: string) => Promise<string>
  exportJson: (id: string) => Promise<string>
  branch: (
    id: string,
    fromEventIndex?: number,
  ) => Promise<BranchSessionResult>
}

export interface RawSession {
  id: string
  title?: string
  cwd?: string | null
  workspaceIsolation?: 'policy' | 'strict'
  created_at?: number | string
  createdAt?: number | string
  updated_at?: number | string
  updatedAt?: number | string
  provider?: string
  model?: string
  device?: string
  tags?: string[]
  personaIds?: string[]
  isRunning?: boolean
}

function createDraftId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`
}

export function createDraftSession(title?: string, cwd?: string | null): SessionSummary {
  const now = Date.now()
  return {
    id: createDraftId(),
    title: title?.trim() || '새 대화',
    ...(cwd?.trim() ? { cwd: cwd.trim() } : {}),
    createdAt: now,
    updatedAt: now,
    tags: [],
    isDraft: true,
  }
}

function toTimestamp(
  value: number | string | undefined,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) {
      const numeric = Number.parseInt(value, 10)
      if (Number.isFinite(numeric)) {
        return numeric
      }
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return fallback
}

export function mapSession(raw: RawSession): SessionSummary {
  const updatedAt = toTimestamp(raw.updatedAt ?? raw.updated_at, Date.now())
  const createdAt = toTimestamp(raw.createdAt ?? raw.created_at, updatedAt)
  return {
    id: raw.id,
    title: raw.title ?? '새 대화',
    ...(raw.cwd?.trim() ? { cwd: raw.cwd.trim() } : {}),
    ...(raw.workspaceIsolation ? { workspaceIsolation: raw.workspaceIsolation } : {}),
    createdAt,
    updatedAt,
    provider: raw.provider,
    model: raw.model,
    device: raw.device,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    ...(Array.isArray(raw.personaIds)
      ? { personaIds: normalizeSessionPersonaIds(raw.personaIds) }
      : {}),
    isRunning: raw.isRunning ?? false,
    isDraft: false,
  }
}

function mapDaemonSession(raw: DaemonSessionMeta): SessionSummary {
  return mapSession({
    id: raw.id,
    title: raw.title,
    cwd: raw.cwd,
    workspaceIsolation: raw.workspaceIsolation,
    createdAt: raw.createdAt,
    updated_at: raw.updatedAt,
    provider: raw.provider,
    model: raw.model,
    device: raw.device,
    tags: raw.tags,
    personaIds: raw.personaIds,
    isRunning: raw.isRunning,
  })
}

export async function createSessionsApi(
  transport: Transport,
): Promise<SessionsApi> {
  const desktopApi = getDesktopApi()
  const daemon = await makeDaemonRequestContext(transport)

  return {
    async list(query) {
      const normalizedQuery = query?.trim() || undefined
      if (desktopApi) {
        const raw = await desktopApi.sessions(normalizedQuery, { perPage: 100 })
        return raw.items.map(mapDaemonSession)
      }
      const searchParams = new URLSearchParams()
      searchParams.set('perPage', '100')
      if (normalizedQuery) {
        searchParams.set('query', normalizedQuery)
      }
      const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : ''
      const r = await fetch(daemon.url(`/sessions${suffix}`), {
        headers: daemon.headers(),
      })
      if (!r.ok) throw new Error(`sessions.list failed (${r.status})`)
      const raw = (await r.json()) as { data: DaemonSessionList }
      return raw.data.items.map(mapDaemonSession)
    },
    async watch(onSnapshot) {
      const watchSessions = desktopApi?.watchSessions
      if (typeof watchSessions !== 'function') return null
      return await watchSessions.call(
        desktopApi,
        (event: DaemonSessionsWatchPayload) => {
          if (event.type !== 'snapshot') return
          onSnapshot(event.sessions.items.map(mapDaemonSession))
        },
      )
    },
    async create(title, cwd) {
      const r = await fetch(daemon.url('/sessions'), {
        method: 'POST',
        headers: daemon.headers(),
        body: JSON.stringify({
          ...(title?.trim() ? { title: title.trim() } : {}),
          ...(cwd?.trim() ? { cwd: cwd.trim() } : {}),
        }),
      })
      if (!r.ok) throw new Error(`sessions.create failed (${r.status})`)
      const raw = (await r.json()) as { data: DaemonSessionMeta }
      return mapDaemonSession(raw.data)
    },
    async updateWorkspace(id, cwd) {
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: daemon.headers(),
        body: JSON.stringify({ cwd }),
      })
      if (!r.ok) throw new Error(`sessions.updateWorkspace failed (${r.status})`)
      const raw = (await r.json()) as { data?: DaemonSessionMeta } & DaemonSessionMeta
      const updated = mapDaemonSession(raw.data ?? raw)
      return cwd === null ? { ...updated, cwd: undefined } : updated
    },
    async updateWorkspaceIsolation(id, workspaceIsolation) {
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: daemon.headers(),
        body: JSON.stringify({ workspaceIsolation }),
      })
      if (!r.ok) throw new Error(`sessions.updateWorkspaceIsolation failed (${r.status})`)
      const raw = (await r.json()) as { data?: DaemonSessionMeta } & DaemonSessionMeta
      const updated = mapDaemonSession(raw.data ?? raw)
      if (updated.workspaceIsolation !== workspaceIsolation) {
        throw new Error('Daemon did not confirm the execution boundary; update the daemon first.')
      }
      return updated
    },
    async updatePersonas(id, personaIds) {
      const normalized = normalizeSessionPersonaIds(personaIds)
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: daemon.headers(),
        body: JSON.stringify({ personaIds: normalized }),
      })
      if (!r.ok) throw new Error(`sessions.updatePersonas failed (${r.status})`)
      const raw = (await r.json()) as { data?: DaemonSessionMeta } & DaemonSessionMeta
      return {
        ...mapDaemonSession(raw.data ?? raw),
        personaIds: normalized,
      }
    },
    async transcriptTurn(id, input) {
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(id)}/transcript-turn`), {
        method: 'POST',
        headers: daemon.headers(),
        body: JSON.stringify(input),
      })
      if (!r.ok) throw new Error(`sessions.transcriptTurn failed (${r.status})`)
      const raw = (await r.json()) as { data: DaemonSessionMeta }
      return mapDaemonSession(raw.data)
    },
    async remove(id) {
      if (desktopApi) {
        await desktopApi.deleteSession(id)
        return
      }
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: daemon.headers(),
      })
      if (!r.ok && r.status !== 404)
        throw new Error(`sessions.remove failed (${r.status})`)
    },
    async exportMarkdown(id) {
      const r = await fetch(
        daemon.url(`/sessions/${encodeURIComponent(id)}/export?format=markdown`),
        { headers: daemon.headers() },
      )
      if (!r.ok) throw new Error(`sessions.export failed (${r.status})`)
      return await r.text()
    },
    async exportJson(id) {
      const r = await fetch(
        daemon.url(`/sessions/${encodeURIComponent(id)}/export?format=json`),
        { headers: daemon.headers() },
      )
      if (!r.ok) throw new Error(`sessions.exportJson failed (${r.status})`)
      return await r.text()
    },
    async branch(id, fromEventIndex) {
      const r = await fetch(
        daemon.url(`/sessions/${encodeURIComponent(id)}/branch`),
        {
          method: 'POST',
          headers: daemon.headers(),
          body: JSON.stringify(
            fromEventIndex == null ? {} : { fromEventIndex },
          ),
        },
      )
      if (!r.ok) throw new Error(`sessions.branch failed (${r.status})`)
      const raw = (await r.json()) as { data: BranchSessionResult }
      return raw.data
    },
  }
}
