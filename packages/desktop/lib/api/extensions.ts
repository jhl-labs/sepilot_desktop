import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { ExtensionItem } from '@/lib/store/extensions-store'

interface ExtensionEventHandlers {
  onSnapshot: (items: ExtensionItem[]) => void
  onError: (err: Error) => void
}

export interface ExtensionsApi {
  list: () => Promise<ExtensionItem[]>
  enable: (id: string) => Promise<void>
  disable: (id: string) => Promise<void>
  install: (manifest: unknown) => Promise<{ id: string }>
  uninstall: (id: string) => Promise<void>
  events: (handlers: ExtensionEventHandlers) => () => void
}

export async function createExtensionsApi(
  transport: Transport,
): Promise<ExtensionsApi> {
  const http = await makeHttp(transport)
  const cfg = await transport.getConfig()
  const wsBase = cfg.daemonOrigin.replace(/^http/, 'ws')
  const tokenQuery = cfg.daemonToken
    ? `?token=${encodeURIComponent(cfg.daemonToken)}`
    : ''
  return {
    list: () => getJson<ExtensionItem[]>(http, '/extensions', 'extensions'),
    enable: (id) =>
      sendJson<void>(
        http,
        'POST',
        `/extensions/${encodeURIComponent(id)}/enable`,
        {},
        'extensions',
      ),
    disable: (id) =>
      sendJson<void>(
        http,
        'POST',
        `/extensions/${encodeURIComponent(id)}/disable`,
        {},
        'extensions',
      ),
    install: (manifest) =>
      sendJson<{ id: string }>(
        http,
        'POST',
        '/extensions/install',
        { manifest },
        'extensions',
      ),
    uninstall: (id) =>
      sendJson<void>(
        http,
        'DELETE',
        `/extensions/${encodeURIComponent(id)}`,
        {},
        'extensions',
      ),
    events: (h) => {
      try {
        let closedByClient = false
        const ws = new WebSocket(`${wsBase}/extensions/events${tokenQuery}`)
        ws.onmessage = (ev) => {
          try {
            h.onSnapshot(
              JSON.parse(
                typeof ev.data === 'string' ? ev.data : '',
              ) as ExtensionItem[],
            )
          } catch (err) {
            h.onError(err as Error)
          }
        }
        ws.onerror = () =>
          h.onError(new Error('extensions event stream error'))
        ws.onclose = () => {
          if (!closedByClient) {
            h.onError(new Error('extensions event stream closed'))
          }
        }
        return () => {
          closedByClient = true
          ws.close()
        }
      } catch (err) {
        h.onError(err as Error)
        return () => {}
      }
    },
  }
}
export { CapabilityUnavailableError }
