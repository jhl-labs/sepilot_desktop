import { getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export type BrowserTransportKind = 'extension' | 'cdp'

export interface BrowserFrame {
  image: string
  title: string
  url: string
  capturedAt: number
}

export interface BrowserConnection {
  id: string
  label: string
  sessionId: string | null
  mode: 'human' | 'agent'
  activity: string
  frame?: BrowserFrame
  transport?: BrowserTransportKind
  capabilities?: { refs: boolean; console: boolean; network: boolean }
}

export interface BrowserCdpStatus {
  available: boolean
  reason?: 'disabled' | 'not_enabled' | 'unsupported_platform' | 'invalid_endpoint'
  instruction?: string
  userDataDir?: string
}

export interface BrowserCdpTab {
  targetId: string
  url: string
  title: string
}

export async function createRemoteBrowserApi(transport: Transport) {
  const http = await makeHttp(transport)
  return {
    list: () => getJson<BrowserConnection[]>(http, '/api/v1/browser/connections', 'browser'),
    control: (id: string, sessionId: string, mode: 'human' | 'agent') =>
      sendJson(http, 'POST', '/api/v1/browser/control', { id, sessionId, mode }, 'browser'),
    disconnect: (id: string) =>
      sendJson(http, 'POST', '/api/v1/browser/disconnect', { id }, 'browser'),
    cdpStatus: () => getJson<BrowserCdpStatus>(http, '/api/v1/browser/cdp/status', 'browser'),
    cdpConnect: (label?: string) =>
      sendJson<{ id: string; tabs: BrowserCdpTab[] }>(
        http,
        'POST',
        '/api/v1/browser/cdp/connect',
        label ? { label } : {},
        'browser',
      ),
    cdpAttach: (id: string, targetId: string) =>
      sendJson<{ id: string }>(http, 'POST', '/api/v1/browser/cdp/attach', { id, targetId }, 'browser'),
    cdpCancel: (id: string) =>
      sendJson(http, 'POST', '/api/v1/browser/cdp/cancel', { id }, 'browser'),
    issueToken: () =>
      sendJson<{ data: { id: string; token: string } }>(
        http,
        'POST',
        '/api/v1/auth/tokens',
        {
          label: 'Browser Companion',
          scopes: ['browser'],
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        'browser',
      ),
    revokeToken: (id: string) =>
      sendJson(
        http,
        'DELETE',
        `/api/v1/auth/tokens/${encodeURIComponent(id)}`,
        undefined,
        'browser',
      ),
  }
}
