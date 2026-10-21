import type {
  DaemonConfig,
  DaemonConfigUpdateInput,
  DaemonConfigUpdateResult,
} from '@sepilotd/api-client'
import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

interface ApiEnvelope<T> {
  data?: T
}

function unwrap<T>(value: T | ApiEnvelope<T>): T {
  if (value && typeof value === 'object' && 'data' in value) {
    const data = (value as ApiEnvelope<T>).data
    if (data !== undefined) return data
  }
  return value as T
}

export interface ConfigApi {
  get: () => Promise<DaemonConfig>
  update: (updates: DaemonConfigUpdateInput) => Promise<DaemonConfigUpdateResult>
}

export async function createConfigApi(transport: Transport): Promise<ConfigApi> {
  const http = await makeHttp(transport)
  return {
    get: async () =>
      unwrap(await getJson<DaemonConfig | ApiEnvelope<DaemonConfig>>(http, '/api/v1/config', 'config')),
    update: async (updates) =>
      unwrap(
        await sendJson<DaemonConfigUpdateResult | ApiEnvelope<DaemonConfigUpdateResult>>(
          http,
          'PUT',
          '/api/v1/config',
          updates,
          'config',
        ),
      ),
  }
}
