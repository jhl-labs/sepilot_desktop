import { createResettableStore } from './create-store'

export interface SessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  cwd?: string
  workspaceIsolation?: 'policy' | 'strict'
  provider?: string
  model?: string
  device?: string
  tags?: string[]
  personaIds?: string[]
  isPinned?: boolean
  titleDirty?: boolean
  isDraft?: boolean
  isRunning?: boolean
}

interface SessionState {
  sessions: SessionSummary[]
  activeId: string | null
  upsertSession: (s: SessionSummary) => void
  removeSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  togglePinned: (id: string) => void
  setPersonaIds: (id: string, personaIds: string[]) => void
  setActive: (id: string | null) => void
  setSessions: (next: SessionSummary[]) => void
}

const defaults = {
  sessions: [] as SessionSummary[],
  activeId: null as string | null,
}

export const MAX_SESSION_PERSONAS = 6

export function normalizeSessionPersonaIds(personaIds: readonly string[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const value of personaIds) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
    if (normalized.length === MAX_SESSION_PERSONAS) break
  }
  return normalized
}

const sortByUpdated = (list: SessionSummary[]): SessionSummary[] =>
  list.slice().sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) {
      return a.isPinned ? -1 : 1
    }
    return b.updatedAt - a.updatedAt
  })

const dedupeById = (list: SessionSummary[]): SessionSummary[] => {
  if (list.length < 2) return list
  const seen = new Set<string>()
  const out: SessionSummary[] = []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.unshift(item)
  }
  return out
}

function mergeSession(
  existing: SessionSummary | undefined,
  incoming: SessionSummary,
): SessionSummary {
  const cwd = Object.prototype.hasOwnProperty.call(incoming, 'cwd')
    ? incoming.cwd
    : existing?.cwd
  const personaIds = Object.prototype.hasOwnProperty.call(incoming, 'personaIds')
    ? normalizeSessionPersonaIds(incoming.personaIds ?? [])
    : existing?.personaIds
  const isRunning = Object.prototype.hasOwnProperty.call(incoming, 'isRunning')
    ? incoming.isRunning
    : existing?.isRunning
  return {
    ...incoming,
    cwd,
    workspaceIsolation: incoming.workspaceIsolation ?? existing?.workspaceIsolation,
    isRunning,
    ...(personaIds !== undefined ? { personaIds: [...personaIds] } : {}),
    title: existing?.titleDirty ? existing.title : incoming.title,
    createdAt: incoming.createdAt || existing?.createdAt || incoming.updatedAt,
    isPinned: existing?.isPinned ?? incoming.isPinned ?? false,
    titleDirty: existing?.titleDirty ?? incoming.titleDirty ?? false,
    isDraft: incoming.isDraft ?? false,
  }
}

function areStringArraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function areSessionsEqual(
  left: readonly SessionSummary[],
  right: readonly SessionSummary[],
): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((session, index) => {
    const other = right[index]
    return (
      other != null &&
      session.id === other.id &&
      session.title === other.title &&
      session.createdAt === other.createdAt &&
      session.updatedAt === other.updatedAt &&
      session.cwd === other.cwd &&
      session.workspaceIsolation === other.workspaceIsolation &&
      session.provider === other.provider &&
      session.model === other.model &&
      session.device === other.device &&
      session.isPinned === other.isPinned &&
      session.titleDirty === other.titleDirty &&
      session.isDraft === other.isDraft &&
      session.isRunning === other.isRunning &&
      areStringArraysEqual(session.tags, other.tags) &&
      areStringArraysEqual(session.personaIds, other.personaIds)
    )
  })
}

const { store, reset } = createResettableStore<SessionState>(
  (set, get) => ({
    ...defaults,
    upsertSession: (s: SessionSummary) => {
      const list = get().sessions
      const i = list.findIndex((x) => x.id === s.id)
      const next = i === -1 ? [...list, s] : list.slice()
      if (i === -1) {
        next[next.length - 1] = mergeSession(undefined, s)
      } else {
        next[i] = mergeSession(list[i], s)
      }
      set({ sessions: sortByUpdated(next) })
    },
    removeSession: (id: string) => {
      set({
        sessions: get().sessions.filter((x) => x.id !== id),
        activeId: get().activeId === id ? null : get().activeId,
      })
    },
    renameSession: (id: string, title: string) =>
      set({
        sessions: sortByUpdated(
          get().sessions.map((session) =>
            session.id === id
              ? { ...session, title, titleDirty: true }
              : session,
          ),
        ),
      }),
    togglePinned: (id: string) =>
      set({
        sessions: sortByUpdated(
          get().sessions.map((session) =>
            session.id === id
              ? { ...session, isPinned: !session.isPinned }
              : session,
          ),
        ),
      }),
    setPersonaIds: (id: string, personaIds: string[]) =>
      set({
        sessions: sortByUpdated(
          get().sessions.map((session) =>
            session.id === id
              ? { ...session, personaIds: normalizeSessionPersonaIds(personaIds) }
              : session,
          ),
        ),
      }),
    setActive: (id: string | null) => set({ activeId: id }),
    setSessions: (next: SessionSummary[]) =>
      set((state) => {
        const deduped = dedupeById(next)
        const existing = new Map(state.sessions.map((session) => [session.id, session]))
        const preservedDrafts = state.sessions.filter(
          (session) =>
            session.isDraft && !deduped.some((incoming) => incoming.id === session.id),
        )
        const sessions = sortByUpdated(
          dedupeById([
            ...deduped.map((session) => mergeSession(existing.get(session.id), session)),
            ...preservedDrafts,
          ]),
        )
        const activeId = sessions.some((session) => session.id === state.activeId)
          ? state.activeId
          : null
        return areSessionsEqual(state.sessions, sessions) && activeId === state.activeId
          ? state
          : { sessions, activeId }
      }),
  }),
  {
    ...defaults,
    upsertSession: () => {},
    removeSession: () => {},
    renameSession: () => {},
    togglePinned: () => {},
    setPersonaIds: () => {},
    setActive: () => {},
    setSessions: () => {},
  },
)

export const useSessionStore = store
export const resetSessionStore = reset
