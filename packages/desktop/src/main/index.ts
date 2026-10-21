import { registerCliChatHandlers } from './cli-chat-ipc'
import { listCliModels } from './cli-models'
import { deliverTaskNotification } from './task-notification-delivery'
import { PetWindow } from './pet-window'
import { installBrowserExtension, openChromeInspect } from './browser-extension-install'
import { configureDesktopTestProfile, desktopNotificationWatchEnabled } from './test-profile'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Notification as ElectronNotification,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  protocol,
  screen,
  session,
  shell,
  type OpenDialogOptions,
} from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { readPreviewFile } from './file-preview.js'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import { autoUpdater } from 'electron-updater'
import { collectAiUsage } from './ai-usage'
import { handleDesktopAtlassianRequest } from './atlassian-dc'
import { importInstalledBrowserBookmarks, inspectGitRepoUrl, openDevTarget } from './dev-apps'
import {
  deleteDesktopKubernetesCredential,
  fetchDesktopKubernetesSnapshot,
  importDesktopRancherClusters,
} from './kubernetes'
import { startDaemon, type DaemonStartupResult } from './daemon-lifecycle'
import { startGateway, stopGateway, type GatewayStartupResult } from './gateway-lifecycle'
import { confirmAndShutdownDaemon } from './daemon-shutdown'
import { getAutoLaunchState, setAutoLaunchEnabled } from './auto-launch'
import { wireDesktopDaemonLifecycle } from './app-lifecycle'
import { configureMacDevDock, showMacDevDock } from './mac-dev-dock'
import { resolveDesktopAssetPaths } from './asset-paths'
import { buildDesktopContentSecurityPolicy } from './content-security-policy'
import {
  isAllowedMainFrameNavigation,
  isRendererPermissionAllowed,
  isHttpOrHttpsUrl,
  type MainFrameNavigationOptions,
} from './navigation-security'
import {
  APP_PROTOCOL_ENTRY_URL,
  APP_PROTOCOL_HOST,
  APP_PROTOCOL_NAME,
  appProtocolResponseHeaders,
  mapAppUrlToFile,
} from '../../electron/main/protocol/app-protocol'
import {
  DaemonClient,
  parseJsonSseStream,
  type DaemonNotificationsWatchPayload,
  type DaemonQuickInputSettings,
  type DesktopAppSaveInput,
  type DesktopCalendarAutoSyncInput,
  type DesktopCalendarGoogleDeleteInput,
  type DesktopCalendarGoogleSyncInput,
  type DesktopCalendarGoogleSyncState,
  type DesktopCalendarIcsExportInput,
  type DesktopDiagnosticsExportInput,
  type DesktopDiagnosticsExportResult,
  type DesktopRendererErrorReportInput,
  type DesktopRendererErrorReportResult,
} from '@sepilotd/api-client'
import {
  getDesktopDaemonOrigin,
  getDesktopDataDir,
  getDesktopGatewayOrigin,
  getDesktopManagedDaemonOrigin,
  getDesktopManagedGatewayOrigin,
  isDesktopManagedDaemonOrigin,
  isDesktopManagedGatewayOrigin,
} from './runtime-config'
import { loadDesktopSettings, saveDesktopSettings } from './desktop-settings'
import {
  resolveDesktopServiceToken,
  waitForDesktopServiceToken,
} from './transport-credentials'
import { TRANSPORT_CONFIG_UPDATED_CHANNEL } from '../shared/transport-events'
import {
  desktopSettingsBuildFeatures,
  requireDesktopSettingsBuildFeature,
} from '../shared/settings-build-features'
import { registerWritingDocIpc } from './writing-doc'
import { registerWikiFolderTransferIpc } from './wiki-folder-transfer'
import {
  createDesktopAppsBackupFilename,
  createDesktopAppExportFilename,
  deleteDesktopApp,
  exportDesktopAppsBackup,
  exportDesktopAppPortable,
  importDesktopAppPortable,
  listDesktopAppAudit,
  listDesktopAppDiagnostics,
  listDesktopApps,
  listDesktopAppStorageTree,
  readDesktopAppChat,
  readDesktopAppStorageFile,
  recordDesktopAppAudit,
  resetDesktopApps,
  restoreDesktopAppsBackup,
  restoreDesktopAppVersion,
  saveDesktopApp,
  saveDesktopAppChat,
  saveDesktopAppData,
  writeDesktopAppStorageFile,
} from './apps-storage'
import { checkDesktopServiceHealth } from './service-health'
import { waitForLateServiceReadiness } from './late-service-readiness'
import { fetchDesktopMarketQuotes } from './market-quotes'
import {
  commandDesktopSmartHomeDevice,
  getDesktopSmartHomeStatus,
  syncDesktopSmartHomeDevices,
} from './smart-home'
import { resolveRendererTarget } from '../../electron/main/renderer-resolver'
import type { RendererTarget } from '../../electron/main/renderer-resolver'
import {
  clampBoundsToDisplays,
  computeWindowOptions,
  loadWindowBounds,
  saveWindowBounds,
} from '../../electron/main/window-manager'
import {
  DEFAULT_QUICK_INPUT_ACCELERATOR,
  QUICK_INPUT_FALLBACK_ACCELERATORS,
  QUICK_INPUT_FORWARD_CHANNEL,
  QUICK_INPUT_OPEN_CHANNEL,
  QUICK_INPUT_PUBLISH_CHANNEL,
  QUICK_INPUT_REGISTRATION_CHANNEL,
  normalizeQuickInputAccelerator,
  normalizeQuickInputText,
  resolveQuickInputRendererTarget,
  type QuickInputRegistrationState,
} from '../../electron/main/quick-input'
import {
  NOTIFICATION_DISMISS_CHANNEL,
  NOTIFICATION_OPEN_CHANNEL,
  NOTIFICATION_OPENED_CHANNEL,
  NOTIFICATION_PUBLISH_CHANNEL,
  NOTIFICATION_PUSH_CHANNEL,
  notificationJobId,
  notificationSessionId,
  notificationTargetView,
  notificationVisibleDurationMs,
  normalizeNotificationPayload,
  resolveNotificationRendererTarget,
  type DesktopNotificationPayload,
} from '../../electron/main/notifications'
import {
  DesktopTerminalSessions,
  diagnoseShellTarget,
  readDefaultSshConfig,
  type DesktopShellStartInput,
} from './terminal-sessions'
import {
  configureDesktopCalendarAutoSync,
  configureDesktopGoogleCalendar,
  configureDesktopGoogleCalendarSelection,
  connectDesktopGoogleCalendar,
  deleteDesktopCalendarGoogleEvent,
  disconnectDesktopGoogleCalendar,
  exportDesktopCalendarIcs,
  getDesktopCalendarStatus,
  listDesktopGoogleCalendars,
  refreshDesktopCalendarAutoSync,
  startDesktopCalendarAutoSync,
  stopDesktopCalendarAutoSync,
  syncDesktopCalendarAppEvents,
} from './calendar-sync'
import {
  describeUnknownError,
  logDesktopEvent,
  sanitizeDesktopLogDetail,
  type DesktopLogSeverity,
} from './desktop-logging'
import { DesktopObservabilityIngestQueue } from './observability-ingest-queue'
import {
  isNotificationWatchUnavailableStatus,
  isNotificationWatchConnectionStable,
  notificationWatchRetryDelay,
  shouldLogNotificationWatchFailure,
} from './notification-watch-policy'
import { EventRateLimiter } from './event-rate-limiter'
import { exportDesktopDiagnostics } from './desktop-diagnostics'
import {
  DESKTOP_RELEASES_URL,
  resolveDesktopUpdatePolicy,
} from './desktop-update-policy.js'

const TEST_PROFILE = configureDesktopTestProfile(app)
let mainWindow: BrowserWindow | null = null
const petWindow = new PetWindow((action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (action === 'show-main' || action === 'studio' || action === 'chat') {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  mainWindow.webContents.send('sepilot:pet/action', action)
})
ipcMain.handle('sepilot:pet/update', (event, payload: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Pet updates require the main window')
  return petWindow.update(payload, join(app.getPath('userData'), 'pet-window-position.json'))
})
ipcMain.handle('sepilot:pet/say', (event, payload: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Pet speech requires the main window')
  return petWindow.say(payload)
})
let quickInputWindow: BrowserWindow | null = null
let notificationWindow: BrowserWindow | null = null
let notificationWindowReady = false
let quickInputRendererContext: {
  preloadPath: string
  target: RendererTarget
} | null = null
let notificationRendererContext: {
  preloadPath: string
  target: RendererTarget
} | null = null
let tray: Tray | null = null
let isQuittingApp = false
let trayHideHintShown = false
let appProtocolRegistered = false
let notificationWatchController: AbortController | null = null
let notificationWatchRetryTimer: NodeJS.Timeout | null = null
let notificationWatchRetryAttempt = 0
let notificationWatchUnavailable = false
let notificationHideTimer: NodeJS.Timeout | null = null
let notificationHideDeadline = 0
let notificationWatchBootstrapped = false
let desktopLifecycleReady = false
let mainWindowReadyForIpc = false
let mainFrameNavigationOptions: MainFrameNavigationOptions | null = null
const seenNotificationIds = new Set<string>()
const pendingNotificationPayloads: DesktopNotificationPayload[] = []
const pendingMainWindowActions: Array<(window: BrowserWindow) => void> = []
let pendingMainWindowActionOverflowLogged = false
const terminalSessions = new DesktopTerminalSessions()
const rendererConsoleLogRateLimiter = new EventRateLimiter({
  windowMs: 30_000,
  maxEntries: 500,
})
const recentRendererErrorReports = new Map<
  string,
  { createdAt: number; result: Promise<DesktopRendererErrorReportResult> }
>()

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL_NAME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

const DESKTOP_DATA_DIR = getDesktopDataDir()
const DAEMON_ORIGIN = getDesktopDaemonOrigin()
const GATEWAY_ORIGIN = getDesktopGatewayOrigin()
const DESKTOP_DISABLE_TRAY = process.env.SEPILOT_DESKTOP_DISABLE_TRAY === '1'
const DESKTOP_UPDATE_POLICY = resolveDesktopUpdatePolicy({
  platform: process.platform,
  portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
  disabled: process.env.SEPILOT_DESKTOP_DISABLE_AUTO_UPDATES === '1',
})
const DESKTOP_FORCE_DEVTOOLS = process.env.SEPILOT_DESKTOP_DEVTOOLS === '1'
const DESKTOP_PROCESS_ERROR_HANDLERS_MARKER = '__sepilotdDesktopProcessErrorHandlersInstalled__'
const DESKTOP_PACKAGED_SMOKE_TEST = process.argv.includes('--packaged-smoke-test')
const DESKTOP_PACKAGED_SMOKE_TIMEOUT_MS = 30_000
let packagedSmokeFinished = false
let packagedSmokeTimeout: NodeJS.Timeout | null = null
let packagedSmokeRendererReady = false
let packagedSmokeDaemonReady = false
const DESKTOP_DISABLE_NOTIFICATION_WATCH = !desktopNotificationWatchEnabled(TEST_PROFILE)
const DESKTOP_DISABLE_NATIVE_NOTIFICATIONS =
  process.env.SEPILOT_DESKTOP_DISABLE_NATIVE_NOTIFICATIONS === '1' ||
  process.env.NODE_ENV === 'test'

type ProcessWithDesktopErrorHandlers = NodeJS.Process & {
  [DESKTOP_PROCESS_ERROR_HANDLERS_MARKER]?: boolean
}

function installDesktopProcessErrorHandlers(): void {
  const markedProcess = process as ProcessWithDesktopErrorHandlers
  if (markedProcess[DESKTOP_PROCESS_ERROR_HANDLERS_MARKER]) return
  markedProcess[DESKTOP_PROCESS_ERROR_HANDLERS_MARKER] = true

  process.on('uncaughtException', (error) => {
    void logDesktopEvent(
      'desktop.process.uncaught-exception',
      {
        message: error.message,
        stack: error.stack ?? null,
      },
      { severity: 'fatal' },
    )
  })

  process.on('unhandledRejection', (reason) => {
    void logDesktopEvent(
      'desktop.process.unhandled-rejection',
      {
        reason:
          reason instanceof Error
            ? { message: reason.message, stack: reason.stack ?? null }
            : { value: String(reason) },
      },
      { severity: 'error' },
    )
  })
}

function finishPackagedSmokeTest(exitCode: 0 | 1, reason: string): void {
  if (!DESKTOP_PACKAGED_SMOKE_TEST || packagedSmokeFinished) return
  packagedSmokeFinished = true
  if (packagedSmokeTimeout) clearTimeout(packagedSmokeTimeout)
  packagedSmokeTimeout = null
  console.log(`[desktop-smoke] ${reason}`)
  app.exit(exitCode)
}

function completePackagedSmokeTestWhenReady(): void {
  if (
    !DESKTOP_PACKAGED_SMOKE_TEST
    || packagedSmokeFinished
    || !packagedSmokeRendererReady
    || !packagedSmokeDaemonReady
  ) return

  finishPackagedSmokeTest(0, 'renderer and daemon loaded successfully')
}

function markPackagedSmokeRendererReady(): void {
  if (!DESKTOP_PACKAGED_SMOKE_TEST) return
  packagedSmokeRendererReady = true
  completePackagedSmokeTestWhenReady()
}

function markPackagedSmokeDaemonReady(): void {
  if (!DESKTOP_PACKAGED_SMOKE_TEST) return
  packagedSmokeDaemonReady = true
  completePackagedSmokeTestWhenReady()
}
const MAX_SEEN_NOTIFICATION_IDS = 1_000
const MAX_PENDING_NOTIFICATION_PAYLOADS = 50
const MAX_PENDING_MAIN_WINDOW_ACTIONS = 50
const NOTIFICATION_WINDOW_LOAD_TIMEOUT_MS = 15_000
const RENDERER_ERROR_DEDUPE_MS = 30_000
const MAX_RECENT_RENDERER_ERROR_REPORTS = 100
const DESKTOP_APP_USER_MODEL_ID = 'com.sepilot.desktop'
const COMPUTER_OBSERVATION_ROOT = resolve(tmpdir(), 'sepilotd-computer-use')
const MAX_COMPUTER_OBSERVATION_IMAGE_BYTES = 20 * 1024 * 1024

const LOCAL_CREDENTIAL_STARTUP_WAIT_MS = 15_000
const QUICK_INPUT_SETTINGS_TIMEOUT_MS = 2_500
let daemonStartupPromise: Promise<DaemonStartupResult> | null = null
let gatewayStartupPromise: Promise<GatewayStartupResult> | null = null
let daemonTokenWatchPromise: Promise<boolean> | null = null
let lateDaemonReadinessProbe: Promise<boolean> | null = null
let shortcutRegistrationInitialized = false
let daemonReadyForCredentials = false

type DesktopRendererEnv = 'legacy' | 'next'

function resolveDesktopRendererEnv(
  rawValue = process.env.SEPILOTD_DESKTOP_RENDERER,
): DesktopRendererEnv {
  return rawValue === 'legacy' ? 'legacy' : 'next'
}

function resolveNextRendererDevUrl(rendererEnv: DesktopRendererEnv): string | null {
  return (
    process.env.SEPILOTD_NEXT_DEV_URL ??
    (rendererEnv === 'next' && !app.isPackaged ? 'http://localhost:17650' : null)
  )
}

function resolveMainFrameNavigationOptions(): MainFrameNavigationOptions {
  const { rendererPath, nextStaticEntry, nextStaticRoot } = resolveDesktopAssetPaths(__dirname)
  const rendererEnv = resolveDesktopRendererEnv()
  const rendererAssetRoot =
    rendererEnv === 'legacy'
      ? dirname(rendererPath)
      : (nextStaticRoot ?? (nextStaticEntry ? dirname(nextStaticEntry) : null))

  return {
    rendererDevUrl:
      rendererEnv === 'next' && !app.isPackaged ? resolveNextRendererDevUrl(rendererEnv) : null,
    rendererAssetRoots: rendererAssetRoot ? [rendererAssetRoot] : [],
    appProtocolName: APP_PROTOCOL_NAME,
    appProtocolHost: APP_PROTOCOL_HOST,
  }
}

function installPrivilegedWindowGuards(
  window: BrowserWindow,
  options: { openExternalHttpLinks?: boolean } = {},
): void {
  window.webContents.on('will-navigate', (event, url) => {
    const navigationOptions = mainFrameNavigationOptions
    if (!navigationOptions || !isAllowedMainFrameNavigation(url, navigationOptions)) {
      event.preventDefault()
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (options.openExternalHttpLinks && isHttpOrHttpsUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath)
  return (
    relativePath === '' ||
    (relativePath.length > 0 && !relativePath.startsWith('..') && !isAbsolute(relativePath))
  )
}

async function readComputerObservationImage(pathValue: unknown): Promise<string | null> {
  if (typeof pathValue !== 'string') return null
  const requestedPath = pathValue.trim()
  if (!requestedPath) return null

  const resolvedPath = resolve(requestedPath)
  if (extname(resolvedPath).toLowerCase() !== '.png') return null

  const [rootPath, imagePath] = await Promise.all([
    realpath(COMPUTER_OBSERVATION_ROOT),
    realpath(resolvedPath),
  ])
  if (!isPathInside(rootPath, imagePath)) return null

  const file = await stat(imagePath)
  if (!file.isFile() || file.size > MAX_COMPUTER_OBSERVATION_IMAGE_BYTES) {
    return null
  }

  const image = await readFile(imagePath)
  return `data:image/png;base64,${image.toString('base64')}`
}

void logDesktopEvent('desktop.main.start', {
  daemonOrigin: DAEMON_ORIGIN,
  gatewayOrigin: GATEWAY_ORIGIN,
})

async function waitForServiceStartupForCredentials(
  kind: 'daemon' | 'gateway',
): Promise<void> {
  const startup = kind === 'daemon' ? daemonStartupPromise : gatewayStartupPromise
  if (!startup) return

  await new Promise<void>((resolveWait) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveWait()
    }
    const timer = setTimeout(finish, LOCAL_CREDENTIAL_STARTUP_WAIT_MS)
    timer.unref?.()
    void startup.then(finish, finish)
  })
}

async function loadLocalToken(
  kind: 'daemon' | 'gateway',
  waitForStartup = false,
): Promise<string | null> {
  const saved = loadDesktopSettings()
  const savedToken = kind === 'daemon' ? saved.daemonToken : saved.gatewayToken
  const origin = kind === 'daemon' ? DAEMON_ORIGIN : GATEWAY_ORIGIN
  const managedLocally = kind === 'daemon'
    ? isDesktopManagedDaemonOrigin(origin)
    : isDesktopManagedGatewayOrigin(origin)

  return resolveDesktopServiceToken({
    kind,
    origin,
    savedToken,
    dataDir: DESKTOP_DATA_DIR,
    managedLocally,
    waitForLocalService: waitForStartup
      ? () => waitForServiceStartupForCredentials(kind)
      : undefined,
  })
}

function broadcastTransportConfigUpdated(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(TRANSPORT_CONFIG_UPDATED_CHANNEL)
    }
  }
}

function startDesktopDaemon(): Promise<DaemonStartupResult> {
  daemonStartupPromise ??= startDaemon()
  if (
    isDesktopManagedDaemonOrigin(DAEMON_ORIGIN)
    && !daemonTokenWatchPromise
  ) {
    daemonTokenWatchPromise = waitForDesktopServiceToken({
      kind: 'daemon',
      dataDir: DESKTOP_DATA_DIR,
    })
    void daemonTokenWatchPromise.then(async (found) => {
      if (!found) return
      broadcastTransportConfigUpdated()

      const startup = await daemonStartupPromise?.catch(() => null)
      if (!startup || startup.ready) return
      lateDaemonReadinessProbe ??= waitForLateServiceReadiness(async () => {
        const client = await createDaemonClient()
        await client.health({ signal: AbortSignal.timeout(2_500) })
        return true
      })
      if (await lateDaemonReadinessProbe) {
        try {
          await handleDaemonReady()
        } catch (error) {
          void logDesktopEvent(
            'desktop.daemon-late-readiness.refresh.failed',
            { error: describeUnknownError(error) },
            { severity: 'warning' },
          )
        }
      }
    }).catch((error) => {
      void logDesktopEvent(
        'desktop.daemon-token.watch.failed',
        { error: describeUnknownError(error) },
        { severity: 'warning' },
      )
    })
  }
  return daemonStartupPromise
}

function startDesktopGateway(): Promise<GatewayStartupResult> {
  gatewayStartupPromise ??= startGateway()
  return gatewayStartupPromise
}

async function handleDaemonReady(): Promise<void> {
  if (daemonReadyForCredentials) return
  daemonReadyForCredentials = true
  broadcastTransportConfigUpdated()
  if (!shortcutRegistrationInitialized) return
  await refreshQuickShortcutRegistrations()
}

async function createDaemonClient(): Promise<DaemonClient> {
  const token = await loadLocalToken('daemon')
  return new DaemonClient({
    baseUrl: DAEMON_ORIGIN,
    token,
    surface: 'desktop',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type StorageBrokerOperation = 'tree' | 'read-file' | 'write-file'

interface StorageBrokerGrant {
  rendererId: number
  operation: StorageBrokerOperation
  expiresAt: number
}

const STORAGE_BROKER_TOKEN_TTL_MS = 30_000
const storageBrokerOperations = new Set<StorageBrokerOperation>([
  'tree',
  'read-file',
  'write-file',
])
const storageBrokerSecrets = new Map<number, string>()
const storageBrokerTokens = new Map<string, StorageBrokerGrant>()

function storageBrokerRendererId(event: { sender?: { id?: unknown } }): number {
  const id = event.sender?.id
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new Error('Storage broker renderer is invalid.')
  }
  return id
}

function storageBrokerOperation(value: unknown): StorageBrokerOperation {
  if (typeof value === 'string' && storageBrokerOperations.has(value as StorageBrokerOperation)) {
    return value as StorageBrokerOperation
  }
  throw new Error('Storage broker operation is invalid.')
}

function cleanStorageBrokerTokens(now = Date.now()): void {
  for (const [token, grant] of storageBrokerTokens) {
    if (grant.expiresAt <= now) storageBrokerTokens.delete(token)
  }
}

function registerStorageBroker(event: { sender?: { id?: unknown } }, secret: unknown) {
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('Storage broker secret is required.')
  }
  storageBrokerSecrets.set(storageBrokerRendererId(event), secret)
  return { ok: true }
}

function issueStorageBrokerToken(event: { sender?: { id?: unknown } }, input: unknown) {
  const rendererId = storageBrokerRendererId(event)
  const record = isRecord(input) ? input : {}
  const secret = typeof record.secret === 'string' ? record.secret : ''
  if (!secret || storageBrokerSecrets.get(rendererId) !== secret) {
    throw new Error('Storage broker secret is invalid.')
  }
  const operation = storageBrokerOperation(record.operation)
  cleanStorageBrokerTokens()
  const token = randomUUID()
  const expiresAt = Date.now() + STORAGE_BROKER_TOKEN_TTL_MS
  storageBrokerTokens.set(token, { rendererId, operation, expiresAt })
  return { token, operation, expiresAt }
}

function consumeStorageBrokerToken(
  event: { sender?: { id?: unknown } },
  input: unknown,
  operation: StorageBrokerOperation,
): Record<string, unknown> {
  const rendererId = storageBrokerRendererId(event)
  const record = isRecord(input) ? input : {}
  const token = typeof record.brokerToken === 'string' ? record.brokerToken : ''
  if (!token) throw new Error('Storage broker token is required.')

  cleanStorageBrokerTokens()
  const grant = storageBrokerTokens.get(token)
  if (grant) storageBrokerTokens.delete(token)
  if (
    !grant ||
    grant.rendererId !== rendererId ||
    grant.operation !== operation ||
    grant.expiresAt <= Date.now()
  ) {
    throw new Error('Storage broker token is invalid.')
  }
  return record
}

function optionalString(value: unknown, maxLength = 12_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed
}

function normalizeRendererErrorReport(input: unknown): DesktopRendererErrorReportInput {
  const value = isRecord(input) ? input : {}
  const message = optionalString(value.message) ?? 'Unknown renderer error'
  const attributes = isRecord(value.attributes) ? value.attributes : undefined
  return {
    source: optionalString(value.source, 160) ?? 'renderer',
    message,
    name: optionalString(value.name, 240),
    stack: optionalString(value.stack),
    componentStack: optionalString(value.componentStack),
    href: optionalString(value.href, 2_000),
    userAgent: optionalString(value.userAgent, 1_000),
    sessionId: optionalString(value.sessionId, 240),
    runId: optionalString(value.runId, 240),
    requestId: optionalString(value.requestId, 240),
    attributes,
  }
}

const desktopObservabilityIngestQueue = new DesktopObservabilityIngestQueue({
  sendBatch: async (events) => {
    const client = await createDaemonClient()
    await client.recordObservabilityEvents(events)
  },
  onDiagnostic: (diagnostic) => {
    void logDesktopEvent(
      diagnostic.kind === 'overflow'
        ? 'desktop.observability.ingest.overflow'
        : 'desktop.observability.ingest.failed',
      diagnostic,
      { severity: 'warning' },
    )
  },
})

function recordDesktopObservabilityEvent(event: {
  id: string
  timestamp: string
  source: 'desktop-main' | 'desktop-renderer'
  eventType: string
  severity: DesktopLogSeverity
  sessionId?: string
  runId?: string
  requestId?: string
  attributes?: Record<string, unknown>
}): number | undefined {
  const admitted = desktopObservabilityIngestQueue.enqueue({
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    surface: 'desktop',
    eventType: event.eventType,
    severity: event.severity,
    privacy: 'diagnostic',
    sessionId: event.sessionId,
    runId: event.runId,
    attributes: sanitizeDesktopLogDetail({
      ...event.attributes,
      requestId: event.requestId,
    }) ?? {},
  })
  return admitted ? 1 : undefined
}

async function persistRendererErrorReport(
  report: DesktopRendererErrorReportInput,
): Promise<DesktopRendererErrorReportResult> {
  const timestamp = new Date().toISOString()
  const logged = await logDesktopEvent(
    'desktop.renderer.error',
    {
      source: report.source,
      name: report.name,
      message: report.message,
      stack: report.stack,
      componentStack: report.componentStack,
      href: report.href,
      userAgent: report.userAgent,
      attributes: report.attributes,
    },
    {
      timestamp,
      severity: 'error',
      processType: 'renderer',
      sessionId: report.sessionId,
      runId: report.runId,
      requestId: report.requestId,
    },
  )
  const observabilityAccepted = recordDesktopObservabilityEvent({
    id: logged.id,
    timestamp: logged.timestamp,
    source: 'desktop-renderer',
    eventType: 'desktop.renderer.error',
    severity: 'error',
    sessionId: report.sessionId,
    runId: report.runId,
    requestId: report.requestId,
    attributes: {
      ...report.attributes,
      source: report.source,
      name: report.name,
      message: report.message,
      hasStack: Boolean(report.stack),
      hasComponentStack: Boolean(report.componentStack),
      href: report.href,
      userAgent: report.userAgent,
    },
  })

  return {
    id: logged.id,
    timestamp: logged.timestamp,
    logPath: logged.logPath,
    observabilityAccepted,
  }
}

function rendererErrorFingerprint(report: DesktopRendererErrorReportInput): string {
  return [
    report.source,
    report.name ?? '',
    report.message,
    report.stack?.slice(0, 2_000) ?? '',
    report.componentStack?.slice(0, 2_000) ?? '',
    report.href ?? '',
    report.sessionId ?? '',
    report.runId ?? '',
    report.requestId ?? '',
  ].join('\u0000')
}

ipcMain.handle(
  'sepilot:renderer-error/report',
  (_event, input: unknown): Promise<DesktopRendererErrorReportResult> => {
    const report = normalizeRendererErrorReport(input)
    const fingerprint = rendererErrorFingerprint(report)
    const now = Date.now()
    const cached = recentRendererErrorReports.get(fingerprint)
    if (cached && now - cached.createdAt < RENDERER_ERROR_DEDUPE_MS) {
      return cached.result
    }

    const result = persistRendererErrorReport(report)
    recentRendererErrorReports.delete(fingerprint)
    recentRendererErrorReports.set(fingerprint, { createdAt: now, result })
    while (recentRendererErrorReports.size > MAX_RECENT_RENDERER_ERROR_REPORTS) {
      const oldest = recentRendererErrorReports.keys().next().value
      if (typeof oldest !== 'string') break
      recentRendererErrorReports.delete(oldest)
    }
    return result
  },
)

ipcMain.handle('sepilot:get-app-info', () => {
  return {
    version: app.getVersion(),
    platform: process.platform,
  }
})

ipcMain.handle('sepilot:get-transport-config', async () => {
  const [daemonToken, gatewayToken] = await Promise.all([
    loadLocalToken('daemon', true),
    loadLocalToken('gateway', true),
  ])
  return {
    daemonOrigin: DAEMON_ORIGIN,
    gatewayOrigin: GATEWAY_ORIGIN,
    daemonToken,
    gatewayToken,
  }
})

ipcMain.handle('sepilot:get-desktop-settings', () => {
  const saved = loadDesktopSettings()
  const daemonManagedLocally = isDesktopManagedDaemonOrigin(DAEMON_ORIGIN)
  const gatewayManagedLocally = isDesktopManagedGatewayOrigin(GATEWAY_ORIGIN)
  return {
    saved: {
      ...saved,
      daemonToken: daemonManagedLocally ? null : saved.daemonToken,
      gatewayToken: gatewayManagedLocally ? null : saved.gatewayToken,
    },
    effective: {
      daemonOrigin: DAEMON_ORIGIN,
      gatewayOrigin: GATEWAY_ORIGIN,
      daemonManagedOrigin: getDesktopManagedDaemonOrigin(),
      gatewayManagedOrigin: getDesktopManagedGatewayOrigin(),
      daemonManagedLocally,
      gatewayManagedLocally,
    },
  }
})

registerWritingDocIpc(() => mainWindow)
ipcMain.handle('sepilot:preview/pick-file', async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('File previews require the main window')
  const result = await dialog.showOpenDialog(mainWindow, { title: '미리볼 파일 열기', properties: ['openFile'] })
  return result.canceled ? null : result.filePaths[0] ?? null
})
ipcMain.handle('sepilot:preview/read-file', async (event, input: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('File previews require the main window')
  }
  return readPreviewFile(input)
})
registerWikiFolderTransferIpc(() => mainWindow)

ipcMain.handle('sepilot:save-desktop-settings', (_event, next: unknown) => {
  if (typeof next !== 'object' || next === null) {
    throw new Error('save-desktop-settings: payload must be an object')
  }
  const result = saveDesktopSettings(next as Partial<ReturnType<typeof loadDesktopSettings>>)
  refreshDesktopCalendarAutoSync()
  broadcastTransportConfigUpdated()
  return result
})

function forwardQuickInput(rawText: unknown): boolean {
  const text = normalizeQuickInputText(rawText)
  if (!text) return false
  runWhenMainWindowReadyForIpc((window) => {
    window.webContents.send(QUICK_INPUT_FORWARD_CHANNEL, text)
  })
  return true
}

ipcMain.handle(QUICK_INPUT_PUBLISH_CHANNEL, async (_event, text: unknown) => {
  if (!forwardQuickInput(text)) {
    throw new Error('Quick Input target is unavailable')
  }
  quickInputWindow?.close()
  return { ok: true }
})

ipcMain.handle('sepilot:auto-launch/get', async () => getAutoLaunchState({ refresh: true }))
ipcMain.handle('sepilot:auto-launch/set', async (_event, enabled: unknown) => {
  const state = setAutoLaunchEnabled(Boolean(enabled))
  refreshTrayMenu()
  return state
})

ipcMain.handle('sepilot:save-health-report', async (_event, content: string) => {
  const defaultPath = join(
    app.getPath('documents'),
    `sepilotd-health-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
  )
  const dialogOptions = {
    title: 'Save sepilotd health report',
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)

  if (result.canceled || !result.filePath) {
    return null
  }

  await writeFile(result.filePath, content, 'utf-8')
  return result.filePath
})

ipcMain.handle(
  'sepilot:diagnostics/export',
  async (
    _event,
    input: DesktopDiagnosticsExportInput,
  ): Promise<DesktopDiagnosticsExportResult | null> =>
    exportDesktopDiagnostics(input, {
      parentWindow: mainWindow,
      collectDaemonHealthReport: async () => {
        const client = await createDaemonClient()
        return client.healthReport('markdown')
      },
    }),
)

ipcMain.handle('sepilot:select-directory', async (_event, defaultPath?: string) => {
  const dialogOptions: OpenDialogOptions = {
    title: '워크스페이스 폴더 선택',
    defaultPath: defaultPath?.trim() || app.getPath('documents'),
    properties: ['openDirectory'],
    buttonLabel: '이 폴더 사용',
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0] ?? null
})

ipcMain.handle('sepilot:computer-observation-image', async (_event, pathValue: unknown) => {
  try {
    return await readComputerObservationImage(pathValue)
  } catch {
    return null
  }
})

ipcMain.handle('sepilot:apps/clipboard/read-text', async () => ({
  text: clipboard.readText() ?? '',
}))

ipcMain.handle('sepilot:apps/clipboard/write', async (_event, input: unknown) => {
  const record = isRecord(input) ? input : {}
  const text = typeof record.text === 'string' ? record.text : ''
  const html = typeof record.html === 'string' ? record.html : ''
  const rtf = typeof record.rtf === 'string' ? record.rtf : ''
  if (!text && !html && !rtf) throw new Error('Clipboard content is required.')
  clipboard.write({ text, html, rtf })
  return { ok: true }
})

ipcMain.handle('sepilot:apps/ai-usage/get', async () => collectAiUsage())

const NOTE_TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024
const NOTE_TEXT_FILE_FILTERS = [
  { name: 'Text', extensions: ['txt'] },
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
  { name: 'All Files', extensions: ['*'] },
]
const NOTE_TEXT_FILE_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.mdx'])
const NOTE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
const NOTE_ATTACHMENT_FILTERS = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
]
const NOTE_ATTACHMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const NOTE_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u
const VAULT_BACKUP_FILE_MAX_BYTES = 2 * 1024 * 1024
const VAULT_BACKUP_FILE_FILTERS = [
  { name: 'Sepilotd Vault Backup', extensions: ['sepilotvault', 'json'] },
  { name: 'JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
]
const VAULT_BACKUP_FILE_EXTENSIONS = new Set(['.sepilotvault', '.json'])
const DEVICE_TABLE_FILE_MAX_BYTES = 5 * 1024 * 1024
const DEVICE_TABLE_FILE_FILTERS = [
  { name: 'Sepilotd Device Table JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
]
const DEVICE_TABLE_FILE_EXTENSIONS = new Set(['.json'])
const SERVICES_FILE_MAX_BYTES = 5 * 1024 * 1024
const SERVICES_FILE_FILTERS = [
  { name: 'Sepilotd Services JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
]
const SERVICES_FILE_EXTENSIONS = new Set(['.json'])
const STOCKS_FILE_MAX_BYTES = 5 * 1024 * 1024
const STOCKS_FILE_FILTERS = [
  { name: 'Sepilotd Stocks JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
]
const STOCKS_FILE_EXTENSIONS = new Set(['.json'])
const SMARTCAR_FILE_MAX_BYTES = 5 * 1024 * 1024
const SMARTCAR_FILE_FILTERS = [
  { name: 'Sepilotd Smart Car JSON', extensions: ['json'] },
  { name: 'All Files', extensions: ['*'] },
]
const SMARTCAR_FILE_EXTENSIONS = new Set(['.json'])

function noteFileRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sanitizeDeviceTableFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || '디바이스 테이블'
}

function sanitizeServicesFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || '서비스 카탈로그'
}

function sanitizeStocksFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || '주식 투자 분석'
}

function sanitizeSmartCarFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || 'Smart Car 차계부'
}

function deviceTableJsonText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, DEVICE_TABLE_FILE_MAX_BYTES) : ''
}

function servicesJsonText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SERVICES_FILE_MAX_BYTES) : ''
}

function stocksJsonText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, STOCKS_FILE_MAX_BYTES) : ''
}

function smartCarJsonText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SMARTCAR_FILE_MAX_BYTES) : ''
}

function noteFileText(value: unknown, maxLength = NOTE_TEXT_FILE_MAX_BYTES): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function noteFileFormat(value: unknown): 'txt' | 'md' {
  return value === 'md' ? 'md' : 'txt'
}

function sanitizeNoteFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || '새 노트'
}

function noteAttachmentAppId(value: unknown): string {
  const appId = typeof value === 'string' ? value.trim() : ''
  return NOTE_APP_ID_PATTERN.test(appId) ? appId : 'notepad'
}

function noteAttachmentsDirectory(raw: unknown): string {
  const input = noteFileRecord(raw)
  return join(getDesktopDataDir(), 'apps', noteAttachmentAppId(input.appId), 'attachments')
}

function sanitizeNoteAttachmentBaseName(value: unknown): string {
  const name = basename(noteFileText(value, 120))
    .replace(/\.[^.]+$/u, '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || 'image'
}

function noteAttachmentMime(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  return 'image/png'
}

function noteAttachmentRelativePath(fileName: string): string {
  return `attachments/${fileName.replace(/\\/gu, '/')}`
}

function noteAttachmentFileName(value: unknown): string {
  const name = basename(noteFileText(value, 160).replace(/\\/g, '/'))
  if (!name || !NOTE_ATTACHMENT_EXTENSIONS.has(extname(name).toLowerCase())) {
    throw new Error('Image attachment is required.')
  }
  return name
}

function noteAttachmentMarkdown(fileName: string): string {
  const label = fileName.replace(/\.[^.]+$/u, '')
  return `![${label}](${noteAttachmentRelativePath(fileName)})`
}

async function uniqueNoteAttachmentName(directory: string, baseName: string, extension: string) {
  const safeBase = sanitizeNoteAttachmentBaseName(baseName)
  const safeExt = NOTE_ATTACHMENT_EXTENSIONS.has(extension.toLowerCase()) ? extension.toLowerCase() : '.png'
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = `${safeBase}${suffix}${safeExt}`
    try {
      await stat(join(directory, candidate))
    } catch {
      return candidate
    }
  }
  return `${safeBase}-${Date.now()}${safeExt}`
}

function noteAttachmentPayload(directory: string, fileName: string, buffer: Buffer, mtimeMs: number) {
  const mime = noteAttachmentMime(fileName)
  return {
    name: fileName,
    path: join(directory, fileName),
    directory,
    relativePath: noteAttachmentRelativePath(fileName),
    markdown: noteAttachmentMarkdown(fileName),
    mime,
    size: buffer.length,
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    mtimeMs,
  }
}

async function saveNoteAttachmentBuffer(raw: unknown, sourceName: unknown, buffer: Buffer, fallbackExt = '.png') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Image content is required.')
  if (buffer.length > NOTE_ATTACHMENT_MAX_BYTES) {
    throw new Error('Note image attachments must be 5MB or smaller.')
  }
  const directory = noteAttachmentsDirectory(raw)
  await mkdir(directory, { recursive: true })
  const sourceExt = extname(noteFileText(sourceName, 120)).toLowerCase()
  const extension = NOTE_ATTACHMENT_EXTENSIONS.has(sourceExt) ? sourceExt : fallbackExt
  const fileName = await uniqueNoteAttachmentName(directory, sanitizeNoteAttachmentBaseName(sourceName), extension)
  const filePath = join(directory, fileName)
  await writeFile(filePath, buffer)
  const info = await stat(filePath)
  return noteAttachmentPayload(directory, fileName, buffer, info.mtimeMs)
}

function sanitizeVaultFileBaseName(value: unknown): string {
  const name = noteFileText(value, 80)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
  return name || '보안 금고'
}

function vaultBackupText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, VAULT_BACKUP_FILE_MAX_BYTES) : ''
}

function normalizeVaultBackupFilePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('file path is required')
  const filePath = resolve(value)
  if (!isAbsolute(filePath)) throw new Error('file path must be absolute')
  const ext = extname(filePath).toLowerCase()
  if (ext && !VAULT_BACKUP_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only .sepilotvault and .json files are supported.')
  }
  return filePath
}

async function readVaultBackupFile(filePath: string) {
  const normalizedPath = normalizeVaultBackupFilePath(filePath)
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > VAULT_BACKUP_FILE_MAX_BYTES) {
    throw new Error('Vault backup files must be 2MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    mtimeMs: info.mtimeMs,
  }
}

async function pickDeviceTableJsonFile() {
  const options: OpenDialogOptions = {
    title: '디바이스 테이블 JSON 가져오기',
    properties: ['openFile'],
    filters: DEVICE_TABLE_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !DEVICE_TABLE_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > DEVICE_TABLE_FILE_MAX_BYTES) {
    throw new Error('Device table files must be 5MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    mtimeMs: info.mtimeMs,
  }
}

async function pickServicesJsonFile() {
  const options: OpenDialogOptions = {
    title: '서비스 카탈로그 JSON 가져오기',
    properties: ['openFile'],
    filters: SERVICES_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !SERVICES_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > SERVICES_FILE_MAX_BYTES) {
    throw new Error('Services files must be 5MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    mtimeMs: info.mtimeMs,
  }
}

async function pickStocksJsonFile() {
  const options: OpenDialogOptions = {
    title: '주식 투자 분석 JSON 가져오기',
    properties: ['openFile'],
    filters: STOCKS_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !STOCKS_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > STOCKS_FILE_MAX_BYTES) {
    throw new Error('Stock analysis files must be 5MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    mtimeMs: info.mtimeMs,
  }
}

async function pickSmartCarJsonFile() {
  const options: OpenDialogOptions = {
    title: 'Smart Car 차계부 JSON 가져오기',
    properties: ['openFile'],
    filters: SMARTCAR_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !SMARTCAR_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > SMARTCAR_FILE_MAX_BYTES) {
    throw new Error('Smart Car files must be 5MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    mtimeMs: info.mtimeMs,
  }
}

async function pickVaultBackupFile() {
  const options: OpenDialogOptions = {
    title: '암호화 금고 백업 가져오기',
    properties: ['openFile'],
    filters: VAULT_BACKUP_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  return readVaultBackupFile(filePath)
}

function normalizeNoteTextFilePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('file path is required')
  const filePath = resolve(value)
  if (!isAbsolute(filePath)) throw new Error('file path must be absolute')
  const ext = extname(filePath).toLowerCase()
  if (ext && !NOTE_TEXT_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only .txt, .md, .markdown, and .mdx files are supported.')
  }
  return filePath
}

function titleFromNoteFilePath(filePath: string): string {
  const name = basename(filePath).replace(/\.[^.]+$/u, '')
  return sanitizeNoteFileBaseName(name)
}

function noteFormatFromPath(filePath: string): 'txt' | 'md' {
  const ext = extname(filePath).toLowerCase()
  return ext === '.md' || ext === '.markdown' || ext === '.mdx' ? 'md' : 'txt'
}

async function readNoteTextFile(filePath: string) {
  const normalizedPath = normalizeNoteTextFilePath(filePath)
  const info = await stat(normalizedPath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > NOTE_TEXT_FILE_MAX_BYTES) {
    throw new Error('Note text files must be 2MB or smaller.')
  }
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    title: titleFromNoteFilePath(normalizedPath),
    body: await readFile(normalizedPath, 'utf-8'),
    format: noteFormatFromPath(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
}

async function writeNoteTextFile(filePath: string, body: unknown) {
  const normalizedPath = normalizeNoteTextFilePath(filePath)
  await writeFile(normalizedPath, noteFileText(body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    format: noteFormatFromPath(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
}

async function pickNoteTextFile() {
  const options: OpenDialogOptions = {
    title: '노트 파일 가져오기',
    properties: ['openFile'],
    filters: NOTE_TEXT_FILE_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  return readNoteTextFile(filePath)
}

async function importNoteAttachmentImage(raw: unknown) {
  const options: OpenDialogOptions = {
    title: '노트 이미지 첨부',
    properties: ['openFile'],
    filters: NOTE_ATTACHMENT_FILTERS,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  const extension = extname(filePath).toLowerCase()
  if (!NOTE_ATTACHMENT_EXTENSIONS.has(extension)) {
    throw new Error('Only image attachments are supported.')
  }
  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('Selected path is not a file.')
  if (info.size > NOTE_ATTACHMENT_MAX_BYTES) {
    throw new Error('Note image attachments must be 5MB or smaller.')
  }
  return saveNoteAttachmentBuffer(raw, basename(filePath), await readFile(filePath), extension)
}

async function saveClipboardNoteAttachment(raw: unknown) {
  const image = clipboard.readImage()
  if (image.isEmpty()) throw new Error('Clipboard does not contain an image.')
  return saveNoteAttachmentBuffer(raw, `clipboard-${Date.now()}.png`, image.toPNG(), '.png')
}

async function listNoteAttachments(raw: unknown) {
  const directory = noteAttachmentsDirectory(raw)
  try {
    await mkdir(directory, { recursive: true })
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && NOTE_ATTACHMENT_EXTENSIONS.has(extname(entry.name).toLowerCase()))
        .map(async (entry) => {
          const filePath = join(directory, entry.name)
          const info = await stat(filePath)
          if (info.size > NOTE_ATTACHMENT_MAX_BYTES) return null
          return noteAttachmentPayload(directory, entry.name, await readFile(filePath), info.mtimeMs)
        }),
    )
    return {
      directory,
      attachments: files
        .filter((file): file is NonNullable<typeof file> => Boolean(file))
        .sort((left, right) => Number(right.mtimeMs || 0) - Number(left.mtimeMs || 0)),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { directory, attachments: [] }
    throw error
  }
}

async function deleteNoteAttachment(raw: unknown) {
  const input = noteFileRecord(raw)
  const directory = noteAttachmentsDirectory(raw)
  const fileName = noteAttachmentFileName(input.name || input.relativePath || input.path)
  const root = resolve(directory)
  const filePath = resolve(root, fileName)
  const relativePath = relative(root, filePath)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Invalid attachment path.')
  }
  await unlink(filePath)
  return {
    ok: true,
    name: fileName,
    path: filePath,
    directory,
    relativePath: noteAttachmentRelativePath(fileName),
  }
}

ipcMain.handle('sepilot:apps/note-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const format = noteFileFormat(input.format)
  const extension = format === 'md' ? 'md' : 'txt'
  const defaultPath = join(app.getPath('documents'), `${sanitizeNoteFileBaseName(input.title)}.${extension}`)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '노트를 파일로 내보내기',
        defaultPath,
        filters: NOTE_TEXT_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: '노트를 파일로 내보내기',
        defaultPath,
        filters: NOTE_TEXT_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.${extension}`
  return writeNoteTextFile(filePath, input.body)
})

ipcMain.handle('sepilot:apps/note-file/import', async () => pickNoteTextFile())
ipcMain.handle('sepilot:apps/note-file/link', async () => pickNoteTextFile())
ipcMain.handle('sepilot:apps/note-file/read', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  return readNoteTextFile(noteFileText(input.path, 2000))
})
ipcMain.handle('sepilot:apps/note-file/write', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  return writeNoteTextFile(noteFileText(input.path, 2000), input.body)
})

ipcMain.handle('sepilot:apps/note-attachment/import-image', async (_event, raw: unknown) =>
  importNoteAttachmentImage(raw),
)
ipcMain.handle('sepilot:apps/note-attachment/save-clipboard-image', async (_event, raw: unknown) =>
  saveClipboardNoteAttachment(raw),
)
ipcMain.handle('sepilot:apps/note-attachment/list', async (_event, raw: unknown) =>
  listNoteAttachments(raw),
)
ipcMain.handle('sepilot:apps/note-attachment/delete', async (_event, raw: unknown) =>
  deleteNoteAttachment(raw),
)

ipcMain.handle('sepilot:apps/vault-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const defaultPath = join(
    app.getPath('documents'),
    `${sanitizeVaultFileBaseName(input.title)}.sepilotvault`,
  )
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '암호화 금고 백업 저장',
        defaultPath,
        filters: VAULT_BACKUP_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: '암호화 금고 백업 저장',
        defaultPath,
        filters: VAULT_BACKUP_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.sepilotvault`
  const normalizedPath = normalizeVaultBackupFilePath(filePath)
  await writeFile(normalizedPath, vaultBackupText(input.body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
})

ipcMain.handle('sepilot:apps/vault-file/import', async () => pickVaultBackupFile())
ipcMain.handle('sepilot:apps/services-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const fallbackName =
    typeof input.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : `${sanitizeServicesFileBaseName(input.title)}.json`
  const defaultPath = join(app.getPath('documents'), fallbackName)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '서비스 카탈로그 JSON 저장',
        defaultPath,
        filters: SERVICES_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: '서비스 카탈로그 JSON 저장',
        defaultPath,
        filters: SERVICES_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.json`
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !SERVICES_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  await writeFile(normalizedPath, servicesJsonText(input.body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
})
ipcMain.handle('sepilot:apps/services-file/import', async () => pickServicesJsonFile())
ipcMain.handle('sepilot:apps/stocks-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const fallbackName =
    typeof input.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : `${sanitizeStocksFileBaseName(input.title)}.json`
  const defaultPath = join(app.getPath('documents'), fallbackName)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '주식 투자 분석 JSON 저장',
        defaultPath,
        filters: STOCKS_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: '주식 투자 분석 JSON 저장',
        defaultPath,
        filters: STOCKS_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.json`
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !STOCKS_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  await writeFile(normalizedPath, stocksJsonText(input.body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
})
ipcMain.handle('sepilot:apps/stocks-file/import', async () => pickStocksJsonFile())
ipcMain.handle('sepilot:apps/devices-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const fallbackName =
    typeof input.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : `${sanitizeDeviceTableFileBaseName(input.title)}.json`
  const defaultPath = join(app.getPath('documents'), fallbackName)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '디바이스 테이블 JSON 저장',
        defaultPath,
        filters: DEVICE_TABLE_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: '디바이스 테이블 JSON 저장',
        defaultPath,
        filters: DEVICE_TABLE_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.json`
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !DEVICE_TABLE_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  await writeFile(normalizedPath, deviceTableJsonText(input.body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
})
ipcMain.handle('sepilot:apps/devices-file/import', async () => pickDeviceTableJsonFile())
ipcMain.handle('sepilot:apps/smartcar-file/export', async (_event, raw: unknown) => {
  const input = noteFileRecord(raw)
  const fallbackName =
    typeof input.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : `${sanitizeSmartCarFileBaseName(input.title)}.json`
  const defaultPath = join(app.getPath('documents'), fallbackName)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: 'Smart Car 차계부 JSON 저장',
        defaultPath,
        filters: SMARTCAR_FILE_FILTERS,
      })
    : await dialog.showSaveDialog({
        title: 'Smart Car 차계부 JSON 저장',
        defaultPath,
        filters: SMARTCAR_FILE_FILTERS,
      })
  if (result.canceled || !result.filePath) return null
  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.json`
  const normalizedPath = resolve(filePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (ext && !SMARTCAR_FILE_EXTENSIONS.has(ext)) {
    throw new Error('Only JSON files are supported.')
  }
  await writeFile(normalizedPath, smartCarJsonText(input.body), 'utf-8')
  const info = await stat(normalizedPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
    mtimeMs: info.mtimeMs,
  }
})
ipcMain.handle('sepilot:apps/smartcar-file/import', async () => pickSmartCarJsonFile())
declare const __SEPILOT_BROWSER_EXTENSION_FILES__: Record<string, string>
declare const __SEPILOT_BROWSER_EXTENSION_DISTRIBUTION__: { chromeStoreUrl: string | null; edgeStoreUrl: string | null }
ipcMain.handle('sepilot:browser/install-extension', async (_event, raw: unknown) =>
  installBrowserExtension(raw, __SEPILOT_BROWSER_EXTENSION_FILES__, __SEPILOT_BROWSER_EXTENSION_DISTRIBUTION__),
)
ipcMain.handle('sepilot:browser/open-chrome-inspect', async () => openChromeInspect())
ipcMain.handle('sepilot:apps/dev/open', async (_event, raw: unknown) => openDevTarget(raw))
ipcMain.handle('sepilot:apps/git/inspect', async (_event, raw: unknown) => inspectGitRepoUrl(raw))
ipcMain.handle('sepilot:apps/bookmarks/import-browser', async (_event, raw: unknown) =>
  importInstalledBrowserBookmarks(raw),
)

const LOCAL_INBOX_FILE_MAX_BYTES = 512 * 1024
const LOCAL_INBOX_MAX_FILES = 80
const LOCAL_INBOX_MAX_DEPTH = 3
const LOCAL_INBOX_ADAPTER_TIMEOUT_MS = 8000
const LOCAL_INBOX_ADAPTER_MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const LOCAL_INBOX_ADAPTER_MAX_ERROR_BYTES = 128 * 1024

type LocalInboxAdapterFile = {
  path: string
  relativePath: string
  name: string
  title: string
  body: string
  text: string
  hash: string
  size: number
  mtimeMs: number
  extension: string
  directoryName: string
  binary: boolean
  skippedBody: boolean
  error?: string
}

function localInboxRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function normalizeLocalInboxFolderPath(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value.trim()) throw new Error('folder path is required')
  const folderPath = resolve(value)
  if (!isAbsolute(folderPath)) throw new Error('folder path must be absolute')
  const normalizedPath = await realpath(folderPath)
  const info = await stat(normalizedPath)
  if (!info.isDirectory()) throw new Error('Selected path is not a folder.')
  return normalizedPath
}

function decodeLocalInboxTextFile(buffer: Buffer): string {
  if (buffer.includes(0)) throw new Error('Binary files are not supported.')
  let text = ''
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('Only UTF-8 text files are supported.')
  }
  const sample = text.slice(0, 4096)
  const controlMatches = sample.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu)
  const controlCount = controlMatches ? controlMatches.length : 0
  if (controlCount > Math.max(8, sample.length * 0.01)) {
    throw new Error('Binary files are not supported.')
  }
  return text.replace(/^\uFEFF/u, '')
}

function localInboxTitleFromPath(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/u, '') || basename(filePath)
}

function localInboxHash(filePath: string, mtimeMs: number): string {
  return `${Buffer.from(filePath).toString('base64url').slice(0, 80)}-${Math.floor(mtimeMs)}`
}

function localInboxAdapterCode(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('로컬 폴더 adapter Python 코드가 필요합니다.')
  }
  return value
}

function localInboxPythonCommand(): string {
  return (
    process.env.SEPILOTD_DESKTOP_PYTHON ||
    process.env.SEPILOT_DESKTOP_PYTHON ||
    process.env.PYTHON ||
    (process.platform === 'win32' ? 'python' : 'python3')
  )
}

async function collectLocalInboxFiles(
  folderPath: string,
  directoryPath = folderPath,
  depth = 0,
  files: LocalInboxAdapterFile[] = [],
): Promise<LocalInboxAdapterFile[]> {
  if (files.length >= LOCAL_INBOX_MAX_FILES) return files
  const entries = (await readdir(directoryPath, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    if (files.length >= LOCAL_INBOX_MAX_FILES) break
    const entryPath = join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      if (depth < LOCAL_INBOX_MAX_DEPTH) {
        await collectLocalInboxFiles(folderPath, entryPath, depth + 1, files)
      }
      continue
    }
    if (!entry.isFile()) continue
    const info = await stat(entryPath)
    if (!info.isFile()) continue
    let body = ''
    let binary = false
    let error: string | undefined
    const skippedBody = info.size > LOCAL_INBOX_FILE_MAX_BYTES
    if (!skippedBody) {
      try {
        body = decodeLocalInboxTextFile(await readFile(entryPath))
      } catch (decodeError) {
        binary = true
        error = decodeError instanceof Error ? decodeError.message : String(decodeError)
      }
    }
    files.push({
      path: entryPath,
      relativePath: relative(folderPath, entryPath),
      name: entry.name,
      title: localInboxTitleFromPath(entryPath),
      body,
      text: body,
      hash: localInboxHash(entryPath, info.mtimeMs),
      size: info.size,
      mtimeMs: info.mtimeMs,
      extension: extname(entry.name).toLowerCase(),
      directoryName: basename(folderPath),
      binary,
      skippedBody,
      ...(error ? { error } : {}),
    })
  }
  return files
}

function normalizeLocalInboxAdapterItems(output: unknown): Record<string, unknown>[] {
  const root = output && typeof output === 'object' && !Array.isArray(output) ? output : {}
  const candidates = Array.isArray(output)
    ? output
    : Array.isArray((root as Record<string, unknown>).items)
      ? ((root as Record<string, unknown>).items as unknown[])
      : []
  return candidates.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
  )
}

async function runLocalInboxAdapter(
  adapterCode: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const scriptPath = join(
    tmpdir(),
    `sepilotd-inbox-adapter-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.py`,
  )
  await writeFile(scriptPath, adapterCode, 'utf-8')
  try {
    const stdout = await new Promise<string>((resolvePromise, rejectPromise) => {
      const child = spawn(localInboxPythonCommand(), [scriptPath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let settled = false
      const finish = (error: Error | null, value = '') => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error) rejectPromise(error)
        else resolvePromise(value)
      }
      const timeout = setTimeout(() => {
        child.kill()
        finish(new Error('로컬 폴더 adapter 실행 시간이 초과되었습니다.'))
      }, LOCAL_INBOX_ADAPTER_TIMEOUT_MS)
      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length
        if (stdoutBytes > LOCAL_INBOX_ADAPTER_MAX_OUTPUT_BYTES) {
          child.kill()
          finish(new Error('로컬 폴더 adapter 출력이 너무 큽니다.'))
          return
        }
        stdoutChunks.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length
        if (stderrBytes <= LOCAL_INBOX_ADAPTER_MAX_ERROR_BYTES) stderrChunks.push(chunk)
      })
      child.on('error', (error) => finish(error))
      child.on('close', (code) => {
        if (settled) return
        const stderrText = Buffer.concat(stderrChunks).toString('utf-8').trim()
        if (code !== 0) {
          finish(
            new Error(
              `로컬 폴더 adapter 실패 (${code ?? 'unknown'}): ${
                stderrText || 'stderr 출력 없음'
              }`,
            ),
          )
          return
        }
        finish(null, Buffer.concat(stdoutChunks).toString('utf-8'))
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(JSON.stringify(payload))
    })
    const trimmed = stdout.trim()
    if (!trimmed) return []
    return normalizeLocalInboxAdapterItems(JSON.parse(trimmed))
  } finally {
    await unlink(scriptPath).catch(() => undefined)
  }
}

async function pickLocalInboxFolder() {
  const options: OpenDialogOptions = {
    title: '인박스로 가져올 로컬 폴더 선택',
    properties: ['openDirectory'],
    buttonLabel: 'Use folder',
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  const folderPath = result.filePaths[0]
  if (result.canceled || !folderPath) return null
  const normalizedPath = await normalizeLocalInboxFolderPath(folderPath)
  return {
    path: normalizedPath,
    name: basename(normalizedPath),
  }
}

async function scanLocalInboxFolder(raw: unknown) {
  const input = localInboxRecord(raw)
  const folderPath = await normalizeLocalInboxFolderPath(input.path)
  const adapterCode = localInboxAdapterCode(input.adapterCode)
  const files = (await collectLocalInboxFiles(folderPath)).sort((a, b) => b.mtimeMs - a.mtimeMs)
  const items = await runLocalInboxAdapter(adapterCode, {
    folderPath,
    folderName: basename(folderPath),
    scannedAt: new Date().toISOString(),
    files,
  })
  return {
    path: folderPath,
    name: basename(folderPath),
    filesScanned: files.length,
    items,
  }
}

ipcMain.handle('sepilot:apps/inbox-local-folder/pick', async () => pickLocalInboxFolder())
ipcMain.handle('sepilot:apps/inbox-local-folder/scan', async (_event, raw: unknown) =>
  scanLocalInboxFolder(raw),
)

ipcMain.handle('sepilot:apps/storage/register-broker', async (event, secret: unknown) =>
  registerStorageBroker(event, secret),
)
ipcMain.handle('sepilot:apps/storage/broker-token', async (event, input: unknown) =>
  issueStorageBrokerToken(event, input),
)
ipcMain.handle('sepilot:apps/storage/tree', async (event, input: unknown) => {
  consumeStorageBrokerToken(event, input, 'tree')
  return listDesktopAppStorageTree()
})
ipcMain.handle('sepilot:apps/storage/read-file', async (event, input: unknown) => {
  const record = consumeStorageBrokerToken(event, input, 'read-file')
  return readDesktopAppStorageFile(
    record as unknown as Parameters<typeof readDesktopAppStorageFile>[0],
  )
})
ipcMain.handle('sepilot:apps/storage/write-file', async (event, input: unknown) => {
  const record = consumeStorageBrokerToken(event, input, 'write-file')
  return writeDesktopAppStorageFile(
    record as unknown as Parameters<typeof writeDesktopAppStorageFile>[0],
  )
})

ipcMain.handle('sepilot:apps/list', async () => listDesktopApps())
ipcMain.handle('sepilot:apps/diagnostics', async () => listDesktopAppDiagnostics())
ipcMain.handle('sepilot:apps/save', async (_event, input: DesktopAppSaveInput) =>
  saveDesktopApp(input),
)
ipcMain.handle('sepilot:apps/save-data', async (_event, id: unknown, data: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  const normalizedData = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return saveDesktopAppData(id, normalizedData)
})
ipcMain.handle('sepilot:apps/read-chat', async (_event, id: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  return readDesktopAppChat(id)
})
ipcMain.handle('sepilot:apps/save-chat', async (_event, id: unknown, history: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  return saveDesktopAppChat(
    id,
    Array.isArray(history) ? (history as Parameters<typeof saveDesktopAppChat>[1]) : [],
  )
})
ipcMain.handle('sepilot:apps/restore-version', async (_event, id: unknown, version: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('app version must be a positive integer')
  }
  return restoreDesktopAppVersion(id, version)
})
ipcMain.handle('sepilot:apps/export', async (_event, id: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  const bundle = (await listDesktopApps()).find((candidate) => candidate.manifest.id === id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: 'Export sepilotd app',
        defaultPath: join(app.getPath('documents'), createDesktopAppExportFilename(bundle)),
        filters: [{ name: 'sepilotd app', extensions: ['sepilotapp', 'json'] }],
      })
    : await dialog.showSaveDialog({
        title: 'Export sepilotd app',
        defaultPath: join(app.getPath('documents'), createDesktopAppExportFilename(bundle)),
        filters: [{ name: 'sepilotd app', extensions: ['sepilotapp', 'json'] }],
      })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, await exportDesktopAppPortable(id), 'utf-8')
  return result.filePath
})
ipcMain.handle('sepilot:apps/import', async () => {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: 'Import sepilotd app',
        properties: ['openFile'],
        filters: [{ name: 'sepilotd app', extensions: ['sepilotapp', 'json'] }],
      })
    : await dialog.showOpenDialog({
        title: 'Import sepilotd app',
        properties: ['openFile'],
        filters: [{ name: 'sepilotd app', extensions: ['sepilotapp', 'json'] }],
      })
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  return importDesktopAppPortable(await readFile(filePath, 'utf-8'))
})
ipcMain.handle('sepilot:apps/export-backup', async () => {
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: 'Export sepilotd apps backup',
        defaultPath: join(app.getPath('documents'), createDesktopAppsBackupFilename()),
        filters: [{ name: 'sepilotd apps backup', extensions: ['sepilotapps', 'json'] }],
      })
    : await dialog.showSaveDialog({
        title: 'Export sepilotd apps backup',
        defaultPath: join(app.getPath('documents'), createDesktopAppsBackupFilename()),
        filters: [{ name: 'sepilotd apps backup', extensions: ['sepilotapps', 'json'] }],
      })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, await exportDesktopAppsBackup(), 'utf-8')
  return result.filePath
})
ipcMain.handle('sepilot:apps/restore-backup', async () => {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: 'Restore sepilotd apps backup',
        properties: ['openFile'],
        filters: [{ name: 'sepilotd apps backup', extensions: ['sepilotapps', 'json'] }],
      })
    : await dialog.showOpenDialog({
        title: 'Restore sepilotd apps backup',
        properties: ['openFile'],
        filters: [{ name: 'sepilotd apps backup', extensions: ['sepilotapps', 'json'] }],
      })
  const filePath = result.filePaths[0]
  if (result.canceled || !filePath) return null
  return restoreDesktopAppsBackup(await readFile(filePath, 'utf-8'))
})
ipcMain.handle('sepilot:apps/audit', async (_event, appId: unknown) =>
  listDesktopAppAudit({ appId: typeof appId === 'string' ? appId : undefined }),
)
ipcMain.handle('sepilot:apps/record-audit', async (_event, input: unknown) => {
  if (!input || typeof input !== 'object') throw new Error('audit input must be an object')
  await recordDesktopAppAudit(input as Parameters<typeof recordDesktopAppAudit>[0])
})
ipcMain.handle('sepilot:apps/delete', async (_event, id: unknown) => {
  if (typeof id !== 'string') throw new Error('app id must be a string')
  await deleteDesktopApp(id)
})
ipcMain.handle('sepilot:apps/reset', async (_event, inputs: unknown) => {
  if (!Array.isArray(inputs)) throw new Error('apps reset input must be an array')
  return resetDesktopApps(inputs as DesktopAppSaveInput[])
})
ipcMain.handle('sepilot:apps/services/health-check', async (_event, input: unknown) =>
  checkDesktopServiceHealth(input),
)
ipcMain.handle('sepilot:apps/market-quotes/fetch', async (_event, input: unknown) =>
  fetchDesktopMarketQuotes(input),
)
ipcMain.handle('sepilot:apps/atlassian/request', async (_event, input: unknown) =>
  handleDesktopAtlassianRequest(input),
)
ipcMain.handle('sepilot:apps/kubernetes/snapshot', async (_event, input: unknown) =>
  fetchDesktopKubernetesSnapshot(input),
)
ipcMain.handle('sepilot:apps/kubernetes/rancher/import', async (_event, input: unknown) =>
  importDesktopRancherClusters(input),
)
ipcMain.handle('sepilot:apps/kubernetes/credential/delete', async (_event, connectionId: unknown) =>
  deleteDesktopKubernetesCredential(connectionId),
)
ipcMain.handle('sepilot:apps/smart-home/status', async () => {
  requireDesktopSettingsBuildFeature('smart-home')
  return getDesktopSmartHomeStatus()
})
ipcMain.handle('sepilot:apps/smart-home/sync', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('smart-home')
  return syncDesktopSmartHomeDevices(input)
})
ipcMain.handle('sepilot:apps/smart-home/command', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('smart-home')
  return commandDesktopSmartHomeDevice(input)
})

ipcMain.handle('sepilot:calendar/status', async (_event, appId: unknown, state: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  return getDesktopCalendarStatus(
    typeof appId === 'string' ? appId : undefined,
    state && typeof state === 'object' ? (state as DesktopCalendarGoogleSyncState) : null,
  )
})
ipcMain.handle('sepilot:calendar/configure-google', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  if (!input || typeof input !== 'object')
    throw new Error('calendar config input must be an object')
  return configureDesktopGoogleCalendar(
    input as { clientId?: string | null; clientSecret?: string | null },
  )
})
ipcMain.handle('sepilot:calendar/list-google-calendars', async (_event, appId: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  return listDesktopGoogleCalendars(typeof appId === 'string' ? appId : undefined)
})
ipcMain.handle(
  'sepilot:calendar/configure-google-calendars',
  async (_event, input: unknown) => {
    requireDesktopSettingsBuildFeature('google')
    if (!input || typeof input !== 'object')
      throw new Error('calendar configure calendars input must be an object')
    return configureDesktopGoogleCalendarSelection(
      input as {
        appId?: string
        appTitle?: string
        selectedCalendarIds?: unknown
        defaultCalendarId?: unknown
      },
    )
  },
)
ipcMain.handle('sepilot:calendar/connect-google', async () => {
  requireDesktopSettingsBuildFeature('google')
  return connectDesktopGoogleCalendar()
})
ipcMain.handle('sepilot:calendar/disconnect-google', async () => {
  requireDesktopSettingsBuildFeature('google')
  return disconnectDesktopGoogleCalendar()
})
ipcMain.handle('sepilot:calendar/sync-app-events', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  if (!input || typeof input !== 'object') throw new Error('calendar sync input must be an object')
  return syncDesktopCalendarAppEvents(input as DesktopCalendarGoogleSyncInput)
})
ipcMain.handle('sepilot:calendar/delete-google-event', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  if (!input || typeof input !== 'object') throw new Error('calendar delete input must be an object')
  return deleteDesktopCalendarGoogleEvent(input as DesktopCalendarGoogleDeleteInput)
})
ipcMain.handle('sepilot:calendar/configure-auto-sync', async (_event, input: unknown) => {
  requireDesktopSettingsBuildFeature('google')
  if (!input || typeof input !== 'object') throw new Error('auto sync input must be an object')
  return configureDesktopCalendarAutoSync(input as DesktopCalendarAutoSyncInput)
})
ipcMain.handle('sepilot:calendar/export-ics', async (_event, input: unknown) => {
  if (!input || typeof input !== 'object') throw new Error('ics export input must be an object')
  return exportDesktopCalendarIcs(input as DesktopCalendarIcsExportInput, mainWindow)
})

registerCliChatHandlers(ipcMain)

ipcMain.handle('sepilot:cli/models', (_event, backend: unknown, cwd: unknown) => listCliModels(backend, cwd))

ipcMain.handle('sepilot:shell/start', (event, input: DesktopShellStartInput) =>
  terminalSessions.start(input ?? {}, event.sender),
)
ipcMain.handle('sepilot:shell/write', (_event, id: unknown, data: unknown) => {
  terminalSessions.write(id, data)
})
ipcMain.handle('sepilot:shell/resize', (_event, id: unknown, cols: unknown, rows: unknown) => {
  terminalSessions.resize(id, cols, rows)
})
ipcMain.handle('sepilot:shell/kill', (_event, id: unknown) => {
  terminalSessions.kill(id)
})
ipcMain.handle('sepilot:shell/read-ssh-config', () => readDefaultSshConfig())
ipcMain.handle('sepilot:shell/diagnose', async (_event, input: DesktopShellStartInput) =>
  diagnoseShellTarget(input ?? {}),
)

async function ensureAppProtocol(root: string): Promise<void> {
  if (appProtocolRegistered) return

  const contentSecurityPolicy = buildDesktopContentSecurityPolicy({
    daemonOrigin: DAEMON_ORIGIN,
    gatewayOrigin: GATEWAY_ORIGIN,
    allowUnsafeInline: true,
    allowUnsafeEval: false,
  })
  protocol.handle(APP_PROTOCOL_NAME, async (request) => {
    const filePath = mapAppUrlToFile(request.url, root)

    try {
      const body = await readFile(filePath)
      return new Response(body, {
        headers: appProtocolResponseHeaders(filePath, contentSecurityPolicy),
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  appProtocolRegistered = true
  await logDesktopEvent('desktop.protocol.app.registered', { root })
}

async function readQuickInputSettings(): Promise<DaemonQuickInputSettings | null> {
  try {
    const client = await createDaemonClient()
    return await client.request<DaemonQuickInputSettings>('/quick-input/settings', {
      method: 'GET',
      signal: AbortSignal.timeout(QUICK_INPUT_SETTINGS_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

interface QuickQuestion {
  id: string
  name: string
  prompt: string
  shortcut: string
  enabled: boolean
}

const QUICK_QUESTION_TRIGGER_CHANNEL = 'sepilot:quick-question/trigger'
const MAIN_WINDOW_READY_FOR_ACTIONS_CHANNEL = 'sepilot:main-window/ready-for-actions'
let registeredQuickInputAccelerator: string | null = null
let lastQuickInputRegistration: QuickInputRegistrationState = {
  requestedAccelerator: DEFAULT_QUICK_INPUT_ACCELERATOR,
  activeAccelerator: null,
  attemptedAccelerators: [],
  status: 'pending',
}
const registeredQuickQuestionShortcuts: string[] = []
let quickShortcutRefreshGeneration = 0

function readQuickQuestions(settings: DaemonQuickInputSettings | null): QuickQuestion[] {
  const list = settings?.quickQuestions
  if (!Array.isArray(list)) return []
  return list.filter((q): q is QuickQuestion => {
    if (!q || typeof q !== 'object') return false
    const item = q as unknown as Record<string, unknown>
    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.prompt === 'string' &&
      typeof item.shortcut === 'string' &&
      typeof item.enabled === 'boolean'
    )
  })
}

interface QuickQuestionRegistration {
  id: string
  name: string
  shortcut: string
  enabled: boolean
  registered: boolean
}

const QUICK_QUESTION_STATUS_CHANNEL = 'sepilot:quick-question/registration'
let lastQuickQuestionRegistrations: QuickQuestionRegistration[] = []

async function registerQuickQuestionShortcuts(
  settings: DaemonQuickInputSettings | null,
): Promise<void> {
  for (const accel of registeredQuickQuestionShortcuts) {
    try {
      globalShortcut.unregister(accel)
    } catch {
    }
  }
  registeredQuickQuestionShortcuts.length = 0
  if (process.env.SEPILOT_DESKTOP_DISABLE_GLOBAL_SHORTCUTS === '1') {
    lastQuickQuestionRegistrations = []
    publishQuickQuestionStatus()
    return
  }

  const questions = readQuickQuestions(settings)
  const results: QuickQuestionRegistration[] = []
  for (const q of questions) {
    if (!q.enabled) {
      results.push({
        id: q.id,
        name: q.name,
        shortcut: q.shortcut,
        enabled: false,
        registered: false,
      })
      continue
    }
    let registered = false
    try {
      registered = globalShortcut.register(q.shortcut, () => {
        triggerQuickQuestion(q)
      })
    } catch {
      registered = false
    }
    void logDesktopEvent('desktop.quick-question.shortcut', {
      id: q.id,
      name: q.name,
      shortcut: q.shortcut,
      registered,
    })
    if (registered) registeredQuickQuestionShortcuts.push(q.shortcut)
    results.push({
      id: q.id,
      name: q.name,
      shortcut: q.shortcut,
      enabled: true,
      registered,
    })
  }
  lastQuickQuestionRegistrations = results
  publishQuickQuestionStatus()
}

function publishQuickQuestionStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(QUICK_QUESTION_STATUS_CHANNEL, lastQuickQuestionRegistrations)
}

function publishQuickInputRegistrationStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(QUICK_INPUT_REGISTRATION_CHANNEL, lastQuickInputRegistration)
}

function updateQuickInputRegistrationStatus(state: QuickInputRegistrationState): void {
  lastQuickInputRegistration = state
  publishQuickInputRegistrationStatus()
  void logDesktopEvent('desktop.quick-input.registration', { ...state }, {
    severity: state.status === 'unavailable' ? 'warning' : 'info',
  })
}

function runWhenMainWindowReadyForIpc(action: (window: BrowserWindow) => void): void {
  const win = showMainWindow()
  if (win && mainWindowReadyForIpc) {
    action(win)
    return
  }
  pendingMainWindowActions.push(action)
  if (pendingMainWindowActions.length > MAX_PENDING_MAIN_WINDOW_ACTIONS) {
    pendingMainWindowActions.splice(
      0,
      pendingMainWindowActions.length - MAX_PENDING_MAIN_WINDOW_ACTIONS,
    )
    if (!pendingMainWindowActionOverflowLogged) {
      pendingMainWindowActionOverflowLogged = true
      void logDesktopEvent(
        'desktop.window.pending-action.overflow',
        { maxPending: MAX_PENDING_MAIN_WINDOW_ACTIONS },
        { severity: 'warning' },
      )
    }
  }
}

function triggerQuickQuestion(question: QuickQuestion): void {
  let clipboardText = ''
  try {
    clipboardText = clipboard.readText() ?? ''
  } catch {
    clipboardText = ''
  }
  const trimmedClipboard = clipboardText.trim()
  const message = trimmedClipboard ? `${question.prompt}\n\n${clipboardText}` : question.prompt

  runWhenMainWindowReadyForIpc((window) => {
    window.webContents.send(QUICK_QUESTION_TRIGGER_CHANNEL, {
      questionId: question.id,
      questionName: question.name,
      message,
      clipboardEmpty: trimmedClipboard.length === 0,
    })
  })
  void logDesktopEvent('desktop.quick-question.triggered', {
    id: question.id,
    name: question.name,
    clipboardLength: clipboardText.length,
  })
}

async function registerQuickInputShortcut(
  settings: DaemonQuickInputSettings | null,
): Promise<void> {
  if (registeredQuickInputAccelerator) {
    try {
      globalShortcut.unregister(registeredQuickInputAccelerator)
    } catch {
    }
    registeredQuickInputAccelerator = null
  }
  const preferred = normalizeQuickInputAccelerator(
    settings?.hotkey ?? DEFAULT_QUICK_INPUT_ACCELERATOR,
  )
  if (process.env.SEPILOT_DESKTOP_DISABLE_GLOBAL_SHORTCUTS === '1') {
    updateQuickInputRegistrationStatus({
      requestedAccelerator: preferred,
      activeAccelerator: null,
      attemptedAccelerators: [],
      status: 'disabled',
    })
    refreshTrayMenu()
    return
  }
  const candidates: string[] = [preferred]
  for (const fallback of QUICK_INPUT_FALLBACK_ACCELERATORS) {
    if (!candidates.includes(fallback)) candidates.push(fallback)
  }

  let activeAccelerator: string | null = null
  const attemptedAccelerators: string[] = []
  for (const accelerator of candidates) {
    attemptedAccelerators.push(accelerator)
    let registered = false
    try {
      registered = globalShortcut.register(accelerator, () => {
        void openQuickInputWindow()
      })
    } catch {
      registered = false
    }
    void logDesktopEvent('desktop.quick-input.shortcut', {
      accelerator,
      registered,
      attempted: attemptedAccelerators,
    })
    if (registered) {
      activeAccelerator = accelerator
      registeredQuickInputAccelerator = accelerator
      break
    }
  }

  updateQuickInputRegistrationStatus({
    requestedAccelerator: preferred,
    activeAccelerator,
    attemptedAccelerators,
    status: activeAccelerator
      ? activeAccelerator === preferred
        ? 'preferred'
        : 'fallback'
      : 'unavailable',
  })

  refreshTrayMenu()

  if (!activeAccelerator && ElectronNotification.isSupported()) {
    try {
      new ElectronNotification({
        title: 'Quick Input 단축키를 등록하지 못했습니다',
        body: '시도한 단축키 모두 다른 앱이 점유 중입니다. 설정에서 다른 키 조합으로 변경하세요.',
        silent: true,
      }).show()
    } catch {
    }
  }
}

async function refreshQuickShortcutRegistrations(options: {
  allowInitialFallback?: boolean
} = {}): Promise<boolean> {
  if (TEST_PROFILE) return false
  const generation = ++quickShortcutRefreshGeneration
  const settings = await readQuickInputSettings()
  if (generation !== quickShortcutRefreshGeneration) return false
  if (!settings) {
    if (
      options.allowInitialFallback
      && registeredQuickInputAccelerator == null
      && registeredQuickQuestionShortcuts.length === 0
    ) {
      await registerQuickInputShortcut(null)
      await registerQuickQuestionShortcuts(null)
    }
    return false
  }
  await registerQuickInputShortcut(settings)
  await registerQuickQuestionShortcuts(settings)
  return true
}

async function openQuickInputWindow(): Promise<void> {
  if (!quickInputRendererContext) {
    mainWindow?.show()
    mainWindow?.focus()
    return
  }

  if (quickInputWindow && !quickInputWindow.isDestroyed()) {
    quickInputWindow.show()
    quickInputWindow.focus()
    return
  }

  const { width: screenWidth, x: screenX, y: screenY } = screen.getPrimaryDisplay().workArea
  const width = 720
  quickInputWindow = new BrowserWindow({
    width,
    height: 200,
    x: Math.round(screenX + (screenWidth - width) / 2),
    y: screenY + 120,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    title: 'Quick Input',
    webPreferences: {
      preload: quickInputRendererContext.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })
  installPrivilegedWindowGuards(quickInputWindow)

  quickInputWindow.on('blur', () => {
    quickInputWindow?.hide()
  })
  quickInputWindow.on('closed', () => {
    quickInputWindow = null
  })
  quickInputWindow.once('ready-to-show', () => {
    quickInputWindow?.show()
    quickInputWindow?.focus()
  })

  const target = resolveQuickInputRendererTarget(quickInputRendererContext.target)
  if (target.kind === 'url') {
    await quickInputWindow.loadURL(target.url)
  } else {
    await quickInputWindow.loadFile(target.path)
  }
}

function sendNotificationPayloadToWindow(
  window: BrowserWindow | null,
  payload: DesktopNotificationPayload,
): void {
  if (!window || window.isDestroyed()) return
  window.webContents.send(NOTIFICATION_PUSH_CHANNEL, payload)
}

function flushPendingNotificationPayloads(): void {
  if (
    !notificationWindow
    || notificationWindow.isDestroyed()
    || !notificationWindowReady
  ) return
  while (pendingNotificationPayloads.length > 0) {
    const payload = pendingNotificationPayloads.shift()
    if (payload) sendNotificationPayloadToWindow(notificationWindow, payload)
  }
}

function armNotificationWindowHide(): void {
  if (notificationHideTimer) clearTimeout(notificationHideTimer)
  notificationHideTimer = null
  if (!notificationWindowReady || notificationHideDeadline <= 0) return
  const remainingMs = Math.max(0, notificationHideDeadline - Date.now())
  notificationHideTimer = setTimeout(() => {
    notificationWindow?.hide()
    notificationHideTimer = null
    notificationHideDeadline = 0
  }, remainingMs)
}

function scheduleNotificationWindowHide(delayMs = 10_000): void {
  notificationHideDeadline = Math.max(
    notificationHideDeadline,
    Date.now() + delayMs,
  )
  armNotificationWindowHide()
}

let cachedNotificationIcon: Electron.NativeImage | null | undefined
function resolveNotificationIcon(): Electron.NativeImage | null {
  if (cachedNotificationIcon !== undefined) return cachedNotificationIcon
  for (const candidate of resolveTrayIconCandidates()) {
    try {
      const img = nativeImage.createFromPath(candidate)
      if (!img.isEmpty()) {
        cachedNotificationIcon = img
        return img
      }
    } catch {
    }
  }
  cachedNotificationIcon = null
  return null
}

function showNativeNotification(payload: DesktopNotificationPayload): void {
  if (DESKTOP_DISABLE_NATIVE_NOTIFICATIONS) return
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
    return
  }
  try {
    if (!ElectronNotification.isSupported()) return
    const icon = resolveNotificationIcon()
    const notification = new ElectronNotification({
      title: payload.title,
      body: payload.body,
      ...(icon ? { icon } : {}),
    })
    notification.on('click', () => {
      openDesktopNotificationTarget(payload.url)
    })
    notification.show()
  } catch {
  }
}

async function openNotificationWindow(payload: DesktopNotificationPayload): Promise<void> {
  if (!notificationRendererContext) {
    return
  }

  if (notificationWindow && !notificationWindow.isDestroyed()) {
    if (notificationWindowReady) {
      notificationWindow.showInactive()
      flushPendingNotificationPayloads()
    }
    scheduleNotificationWindowHide(notificationVisibleDurationMs(payload))
    return
  }

  const {
    width: screenWidth,
    height: screenHeight,
    x: screenX,
    y: screenY,
  } = screen.getPrimaryDisplay().workArea
  const width = Math.max(280, Math.min(420, screenWidth - 32))
  const height = Math.max(240, Math.min(380, screenHeight - 32))
  const createdWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(screenX + screenWidth - width - 16),
    y: Math.round(screenY + screenHeight - height - 16),
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    title: 'Notifications',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090d16' : '#f5f7fa',
    webPreferences: {
      preload: notificationRendererContext.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })
  notificationWindow = createdWindow
  notificationWindowReady = false
  installPrivilegedWindowGuards(createdWindow)

  createdWindow.on('closed', () => {
    if (notificationWindow !== createdWindow) return
    notificationWindow = null
    notificationWindowReady = false
    notificationHideDeadline = 0
    if (notificationHideTimer) clearTimeout(notificationHideTimer)
    notificationHideTimer = null
  })
  createdWindow.once('ready-to-show', () => {
    if (notificationWindow !== createdWindow) return
    createdWindow.showInactive()
    scheduleNotificationWindowHide(notificationVisibleDurationMs(payload))
  })
  createdWindow.webContents.on('did-start-loading', () => {
    if (notificationWindow === createdWindow) notificationWindowReady = false
  })
  const markNotificationWindowReady = () => {
    if (notificationWindow !== createdWindow || createdWindow.isDestroyed()) {
      return
    }
    const shouldShow = pendingNotificationPayloads.length > 0
    notificationWindowReady = true
    flushPendingNotificationPayloads()
    if (shouldShow) createdWindow.showInactive()
    armNotificationWindowHide()
  }
  createdWindow.webContents.on('dom-ready', markNotificationWindowReady)
  createdWindow.webContents.on('did-finish-load', markNotificationWindowReady)

  const target = resolveNotificationRendererTarget(notificationRendererContext.target)
  let loadTimeout: NodeJS.Timeout | null = null
  try {
    const load = target.kind === 'url'
      ? createdWindow.loadURL(target.url)
      : createdWindow.loadFile(target.path)
    await Promise.race([
      load,
      new Promise<never>((_resolve, reject) => {
        loadTimeout = setTimeout(() => {
          try {
            createdWindow.webContents.stop()
          } catch {
          }
          reject(new Error(
            `Notification renderer did not load within ${NOTIFICATION_WINDOW_LOAD_TIMEOUT_MS}ms`,
          ))
        }, NOTIFICATION_WINDOW_LOAD_TIMEOUT_MS)
        loadTimeout.unref?.()
      }),
    ])
  } catch (error) {
    if (notificationWindow === createdWindow) {
      notificationWindow = null
      notificationWindowReady = false
      if (notificationHideTimer) clearTimeout(notificationHideTimer)
      notificationHideTimer = null
    }
    if (!createdWindow.isDestroyed()) createdWindow.destroy()
    throw error
  } finally {
    if (loadTimeout) clearTimeout(loadTimeout)
  }
}

function deliverNotificationToHelper(payload: DesktopNotificationPayload): void {
  void openNotificationWindow(payload)
    .then(() => {
      flushPendingNotificationPayloads()
    })
    .catch((error) => {
      void logDesktopEvent(
        'desktop.notifications.window.failed',
        {
          message: error instanceof Error ? error.message : String(error),
        },
        { severity: 'warning' },
      )
    })
}

async function pushDesktopNotification(rawPayload: unknown): Promise<boolean> {
  const payload = normalizeNotificationPayload(rawPayload)
  if (!payload) return false

  if (seenNotificationIds.has(payload.id)) return true
  rememberSeenNotificationId(payload.id)
  sendNotificationPayloadToWindow(mainWindow, payload)
  void deliverTaskNotification(payload, (speech) => petWindow.notify(speech), () => {
    showNativeNotification(payload)
    if (notificationRendererContext) {
      pendingNotificationPayloads.push(payload)
      if (pendingNotificationPayloads.length > MAX_PENDING_NOTIFICATION_PAYLOADS) {
        pendingNotificationPayloads.splice(
          0,
          pendingNotificationPayloads.length - MAX_PENDING_NOTIFICATION_PAYLOADS,
        )
      }
      deliverNotificationToHelper(payload)
    }
  })
  return true
}

ipcMain.handle(NOTIFICATION_PUBLISH_CHANNEL, async (_event, payload: unknown) => {
  if (!(await pushDesktopNotification(payload))) {
    throw new Error('Notification payload is invalid')
  }
  return { ok: true }
})

function hideNotificationWindow(): void {
  if (notificationHideTimer) clearTimeout(notificationHideTimer)
  notificationHideTimer = null
  notificationHideDeadline = 0
  notificationWindow?.hide()
}

function openDesktopNotificationTarget(url: string | null | undefined): void {
  hideNotificationWindow()
  if (url && isHttpOrHttpsUrl(url)) {
    void shell.openExternal(url)
    return
  }

  showMainWindow()
  const sessionId = notificationSessionId(url)
  const view = notificationTargetView(url)
  const jobId = notificationJobId(url)
  runWhenMainWindowReadyForIpc((window) => {
    window.webContents.send(NOTIFICATION_OPENED_CHANNEL, { sessionId, view, jobId })
  })
}

function isNotificationWindowSender(event: Electron.IpcMainInvokeEvent): boolean {
  return Boolean(
    notificationWindow
    && !notificationWindow.isDestroyed()
    && event.sender === notificationWindow.webContents,
  )
}

ipcMain.handle(NOTIFICATION_OPEN_CHANNEL, (event, url: unknown) => {
  if (!isNotificationWindowSender(event)) return { ok: false }
  openDesktopNotificationTarget(typeof url === 'string' ? url : null)
  return { ok: true }
})

ipcMain.handle(NOTIFICATION_DISMISS_CHANNEL, (event) => {
  if (!isNotificationWindowSender(event)) return { ok: false }
  hideNotificationWindow()
  return { ok: true }
})

ipcMain.handle('sepilot:notifications/diagnostics', () => {
  let nativeSupported = false
  try {
    nativeSupported = ElectronNotification.isSupported()
  } catch {
    nativeSupported = false
  }
  return {
    platform: process.platform,
    nativeSupported,
    nativeDisabledByEnv: DESKTOP_DISABLE_NATIVE_NOTIFICATIONS,
    appUserModelId: process.platform === 'win32' ? DESKTOP_APP_USER_MODEL_ID : null,
    iconResolved: resolveNotificationIcon() != null,
  }
})

ipcMain.handle(MAIN_WINDOW_READY_FOR_ACTIONS_CHANNEL, (event) => {
  const win = getLiveMainWindow()
  if (!win || event.sender !== win.webContents) {
    return { ok: false }
  }
  flushPendingMainWindowActions()
  return { ok: true }
})

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function rememberSeenNotificationId(id: string): void {
  if (seenNotificationIds.has(id)) return
  seenNotificationIds.add(id)
  if (seenNotificationIds.size <= MAX_SEEN_NOTIFICATION_IDS) return
  const oldest = seenNotificationIds.values().next().value
  if (typeof oldest === 'string') seenNotificationIds.delete(oldest)
}

async function handleNotificationWatchPayload(
  payload: DaemonNotificationsWatchPayload,
): Promise<void> {
  if (payload.type === 'heartbeat') return

  if (payload.type === 'snapshot') {
    const items = payload.items
      .map((item) => normalizeNotificationPayload(item))
      .filter((item): item is DesktopNotificationPayload => item != null)

    if (!notificationWatchBootstrapped) {
      for (const item of items) rememberSeenNotificationId(item.id)
      notificationWatchBootstrapped = true
      return
    }

    const missed = items.filter((item) => !seenNotificationIds.has(item.id)).reverse()
    for (const item of missed) {
      await pushDesktopNotification(item)
    }
    return
  }

  const item = normalizeNotificationPayload(payload.item)
  if (!item || seenNotificationIds.has(item.id)) return
  await pushDesktopNotification(item)
}

function scheduleNotificationWatchRetry(): {
  attempt: number
  delayMs: number
} | null {
  if (
    DESKTOP_DISABLE_NOTIFICATION_WATCH
    || notificationWatchUnavailable
    || notificationWatchRetryTimer
  ) return null
  notificationWatchRetryAttempt += 1
  const delayMs = notificationWatchRetryDelay(notificationWatchRetryAttempt)
  notificationWatchRetryTimer = setTimeout(() => {
    notificationWatchRetryTimer = null
    startNotificationWatch()
  }, delayMs)
  notificationWatchRetryTimer.unref?.()
  return { attempt: notificationWatchRetryAttempt, delayMs }
}

function startNotificationWatch(): void {
  if (
    DESKTOP_DISABLE_NOTIFICATION_WATCH
    || notificationWatchUnavailable
    || notificationWatchController
  ) return

  const controller = new AbortController()
  notificationWatchController = controller

  void (async () => {
    let connectedAt: number | null = null
    try {
      const client = await createDaemonClient()
      const response = await client.watchNotificationsStream({
        signal: controller.signal,
      })
      if (isNotificationWatchUnavailableStatus(response.status)) {
        notificationWatchUnavailable = true
        void logDesktopEvent(
          'desktop.notifications.watch.unavailable',
          { status: response.status },
          { severity: 'warning' },
        )
        return
      }
      if (!response.ok) {
        throw new Error(`notification watch failed: ${response.status}`)
      }
      if (!response.body) {
        throw new Error('Notification watch response body is unavailable')
      }

      connectedAt = Date.now()
      for await (const event of parseJsonSseStream<DaemonNotificationsWatchPayload>(
        response.body,
      )) {
        if (isNotificationWatchConnectionStable(connectedAt)) {
          notificationWatchRetryAttempt = 0
        }
        await handleNotificationWatchPayload(event.data)
      }
      if (!controller.signal.aborted) {
        if (isNotificationWatchConnectionStable(connectedAt)) {
          notificationWatchRetryAttempt = 0
        }
        scheduleNotificationWatchRetry()
      }
    } catch (error) {
      if (!isAbortError(error)) {
        if (
          connectedAt != null
          && isNotificationWatchConnectionStable(connectedAt)
        ) {
          notificationWatchRetryAttempt = 0
        }
        const retry = scheduleNotificationWatchRetry()
        if (retry && shouldLogNotificationWatchFailure(retry.attempt)) {
          void logDesktopEvent(
            'desktop.notifications.watch.failed',
            {
              message: error instanceof Error ? error.message : String(error),
              retryAttempt: retry.attempt,
              retryDelayMs: retry.delayMs,
            },
            { severity: 'warning' },
          )
        }
      }
    } finally {
      if (notificationWatchController === controller) {
        notificationWatchController = null
      }
    }
  })()
}

function stopNotificationWatch(): void {
  notificationWatchController?.abort()
  notificationWatchController = null
  if (notificationWatchRetryTimer) clearTimeout(notificationWatchRetryTimer)
  notificationWatchRetryTimer = null
  notificationWatchRetryAttempt = 0
  if (notificationHideTimer) clearTimeout(notificationHideTimer)
  notificationHideTimer = null
  notificationHideDeadline = 0
}

function getLiveMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  mainWindow = null
  return null
}

function flushPendingMainWindowActions(): void {
  const win = getLiveMainWindow()
  if (!win) return
  mainWindowReadyForIpc = true
  const actions = pendingMainWindowActions.splice(0)
  pendingMainWindowActionOverflowLogged = false
  for (const action of actions) {
    try {
      action(win)
    } catch (error) {
      void logDesktopEvent(
        'desktop.window.pending-action.failed',
        {
          message: error instanceof Error ? error.message : String(error),
        },
        { severity: 'warning' },
      )
    }
  }
}

function showMainWindow(): BrowserWindow | null {
  const existing = getLiveMainWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return existing
  }
  if (!desktopLifecycleReady) {
    return null
  }
  createWindow()
  const created = getLiveMainWindow()
  if (created) {
    created.show()
    created.focus()
  }
  return created
}

function createWindow(): void {
  const existing = getLiveMainWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }
  if (!desktopLifecycleReady) {
    return
  }

  const { preloadPath, rendererPath, nextStaticEntry, nextStaticRoot } =
    resolveDesktopAssetPaths(__dirname)
  const rawRendererEnv = process.env.SEPILOTD_DESKTOP_RENDERER
  const rendererEnv = resolveDesktopRendererEnv(rawRendererEnv)
  if (rawRendererEnv && rawRendererEnv !== 'legacy' && rawRendererEnv !== 'next') {
    console.warn(
      `[desktop] Unknown SEPILOTD_DESKTOP_RENDERER="${rawRendererEnv}", defaulting to "next".`,
    )
  }
  if (rendererEnv === 'legacy') {
    console.error(
      '[desktop] ⚠ Running LEGACY renderer (src/renderer). ' +
        'Unset SEPILOTD_DESKTOP_RENDERER or set it to "next" to use the parity UI.',
    )
  }
  const configuredNextDevUrl = resolveNextRendererDevUrl(rendererEnv)
  const allowUnsafeEval = !app.isPackaged && rendererEnv === 'next' && Boolean(configuredNextDevUrl)
  void logDesktopEvent('desktop.window.assets', {
    preloadPath,
    rendererPath,
    nextStaticEntry,
    nextStaticRoot,
    isPackaged: app.isPackaged,
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : null,
  })

  const windowStatePath = join(app.getPath('userData'), 'window-state.json')
  const savedBounds = loadWindowBounds(windowStatePath)
  const restorableBounds = savedBounds
    ? clampBoundsToDisplays(savedBounds, screen.getAllDisplays())
    : null

  mainWindow = new BrowserWindow({
    ...computeWindowOptions({
      isDarkSystem: nativeTheme.shouldUseDarkColors,
      preloadPath,
      platform: process.platform,
      savedBounds: restorableBounds,
    }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })
  installPrivilegedWindowGuards(mainWindow, { openExternalHttpLinks: true })
  if (TEST_PROFILE) {
    mainWindow.setTitle('sepilot — TEST INSTANCE')
    mainWindow.on('page-title-updated', (event) => event.preventDefault())
  }

  if (savedBounds?.isMaximized) {
    mainWindow.maximize()
  }

  let saveBoundsTimer: NodeJS.Timeout | null = null
  const scheduleSaveWindowBounds = () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      const win = mainWindow
      if (!win || win.isDestroyed()) return
      const isMaximized = win.isMaximized()
      const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()
      saveWindowBounds(windowStatePath, { ...bounds, isMaximized })
    }, 500)
  }
  mainWindow.on('resize', scheduleSaveWindowBounds)
  mainWindow.on('move', scheduleSaveWindowBounds)
  mainWindow.on('maximize', scheduleSaveWindowBounds)
  mainWindow.on('unmaximize', scheduleSaveWindowBounds)
  mainWindowReadyForIpc = false

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          buildDesktopContentSecurityPolicy({
            daemonOrigin: DAEMON_ORIGIN,
            gatewayOrigin: GATEWAY_ORIGIN,
            allowUnsafeInline: rendererEnv === 'next',
            allowUnsafeEval,
          }),
        ],
      },
    })
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.webContents.once('dom-ready', () => {
    mainWindow?.show()
  })

  const startupShowTimeout = setTimeout(() => {
    mainWindow?.show()
  }, 1_500)

  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      mainWindowReadyForIpc = false
    }
  })
  mainWindow.webContents.on('did-finish-load', () => {
    clearTimeout(startupShowTimeout)
    if (rendererEnv === 'legacy') {
      flushPendingMainWindowActions()
    }
    void logDesktopEvent('desktop.window.did-finish-load')
    markPackagedSmokeRendererReady()
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelTag = ['debug', 'info', 'warning', 'error'][level] ?? 'log'
      const src = sourceId ? ` (${sourceId}:${line})` : ''
      console.log(`[renderer:${levelTag}] ${message}${src}`)
    })
  }

  let nextRendererRetries = 0
  const MAX_NEXT_RENDERER_RETRIES = 8
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      void logDesktopEvent(
        'desktop.window.did-fail-load',
        {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        },
        { severity: isMainFrame ? 'error' : 'warning' },
      )
      if (isMainFrame) {
        finishPackagedSmokeTest(
          1,
          `renderer load failed (${errorCode}: ${errorDescription})`,
        )
      }
      if (
        isMainFrame &&
        rendererEnv === 'next' &&
        !app.isPackaged &&
        configuredNextDevUrl &&
        validatedURL.startsWith(configuredNextDevUrl) &&
        nextRendererRetries < MAX_NEXT_RENDERER_RETRIES
      ) {
        nextRendererRetries += 1
        const delay = Math.min(2_000, 500 * nextRendererRetries)
        console.warn(
          `[desktop] Next dev server not ready (${errorDescription}); retry ${nextRendererRetries}/${MAX_NEXT_RENDERER_RETRIES} in ${delay}ms`,
        )
        setTimeout(() => {
          mainWindow?.loadURL(configuredNextDevUrl)
        }, delay)
      }
    },
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    void logDesktopEvent(
      'desktop.window.render-process-gone',
      {
        reason: details.reason,
        exitCode: details.exitCode,
      },
      {
        severity: details.reason === 'crashed' ? 'fatal' : 'error',
      },
    )
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2 && !/error|failed|exception/i.test(message)) {
      return
    }
    const fingerprint = `${level}\u0000${sourceId}\u0000${line}\u0000${message.slice(0, 2_000)}`
    if (!rendererConsoleLogRateLimiter.shouldAccept(fingerprint)) return
    void logDesktopEvent(
      'desktop.window.console',
      {
        level,
        message,
        line,
        sourceId,
      },
      {
        severity: level >= 3 ? 'error' : 'warning',
      },
    )
  })

  const target = resolveRendererTarget({
    env: rendererEnv,
    isDev: !app.isPackaged,
    legacyFile: rendererPath,
    nextDevUrl: configuredNextDevUrl,
    nextStaticUrl: nextStaticRoot ? APP_PROTOCOL_ENTRY_URL : null,
    nextStaticEntry,
  })
  quickInputRendererContext = rendererEnv === 'next' ? { preloadPath, target } : null
  notificationRendererContext = rendererEnv === 'next' ? { preloadPath, target } : null

  console.log(
    `[desktop] renderer=${rendererEnv} target=${
      target.kind === 'url' ? `url:${target.url}` : `file:${target.path}`
    } isPackaged=${app.isPackaged}`,
  )
  if (rendererEnv === 'legacy') {
    mainWindow.setTitle('sepilotd (LEGACY renderer)')
  }
  if (target.kind === 'url') {
    void logDesktopEvent('desktop.window.load', { mode: 'url', url: target.url })
    mainWindow.loadURL(target.url)
  } else {
    void logDesktopEvent('desktop.window.load', { mode: 'file', path: target.path })
    mainWindow.loadFile(target.path)
  }

  mainWindow.on('close', (e) => {
    if (isQuittingApp) return
    e.preventDefault()
    mainWindow?.hide()
    if (process.platform !== 'darwin' && !trayHideHintShown && ElectronNotification.isSupported()) {
      trayHideHintShown = true
      try {
        new ElectronNotification({
          title: 'sepilotd가 트레이에서 계속 실행 중입니다',
          body: '트레이 아이콘을 클릭하면 다시 열 수 있습니다. tray helper까지 종료하려면 트레이 메뉴의 Exit tray helper를 누르세요.',
          silent: true,
        }).show()
      } catch {
      }
    }
  })

  mainWindow.on('closed', () => {
    clearTimeout(startupShowTimeout)
    quickInputWindow?.close()
    notificationWindow?.close()
    mainWindow = null
    mainWindowReadyForIpc = false
  })

  if (DESKTOP_FORCE_DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function resolveTrayIconCandidates(): string[] {
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string') {
    candidates.push(join(process.resourcesPath, 'build', 'icon.png'))
    candidates.push(join(process.resourcesPath, 'icon.png'))
  }
  candidates.push(join(app.getAppPath(), 'build', 'icon.png'))
  candidates.push(join(__dirname, '..', '..', 'build', 'icon.png'))
  candidates.push(join(process.cwd(), 'build', 'icon.png'))
  candidates.push(join(process.cwd(), 'packages', 'desktop', 'build', 'icon.png'))
  return [...new Set(candidates)]
}

function createFallbackTrayIcon(): Electron.NativeImage {
  const width = 16
  const height = 16
  const bitmap = Buffer.alloc(width * height * 4)
  const blue = { b: 239, g: 117, r: 37, a: 255 }
  const white = { b: 255, g: 255, r: 255, a: 255 }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const isWhite =
        (y >= 3 && y <= 5 && x >= 4 && x <= 12) ||
        (y >= 7 && y <= 9 && x >= 4 && x <= 12) ||
        (y >= 11 && y <= 13 && x >= 4 && x <= 12) ||
        (x >= 3 && x <= 5 && y >= 4 && y <= 8) ||
        (x >= 10 && x <= 12 && y >= 8 && y <= 12)
      const color = isWhite ? white : blue
      bitmap[offset] = color.b
      bitmap[offset + 1] = color.g
      bitmap[offset + 2] = color.r
      bitmap[offset + 3] = color.a
    }
  }

  return nativeImage.createFromBuffer(bitmap, { width, height })
}

function createTrayIcon(): Electron.NativeImage {
  for (const candidate of resolveTrayIconCandidates()) {
    try {
      const img = nativeImage.createFromPath(candidate)
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16, quality: 'best' })
      }
    } catch {
    }
  }
  console.warn('[desktop] Tray icon asset not found; using visible fallback icon.')
  return createFallbackTrayIcon()
}

function reportDesktopUpdateFailure(operation: string, error: unknown): void {
  void logDesktopEvent(
    'desktop.update.failed',
    {
      operation,
      error: describeUnknownError(error),
    },
    { severity: 'warning' },
  )
}

function openDesktopReleases(): void {
  if (!isHttpOrHttpsUrl(DESKTOP_RELEASES_URL)) return
  void shell
    .openExternal(DESKTOP_RELEASES_URL)
    .catch((error) => reportDesktopUpdateFailure('open-releases', error))
}

function requestDesktopUpdateCheck(): void {
  if (DESKTOP_UPDATE_POLICY.mode !== 'electron-updater') {
    openDesktopReleases()
    return
  }

  void autoUpdater
    .checkForUpdatesAndNotify()
    .catch((error) => reportDesktopUpdateFailure('check', error))
}

function buildDesktopUpdateMenuItem(): Electron.MenuItemConstructorOptions {
  return DESKTOP_UPDATE_POLICY.mode === 'electron-updater'
    ? {
        label: 'Check for Updates',
        click: requestDesktopUpdateCheck,
      }
    : {
        label: 'View Releases…',
        click: openDesktopReleases,
      }
}

function buildTrayContextMenu(connectedCount: number | null): Electron.Menu {
  const autoLaunch = getAutoLaunchState()
  const quickInputAccelerator = registeredQuickInputAccelerator ?? DEFAULT_QUICK_INPUT_ACCELERATOR

  return Menu.buildFromTemplate([
    {
      label:
        connectedCount === null
          ? 'sepilotd — daemon offline'
          : `sepilotd — ${connectedCount} connected`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open sepilotd',
      click: () => {
        showMainWindow()
      },
    },
    {
      label: 'Open Quick Input',
      accelerator: quickInputAccelerator,
      click: () => {
        void openQuickInputWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'New Chat',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        runWhenMainWindowReadyForIpc((window) => {
          window.webContents.send('sepilot:new-chat')
        })
      },
    },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: autoLaunch.enabled,
      enabled: autoLaunch.supported,
      toolTip: autoLaunch.supported
        ? undefined
        : 'Use `sepilot daemon install-service` on Linux to enable systemd auto-start',
      click: (menuItem) => {
        setAutoLaunchEnabled(menuItem.checked)
        refreshTrayMenu()
      },
    },
    buildDesktopUpdateMenuItem(),
    { type: 'separator' },
    {
      label: 'Close Desktop Window',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        mainWindow?.hide()
        quickInputWindow?.hide()
        notificationWindow?.hide()
      },
    },
    {
      label: 'Exit tray helper',
      click: () => {
        isQuittingApp = true
        quickInputWindow?.close()
        notificationWindow?.close()
        mainWindow?.destroy()
        app.quit()
      },
    },
    {
      label: 'Shutdown daemon...',
      click: () => {
        void confirmAndShutdownDaemon({ parentWindow: mainWindow }).catch((error) => {
          console.warn('[desktop] Failed to shutdown daemon', error)
        })
      },
    },
  ])
}

function buildApplicationMenu(): Electron.Menu {
  const isMac = process.platform === 'darwin'

  const appMenu: Electron.MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.getName(),
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Settings…',
              accelerator: 'Cmd+,',
              click: () => {
                runWhenMainWindowReadyForIpc((window) => {
                  window.webContents.send('sepilot:open-settings')
                })
              },
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : []

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Chat',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          runWhenMainWindowReadyForIpc((window) => {
            window.webContents.send('sepilot:new-chat')
          })
        },
      },
      ...(isMac
        ? []
        : ([
            {
              label: 'Settings…',
              accelerator: 'Ctrl+,',
              click: () => {
                runWhenMainWindowReadyForIpc((window) => {
                  window.webContents.send('sepilot:open-settings')
                })
              },
            },
            { type: 'separator' },
            { role: 'quit' },
          ] as Electron.MenuItemConstructorOptions[])),
    ],
  }

  const editMenu: Electron.MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  }

  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      ...(app.isPackaged
        ? []
        : ([
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
          ] as Electron.MenuItemConstructorOptions[])),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  }

  const windowMenu: Electron.MenuItemConstructorOptions = {
    label: 'Window',
    submenu: isMac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }],
  }

  const helpMenu: Electron.MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      buildDesktopUpdateMenuItem(),
      ...(isMac
        ? []
        : ([{ type: 'separator' }, { role: 'about' }] as Electron.MenuItemConstructorOptions[])),
    ],
  }

  return Menu.buildFromTemplate([...appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu])
}

let lastConnectedCount: number | null = null
let trayPollInFlight = false

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(buildTrayContextMenu(lastConnectedCount))
}

async function pollDaemonClients(): Promise<void> {
  if (trayPollInFlight) return
  trayPollInFlight = true
  let connectedCount: number | null = null
  try {
    const client = await createDaemonClient()
    const snapshot = await client.systemClients({
      signal: AbortSignal.timeout(2_000),
    })
    connectedCount = snapshot.count
  } catch {
    connectedCount = null
  } finally {
    trayPollInFlight = false
  }
  if (connectedCount === lastConnectedCount) return
  lastConnectedCount = connectedCount
  refreshTrayMenu()
}

function createTray(): void {
  if (tray) return

  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('sepilotd')

  refreshTrayMenu()
  void pollDaemonClients()

  tray.on('right-click', () => {
    void pollDaemonClients()
  })

  tray.on('click', () => {
    showMainWindow()
  })
  tray.on('double-click', () => {
    showMainWindow()
  })
}

function extractReleaseNotes(releaseNotes: unknown): string | null {
  if (typeof releaseNotes === 'string') return releaseNotes || null
  if (Array.isArray(releaseNotes)) {
    const joined = releaseNotes
      .map((entry) => (entry && typeof entry === 'object' ? (entry as { note?: string | null }).note : null))
      .filter((note): note is string => Boolean(note))
      .join('\n\n---\n\n')
    return joined || null
  }
  return null
}

function setupAutoUpdater(): void {
  if (DESKTOP_UPDATE_POLICY.mode !== 'electron-updater') return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: extractReleaseNotes(info.releaseNotes),
    })
    void autoUpdater
      .downloadUpdate()
      .catch((error) => reportDesktopUpdateFailure('download', error))
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
      releaseNotes: extractReleaseNotes(info.releaseNotes),
    })
  })

  requestDesktopUpdateCheck()
  setInterval(
    requestDesktopUpdateCheck,
    4 * 60 * 60 * 1000,
  )
}

app.setName(TEST_PROFILE ? 'sepilot Test Instance' : 'sepilot')
configureMacDevDock(app, { platform: process.platform, isPackaged: app.isPackaged })

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId(DESKTOP_APP_USER_MODEL_ID)
    } catch {
    }
  }

  wireDesktopDaemonLifecycle(app, {
    startDaemon: startDesktopDaemon,
    startGateway: DESKTOP_PACKAGED_SMOKE_TEST ? undefined : startDesktopGateway,
    stopGateway: DESKTOP_PACKAGED_SMOKE_TEST ? undefined : stopGateway,
    onDaemonReady: async () => {
      markPackagedSmokeDaemonReady()
      await handleDaemonReady()
    },
    onGatewayReady: broadcastTransportConfigUpdated,
    onServiceStartupError: (service, error) => {
      void logDesktopEvent(
        'desktop.service.startup.failed',
        {
          service,
          error: describeUnknownError(error),
        },
        { severity: 'error' },
      )
      if (service === 'daemon') {
        finishPackagedSmokeTest(1, `daemon startup failed: ${describeUnknownError(error)}`)
      }
    },
    onReady: async () => {
      const macDevDockVisible = await showMacDevDock(app, {
        platform: process.platform,
        isPackaged: app.isPackaged,
      })
      if (process.platform === 'darwin' && !app.isPackaged) {
        console.info(`[desktop] macOS development Dock icon visible: ${macDevDockVisible}`)
      }
      Menu.setApplicationMenu(buildApplicationMenu())

      installDesktopProcessErrorHandlers()

      const navigationOptions = resolveMainFrameNavigationOptions()
      mainFrameNavigationOptions = navigationOptions
      session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
        callback(isRendererPermissionAllowed({
          permission,
          requestingUrl: details.requestingUrl,
          mediaTypes: 'mediaTypes' in details ? details.mediaTypes : undefined,
          navigation: mainFrameNavigationOptions,
        }))
      })
      session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => (
        isRendererPermissionAllowed({
          permission,
          requestingUrl: details.requestingUrl ?? requestingOrigin,
          mediaTypes: details.mediaType ? [details.mediaType] : undefined,
          navigation: mainFrameNavigationOptions,
        })
      ))
      session.defaultSession.webRequest.onBeforeRequest(
        {
          urls: ['http://*/*', 'https://*/*', 'file://*/*', `${APP_PROTOCOL_NAME}://*/*`],
        },
        (details, callback) => {
          if (
            details.resourceType === 'mainFrame' &&
            !isAllowedMainFrameNavigation(details.url, navigationOptions)
          ) {
            callback({ cancel: true })
          } else {
            callback({})
          }
        },
      )

      const { nextStaticRoot } = resolveDesktopAssetPaths(__dirname)
      if (nextStaticRoot) {
        await ensureAppProtocol(nextStaticRoot)
      }

      desktopLifecycleReady = true
      showMainWindow()
      if (DESKTOP_PACKAGED_SMOKE_TEST && !packagedSmokeFinished) {
        packagedSmokeTimeout = setTimeout(
          () => finishPackagedSmokeTest(1, 'renderer load timed out'),
          DESKTOP_PACKAGED_SMOKE_TIMEOUT_MS,
        )
        packagedSmokeTimeout.unref()
      }
      const settingsLoaded = await refreshQuickShortcutRegistrations({
        allowInitialFallback: true,
      })
      shortcutRegistrationInitialized = true
      if (!settingsLoaded && daemonReadyForCredentials) {
        await refreshQuickShortcutRegistrations()
      }
      ipcMain.handle('sepilot:quick-input/reload', async () => {
        await refreshQuickShortcutRegistrations()
        return lastQuickInputRegistration
      })
      ipcMain.handle('sepilot:quick-questions/reload', async () => {
        await refreshQuickShortcutRegistrations()
        return { ok: true }
      })
      ipcMain.handle('sepilot:quick-questions/registration', () => lastQuickQuestionRegistrations)
      ipcMain.handle(QUICK_INPUT_REGISTRATION_CHANNEL, () => lastQuickInputRegistration)
      ipcMain.handle(QUICK_INPUT_OPEN_CHANNEL, async () => {
        await openQuickInputWindow()
        return { ok: true }
      })
      startNotificationWatch()
      if (!TEST_PROFILE && desktopSettingsBuildFeatures.google) {
        startDesktopCalendarAutoSync()
      }
      if (!TEST_PROFILE && !DESKTOP_DISABLE_TRAY) {
        createTray()
      }

      if (!TEST_PROFILE && DESKTOP_UPDATE_POLICY.mode === 'electron-updater') {
        setupAutoUpdater()
      }
    },
  })

  app.on('window-all-closed', () => {
    if (isQuittingApp && process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    petWindow.close()
    isQuittingApp = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopNotificationWatch()
    stopDesktopCalendarAutoSync()
    terminalSessions.killAll()
  })

  app.on('activate', () => {
    showMainWindow()
  })
}
