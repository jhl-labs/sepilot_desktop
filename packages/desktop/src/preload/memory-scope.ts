import { fetchSystemScope, type MemoryScope } from '@sepilotd/api-client'

const cache = new Map<string, Promise<MemoryScope | null>>()

export function getDaemonMemoryScope(
  baseUrl: string,
  token: string | null,
): () => Promise<MemoryScope | null> {
  return () => {
    const key = `${baseUrl}::${token ?? ''}`
    let pending = cache.get(key)
    if (!pending) {
      pending = fetchSystemScope(baseUrl, token).then((scope) => {
        if (!scope) {
          cache.delete(key)
        }
        return scope
      }, (error) => {
        cache.delete(key)
        throw error
      })
      cache.set(key, pending)
    }
    return pending
  }
}

export function requireDaemonMemoryScope(
  baseUrl: string,
  token: string | null,
): () => Promise<MemoryScope> {
  const resolveScope = getDaemonMemoryScope(baseUrl, token)
  return async () => {
    const scope = await resolveScope()
    if (!scope) throw new Error('daemon memory scope is unavailable')
    return scope
  }
}
