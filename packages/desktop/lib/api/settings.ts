import type { Transport } from '@/lib/transport/transport-adapter'

export interface ProviderInfo {
  id: string
  label: string
  models: {
    id: string
    label: string
    contextWindow?: number
    vision?: boolean
    maxOutputTokens?: number
  }[]
}

interface GeneralSettingsDto {
  theme: 'light' | 'dark' | 'system'
  locale: 'ko' | 'en'
  workingDir: string | null
}

interface LlmSettingsDto {
  providerId: string | null
  modelId: string | null
}

export interface SettingsApi {
  listProviders: () => Promise<ProviderInfo[]>
  getGeneral: () => Promise<GeneralSettingsDto>
  setGeneral: (next: Partial<GeneralSettingsDto>) => Promise<void>
  getLlm: () => Promise<LlmSettingsDto>
  setLlm: (next: LlmSettingsDto) => Promise<void>
}

export async function createSettingsApi(
  transport: Transport,
): Promise<SettingsApi> {
  const cfg = await transport.getConfig()
  const headers = (): HeadersInit =>
    cfg.daemonToken
      ? {
          authorization: `Bearer ${cfg.daemonToken}`,
          'content-type': 'application/json',
        }
      : { 'content-type': 'application/json' }
  const u = (p: string) => `${cfg.daemonOrigin}${p}`

  async function send(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(u(path), {
      method,
      headers: headers(),
      body: body == null ? undefined : JSON.stringify(body),
    })
  }

  return {
    async listProviders() {
      const r = await send('GET', '/llm/providers')
      if (!r.ok) throw new Error('listProviders failed')
      return (await r.json()) as ProviderInfo[]
    },
    async getGeneral() {
      const r = await send('GET', '/settings/general')
      if (!r.ok) throw new Error('getGeneral failed')
      return (await r.json()) as GeneralSettingsDto
    },
    async setGeneral(next) {
      const r = await send('PUT', '/settings/general', next)
      if (!r.ok) throw new Error('setGeneral failed')
    },
    async getLlm() {
      const r = await send('GET', '/settings/llm')
      if (!r.ok) throw new Error('getLlm failed')
      return (await r.json()) as LlmSettingsDto
    },
    async setLlm(next) {
      const r = await send('PUT', '/settings/llm', next)
      if (!r.ok) throw new Error('setLlm failed')
    },
  }
}
