import type { SepilotDesktopApi } from '@sepilotd/api-client'

export interface DesktopNotificationDiagnostics {
  platform: NodeJS.Platform
  nativeSupported: boolean
  nativeDisabledByEnv: boolean
  appUserModelId: string | null
  iconResolved: boolean
}

export interface DesktopAppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface SepilotdBridge {
  platform?: NodeJS.Platform
  appInfo?(): Promise<DesktopAppInfo>
  invoke?<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  on?<T = unknown>(
    channel: string,
    handler: (payload: T) => void,
  ): () => void
  quickInput?: {
    publish: (text: string) => Promise<{ ok: true } | void>
  }
  notifications?: {
    onPush: <T = unknown>(handler: (payload: T) => void) => () => void
    publish?: (payload: unknown) => Promise<void>
    open?: (url?: string | null) => Promise<void>
    dismiss?: () => Promise<void>
    getDiagnostics?: () => Promise<DesktopNotificationDiagnostics>
  }
  update?: {
    onAvailable: (handler: (payload: UpdateEventPayload) => void) => () => void
    onDownloaded: (handler: (payload: UpdateEventPayload) => void) => () => void
    install: () => Promise<void>
  }
}

export interface UpdateEventPayload {
  version: string
  releaseNotes: string | null
}

declare global {
  interface Window {
    sepilotd?: SepilotdBridge
    sepilot: SepilotDesktopApi
  }
}

function createLegacyBridge(api: SepilotDesktopApi): SepilotdBridge {
  return {
    invoke: async <T>(channel: string): Promise<T> => {
      if (channel !== 'sepilot:get-transport-config') {
        throw new Error(`unsupported legacy desktop invoke channel: ${channel}`)
      }

      const config = await api.config()
      const daemonOrigin = `http://${config.daemon.host}:${config.daemon.port}`
      const gatewayOrigin = config.gateway.url
      return {
        daemonOrigin,
        gatewayOrigin,
        daemonToken: null,
        gatewayToken: null,
      } as T
    },
    on: () => () => {},
    update: {
      onAvailable: (handler) => {
        api.onUpdateAvailable?.((version) => handler({ version, releaseNotes: null }))
        return () => {}
      },
      onDownloaded: (handler) => {
        api.onUpdateDownloaded?.((version) => handler({ version, releaseNotes: null }))
        return () => {}
      },
      install: async () => {},
    },
  }
}

function resolveBridge(): SepilotdBridge | null {
  if (typeof window === 'undefined') return null
  if (window.sepilotd) {
    if (window.sepilotd.invoke) return window.sepilotd
    if (window.sepilot) {
      const legacy = createLegacyBridge(window.sepilot)
      return {
        ...window.sepilotd,
        invoke: window.sepilotd.invoke ?? legacy.invoke,
      }
    }
    return window.sepilotd
  }
  if (window.sepilot) return createLegacyBridge(window.sepilot)
  return null
}

const noopUnsubscribe = () => {}
const warnedSubscriptionChannels = new Set<string>()

function warnUnavailableSubscription(channel: string, error: unknown): void {
  if (warnedSubscriptionChannels.has(channel)) return
  warnedSubscriptionChannels.add(channel)
  const detail = error instanceof Error ? error.message : String(error)
  console.warn(
    `[desktop] preload channel "${channel}" is unavailable; restart Electron to activate the latest bridge. ${detail}`,
  )
}

export function hasDesktopBridge(): boolean {
  return resolveBridge() != null
}

export function getDesktopPlatform(): NodeJS.Platform | null {
  if (typeof window === 'undefined') return null
  return resolveBridge()?.platform ?? null
}

export async function getDesktopAppInfo(): Promise<DesktopAppInfo | null> {
  const appInfo = resolveBridge()?.appInfo
  if (!appInfo) return null
  try {
    return await appInfo()
  } catch {
    return null
  }
}

export function getDesktopApi(): SepilotDesktopApi | null {
  if (typeof window === 'undefined') return null
  return window.sepilot ?? null
}

export function requireDesktopBridge(): SepilotdBridge {
  const bridge = resolveBridge()
  if (!bridge) throw new Error('preload bridge not available')
  return bridge
}

export function onDesktopChannel<T = unknown>(
  channel: string,
  handler: (payload: T) => void,
): () => void {
  const subscribe = resolveBridge()?.on
  if (!subscribe) return noopUnsubscribe

  try {
    const unsubscribe = subscribe(channel, handler)
    return typeof unsubscribe === 'function' ? unsubscribe : noopUnsubscribe
  } catch (error) {
    warnUnavailableSubscription(channel, error)
    return noopUnsubscribe
  }
}

export class DesktopBridgeUnavailableError extends Error {
  readonly code = 'DESKTOP_BRIDGE_UNAVAILABLE'

  constructor(
    readonly channel: string,
    cause: unknown,
  ) {
    super(
      '실행 중인 SEPilot Desktop이 이 기능을 지원하지 않습니다. 창만 닫거나 새로고침하지 말고, 트레이 메뉴에서 Desktop을 완전히 종료한 뒤 다시 실행하세요. 개발 모드에서는 Electron도 다시 시작해야 합니다. 계속되면 최신 Desktop으로 업데이트하세요.',
      { cause },
    )
    this.name = 'DesktopBridgeUnavailableError'
  }
}

function isMissingInvokeCapability(channel: string, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const missingHandler = `No handler registered for '${channel}'`
  return (
    message === `sepilotd bridge: invoke channel '${channel}' is not allowed` ||
    message === `unsupported legacy desktop invoke channel: ${channel}` ||
    message === missingHandler ||
    message === `Error invoking remote method '${channel}': Error: ${missingHandler}`
  )
}

export async function invokeDesktop<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T | undefined> {
  try {
    return await resolveBridge()?.invoke?.<T>(channel, ...args)
  } catch (error) {
    if (isMissingInvokeCapability(channel, error)) {
      throw new DesktopBridgeUnavailableError(channel, error)
    }
    throw error
  }
}

export async function publishQuickInput(text: string): Promise<boolean> {
  const publish = resolveBridge()?.quickInput?.publish
  if (!publish) return false
  await publish(text)
  return true
}

export function onNotificationPush<T = unknown>(
  handler: (payload: T) => void,
): () => void {
  return resolveBridge()?.notifications?.onPush<T>(handler) ?? (() => {})
}

export async function publishDesktopNotification(
  payload: unknown,
): Promise<boolean> {
  const publish = resolveBridge()?.notifications?.publish
  if (!publish) return false
  await publish(payload)
  return true
}

export async function openDesktopNotification(url?: string | null): Promise<boolean> {
  const open = resolveBridge()?.notifications?.open
  if (!open) return false
  await open(url)
  return true
}

export async function dismissDesktopNotification(): Promise<boolean> {
  const dismiss = resolveBridge()?.notifications?.dismiss
  if (!dismiss) return false
  await dismiss()
  return true
}

export async function getDesktopNotificationDiagnostics(): Promise<DesktopNotificationDiagnostics | null> {
  const getter = resolveBridge()?.notifications?.getDiagnostics
  if (!getter) return null
  try {
    return await getter()
  } catch {
    return null
  }
}

export function onUpdateAvailable(
  handler: (payload: UpdateEventPayload) => void,
): () => void {
  return resolveBridge()?.update?.onAvailable(handler) ?? (() => {})
}

export function onUpdateDownloaded(
  handler: (payload: UpdateEventPayload) => void,
): () => void {
  return resolveBridge()?.update?.onDownloaded(handler) ?? (() => {})
}

export async function installDownloadedUpdate(): Promise<boolean> {
  const install = resolveBridge()?.update?.install
  if (!install) return false
  await install()
  return true
}
