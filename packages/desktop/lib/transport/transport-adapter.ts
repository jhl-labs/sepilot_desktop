import { hasDesktopBridge } from '@/lib/electron/bridge'

export type TransportKind = 'electron' | 'web'

export interface SelectInput {
  hasSepilotdBridge: boolean
  hasWindow: boolean
}

export function selectTransportKind(input: SelectInput): TransportKind {
  if (input.hasWindow && input.hasSepilotdBridge) return 'electron'
  return 'web'
}

export interface TransportConfig {
  daemonOrigin: string
  gatewayOrigin: string
  daemonToken: string | null
  gatewayToken: string | null
}

export interface Transport {
  kind: TransportKind
  getConfig(): Promise<TransportConfig>
  on<T = unknown>(channel: string, handler: (payload: T) => void): () => void
}

export async function createTransport(): Promise<Transport> {
  const hasWindow = typeof window !== 'undefined'
  const hasSepilotdBridge = hasWindow && hasDesktopBridge()
  const kind = selectTransportKind({ hasWindow, hasSepilotdBridge })
  if (kind === 'electron') {
    const { createElectronTransport } = await import('./electron-transport')
    return createElectronTransport()
  }
  const { createWebTransport } = await import('./web-transport')
  return createWebTransport()
}
