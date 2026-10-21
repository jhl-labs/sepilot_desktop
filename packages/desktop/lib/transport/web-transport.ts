import type { Transport, TransportConfig } from './transport-adapter'

const DEFAULT_DAEMON_ORIGIN = 'http://127.0.0.1:17600'
const DEFAULT_GATEWAY_ORIGIN = 'http://127.0.0.1:17610'
const DAEMON_ORIGIN_STORAGE_KEY = 'sepilot:desktop:web:daemon-origin'
const GATEWAY_ORIGIN_STORAGE_KEY = 'sepilot:desktop:web:gateway-origin'
const DAEMON_TOKEN_STORAGE_KEY = 'sepilot:desktop:web:daemon-token'
const GATEWAY_TOKEN_STORAGE_KEY = 'sepilot:desktop:web:gateway-token'

export const WEB_TRANSPORT_CONFIG_CHANGED_EVENT =
  'sepilot:desktop:web-transport-config-changed'

interface LocationLike {
  protocol: string
  hostname: string
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface ReadWebTransportOptions {
  env?: NodeJS.ProcessEnv
  location?: LocationLike | null
  localStorage?: StorageLike | null
  sessionStorage?: StorageLike | null
}

interface SaveWebTransportOptions extends ReadWebTransportOptions {
  eventTarget?: Pick<Window, 'dispatchEvent'> | null
}

type SaveWebTransportInput = Partial<{
  daemonOrigin: string | null
  gatewayOrigin: string | null
  daemonToken: string | null
  gatewayToken: string | null
}>

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function windowLocation(): LocationLike | null {
  if (typeof window === 'undefined') return null
  return window.location
}

function windowLocalStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function windowSessionStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function windowEventTarget(): Pick<Window, 'dispatchEvent'> | null {
  if (typeof window === 'undefined') return null
  return window
}

function readStorageValue(
  storage: StorageLike | null | undefined,
  key: string,
): string | null {
  return storage?.getItem(key)?.trim() ?? null
}

function normalizeEndpoint(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return trimTrailingSlash(trimmed)
  try {
    return trimTrailingSlash(new URL(trimmed).toString())
  } catch {
    return null
  }
}

function normalizeToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function persistValue(
  storage: StorageLike | null | undefined,
  key: string,
  value: string | null,
): void {
  if (!storage) return
  if (value) {
    storage.setItem(key, value)
    return
  }
  storage.removeItem(key)
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1'
    || hostname.endsWith('.localhost')
}

export function deriveWebTransportDefaults(
  location: LocationLike | null = windowLocation(),
  env: NodeJS.ProcessEnv = process.env,
): Pick<TransportConfig, 'daemonOrigin' | 'gatewayOrigin'> {
  const envDaemonOrigin = normalizeEndpoint(
    env.NEXT_PUBLIC_SEPILOTD_DAEMON_ORIGIN,
  )
  const envGatewayOrigin = normalizeEndpoint(
    env.NEXT_PUBLIC_SEPILOTD_GATEWAY_ORIGIN,
  )

  let daemonOrigin = envDaemonOrigin ?? DEFAULT_DAEMON_ORIGIN
  let gatewayOrigin = envGatewayOrigin ?? DEFAULT_GATEWAY_ORIGIN

  if (!location?.hostname) {
    return {
      daemonOrigin,
      gatewayOrigin,
    }
  }

  const protocol = location.protocol === 'https:' ? 'https:' : 'http:'
  const hostname = location.hostname
  if (!envDaemonOrigin) {
    daemonOrigin = `${protocol}//${hostname}:17600`
  }
  if (!envGatewayOrigin) {
    gatewayOrigin = `${protocol}//${hostname}:17610`
  }

  return {
    daemonOrigin,
    gatewayOrigin,
  }
}

export function readWebTransportConfig(
  options: ReadWebTransportOptions = {},
): TransportConfig {
  const defaults = deriveWebTransportDefaults(
    options.location ?? windowLocation(),
    options.env ?? process.env,
  )
  const localStorage = options.localStorage ?? windowLocalStorage()
  const sessionStorage = options.sessionStorage ?? windowSessionStorage()

  return {
    daemonOrigin:
      normalizeEndpoint(
        readStorageValue(localStorage, DAEMON_ORIGIN_STORAGE_KEY),
      ) ?? defaults.daemonOrigin,
    gatewayOrigin:
      normalizeEndpoint(
        readStorageValue(localStorage, GATEWAY_ORIGIN_STORAGE_KEY),
      ) ?? defaults.gatewayOrigin,
    daemonToken: normalizeToken(
      readStorageValue(sessionStorage, DAEMON_TOKEN_STORAGE_KEY),
    ),
    gatewayToken: normalizeToken(
      readStorageValue(sessionStorage, GATEWAY_TOKEN_STORAGE_KEY),
    ),
  }
}

export function saveWebTransportConfig(
  input: SaveWebTransportInput,
  options: SaveWebTransportOptions = {},
): TransportConfig {
  const localStorage = options.localStorage ?? windowLocalStorage()
  const sessionStorage = options.sessionStorage ?? windowSessionStorage()

  if ('daemonOrigin' in input) {
    const value = normalizeEndpoint(input.daemonOrigin)
    if (input.daemonOrigin?.trim() && !value) {
      throw new Error('유효한 daemon origin 또는 /proxy 경로를 입력하세요.')
    }
    persistValue(localStorage, DAEMON_ORIGIN_STORAGE_KEY, value)
  }

  if ('gatewayOrigin' in input) {
    const value = normalizeEndpoint(input.gatewayOrigin)
    if (input.gatewayOrigin?.trim() && !value) {
      throw new Error('유효한 gateway origin 또는 /proxy 경로를 입력하세요.')
    }
    persistValue(localStorage, GATEWAY_ORIGIN_STORAGE_KEY, value)
  }

  if ('daemonToken' in input) {
    persistValue(
      sessionStorage,
      DAEMON_TOKEN_STORAGE_KEY,
      normalizeToken(input.daemonToken),
    )
  }

  if ('gatewayToken' in input) {
    persistValue(
      sessionStorage,
      GATEWAY_TOKEN_STORAGE_KEY,
      normalizeToken(input.gatewayToken),
    )
  }

  const eventTarget = options.eventTarget ?? windowEventTarget()
  eventTarget?.dispatchEvent(new Event(WEB_TRANSPORT_CONFIG_CHANGED_EVENT))

  return readWebTransportConfig(options)
}

export function createWebTransport(): Transport {
  return {
    kind: 'web',
    async getConfig(): Promise<TransportConfig> {
      return readWebTransportConfig()
    },
    on() {
      return () => {}
    },
  }
}
