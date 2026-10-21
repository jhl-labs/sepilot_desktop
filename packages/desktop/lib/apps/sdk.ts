import type {
  SepilotAppCapabilities,
  SepilotAppDataPolicy,
  SepilotAppDataSchema,
  SepilotAppHostRequestPermission,
  SepilotReadableAppRecord,
  SepilotReadableAppSearchResult,
  SepilotReadableAppSummary,
} from '@sepilotd/api-client'
import type { AppPagePermissions } from './types'

export const SEPILOT_APPS_SDK_VERSION = 1 as const

export const SEPILOT_APPS_SDK_ERROR_CODES = [
  'capability_disabled',
  'permission_denied',
  'broker_timeout',
  'broker_error',
  'sdk_error',
] as const

export type SepilotAppsSdkErrorCode = (typeof SEPILOT_APPS_SDK_ERROR_CODES)[number] | (string & {})

export type SepilotAppsSdkPath = string | readonly string[]

export interface SepilotAppsSdkManifest {
  id: string
  title: string
  kind: string
  summary?: string
  category?: string
  origin?: string
  version?: number
  dataPolicy?: SepilotAppDataPolicy
  capabilities?: SepilotAppCapabilities
  hostRequests?: SepilotAppHostRequestPermission[]
  dataSchema?: SepilotAppDataSchema
}

export interface SepilotAppsSdkError extends Error {
  name: 'SepilotAppSdkError'
  code: SepilotAppsSdkErrorCode
  capability?: string
  operation?: string
}

export interface SepilotAppsSdkErrorDetails {
  capability?: string
  operation?: string
  [key: string]: unknown
}

export interface SepilotAppsDataApi {
  get(): Record<string, unknown>
  get<T = unknown>(path: SepilotAppsSdkPath): T | undefined
  set<T = unknown>(path: SepilotAppsSdkPath, value: T): T
  patch(patch: Record<string, unknown>): Record<string, unknown>
  patch<T extends Record<string, unknown>>(path: SepilotAppsSdkPath, patch: Partial<T>): T
  batch<T extends Record<string, unknown>>(mutator: (draft: Record<string, unknown>) => T): T
  batch(mutator: (draft: Record<string, unknown>) => void): Record<string, unknown>
  remove(path: SepilotAppsSdkPath): Record<string, unknown>
}

export interface SepilotAppsCollectionApi<T extends Record<string, unknown>> {
  list(): T[]
  get(id: string | number): T | null
  upsert(item: T | (Partial<T> & Record<string, unknown>)): T & { id: string }
  remove(id: string | number): T[]
  clear(): []
}

export interface SepilotAppsTimeSeriesPoint {
  ts: number
  [key: string]: unknown
}

export interface SepilotAppsTimeSeriesListOptions {
  from?: number
  to?: number
  limit?: number
}

export interface SepilotAppsTimeSeriesApi<T extends SepilotAppsTimeSeriesPoint> {
  append(point: Omit<T, 'ts'> & Partial<Pick<T, 'ts'>>): T
  list(options?: SepilotAppsTimeSeriesListOptions): T[]
  clear(): []
}

export interface SepilotAppsSearchOptions {
  type?: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  includeHtml?: boolean
  interAppReadableOnly?: boolean
}

export interface SepilotAppsBrokerApi {
  list(): Promise<SepilotReadableAppSummary[]>
  read(id: string): Promise<SepilotReadableAppRecord>
  search(
    query: string,
    options?: SepilotAppsSearchOptions,
  ): Promise<SepilotReadableAppSearchResult[]>
  syncSharedWorkspace(): Promise<{ changedPageIds: string[]; changedCount: number }>
}

export interface SepilotAppsSchedulerJob {
  id?: string
  name?: string
  instruction?: string
  when?: string
  cron?: string
  runAt?: number
  timezone?: string
  enabled?: boolean
  maxAttempts?: number
  retryBackoffMs?: number
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface SepilotAppsSchedulerApi {
  list(): Promise<SepilotAppsSchedulerJob[]>
  upsert(job: SepilotAppsSchedulerJob): Promise<unknown>
  run(id: string): Promise<unknown>
  pause(id: string): Promise<unknown>
  resume(id: string): Promise<unknown>
  remove(id: string): Promise<unknown>
}

export interface SepilotAppsNotification {
  id?: string
  title: string
  body?: string
  url?: string | null
  [key: string]: unknown
}

export interface SepilotAppsScheduledNotification extends SepilotAppsNotification {
  when?: string
  runAt?: number
  timezone?: string
  source?: Record<string, unknown>
}

export interface SepilotAppsNotificationsApi {
  list(): Promise<SepilotAppsNotification[]>
  publish(notification: SepilotAppsNotification): Promise<SepilotAppsNotification>
  schedule(notification: SepilotAppsScheduledNotification): Promise<unknown>
}

export interface SepilotAppsClipboardApi {
  readText(): Promise<{ text: string }>
  write(input: { text?: string; html?: string; rtf?: string }): Promise<{ ok: true }>
  writeText(text: string): Promise<{ ok: true }>
}

export type SepilotAppsWritingAssistMode = 'polish' | 'summarize' | 'actions' | 'continue'

export interface SepilotAppsWritingAssistRequest {
  mode: SepilotAppsWritingAssistMode
  title?: string
  tags?: string
  body: string
  locale?: string
}

export interface SepilotAppsWritingAssistResponse {
  text: string
}

export interface SepilotAppsAgentApi {
  write(input: SepilotAppsWritingAssistRequest): Promise<SepilotAppsWritingAssistResponse>
}

export type SepilotAppsGitHubProjectOwnerType = 'user' | 'organization'

export interface SepilotAppsGitHubProjectRef {
  ownerType: SepilotAppsGitHubProjectOwnerType
  owner: string
  number: number
}

export interface SepilotAppsGitHubOAuthStatus {
  connected: boolean
  login: string | null
  configured: boolean
  pending: boolean
  lastError: string | null
}

export interface SepilotAppsGitHubProjectSummary extends SepilotAppsGitHubProjectRef {
  id: string
  name: string
  url: string
  updatedAt: string
  viewerCanUpdate: boolean
  ownerName?: string
}

export interface SepilotAppsGitHubProjectsList {
  provider: 'github-projects-v2'
  login: string
  projects: SepilotAppsGitHubProjectSummary[]
  pulledAt: number
}

export interface SepilotAppsGitHubProjectColumn {
  id: string
  name: string
  position: number
  remoteOptionId: string | null
}

export interface SepilotAppsGitHubProjectCard {
  id: string
  columnId: string
  title: string
  body?: string
  url?: string
  assignees: string[]
  createdAt: string
  updatedAt: string
  fields: Record<string, unknown>
}

export interface SepilotAppsGitHubProjectBoard extends SepilotAppsGitHubProjectRef {
  provider: 'github-projects-v2'
  id: string
  name: string
  url: string
  updatedAt: string
  viewerCanUpdate: boolean
  statusFieldId: string
  columns: SepilotAppsGitHubProjectColumn[]
  cards: SepilotAppsGitHubProjectCard[]
  pulledAt: number
}

export interface SepilotAppsGitHubWorkflowApi {
  status(): Promise<SepilotAppsGitHubOAuthStatus>
  listProjects(input?: { query?: string }): Promise<SepilotAppsGitHubProjectsList>
  getProject(input: SepilotAppsGitHubProjectRef): Promise<SepilotAppsGitHubProjectBoard>
  createDraft(
    input: SepilotAppsGitHubProjectRef & { title: string; body?: string; columnId?: string },
  ): Promise<{ itemId: string }>
  moveCard(
    input: SepilotAppsGitHubProjectRef & { itemId: string; columnId: string },
  ): Promise<{ ok: true; itemId: string; columnId: string; updatedAt: number }>
  updateDraft(
    input: SepilotAppsGitHubProjectRef & { draftIssueId: string; title?: string; body?: string },
  ): Promise<{ ok: true; draftIssueId: string; updatedAt: number }>
}

export interface SepilotAppsWorkflowApi {
  github: SepilotAppsGitHubWorkflowApi
}

export interface SepilotAppsAesGcmEnvelope {
  salt: string
  iv: string
  cipher: string
  updatedAt: number
}

export interface SepilotAppsCryptoStatus {
  available: boolean
  provider: 'webcrypto' | 'unavailable'
}

export interface SepilotAppsCryptoApi {
  status(): Promise<SepilotAppsCryptoStatus>
  encryptAesGcm<T = unknown>(input: {
    passphrase: string
    value: T
  }): Promise<SepilotAppsAesGcmEnvelope>
  decryptAesGcm<T = unknown>(input: {
    passphrase: string
    vault: SepilotAppsAesGcmEnvelope
  }): Promise<{ value: T }>
}

export interface SepilotAppsSdkErrorsApi {
  isSdkError(error: unknown): error is SepilotAppsSdkError
  create(
    code: SepilotAppsSdkErrorCode,
    message: string,
    details?: SepilotAppsSdkErrorDetails,
  ): SepilotAppsSdkError
}

export interface SepilotAppsSdk {
  version: 1
  frameworkVersion: 1
  sdkVersion: typeof SEPILOT_APPS_SDK_VERSION
  appId: string
  getManifest(): Readonly<SepilotAppsSdkManifest>
  getPermissions(): Readonly<AppPagePermissions>
  getCapabilities(): Readonly<SepilotAppCapabilities>
  getHostRequests(): readonly SepilotAppHostRequestPermission[]
  getDataPolicy(): Readonly<SepilotAppDataPolicy>
  getState(): Record<string, unknown>
  save(next: Record<string, unknown>): Record<string, unknown>
  patch(next: Record<string, unknown>): Record<string, unknown>
  data: SepilotAppsDataApi
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
  ): SepilotAppsCollectionApi<T>
  timeSeries<T extends SepilotAppsTimeSeriesPoint = SepilotAppsTimeSeriesPoint>(
    name: string,
  ): SepilotAppsTimeSeriesApi<T>
  apps: SepilotAppsBrokerApi
  scheduler: SepilotAppsSchedulerApi
  notifications: SepilotAppsNotificationsApi
  clipboard: SepilotAppsClipboardApi
  agent: SepilotAppsAgentApi
  workflow: SepilotAppsWorkflowApi
  crypto: SepilotAppsCryptoApi
  request<T = unknown>(capability: string, input?: Record<string, unknown>): Promise<T>
  errors: SepilotAppsSdkErrorsApi
}

export interface SepilotAppsWindow extends Window {
  sepilotApps: SepilotAppsSdk
  sepilotOffice: SepilotAppsSdk
}

declare global {
  interface Window {
    sepilotApps?: SepilotAppsSdk
    sepilotOffice?: SepilotAppsSdk
  }
}

export const SEPILOT_APPS_SDK_PROMPT_REFERENCE = `- Prefer sepilotd Apps SDK v1:
  - window.sepilotApps.data.get(path), data.set(path, value), data.patch(pathOrObject, patch?), data.remove(path)
  - Use synchronous window.sepilotApps.data.batch(draft => { ... }) when one user action changes several fields/collections; the host receives one autosave update.
  - window.sepilotApps.collection(name).list/get/upsert/remove/clear for app-owned tables
  - window.sepilotApps.timeSeries(name).append/list/clear for dated metrics and histories
  - window.sepilotApps.apps.list/read/search for redacted read-only inter-app context; apps.syncSharedWorkspace() refreshes built-in shared workflow projections for the current app
  - window.sepilotApps.scheduler.upsert/list/run/pause/resume/remove for app-owned daemon background jobs
  - window.sepilotApps.notifications.publish/list/schedule for desktop/daemon notifications and reminders
  - window.sepilotApps.clipboard.readText()/writeText(text)/write({ text, html, rtf }) for explicit user-triggered paste/copy actions
  - window.sepilotApps.agent.write({ mode, title, tags, body, locale }) for focused writing assistance when agentTools is enabled
  - window.sepilotApps.workflow.github.status/listProjects/getProject/createDraft/moveCard/updateDraft for daemon-mediated GitHub Projects v2 sync when workflow is enabled
  - window.sepilotApps.crypto.status/encryptAesGcm/decryptAesGcm for encryption-capable vault apps
  - window.sepilotApps.request(op, input) for host requests explicitly listed in getManifest().hostRequests
  - window.sepilotApps.getCapabilities(), getHostRequests(), getPermissions(), getDataPolicy() to inspect the app contract
  - Disabled SDK capabilities throw SepilotAppSdkError with code/capability/operation; catch with window.sepilotApps.errors.isSdkError(error)
  - Do not call scheduler, notifications, workflow, crypto, inter-app APIs, collections, timeSeries, or host requests when the corresponding capability/request is disabled.`
