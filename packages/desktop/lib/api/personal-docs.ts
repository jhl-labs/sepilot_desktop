import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface PersonalDoc {
  id: string
  path: string
  updatedAt: number
}

export interface PersonalDocsApi {
  list: () => Promise<PersonalDoc[]>
  upsert: (d: { id?: string; path: string; content: string }) => Promise<PersonalDoc>
  remove: (id: string) => Promise<void>
}

export async function createPersonalDocsApi(
  transport: Transport,
): Promise<PersonalDocsApi> {
  const http = await makeHttp(transport)
  return {
    list: () =>
      getJson<PersonalDoc[]>(http, '/personal-docs', 'personal-docs'),
    upsert: (d) =>
      sendJson<PersonalDoc>(http, 'POST', '/personal-docs', d, 'personal-docs'),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/personal-docs/${encodeURIComponent(id)}`,
        {},
        'personal-docs',
      ),
  }
}
export { CapabilityUnavailableError }
