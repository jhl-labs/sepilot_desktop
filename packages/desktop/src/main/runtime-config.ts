import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  resolveLocalDaemonEndpoint,
  type LocalDaemonEndpoint,
} from '@sepilotd/api-client/node'
import { loadDesktopSettings } from './desktop-settings.js'
import {
  isLocalHttpServiceOrigin,
  serviceOriginsEqual,
} from '../shared/service-origin.js'

const DEFAULT_GATEWAY_ORIGIN = 'http://127.0.0.1:17610'

function isManagedLocalHttpOrigin(origin: string, managedOrigin: string): boolean {
  return isLocalHttpServiceOrigin(origin)
    && serviceOriginsEqual(origin, managedOrigin)
}

export function getDesktopDataDir(): string {
  const explicit = process.env.SEPILOTD_DATA_DIR?.trim()
  if (explicit) return explicit
  return join(homedir(), '.sepilotd')
}

export function getDesktopDataDirCandidates(): string[] {
  const primary = getDesktopDataDir()
  const legacy = join(homedir(), '.sepilotd')
  return primary === legacy ? [primary] : [primary, legacy]
}

export function getDesktopDaemonOrigin(): string {
  const saved = loadDesktopSettings().daemonUrl
  if (saved) return saved
  return getDesktopManagedDaemonOrigin()
}

export function getDesktopLocalDaemonEndpoint(): LocalDaemonEndpoint {
  return resolveLocalDaemonEndpoint({ dataDir: getDesktopDataDir() })
}

export function getDesktopManagedDaemonOrigin(): string {
  return (
    process.env.SEPILOT_DESKTOP_DAEMON_ORIGIN?.trim()
    || getDesktopLocalDaemonEndpoint().origin
  )
}

export function getDesktopGatewayOrigin(): string {
  const saved = loadDesktopSettings().gatewayUrl
  if (saved) return saved
  return getDesktopManagedGatewayOrigin()
}

export function getDesktopManagedGatewayOrigin(): string {
  return (
    process.env.SEPILOT_DESKTOP_GATEWAY_ORIGIN?.trim()
    ?? DEFAULT_GATEWAY_ORIGIN
  )
}

export function hasExplicitDesktopGatewayConfiguration(): boolean {
  if (process.env.SEPILOT_DESKTOP_ENABLE_GATEWAY_AUTOSTART === '1') return true
  if (process.env.SEPILOT_DESKTOP_GATEWAY_ORIGIN?.trim()) return true
  if (process.env.SEPILOT_DESKTOP_GATEWAY_BIN?.trim()) return true
  if (process.env.SEPILOTD_GATEWAY_BIN?.trim()) return true
  return Boolean(loadDesktopSettings().gatewayUrl)
}

export function isDesktopManagedDaemonOrigin(
  origin = getDesktopDaemonOrigin(),
): boolean {
  return isManagedLocalHttpOrigin(origin, getDesktopManagedDaemonOrigin())
}

export function isDesktopManagedGatewayOrigin(
  origin = getDesktopGatewayOrigin(),
): boolean {
  return isManagedLocalHttpOrigin(origin, getDesktopManagedGatewayOrigin())
}
