import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type {
  DaemonNetworkConfig,
  DaemonNetworkStatus,
} from '@sepilotd/api-client'

export type NetworkConfig = DaemonNetworkConfig
export type NetworkStatus = DaemonNetworkStatus

export interface NetworkProbeResult {
  ok: boolean
  reachable?: boolean
  latencyMs?: number
  status?: number
  reason?: string
}

export interface NetworkApi {
  get: () => Promise<NetworkConfig>
  getStatus: () => Promise<NetworkStatus>
  set: (next: NetworkConfig) => Promise<NetworkConfig>
  probe: (url: string) => Promise<NetworkProbeResult>
}

export async function createNetworkApi(transport: Transport): Promise<NetworkApi> {
  const http = await makeHttp(transport)
  return {
    get: () => getJson<NetworkConfig>(http, '/network', 'network'),
    getStatus: () => getJson<NetworkStatus>(http, '/network/status', 'network'),
    set: (next) => sendJson<NetworkConfig>(http, 'PUT', '/network', next, 'network'),
    probe: (url) =>
      sendJson<NetworkProbeResult>(http, 'POST', '/network/probe', { url }, 'network'),
  }
}
export { CapabilityUnavailableError }
