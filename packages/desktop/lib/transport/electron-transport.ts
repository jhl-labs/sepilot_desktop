import type { Transport, TransportConfig } from './transport-adapter'
import { requireDesktopBridge } from '@/lib/electron/bridge'

export function createElectronTransport(): Transport {
  return {
    kind: 'electron',
    async getConfig(): Promise<TransportConfig> {
      const bridge = requireDesktopBridge()
      if (!bridge.invoke) {
        throw new Error('preload invoke bridge not available')
      }
      return bridge.invoke<TransportConfig>('sepilot:get-transport-config')
    },
    on(channel, handler) {
      return requireDesktopBridge().on?.(
        channel,
        handler as (payload: unknown) => void,
      ) ?? (() => {})
    },
  }
}
