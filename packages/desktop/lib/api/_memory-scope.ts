import { fetchSystemScope, type MemoryScope } from '@sepilotd/api-client'

const resolvedScopes = new Map<string, MemoryScope>()
const pendingScopes = new Map<string, Promise<MemoryScope | null>>()

export class DaemonMemoryScopeUnavailableError extends Error {
  constructor() {
    super('daemon memory scope is unavailable; refusing an unscoped memory request')
    this.name = 'DaemonMemoryScopeUnavailableError'
  }
}

function scopeCacheKey(origin: string, token: string | null): string {
  return `${origin.replace(/\/$/, '')}\u0000${token ?? ''}`
}

export async function resolveDaemonMemoryScope(
  origin: string,
  token: string | null,
): Promise<MemoryScope | null> {
  const key = scopeCacheKey(origin, token)
  const cached = resolvedScopes.get(key)
  if (cached) return cached

  let pending = pendingScopes.get(key)
  if (!pending) {
    pending = fetchSystemScope(origin, token)
    pendingScopes.set(key, pending)
  }

  try {
    const scope = await pending
    if (scope) resolvedScopes.set(key, scope)
    return scope
  } finally {
    if (pendingScopes.get(key) === pending) pendingScopes.delete(key)
  }
}

export async function requireDaemonMemoryScope(
  origin: string,
  token: string | null,
): Promise<MemoryScope> {
  const scope = await resolveDaemonMemoryScope(origin, token)
  if (!scope) throw new DaemonMemoryScopeUnavailableError()
  return scope
}

export function memoryScopeHeaders(scope: MemoryScope | null): Record<string, string> {
  if (!scope) return {}

  const headers: Record<string, string> = {}
  const set = (name: string, value: string | undefined): void => {
    const normalized = value?.trim()
    if (normalized) headers[name] = normalized
  }

  set('x-memory-scope-user-id', scope.userId)
  set('x-memory-scope-channel-type', scope.channelType)
  set('x-memory-scope-channel-id', scope.channelId)
  set('x-memory-scope-session-id', scope.sessionId)
  const groups = scope.groupIds
    ?.map((entry) => entry.trim())
    .filter(Boolean)
    .join(',')
  set('x-memory-scope-groups', groups)
  return headers
}
