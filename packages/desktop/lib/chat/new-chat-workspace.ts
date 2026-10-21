import type { SessionSummary } from '@/lib/store/session-store'

function normalizeWorkspace(value: string | null | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function isMicroAppSession(session: SessionSummary): boolean {
  const tags = session.tags ?? []
  if (tags.some((tag) => tag === 'micro-app' || tag === 'surface:micro-apps')) {
    return true
  }

  return (
    session.title.startsWith('You are the embedded chat agent for one sepilotd Desktop micro app.')
    || session.title.startsWith('You are the sepilotd Apps Code Agent.')
  )
}

export function resolveNewChatWorkspace(input: {
  sessions: readonly SessionSummary[]
  activeId: string | null
  defaultWorkingDir: string | null | undefined
}): string | undefined {
  const activeSession = input.activeId
    ? input.sessions.find((session) => session.id === input.activeId)
    : undefined
  if (activeSession && !isMicroAppSession(activeSession)) {
    const activeWorkspace = normalizeWorkspace(activeSession.cwd)
    if (activeWorkspace) return activeWorkspace
  }

  const defaultWorkspace = normalizeWorkspace(input.defaultWorkingDir)
  if (defaultWorkspace) return defaultWorkspace

  let mostRecent: SessionSummary | undefined
  for (const session of input.sessions) {
    if (isMicroAppSession(session) || !normalizeWorkspace(session.cwd)) continue
    if (!mostRecent || session.updatedAt > mostRecent.updatedAt) {
      mostRecent = session
    }
  }
  return normalizeWorkspace(mostRecent?.cwd)
}
