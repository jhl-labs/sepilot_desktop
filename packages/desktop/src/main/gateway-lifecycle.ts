import { app } from 'electron'
import { join } from 'node:path'
import {
  type DaemonProcess,
  GatewayClient,
  launchDaemon,
  resolveGatewayInvocation,
  waitForDaemonReady,
} from '@sepilotd/api-client/node'
import {
  getDesktopDataDir,
  getDesktopGatewayOrigin,
  hasExplicitDesktopGatewayConfiguration,
  isDesktopManagedGatewayOrigin,
} from './runtime-config.js'

let gatewayProcess: DaemonProcess | null = null
let startedByDesktop = false
let gatewayLifecycleGeneration = 0
let activeGatewayStartup: {
  generation: number
  promise: Promise<GatewayStartupResult>
} | null = null

export type GatewayStartupResult =
  | { ready: true; source: 'existing' | 'spawned' }
  | {
      ready: false
      source:
        | 'cancelled'
        | 'disabled'
        | 'unconfigured'
        | 'remote'
        | 'unavailable'
        | 'timeout'
    }

const GATEWAY_ORIGIN = getDesktopGatewayOrigin()
const HEALTH_URL = `${GATEWAY_ORIGIN.replace(/\/$/, '')}/api/v1/health`
const HEALTH_PROBE_TIMEOUT_MS = 2_000
const DEFAULT_GATEWAY_PORT = '17610'
const DISABLE_GATEWAY_AUTOSTART =
  process.env.SEPILOT_DESKTOP_DISABLE_GATEWAY_AUTOSTART === '1'
const gatewayClient = new GatewayClient({ baseUrl: GATEWAY_ORIGIN })

function getGatewayUrl(): URL | null {
  try {
    return new URL(GATEWAY_ORIGIN)
  } catch {
    return null
  }
}

function canAutoStartLocalGateway(url: URL | null): boolean {
  if (DISABLE_GATEWAY_AUTOSTART) return false
  return Boolean(url && isDesktopManagedGatewayOrigin(GATEWAY_ORIGIN))
}

async function isGatewayRunning(): Promise<boolean> {
  return gatewayClient.health({
    signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
  })
}

function isGatewayStartupCancelled(generation: number): boolean {
  return generation !== gatewayLifecycleGeneration
}

function cancelledGatewayStartup(): GatewayStartupResult {
  return { ready: false, source: 'cancelled' }
}

function detachGatewayProcess(process: DaemonProcess): boolean {
  if (gatewayProcess !== process) return false
  gatewayProcess = null
  startedByDesktop = false
  return true
}

function stopGatewayProcess(process: DaemonProcess): void {
  try {
    process.stop()
  } catch (error) {
    console.warn('[gateway-lifecycle] failed to stop gateway process', error)
  }
}

async function startGatewayForGeneration(
  generation: number,
): Promise<GatewayStartupResult> {
  if (DISABLE_GATEWAY_AUTOSTART) {
    startedByDesktop = false
    return { ready: false, source: 'disabled' }
  }
  if (!hasExplicitDesktopGatewayConfiguration()) {
    startedByDesktop = false
    return { ready: false, source: 'unconfigured' }
  }

  let running: boolean
  try {
    running = await isGatewayRunning()
  } catch (error) {
    if (isGatewayStartupCancelled(generation)) {
      return cancelledGatewayStartup()
    }
    throw error
  }
  if (isGatewayStartupCancelled(generation)) {
    return cancelledGatewayStartup()
  }
  if (running) {
    startedByDesktop = false
    return { ready: true, source: 'existing' }
  }

  const gatewayUrl = getGatewayUrl()
  if (!canAutoStartLocalGateway(gatewayUrl)) {
    console.warn(
      '[gateway-lifecycle] skipping local gateway auto-start for non-local gateway origin',
      GATEWAY_ORIGIN,
    )
    startedByDesktop = false
    return { ready: false, source: 'remote' }
  }

  const invocation = resolveGatewayInvocation({
    moduleSearchRoots: [app.getAppPath()],
    resourceSearchRoots:
      typeof process.resourcesPath === 'string' ? [process.resourcesPath] : [],
    scanPnpmLayout: true,
    execPath: process.execPath,
  })

  if (!invocation) {
    console.warn('[gateway-lifecycle] could not resolve gateway invocation')
    return { ready: false, source: 'unavailable' }
  }

  const dataDir = getDesktopDataDir()
  const gatewayDir = join(dataDir, 'gateway')
  const securityDir = join(dataDir, 'security')
  const childEnv = {
    ...process.env,
    SEPILOTD_DATA_DIR: dataDir,
    GATEWAY_HOST: gatewayUrl?.hostname ?? '127.0.0.1',
    GATEWAY_PORT:
      gatewayUrl?.port
      || (gatewayUrl?.protocol === 'http:' ? '80' : DEFAULT_GATEWAY_PORT),
    GATEWAY_CACHE_DIR: gatewayDir,
    GATEWAY_CACHE_PATH: join(gatewayDir, 'gateway.db'),
    GATEWAY_TOKEN_PATH: join(securityDir, 'gateway.token'),
  } as Record<string, string>

  const launchedProcess = launchDaemon(invocation, { env: childEnv })
  if (isGatewayStartupCancelled(generation)) {
    stopGatewayProcess(launchedProcess)
    return cancelledGatewayStartup()
  }
  gatewayProcess = launchedProcess
  startedByDesktop = true

  let ready: boolean
  try {
    ready = await waitForDaemonReady(HEALTH_URL)
  } catch (error) {
    if (
      isGatewayStartupCancelled(generation)
      || gatewayProcess !== launchedProcess
    ) {
      return cancelledGatewayStartup()
    }
    if (detachGatewayProcess(launchedProcess)) {
      stopGatewayProcess(launchedProcess)
    }
    throw error
  }
  if (
    isGatewayStartupCancelled(generation)
    || gatewayProcess !== launchedProcess
  ) {
    return cancelledGatewayStartup()
  }
  if (!ready) {
    console.warn(
      '[gateway-lifecycle] gateway did not become ready within 10 seconds',
    )
    if (detachGatewayProcess(launchedProcess)) {
      stopGatewayProcess(launchedProcess)
    }
    return { ready: false, source: 'timeout' }
  }
  return { ready: true, source: 'spawned' }
}

export function startGateway(): Promise<GatewayStartupResult> {
  const active = activeGatewayStartup
  if (active && active.generation === gatewayLifecycleGeneration) {
    return active.promise
  }
  if (startedByDesktop && gatewayProcess) {
    return Promise.resolve({ ready: true, source: 'spawned' })
  }

  const generation = gatewayLifecycleGeneration
  const promise = startGatewayForGeneration(generation)
  activeGatewayStartup = { generation, promise }
  const clearActiveStartup = () => {
    if (activeGatewayStartup?.promise === promise) {
      activeGatewayStartup = null
    }
  }
  void promise.then(clearActiveStartup, clearActiveStartup)
  return promise
}

export function stopGateway(): void {
  gatewayLifecycleGeneration += 1
  activeGatewayStartup = null

  const process = gatewayProcess
  gatewayProcess = null
  const shouldStop = startedByDesktop && process != null
  startedByDesktop = false
  if (!shouldStop || !process) return

  stopGatewayProcess(process)
}
