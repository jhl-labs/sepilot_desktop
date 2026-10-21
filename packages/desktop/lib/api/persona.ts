import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { Persona } from '@/lib/store/persona-store'

export interface PersonaApi {
  list: () => Promise<Persona[]>
  upsert: (p: Persona) => Promise<Persona>
  remove: (id: string) => Promise<void>
  activate: (id: string) => Promise<void>
}

export async function createPersonaApi(
  transport: Transport,
): Promise<PersonaApi> {
  const http = await makeHttp(transport)
  return {
    list: () => getJson<Persona[]>(http, '/persona', 'persona'),
    upsert: (p) => sendJson<Persona>(http, 'POST', '/persona', p, 'persona'),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/persona/${encodeURIComponent(id)}`,
        {},
        'persona',
      ),
    activate: (id) =>
      sendJson<void>(
        http,
        'POST',
        `/persona/${encodeURIComponent(id)}/activate`,
        {},
        'persona',
      ),
  }
}
