import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface SettingsJsonApi {
  get: () => Promise<Record<string, unknown>>
  set: (next: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export async function createSettingsJsonApi(
  transport: Transport,
): Promise<SettingsJsonApi> {
  const http = await makeHttp(transport)
  return {
    get: () =>
      getJson<Record<string, unknown>>(http, '/settings/json', 'settings-json'),
    set: (next) =>
      sendJson<Record<string, unknown>>(
        http,
        'PUT',
        '/settings/json',
        next,
        'settings-json',
      ),
  }
}
