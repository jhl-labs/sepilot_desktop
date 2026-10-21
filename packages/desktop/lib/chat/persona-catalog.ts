import { createPersonaApi } from '@/lib/api/persona'
import type { Persona } from '@/lib/store/persona-store'
import type { Transport } from '@/lib/transport/transport-adapter'

let cache: Persona[] | null = null
let inflight: Promise<Persona[]> | null = null

export function getPersonaCatalogSync(): Persona[] | null {
  return cache
}

export async function ensurePersonaCatalog(
  transport: Transport,
): Promise<Persona[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const api = await createPersonaApi(transport)
      const list = await api.list()
      cache = list
      return list
    } catch {
      return []
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function invalidatePersonaCatalog(): void {
  cache = null
  inflight = null
}
