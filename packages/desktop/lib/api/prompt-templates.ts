import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface PromptTemplate {
  id: string
  title: string
  body: string
}

export interface PromptTemplatesApi {
  list: () => Promise<PromptTemplate[]>
  upsert: (t: Partial<PromptTemplate> & { title: string }) => Promise<PromptTemplate>
  remove: (id: string) => Promise<void>
}

export async function createPromptTemplatesApi(
  transport: Transport,
): Promise<PromptTemplatesApi> {
  const http = await makeHttp(transport)
  return {
    list: () =>
      getJson<PromptTemplate[]>(http, '/prompt-templates', 'prompt-templates'),
    upsert: (t) =>
      sendJson<PromptTemplate>(
        http,
        'POST',
        '/prompt-templates',
        t,
        'prompt-templates',
      ),
    remove: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/prompt-templates/${encodeURIComponent(id)}`,
        {},
        'prompt-templates',
      ),
  }
}
export { CapabilityUnavailableError }
