import { contextBridge, ipcRenderer } from 'electron'
import { randomUUID } from 'node:crypto'
import { createActiveRunRegistry } from './active-run.js'
import { createNotificationPushBuffer } from './notification-buffer.js'
import { requireDaemonMemoryScope } from './memory-scope.js'
import { TRANSPORT_CONFIG_UPDATED_CHANNEL } from '../shared/transport-events.js'
import { desktopSettingsBuildFeatures } from '../shared/settings-build-features.js'
import {
  DaemonClient,
  createDaemonChatRunController,
  forwardDaemonStream,
  GatewayClient,
  resolveDaemonChatRunAbortReason,
  runDaemonWsClientChat,
  shouldFallbackFromInteractiveWsError,
  streamChatViaSse,
  streamChatWithFallback,
  type ChatOptions,
  type ChatStreamOptions,
  type DaemonChatRunController,
  type DaemonFileMemorySectionUpdateResult,
  type DaemonFileMemorySnapshot,
  type DesktopShellExitEvent,
  type DesktopShellStartInput,
  type DaemonMemoryAddOptions,
  type DaemonMemoryAuditOptions,
  type DaemonMemoryDeleteOptions,
  type DaemonMemoryReindexResult,
  type DaemonMemoryDocumentIngestInput,
  type DaemonMemoryDocumentSearchOptions,
  type DaemonMemoryLifecycleOptions,
  type DaemonMemoryMaintenanceInput,
  type DaemonMemoryRecentOptions,
  type DaemonMemoryScopeTransferInput,
  type DaemonMemoryScopeTransferResult,
  type DaemonMemoryScopes,
  type DaemonMemorySearchOptions,
  type DaemonMemorySecurityAuditOptions,
  type DaemonMemorySecurityAuditResult,
  type DaemonMemorySemanticStatus,
  type DaemonMemoryUpdateInput,
  type DaemonChatStreamPayload,
  type DaemonSessionsWatchPayload,
  type DaemonSessionWatchPayload,
  type DesktopAppSaveInput,
  type DesktopAppStorageReadInput,
  type DesktopAppStorageWriteInput,
  type DesktopCalendarAutoSyncInput,
  type DesktopCalendarGoogleDeleteInput,
  type DesktopCalendarGoogleSyncInput,
  type DesktopCalendarGoogleSyncState,
  type DesktopCalendarIcsExportInput,
  type DesktopDiagnosticsExportInput,
  type DesktopWikiFolderExportApplyInput,
  type DesktopWikiFolderExportPayload,
  type DesktopKubernetesSnapshotInput,
  type DesktopRancherImportInput,
  type DesktopMarketQuotesInput,
  type DesktopRendererErrorReportInput,
  type DesktopServiceHealthCheckInput,
  type DesktopSmartHomeDeviceCommandInput,
  type DesktopSmartHomeSyncInput,
  type GatewayTicketComment,
  type GatewayTicketCommentsWatchPayload,
  type GatewayTicketsWatchPayload,
  type SepilotDesktopApi,
  watchDaemonSession,
  watchDaemonSessions,
} from '@sepilotd/api-client'
import { sanitizeDesktopChatOptions } from './chat-options.js'
import { DaemonWsClient } from '@sepilotd/api-client/node'
import { answerExternalQuestion, respondExternalApproval, streamExternalAgentChat } from './external-agent-chat.js'

interface TransportConfig {
  daemonOrigin: string
  gatewayOrigin: string
  daemonToken: string | null
  gatewayToken: string | null
}

let transportConfigPromise: Promise<TransportConfig> | null = null
let daemonClientPromise: Promise<DaemonClient> | null = null
let memoryDaemonClientPromise: Promise<DaemonClient> | null = null
let gatewayClientPromise: Promise<GatewayClient> | null = null
const activeRun = createActiveRunRegistry<DaemonChatRunController>(createDaemonChatRunController)

const NOTIFICATION_PUSH_CHANNEL = 'sepilot:notifications/push'
const NOTIFICATION_PUBLISH_CHANNEL = 'sepilot:notifications/publish'
const NOTIFICATION_OPEN_CHANNEL = 'sepilot:notifications/open'
const NOTIFICATION_DISMISS_CHANNEL = 'sepilot:notifications/dismiss'
const notificationPushBuffer = createNotificationPushBuffer()

ipcRenderer.on(NOTIFICATION_PUSH_CHANNEL, (_event, payload: unknown) => {
  notificationPushBuffer.push(payload)
})

ipcRenderer.on(TRANSPORT_CONFIG_UPDATED_CHANNEL, () => {
  transportConfigPromise = null
  daemonClientPromise = null
  memoryDaemonClientPromise = null
  gatewayClientPromise = null
  activeRun.cancelAll()
})

function beginActiveRun(sessionId?: string): DaemonChatRunController {
  return activeRun.begin(sessionId)
}

function clearActiveRun(controller: DaemonChatRunController) {
  activeRun.clear(controller)
}

function getTransportConfig(): Promise<TransportConfig> {
  transportConfigPromise ??= ipcRenderer.invoke('sepilot:get-transport-config')
  return transportConfigPromise
}

function getDaemonClient(): Promise<DaemonClient> {
  daemonClientPromise ??= getTransportConfig().then(
    ({ daemonOrigin, daemonToken }) =>
      new DaemonClient({
        baseUrl: daemonOrigin,
        token: daemonToken,
        surface: 'desktop',
      }),
  )
  return daemonClientPromise
}

function getMemoryDaemonClient(): Promise<DaemonClient> {
  memoryDaemonClientPromise ??= getTransportConfig().then(
    ({ daemonOrigin, daemonToken }) =>
      new DaemonClient({
        baseUrl: daemonOrigin,
        token: daemonToken,
        surface: 'desktop',
        memoryScope: requireDaemonMemoryScope(daemonOrigin, daemonToken),
      }),
  )
  return memoryDaemonClientPromise
}

function getGatewayClient(): Promise<GatewayClient> {
  gatewayClientPromise ??= getTransportConfig().then(
    ({ gatewayOrigin, gatewayToken }) =>
      new GatewayClient({
        baseUrl: gatewayOrigin,
        token: gatewayToken,
      }),
  )
  return gatewayClientPromise
}

type StorageBrokerOperation = 'tree' | 'read-file' | 'write-file'

interface StorageBrokerGrant {
  token: string
  operation: StorageBrokerOperation
  expiresAt: number
}

const STORAGE_BROKER_SECRET = randomUUID()
let storageBrokerRegistrationPromise: Promise<unknown> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function registerStorageBroker(): Promise<unknown> {
  storageBrokerRegistrationPromise ??= ipcRenderer.invoke(
    'sepilot:apps/storage/register-broker',
    STORAGE_BROKER_SECRET,
  )
  return storageBrokerRegistrationPromise
}

function assertStorageBrokerGrant(value: unknown): asserts value is StorageBrokerGrant {
  if (
    !isRecord(value) ||
    typeof value.token !== 'string' ||
    typeof value.expiresAt !== 'number' ||
    (value.operation !== 'tree' &&
      value.operation !== 'read-file' &&
      value.operation !== 'write-file')
  ) {
    throw new Error('Desktop app storage broker returned an invalid token.')
  }
}

async function getStorageBrokerToken(operation: StorageBrokerOperation): Promise<string> {
  await registerStorageBroker()
  const grant = await ipcRenderer.invoke('sepilot:apps/storage/broker-token', {
    operation,
    secret: STORAGE_BROKER_SECRET,
  })
  assertStorageBrokerGrant(grant)
  if (grant.operation !== operation) {
    throw new Error('Desktop app storage broker returned a mismatched token.')
  }
  return grant.token
}

async function invokeStorageBridge(operation: StorageBrokerOperation, input?: unknown) {
  const brokerToken = await getStorageBrokerToken(operation)
  return ipcRenderer.invoke(`sepilot:apps/storage/${operation}`, {
    ...(isRecord(input) ? input : {}),
    brokerToken,
  })
}

const api: SepilotDesktopApi = {
  health: async () => (await getDaemonClient()).health(),
  doctor: async () => (await getDaemonClient()).doctor(),
  healthReport: async (format: 'markdown' | 'json' = 'markdown') => {
    const client = await getDaemonClient()
    return format === 'json' ? client.healthReport('json') : client.healthReport('markdown')
  },
  saveHealthReport: async (content: string) =>
    ipcRenderer.invoke('sepilot:save-health-report', content),
  reportRendererError: async (input: DesktopRendererErrorReportInput) =>
    ipcRenderer.invoke('sepilot:renderer-error/report', input),
  exportDiagnostics: async (input?: DesktopDiagnosticsExportInput) =>
    ipcRenderer.invoke('sepilot:diagnostics/export', input),
  selectDirectory: async (defaultPath?: string) =>
    ipcRenderer.invoke('sepilot:select-directory', defaultPath),
  wikiFiles: {
    pickImportFolder: async () =>
      ipcRenderer.invoke('sepilot:wiki/folder/import'),
    previewFolderExport: async (payload: DesktopWikiFolderExportPayload) =>
      ipcRenderer.invoke('sepilot:wiki/folder/export/preview', payload),
    applyFolderExport: async (input: DesktopWikiFolderExportApplyInput) =>
      ipcRenderer.invoke('sepilot:wiki/folder/export/apply', input),
  },
  computerObservationImage: async (path: string) =>
    ipcRenderer.invoke('sepilot:computer-observation-image', path),
  shell: {
    start: async (input?: DesktopShellStartInput) =>
      ipcRenderer.invoke('sepilot:shell/start', input),
    write: async (id: string, data: string) => ipcRenderer.invoke('sepilot:shell/write', id, data),
    resize: async (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('sepilot:shell/resize', id, cols, rows),
    kill: async (id: string) => ipcRenderer.invoke('sepilot:shell/kill', id),
    readSshConfig: async () => ipcRenderer.invoke('sepilot:shell/read-ssh-config'),
    diagnose: async (input: DesktopShellStartInput) =>
      ipcRenderer.invoke('sepilot:shell/diagnose', input),
    onData: (id: string, handler: (data: string) => void) => {
      const channel = `sepilot:shell:data:${id}`
      const listener = (_event: unknown, data: string) => handler(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id: string, handler: (event: DesktopShellExitEvent) => void) => {
      const channel = `sepilot:shell:exit:${id}`
      const listener = (_event: unknown, payload: DesktopShellExitEvent) => handler(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },
  apps: {
    list: async () => ipcRenderer.invoke('sepilot:apps/list'),
    diagnostics: async () => ipcRenderer.invoke('sepilot:apps/diagnostics'),
    save: async (input: DesktopAppSaveInput) => ipcRenderer.invoke('sepilot:apps/save', input),
    saveData: async (id: string, data: Record<string, unknown>) =>
      ipcRenderer.invoke('sepilot:apps/save-data', id, data),
    readChat: async (id: string) => ipcRenderer.invoke('sepilot:apps/read-chat', id),
    saveChat: async (id: string, history) =>
      ipcRenderer.invoke('sepilot:apps/save-chat', id, history),
    restoreVersion: async (id: string, version: number) =>
      ipcRenderer.invoke('sepilot:apps/restore-version', id, version),
    exportApp: async (id: string) => ipcRenderer.invoke('sepilot:apps/export', id),
    importApp: async () => ipcRenderer.invoke('sepilot:apps/import'),
    exportBackup: async () => ipcRenderer.invoke('sepilot:apps/export-backup'),
    restoreBackup: async () => ipcRenderer.invoke('sepilot:apps/restore-backup'),
    audit: async (appId?: string) => ipcRenderer.invoke('sepilot:apps/audit', appId),
    recordAudit: async (input) => ipcRenderer.invoke('sepilot:apps/record-audit', input),
    delete: async (id: string) => ipcRenderer.invoke('sepilot:apps/delete', id),
    reset: async (apps: DesktopAppSaveInput[]) => ipcRenderer.invoke('sepilot:apps/reset', apps),
    storageTree: async () => invokeStorageBridge('tree'),
    storageReadFile: async (input: DesktopAppStorageReadInput) =>
      invokeStorageBridge('read-file', input),
    storageWriteFile: async (input: DesktopAppStorageWriteInput) =>
      invokeStorageBridge('write-file', input),
    checkServiceHealth: async (input: DesktopServiceHealthCheckInput) =>
      ipcRenderer.invoke('sepilot:apps/services/health-check', input),
    fetchMarketQuotes: async (input: DesktopMarketQuotesInput) =>
      ipcRenderer.invoke('sepilot:apps/market-quotes/fetch', input),
    fetchKubernetesSnapshot: async (input: DesktopKubernetesSnapshotInput) =>
      ipcRenderer.invoke('sepilot:apps/kubernetes/snapshot', input),
    importRancherClusters: async (input: DesktopRancherImportInput) =>
      ipcRenderer.invoke('sepilot:apps/kubernetes/rancher/import', input),
    deleteKubernetesCredential: async (connectionId: string) =>
      ipcRenderer.invoke('sepilot:apps/kubernetes/credential/delete', connectionId),
    ...(desktopSettingsBuildFeatures['smart-home']
      ? {
          smartHomeStatus: async () => ipcRenderer.invoke('sepilot:apps/smart-home/status'),
          syncSmartHomeDevices: async (input: DesktopSmartHomeSyncInput) =>
            ipcRenderer.invoke('sepilot:apps/smart-home/sync', input),
          commandSmartHomeDevice: async (input: DesktopSmartHomeDeviceCommandInput) =>
            ipcRenderer.invoke('sepilot:apps/smart-home/command', input),
        }
      : {}),
  },
  calendar: {
    status: async (appId?: string, state?: DesktopCalendarGoogleSyncState | null) =>
      ipcRenderer.invoke('sepilot:calendar/status', appId, state),
    listGoogleCalendars: async (appId?: string) =>
      ipcRenderer.invoke('sepilot:calendar/list-google-calendars', appId),
    configureGoogle: async (input: { clientId?: string | null }) =>
      ipcRenderer.invoke('sepilot:calendar/configure-google', input),
    configureGoogleCalendars: async (input: {
      appId: string
      appTitle?: string
      selectedCalendarIds: string[]
      defaultCalendarId?: string | null
    }) => ipcRenderer.invoke('sepilot:calendar/configure-google-calendars', input),
    connectGoogle: async () => ipcRenderer.invoke('sepilot:calendar/connect-google'),
    disconnectGoogle: async () => ipcRenderer.invoke('sepilot:calendar/disconnect-google'),
    syncAppEvents: async (input: DesktopCalendarGoogleSyncInput) =>
      ipcRenderer.invoke('sepilot:calendar/sync-app-events', input),
    deleteGoogleEvent: async (input: DesktopCalendarGoogleDeleteInput) =>
      ipcRenderer.invoke('sepilot:calendar/delete-google-event', input),
    configureAutoSync: async (input: DesktopCalendarAutoSyncInput) =>
      ipcRenderer.invoke('sepilot:calendar/configure-auto-sync', input),
    exportIcs: async (input: DesktopCalendarIcsExportInput) =>
      ipcRenderer.invoke('sepilot:calendar/export-ics', input),
  },
  chat: async (message: string, sessionId?: string, options?: ChatOptions) => {
    const { daemonOrigin, daemonToken } = await getTransportConfig()
    await requireDaemonMemoryScope(daemonOrigin, daemonToken)()
    return (await getMemoryDaemonClient()).chat(
      message,
      sessionId,
      sanitizeDesktopChatOptions(options),
    )
  },
  streamChat: async (
    message: string,
    sessionId: string | undefined,
    options: ChatStreamOptions | undefined,
    onEvent: (event: DaemonChatStreamPayload) => void,
  ) => {
    const sanitizedOptions = sanitizeDesktopChatOptions(options)
    const normalizedOptions: ChatStreamOptions =
      options?.textDeltaMode === 'buffered' || sanitizedOptions?.mode === 'writing'
        ? (sanitizedOptions ?? {})
        : { ...(sanitizedOptions ?? {}), textDeltaMode: 'live' }

    if (
      await streamExternalAgentChat({
        message,
        sessionId,
        options: normalizedOptions,
        onEvent,
        loadImage: async (id) => {
          const part = await (await getDaemonClient()).fileContentPart(id)
          if (part.type !== 'image' || part.source.type !== 'base64') throw new Error('Only uploaded images are supported by CLI chat.')
          return { mediaType: part.source.mediaType, data: part.source.data }
        },
        saveImage: async (image) => {
          const { files } = await (await getDaemonClient()).uploadFiles([{
            filename: `generated-${Date.now()}.${image.mediaType.split('/')[1]}`,
            mimeType: image.mediaType,
            content: Buffer.from(image.data, 'base64'),
          }])
          if (!files[0]) throw new Error('Could not save generated image')
          return `/api/v1/files/${encodeURIComponent(files[0].id)}/download`
        },
        persistTurn: async (turn) => {
          const client = await getDaemonClient()
          await client.recordTranscriptTurn(turn.sessionId, {
            userContent: turn.userContent,
            assistantContent: turn.assistantContent,
            title: turn.title,
            provider: turn.provider,
            model: turn.model,
            cwd: turn.cwd,
            tags: turn.tags,
          })
        },
        beginActiveRun: () => beginActiveRun(sessionId),
        clearActiveRun,
      })
    ) {
      return
    }

    const { daemonOrigin, daemonToken } = await getTransportConfig()
    await requireDaemonMemoryScope(daemonOrigin, daemonToken)()
    const client = await getMemoryDaemonClient()
    const wsClient = new DaemonWsClient({
      baseUrl: daemonOrigin,
      token: daemonToken,
      surface: 'desktop',
      memoryScope: requireDaemonMemoryScope(daemonOrigin, daemonToken),
    })
    const runController = beginActiveRun(sessionId)
    const closeWebSocket = () => wsClient.close()
    runController.signal.addEventListener('abort', closeWebSocket, { once: true })

    let wsSawEvent = false
    try {
      await streamChatWithFallback({
        runWebSocketChat: async () => {
          await runDaemonWsClientChat({
            wsClient,
            message,
            sessionId,
            options: normalizedOptions,
            onEvent: (event) => {
              wsSawEvent = true
              onEvent(event)
            },
          })
          const abortReason = resolveDaemonChatRunAbortReason(runController.signal)
          if (abortReason) {
            throw abortReason
          }
        },
        fallbackStream: () =>
          streamChatViaSse({
            client,
            message,
            sessionId,
            options: normalizedOptions,
            signal: runController.signal,
            onEvent,
          }),
        shouldFallback: (error) => shouldFallbackFromInteractiveWsError(error, {
          aborted: runController.signal.aborted,
          sawEvent: wsSawEvent,
        }),
      })
    } finally {
      clearActiveRun(runController)
      runController.signal.removeEventListener('abort', closeWebSocket)
      wsClient.close()
    }
  },
  streamApprovalResume: async (
    requestId: string,
    approved: boolean,
    sessionId: string | undefined,
    onEvent: (event: DaemonChatStreamPayload) => void,
  ) => {
    const client = await getDaemonClient()
    const runController = beginActiveRun(sessionId)

    try {
      const response = await client.resumeApprovalStream(
        requestId,
        approved,
        sessionId,
        undefined,
        { signal: runController.signal },
      )

      await forwardDaemonStream(response, onEvent)
    } catch (error) {
      throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
    } finally {
      clearActiveRun(runController)
    }
  },
  streamSessionResume: async (
    sessionId: string,
    onEvent: (event: DaemonChatStreamPayload) => void,
    options?: { force?: boolean },
  ) => {
    const client = await getDaemonClient()
    const runController = beginActiveRun(sessionId)

    try {
      const response = await client.resumeSessionStream(sessionId, options, {
        signal: runController.signal,
      })

      await forwardDaemonStream(response, onEvent)
    } catch (error) {
      throw resolveDaemonChatRunAbortReason(runController.signal, error) ?? error
    } finally {
      clearActiveRun(runController)
    }
  },
  cancelActiveRun: (sessionId?: string) => {
    activeRun.current(sessionId)?.cancel()
  },
  watchSession: async (sessionId: string, onEvent: (event: DaemonSessionWatchPayload) => void) => {
    const client = await getDaemonClient()
    const watcher = watchDaemonSession({
      client,
      sessionId,
      onEvent,
    })

    watcher.done.catch(() => {})
    return () => watcher.close()
  },
  watchSessions: async (onEvent: (event: DaemonSessionsWatchPayload) => void) => {
    const client = await getDaemonClient()
    const watcher = watchDaemonSessions({
      client,
      onEvent,
    })

    watcher.done.catch(() => {})
    return () => watcher.close()
  },
  respondApproval: async (
    requestId: string,
    approved: boolean,
    options?: {
      sessionId?: string
      scope?: 'once' | 'session' | 'always' | 'run' | 'session-all'
      rule?: { tool: string; pattern: string }
      note?: string
    },
  ) => {
    if (await respondExternalApproval(requestId, approved)) {
      return {
        requestId,
        decision: approved ? 'approved' : 'denied',
        approved,
        resolved: true,
        state: 'live',
      }
    }
    return (await getDaemonClient()).respondApproval(requestId, approved, options)
  },
  answerSessionQuestion: async (sessionId: string, questionId: string, answer: string) => {
    if (await answerExternalQuestion(questionId, answer)) return { answered: true }
    return (await getDaemonClient()).answerSessionQuestion(sessionId, questionId, answer)
  },
  session: async (id: string) => (await getDaemonClient()).session(id),
  sessionArtifacts: async (id: string) => (await getDaemonClient()).sessionArtifacts(id),
  sessions: async (query, options) => (await getDaemonClient()).sessions(query, options),
  deleteSession: async (id: string) => (await getDaemonClient()).deleteSession(id),
  compactSession: async (id: string) => (await getDaemonClient()).compactSession(id),
  usage: async () => (await getDaemonClient()).usage(),
  devices: async () => (await getDaemonClient()).devices(),
  config: async () => (await getDaemonClient()).config(),
  providers: async () => (await getDaemonClient()).providers(),
  personas: async () => (await getDaemonClient()).personas(),
  bots: async () => (await getDaemonClient()).bots(),
  skills: async () => (await getDaemonClient()).skills({ includeBuiltins: false }),
  skillSearch: async (query: string) =>
    (await getDaemonClient()).searchSkills(query, { includeBuiltins: false }),
  skillMarketplaceSearch: async (
    query: string,
    options?: { marketplace?: string; limit?: number },
  ) => (await getDaemonClient()).searchMarketplaceSkills(query, options),
  skillInstallPreview: async (source: string) =>
    (await getDaemonClient()).previewSkillInstall({ source }),
  skillInstall: async (source: string, options?: boolean | { force?: boolean; expectedDigest?: string }) =>
    (await getDaemonClient()).installSkill({
      source,
      ...(typeof options === 'boolean' ? { force: options } : options),
    }),
  listRecentMemory: async (options?: DaemonMemoryRecentOptions) =>
    (await getMemoryDaemonClient()).listRecentMemory(options),
  memorySearch: async (query: string, options?: DaemonMemorySearchOptions) =>
    (await getMemoryDaemonClient()).searchMemory(query, options),
  memoryDocumentSearch: async (query: string, options?: DaemonMemoryDocumentSearchOptions) =>
    (await getMemoryDaemonClient()).searchMemoryDocuments(query, options),
  memoryStatus: async () => {
    const client = await getMemoryDaemonClient()
    const response = await client.request<{ data: DaemonMemorySemanticStatus }>(
      '/api/v1/memory/status',
      { method: 'GET' },
    )
    return response.data
  },
  memoryLifecycle: async (options?: DaemonMemoryLifecycleOptions) =>
    (await getMemoryDaemonClient()).memoryLifecycle(options),
  memoryAudit: async (options?: DaemonMemoryAuditOptions) =>
    (await getMemoryDaemonClient()).memoryAudit(options),
  memorySecurityAudit: async (
    options?: DaemonMemorySecurityAuditOptions,
  ): Promise<DaemonMemorySecurityAuditResult> =>
    (await getMemoryDaemonClient()).memorySecurityAudit(options),
  memoryScopes: async (): Promise<DaemonMemoryScopes> =>
    (await getMemoryDaemonClient()).memoryScopes(),
  transferMemoryScope: async (
    source: string,
    input: DaemonMemoryScopeTransferInput,
  ): Promise<DaemonMemoryScopeTransferResult> =>
    (await getMemoryDaemonClient()).transferMemoryScope(source, input),
  runMemoryMaintenance: async (input?: DaemonMemoryMaintenanceInput) =>
    (await getMemoryDaemonClient()).runMemoryMaintenance(input),
  fileMemory: async () => {
    const client = await getMemoryDaemonClient()
    const response = await client.request<{ data: DaemonFileMemorySnapshot }>(
      '/api/v1/memory/file',
      { method: 'GET' },
    )
    return response.data
  },
  updateFileMemorySection: async (sectionTitle: string, content: string) => {
    const client = await getMemoryDaemonClient()
    const response = await client.request<{ data: DaemonFileMemorySectionUpdateResult }>(
      `/api/v1/memory/file/sections/${encodeURIComponent(sectionTitle)}`,
      { method: 'PUT', body: { content } },
    )
    return response.data
  },
  deleteFileMemorySection: async (sectionTitle: string) => {
    const client = await getMemoryDaemonClient()
    const response = await client.request<{ data: { deleted: boolean } }>(
      `/api/v1/memory/file/sections/${encodeURIComponent(sectionTitle)}`,
      { method: 'DELETE' },
    )
    return response.data
  },
  listMemoryDocuments: async (options) =>
    (await getMemoryDaemonClient()).listMemoryDocuments(options),
  ingestMemoryDocument: async (input: DaemonMemoryDocumentIngestInput) =>
    (await getMemoryDaemonClient()).ingestMemoryDocument(input),
  memoryDocument: async (id: string) => (await getMemoryDaemonClient()).memoryDocument(id),
  deleteMemoryDocument: async (id: string) =>
    (await getMemoryDaemonClient()).deleteMemoryDocument(id),
  addMemory: async (content: string, tags?: string[], options?: DaemonMemoryAddOptions) =>
    (await getMemoryDaemonClient()).addMemory(content, tags, options),
  updateMemory: async (id: string, input: DaemonMemoryUpdateInput) =>
    (await getMemoryDaemonClient()).updateMemory(id, input),
  deleteMemory: async (id: string, options?: DaemonMemoryDeleteOptions) =>
    (await getMemoryDaemonClient()).deleteMemory(id, options),
  reindexMemory: async () => {
    const client = await getMemoryDaemonClient()
    const response = await client.request<{ data: DaemonMemoryReindexResult }>(
      '/api/v1/memory/reindex',
      { method: 'POST' },
    )
    return response.data
  },
  updateConfig: async (updates: Record<string, unknown>) =>
    (await getDaemonClient()).updateConfig(updates),
  agents: async () => (await getDaemonClient()).agents(),
  projects: async () => (await getDaemonClient()).projects(),
  attachSessionToProject: async (projectId: string, sessionId: string) =>
    (await getDaemonClient()).attachSessionToProject(projectId, sessionId),
  tickets: async (status = 'open') => (await getGatewayClient()).listTickets({ status }),
  ticketComments: async (ticketId: string): Promise<GatewayTicketComment[]> =>
    (await getGatewayClient()).getComments(ticketId),
  watchTickets: async (
    status: string | undefined,
    onEvent: (event: GatewayTicketsWatchPayload) => void,
  ) => {
    const client = await getGatewayClient()
    const controller = new AbortController()

    const done = (async () => {
      for await (const event of client.watchTicketsEvents(
        { status },
        { signal: controller.signal },
      )) {
        await onEvent(event)
      }
    })()

    done.catch(() => {})
    return () => controller.abort()
  },
  watchTicketComments: async (
    ticketId: string,
    onEvent: (event: GatewayTicketCommentsWatchPayload) => void,
  ) => {
    const client = await getGatewayClient()
    const controller = new AbortController()

    const done = (async () => {
      for await (const event of client.watchTicketCommentsEvents(ticketId, {
        signal: controller.signal,
      })) {
        await onEvent(event)
      }
    })()

    done.catch(() => {})
    return () => controller.abort()
  },

  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('update-available', (_e, payload) =>
      callback(typeof payload === 'string' ? payload : payload?.version),
    )
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    ipcRenderer.on('update-downloaded', (_e, payload) =>
      callback(typeof payload === 'string' ? payload : payload?.version),
    )
  },
  onNewChat: (callback: () => void) => {
    ipcRenderer.on('new-chat', () => callback())
  },
}

const SEPILOTD_GENERIC_EVENT_CHANNELS = new Set([
  'sepilot:pet/action',
  'sepilot:service-startup-status',
  TRANSPORT_CONFIG_UPDATED_CHANNEL,
  'sepilot:quick-input/forward',
  'sepilot:quick-question/trigger',
  'sepilot:quick-input/registration',
  'sepilot:quick-question/registration',
  'sepilot:new-chat',
  'sepilot:open-settings',
  'sepilot:notification/opened',
])

const SEPILOTD_INVOKE_CHANNELS = new Set([
  'sepilot:preview/read-file',
  'sepilot:preview/pick-file',
  'sepilot:cli/models',
  'sepilot:pet/update',
  'sepilot:pet/say',
  'sepilot:get-transport-config',
  'sepilot:get-desktop-settings',
  'sepilot:save-desktop-settings',
  'sepilot:auto-launch/get',
  'sepilot:auto-launch/set',
  'sepilot:main-window/ready-for-actions',
  'sepilot:quick-questions/reload',
  'sepilot:quick-questions/registration',
  'sepilot:quick-input/reload',
  'sepilot:quick-input/registration',
  'sepilot:quick-input/open',
  'sepilot:writing/pick-open',
  'sepilot:writing/pick-save-as',
  'sepilot:apps/clipboard/read-text',
  'sepilot:apps/clipboard/write',
  'sepilot:apps/ai-usage/get',
  'sepilot:apps/note-file/export',
  'sepilot:apps/note-file/import',
  'sepilot:apps/note-file/link',
  'sepilot:apps/note-file/read',
  'sepilot:apps/note-file/write',
  'sepilot:apps/note-attachment/import-image',
  'sepilot:apps/note-attachment/save-clipboard-image',
  'sepilot:apps/note-attachment/list',
  'sepilot:apps/note-attachment/delete',
  'sepilot:apps/vault-file/export',
  'sepilot:apps/vault-file/import',
  'sepilot:apps/services-file/export',
  'sepilot:apps/services-file/import',
  'sepilot:apps/stocks-file/export',
  'sepilot:apps/stocks-file/import',
  'sepilot:apps/devices-file/export',
  'sepilot:apps/devices-file/import',
  'sepilot:apps/smartcar-file/export',
  'sepilot:apps/smartcar-file/import',
  'sepilot:browser/install-extension',
  'sepilot:browser/open-chrome-inspect',
  'sepilot:apps/dev/open',
  'sepilot:apps/git/inspect',
  'sepilot:apps/bookmarks/import-browser',
  'sepilot:apps/atlassian/request',
  'sepilot:apps/inbox-local-folder/pick',
  'sepilot:apps/inbox-local-folder/scan',
])

function assertAllowedSepilotdChannel(channel: unknown): asserts channel is string {
  if (typeof channel !== 'string' || !SEPILOTD_GENERIC_EVENT_CHANNELS.has(channel)) {
    throw new Error(`sepilotd bridge: channel '${String(channel)}' is not allowed`)
  }
}

function assertAllowedSepilotdInvokeChannel(channel: unknown): asserts channel is string {
  if (typeof channel !== 'string' || !SEPILOTD_INVOKE_CHANNELS.has(channel)) {
    throw new Error(`sepilotd bridge: invoke channel '${String(channel)}' is not allowed`)
  }
}

contextBridge.exposeInMainWorld('sepilotd', {
  platform: process.platform,
  appInfo: async () => ipcRenderer.invoke('sepilot:get-app-info'),
  invoke: async (channel: string, ...args: unknown[]) => {
    assertAllowedSepilotdInvokeChannel(channel)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: <T = unknown>(channel: string, handler: (payload: T) => void) => {
    assertAllowedSepilotdChannel(channel)
    const listener = (_event: unknown, payload: T) => handler(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
  update: {
    onAvailable: (handler: (payload: { version: string; releaseNotes: string | null }) => void) => {
      const listener = (
        _event: unknown,
        payload: string | { version: string; releaseNotes: string | null },
      ) =>
        handler(
          typeof payload === 'string' ? { version: payload, releaseNotes: null } : payload,
        )
      ipcRenderer.on('update-available', listener)
      return () => {
        ipcRenderer.removeListener('update-available', listener)
      }
    },
    onDownloaded: (handler: (payload: { version: string; releaseNotes: string | null }) => void) => {
      const listener = (
        _event: unknown,
        payload: string | { version: string; releaseNotes: string | null },
      ) =>
        handler(
          typeof payload === 'string' ? { version: payload, releaseNotes: null } : payload,
        )
      ipcRenderer.on('update-downloaded', listener)
      return () => {
        ipcRenderer.removeListener('update-downloaded', listener)
      }
    },
    install: async () => {},
  },
  quickInput: {
    publish: async (text: string) => ipcRenderer.invoke('sepilot:quick-input/publish', text),
  },
  notifications: {
    onPush: <T = unknown>(handler: (payload: T) => void) =>
      notificationPushBuffer.subscribe<T>(handler),
    publish: async (payload: unknown) => ipcRenderer.invoke(NOTIFICATION_PUBLISH_CHANNEL, payload),
    open: async (url?: string | null) => ipcRenderer.invoke(NOTIFICATION_OPEN_CHANNEL, url),
    dismiss: async () => ipcRenderer.invoke(NOTIFICATION_DISMISS_CHANNEL),
    getDiagnostics: async () => ipcRenderer.invoke('sepilot:notifications/diagnostics'),
  },
})
contextBridge.exposeInMainWorld('sepilot', api)
