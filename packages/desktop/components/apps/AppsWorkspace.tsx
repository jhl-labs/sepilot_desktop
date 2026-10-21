'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampAppReadLimit,
  isAppDataReadableByApps,
  rankAppSearchRecords,
  redactAppData,
  SEPILOT_APPS_FRAMEWORK_VERSION,
  type DesktopAppAuditInput,
  type DesktopAppChatTurn,
  type DesktopCalendarEventInput,
  type DesktopCalendarGoogleSyncState,
  type DesktopAppStorageSnapshot,
  type DesktopKubernetesSnapshotInput,
  type DesktopRancherImportInput,
  type DesktopMarketQuotesInput,
  type DesktopSmartHomeDeviceCommandInput,
  type DesktopSmartHomeSyncInput,
  type SepilotReadableAppRecord,
  type SepilotReadableAppSearchResult,
  type SepilotReadableAppSummary,
  type SepilotAppCapabilities,
  type SepilotAppDataPolicy,
} from '@sepilotd/api-client'
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  CheckCircle2,
  Cpu,
  GitCompare,
  LayoutGrid,
  LoaderCircle,
  MessageCircle,
  Plus,
  PlusCircle,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createChatApi } from '@/lib/api/chat'
import { createGitHubApi, type SyncRepo } from '@/lib/api/github'
import { createGitHubProjectsApi, type GitHubProjectRef } from '@/lib/api/github-projects'
import { createMessageSubscriptionApi } from '@/lib/api/message-subscription'
import { createNotificationsApi } from '@/lib/api/notifications'
import { createSchedulerApi } from '@/lib/api/scheduler'
import { createSettingsApi } from '@/lib/api/settings'
import { useTransport } from '@/components/providers/transport-provider'
import { getDesktopApi, invokeDesktop } from '@/lib/electron/bridge'
import {
  APP_IFRAME_SANDBOX,
  DEFAULT_APP_PERMISSIONS,
  analyzeAppDataPreservation,
  applyAppChatMutations,
  buildAppChatAgentPrompt,
  buildAppCodeAgentPrompt,
  buildAppSrcDoc,
  extractAppChatAgentResponse,
  extractHtmlDocument,
  getEffectiveAppCapabilities,
  getEffectiveAppHostRequests,
  inferAppSummary,
  inferAppTitle,
  normalizeAppRuntimeError,
  validateAppHtml,
} from '@/lib/apps/runtime'
import {
  decryptAppsAesGcmJson,
  encryptAppsAesGcmJson,
  hasAppsAesGcmCrypto,
} from '@/lib/apps/crypto'
import type { AppPage } from '@/lib/apps/types'
import { getAppTemplate } from '@/lib/apps/templates'
import type {
  AppChatAction,
  AppChatMutation,
  AppChatMutationIssue,
  AppChatMutationApplyResult,
  AppDataPreservationReport,
  AppRuntimeError,
} from '@/lib/apps/runtime'
import { CapabilityUnavailableError, createAppsApi, DaemonAppsToolError } from '@/lib/api/apps'
import { useAppsStore } from '@/lib/store/apps-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useProviderCatalog } from '@/lib/hooks/use-provider-catalog'
import { desktopSettingsFeatures } from '@/lib/feature-profile'
import { cn } from '@/lib/utils/cn'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { FloatingAppSurface } from './FloatingAppSurface'
import { PersonalAssistantHome, type AssistantNavigationProps } from './PersonalAssistantHome'
import { AppAssistantComposer } from './AppAssistantComposer'
import { buildAssistantRequest } from '@/lib/apps/assistant'

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const mo = new MutationObserver(update)
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return isDark
}

interface AppDraftDiff {
  added: number
  removed: number
  changed: number
}

interface PendingAppDraft {
  target: 'current' | 'new'
  request: string
  title: string
  summary: string
  html: string
  validation: ReturnType<typeof validateAppHtml>
  preservation: AppDataPreservationReport
  diff: AppDraftDiff
  previewPage: AppPage
}

interface AppTabGroup {
  key: string
  label: string
  pages: AppPage[]
  accent: string
}

interface AppApiRequestPayload {
  type?: string
  pageId?: string
  requestId?: string
  op?: string
  input?: Record<string, unknown>
}

const NOTE_FILE_HOST_CHANNELS = new Map([
  ['notes.file.export', 'sepilot:apps/note-file/export'],
  ['notes.file.import', 'sepilot:apps/note-file/import'],
  ['notes.file.link', 'sepilot:apps/note-file/link'],
  ['notes.file.read', 'sepilot:apps/note-file/read'],
  ['notes.file.write', 'sepilot:apps/note-file/write'],
  ['notes.attachment.importImage', 'sepilot:apps/note-attachment/import-image'],
  ['notes.attachment.saveClipboardImage', 'sepilot:apps/note-attachment/save-clipboard-image'],
  ['notes.attachment.list', 'sepilot:apps/note-attachment/list'],
  ['notes.attachment.delete', 'sepilot:apps/note-attachment/delete'],
])

const VAULT_FILE_HOST_CHANNELS = new Map([
  ['vault.file.export', 'sepilot:apps/vault-file/export'],
  ['vault.file.import', 'sepilot:apps/vault-file/import'],
])

const SERVICES_FILE_HOST_CHANNELS = new Map([
  ['services.file.export', 'sepilot:apps/services-file/export'],
  ['services.file.import', 'sepilot:apps/services-file/import'],
])

const DEVICES_FILE_HOST_CHANNELS = new Map([
  ['devices.file.export', 'sepilot:apps/devices-file/export'],
  ['devices.file.import', 'sepilot:apps/devices-file/import'],
])

const STOCKS_FILE_HOST_CHANNELS = new Map([
  ['stocks.file.export', 'sepilot:apps/stocks-file/export'],
  ['stocks.file.import', 'sepilot:apps/stocks-file/import'],
])

const SMARTCAR_FILE_HOST_CHANNELS = new Map([
  ['smartcar.file.export', 'sepilot:apps/smartcar-file/export'],
  ['smartcar.file.import', 'sepilot:apps/smartcar-file/import'],
])

interface AppApiErrorPayload {
  code: string
  message: string
  operation?: string
}

type AppChatTurn = DesktopAppChatTurn

interface PendingAppChatMutation {
  pageId: string
  pageTitle: string
  request: string
  reply: string
  previousData: Record<string, unknown>
  mutations: AppChatMutation[]
  dataChanged: boolean
  actions: AppChatAction[]
  applied: string[]
  issues: AppChatMutationIssue[]
  localNextData?: Record<string, unknown>
}

interface AppChatUndoState {
  previousData: Record<string, unknown>
  label: string
  createdAt: number
}

interface SandboxOriginatedDataEntry {
  pageId: string
  signature: string
  remainingEchoes: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stableJsonSignature(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_key, item) => {
      if (!item || typeof item !== 'object') return item
      if (seen.has(item)) return null
      seen.add(item)
      if (Array.isArray(item)) return item
      return Object.keys(item)
        .sort()
        .reduce<Record<string, unknown>>((record, key) => {
          record[key] = (item as Record<string, unknown>)[key]
          return record
        }, {})
    })
  } catch {
    return ''
  }
}

function appSrcDocSignature(
  page: AppPage | null,
  theme: 'light' | 'dark',
  reloadNonce = 0,
): string {
  if (!page) return ''
  return stableJsonSignature({
    theme,
    reloadNonce,
    id: page.id,
    html: page.html,
    title: page.title,
    kind: page.kind,
    summary: page.summary,
    category: page.category,
    origin: page.origin,
    version: page.version ?? 1,
    dataPolicy: page.dataPolicy,
    capabilities: getEffectiveAppCapabilities(page),
    hostRequests: getEffectiveAppHostRequests(page),
    dataSchema: page.dataSchema,
    permissions: page.permissions ?? DEFAULT_APP_PERMISSIONS,
  })
}

const APP_CHAT_HISTORY_LIMIT = 40
const APP_CHAT_CONTENT_LIMIT = 4000
const APP_CHAT_FALLBACK_STORAGE_PREFIX = 'sepilotd.apps.chat.v1.'
const APP_INTERNAL_CHAT_TAGS = ['micro-app', 'surface:micro-apps']

function normalizeAppChatTurn(value: unknown): AppChatTurn | null {
  if (!isRecord(value)) return null
  const role = value.role
  const content = value.content
  const createdAt = value.createdAt
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
  const normalizedCreatedAt =
    typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : Date.now()
  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim().slice(0, 160)
        : `${role}-${normalizedCreatedAt}`,
    role,
    content: content.slice(0, APP_CHAT_CONTENT_LIMIT),
    createdAt: normalizedCreatedAt,
    dataChanged: typeof value.dataChanged === 'boolean' ? value.dataChanged : undefined,
    statusLabel:
      typeof value.statusLabel === 'string' ? value.statusLabel.trim().slice(0, 120) : undefined,
  }
}

function normalizeAppChatHistory(value: unknown): AppChatTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeAppChatTurn)
    .filter((turn): turn is AppChatTurn => Boolean(turn))
    .slice(-APP_CHAT_HISTORY_LIMIT)
}

function fallbackAppChatKey(pageId: string): string {
  return `${APP_CHAT_FALLBACK_STORAGE_PREFIX}${pageId}`
}

async function loadPersistedAppChatHistory(pageId: string): Promise<AppChatTurn[]> {
  const api = getDesktopApi()?.apps
  if (api?.readChat) {
    try {
      return normalizeAppChatHistory(await api.readChat(pageId))
    } catch {
      return []
    }
  }
  if (typeof window === 'undefined') return []
  try {
    return normalizeAppChatHistory(
      JSON.parse(window.localStorage.getItem(fallbackAppChatKey(pageId)) ?? '[]'),
    )
  } catch {
    return []
  }
}

async function savePersistedAppChatHistory(pageId: string, history: AppChatTurn[]): Promise<void> {
  const normalized = normalizeAppChatHistory(history)
  const api = getDesktopApi()?.apps
  if (api?.saveChat) {
    await api.saveChat(pageId, normalized)
    return
  }
  if (typeof window === 'undefined') return
  window.localStorage.setItem(fallbackAppChatKey(pageId), JSON.stringify(normalized))
}

function appChatIssue(
  code: string,
  message: string,
  severity: AppChatMutationIssue['severity'] = 'error',
): AppChatMutationIssue {
  return { severity, code, message }
}

function appApiErrorPayload(error: unknown, operation?: string): AppApiErrorPayload {
  const code =
    error instanceof DaemonAppsToolError && error.result.code
      ? error.result.code
      : isRecord(error) && typeof error.code === 'string'
        ? error.code
        : 'broker_error'
  return {
    code,
    message: error instanceof Error ? error.message : String(error),
    operation,
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

type WritingAssistMode = 'polish' | 'summarize' | 'actions' | 'continue'

const WRITING_ASSIST_MODES = new Set<WritingAssistMode>([
  'polish',
  'summarize',
  'actions',
  'continue',
])

function normalizeWritingAssistMode(value: unknown): WritingAssistMode {
  return WRITING_ASSIST_MODES.has(value as WritingAssistMode)
    ? (value as WritingAssistMode)
    : 'polish'
}

function buildWritingAssistPrompt(input: {
  mode: WritingAssistMode
  title: string
  tags: string
  body: string
  locale: string
}): string {
  const instructions: Record<WritingAssistMode, string> = {
    polish:
      '본문 전체를 더 자연스럽고 명료하게 다듬어라. 의미를 바꾸지 말고, Markdown 구조와 체크박스는 유지하라. 결과 본문만 반환하라.',
    summarize: '노트 끝에 붙일 짧은 요약 섹션을 작성하라. "요약" 제목과 핵심 bullet만 반환하라.',
    actions:
      '노트에서 실행 항목만 추출하라. "다음 액션" 제목 아래에 "- [ ]" 체크리스트로 반환하라. 없는 항목은 만들지 말라.',
    continue:
      '기존 문체와 구조를 이어받아 다음에 쓸 수 있는 짧은 문단이나 bullet을 작성하라. 이어 붙일 본문만 반환하라.',
  }

  return `당신은 sepilotd 노트 앱의 글쓰기 보조 도구입니다.
언어: ${input.locale || 'ko-KR'}
작업: ${instructions[input.mode]}
제목: ${input.title || '제목 없음'}
태그: ${input.tags || '없음'}

노트 본문:
${input.body || '(비어 있음)'}`
}

function extractWritingAssistText(content: string): string {
  const trimmed = content.trim()
  const fenced = /^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}

function validateAppChatActions(
  page: AppPage,
  actions: AppChatAction[] | undefined,
): { ok: boolean; actions: AppChatAction[]; applied: string[]; issues: AppChatMutationIssue[] } {
  const requested = actions ?? []
  const capabilities = pageCapabilities(page)
  const validActions: AppChatAction[] = []
  const applied: string[] = []
  const issues: AppChatMutationIssue[] = []

  for (const action of requested) {
    if (!isRecord(action) || typeof action.op !== 'string') {
      issues.push(appChatIssue('invalid_action', 'Action must include an op.'))
      continue
    }
    if (action.op === 'scheduler.upsert') {
      if (capabilities.scheduler !== true) {
        issues.push(appChatIssue('scheduler_not_granted', 'Scheduler capability is not granted.'))
        continue
      }
      const instruction = cleanText(action.instruction, 1000)
      if (!instruction) {
        issues.push(
          appChatIssue('scheduler_instruction_required', 'Scheduler instruction is required.'),
        )
        continue
      }
      if (!cleanText(action.when, 120) && !cleanText(action.cron, 120)) {
        issues.push(appChatIssue('scheduler_time_required', 'Scheduler action needs when or cron.'))
        continue
      }
      validActions.push(action)
      applied.push(`scheduler.upsert:${appScopedId(page.id, action.id)}`)
      continue
    }
    if (action.op === 'scheduler.remove') {
      if (capabilities.scheduler !== true) {
        issues.push(appChatIssue('scheduler_not_granted', 'Scheduler capability is not granted.'))
        continue
      }
      if (!cleanText(action.id, 120)) {
        issues.push(appChatIssue('scheduler_id_required', 'Scheduler remove action needs an id.'))
        continue
      }
      validActions.push(action)
      applied.push(`scheduler.remove:${appScopedId(page.id, action.id)}`)
      continue
    }
    if (action.op === 'notification.publish') {
      if (capabilities.notifications !== true) {
        issues.push(
          appChatIssue('notifications_not_granted', 'Notifications capability is not granted.'),
        )
        continue
      }
      if (!cleanText(action.title, 120)) {
        issues.push(appChatIssue('notification_title_required', 'Notification title is required.'))
        continue
      }
      validActions.push(action)
      applied.push(`notification.publish:${appScopedId(page.id, action.id)}`)
      continue
    }
    if (action.op === 'notification.schedule') {
      if (capabilities.notifications !== true) {
        issues.push(
          appChatIssue('notifications_not_granted', 'Notifications capability is not granted.'),
        )
        continue
      }
      if (!cleanText(action.title, 120)) {
        issues.push(appChatIssue('notification_title_required', 'Notification title is required.'))
        continue
      }
      if (!cleanText(action.when, 120) && !Number.isFinite(action.runAt)) {
        issues.push(
          appChatIssue('notification_time_required', 'Scheduled notification needs when or runAt.'),
        )
        continue
      }
      validActions.push(action)
      applied.push(`notification.schedule:${appScopedId(page.id, action.id)}`)
      continue
    }
    issues.push(
      appChatIssue(
        'unsupported_action',
        `Unsupported action op: ${(action as { op?: string }).op ?? 'unknown'}`,
      ),
    )
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    actions: validActions,
    applied,
    issues,
  }
}

function appChatIssuesFromDaemonError(error: unknown): AppChatMutationIssue[] {
  if (!(error instanceof DaemonAppsToolError)) return []
  const parsed = error.parsedOutput<{ issues?: unknown[] }>()
  if (!parsed || !Array.isArray(parsed.issues)) return []
  return parsed.issues
    .map((issue): AppChatMutationIssue | null => {
      if (!isRecord(issue)) return null
      const severity =
        issue.severity === 'warning' || issue.severity === 'error' ? issue.severity : 'error'
      const message =
        typeof issue.message === 'string' && issue.message.trim()
          ? issue.message.trim()
          : error.message
      return {
        severity,
        code: typeof issue.code === 'string' ? issue.code : 'daemon_apps_tool_error',
        message,
        mutationIndex: typeof issue.mutationIndex === 'number' ? issue.mutationIndex : undefined,
      }
    })
    .filter((issue): issue is AppChatMutationIssue => Boolean(issue))
}

function isAppsCapabilityUnavailable(error: unknown): boolean {
  return (
    error instanceof CapabilityUnavailableError ||
    (error instanceof Error && error.message.includes("daemon capability 'apps' is not available"))
  )
}

function isChatRunCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /run cancelled by user|request cancelled by user|cancelled by user/i.test(message)
}

function previewAppChatMutationsLocally(
  page: AppPage,
  mutations: AppChatMutation[],
): AppChatMutationApplyResult {
  return applyAppChatMutations({
    data: page.data,
    dataSchema: page.dataSchema,
    mutations,
  })
}

function formatAppChatIssueLines(issues: AppChatMutationIssue[]): string {
  return issues
    .map((issue) => `- ${issue.message}`)
    .slice(0, 6)
    .join('\n')
}

function pageCapabilities(page: AppPage | null): SepilotAppCapabilities {
  if (page) return getEffectiveAppCapabilities(page)
  return {
    fields: true,
    collections: true,
    timeSeries: true,
    semanticSearch: true,
    scheduler: true,
    notifications: true,
    backup: true,
    encryption: false,
    interAppRead: true,
    agentTools: true,
    workflow: false,
    customComponents: true,
  }
}

function pageDataPolicy(page: AppPage): SepilotAppDataPolicy {
  return (
    page.dataPolicy ?? {
      aiReadable: true,
      aiWritable: true,
      interAppReadable: true,
      backup: 'included',
      sensitivePaths: [],
      redactedKeys: [],
    }
  )
}

function readableAppSummary(page: AppPage): SepilotReadableAppSummary {
  return {
    id: page.id,
    title: page.title,
    kind: page.kind,
    summary: page.summary,
    category: page.category,
    version: page.version,
    updatedAt: page.updatedAt,
    capabilities: pageCapabilities(page),
  }
}

function readableAppRecord(page: AppPage): SepilotReadableAppRecord {
  const policy = pageDataPolicy(page)
  return {
    ...readableAppSummary(page),
    dataSchema: page.dataSchema,
    data: redactAppData(page.data, { policy }),
  }
}

async function buildStorageExplorerSnapshot(): Promise<DesktopAppStorageSnapshot> {
  const storageTree = getDesktopApi()?.apps?.storageTree
  if (!storageTree) throw new Error('Desktop app storage bridge is unavailable.')
  return storageTree()
}

function isOfficialStorageExplorerPage(page: AppPage): boolean {
  const template = getAppTemplate('storage')
  return (
    page.kind === 'storage' &&
    page.origin === 'template' &&
    Boolean(template) &&
    page.html === template?.html
  )
}

function isOfficialCalendarPage(page: AppPage): boolean {
  const template = getAppTemplate('calendar')
  return (
    page.kind === 'calendar' &&
    page.origin === 'template' &&
    Boolean(template) &&
    page.html === template?.html
  )
}

function appScopedId(pageId: string, id: unknown): string {
  const raw = typeof id === 'string' && id.trim() ? id.trim() : `job-${Date.now()}`
  if (raw.startsWith(appJobPrefix(pageId))) return raw
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
  return `app-${pageId}-${slug || 'job'}`
}

function appJobPrefix(pageId: string): string {
  return `app-${pageId}-`
}

const HOST_REQUEST_GRANTS_KEY = 'sepilotd.apps.host-request-grants.v1'

function hostRequestReason(page: AppPage, op: string): string {
  return getEffectiveAppHostRequests(page)?.find((request) => request.op === op)?.reason ?? ''
}

function appAllowsHostRequest(page: AppPage, op: string): boolean {
  return Boolean(getEffectiveAppHostRequests(page)?.some((request) => request.op === op))
}

function hostGrantKey(page: AppPage, op: string): string {
  return `${page.id}:${op}`
}

function readHostRequestGrants(): Record<string, true> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOST_REQUEST_GRANTS_KEY) ?? '{}')
    return isRecord(parsed) ? (parsed as Record<string, true>) : {}
  } catch {
    return {}
  }
}

function writeHostRequestGrant(page: AppPage, op: string): void {
  if (typeof window === 'undefined') return
  const grants = readHostRequestGrants()
  grants[hostGrantKey(page, op)] = true
  window.localStorage.setItem(HOST_REQUEST_GRANTS_KEY, JSON.stringify(grants))
}

function ensureHostRequestDeclared(page: AppPage, op: string): void {
  if (!appAllowsHostRequest(page, op)) {
    throw new Error(`Host request is not declared in this app manifest: ${op}`)
  }
}

function ensureHostRequestConsent(page: AppPage, op: string): void {
  ensureHostRequestDeclared(page, op)
  ensureUserGrant(page, op)
}

function ensureUserGrant(page: AppPage, op: string): void {
  if (typeof window === 'undefined') return
  if (readHostRequestGrants()[hostGrantKey(page, op)]) return
  const reason = hostRequestReason(page, op)
  const detail = reason ? `\n\nReason: ${reason}` : ''
  const approved = window.confirm(
    `Allow "${page.title}" to use desktop host request "${op}"?${detail}`,
  )
  if (!approved) throw new Error(`Host request was denied by the user: ${op}`)
  writeHostRequestGrant(page, op)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/u.test(value)
}

function normalizeCalendarEvent(value: unknown): DesktopCalendarEventInput | null {
  if (!isRecord(value)) return null
  const id = cleanText(value.id, 160)
  const title = cleanText(value.title, 240)
  if (!id || !title || !isIsoDate(value.date)) return null
  const googleLinks = Array.isArray(value.googleLinks)
    ? value.googleLinks
        .map((link) => {
          if (!isRecord(link)) return null
          const googleEventId = cleanText(link.googleEventId, 1024)
          const googleCalendarId = cleanText(link.googleCalendarId, 1024)
          if (!googleEventId || !googleCalendarId) return null
          return {
            googleEventId,
            googleCalendarId,
            googleCalendarSummary: cleanText(link.googleCalendarSummary, 240) || undefined,
            googleICalUID: cleanText(link.googleICalUID, 1024) || undefined,
            googleRecurringEventId: cleanText(link.googleRecurringEventId, 1024) || undefined,
            googleOriginalStartTime: isRecord(link.googleOriginalStartTime)
              ? {
                  ...(isIsoDate(link.googleOriginalStartTime.date)
                    ? { date: link.googleOriginalStartTime.date }
                    : {}),
                  ...(typeof link.googleOriginalStartTime.dateTime === 'string'
                    ? { dateTime: link.googleOriginalStartTime.dateTime }
                    : {}),
                  ...(typeof link.googleOriginalStartTime.timeZone === 'string'
                    ? { timeZone: link.googleOriginalStartTime.timeZone }
                    : {}),
                }
              : undefined,
            remoteUpdatedAt:
              typeof link.remoteUpdatedAt === 'string' ? link.remoteUpdatedAt : undefined,
          }
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link))
    : undefined
  return {
    id,
    title,
    date: value.date,
    time: isTime(value.time) ? value.time : undefined,
    endDate: isIsoDate(value.endDate) ? value.endDate : undefined,
    endTime: isTime(value.endTime) ? value.endTime : undefined,
    type: cleanText(value.type, 80) || undefined,
    notes: cleanText(value.notes, 4000) || undefined,
    location: cleanText(value.location, 400) || undefined,
    timezone: cleanText(value.timezone, 80) || undefined,
    sharedOriginKind: cleanText(value.sharedOriginKind, 80) || undefined,
    sharedOriginTitle: cleanText(value.sharedOriginTitle, 160) || undefined,
    sharedOriginId: cleanText(value.sharedOriginId, 160) || undefined,
    sharedReadonly: value.sharedReadonly === true,
    googleEventId: cleanText(value.googleEventId, 1024) || undefined,
    googleCalendarId: cleanText(value.googleCalendarId, 1024) || undefined,
    googleCalendarSummary: cleanText(value.googleCalendarSummary, 240) || undefined,
    googleICalUID: cleanText(value.googleICalUID, 1024) || undefined,
    googleRecurringEventId: cleanText(value.googleRecurringEventId, 1024) || undefined,
    googleOriginalStartTime: isRecord(value.googleOriginalStartTime)
      ? {
          ...(isIsoDate(value.googleOriginalStartTime.date)
            ? { date: value.googleOriginalStartTime.date }
            : {}),
          ...(typeof value.googleOriginalStartTime.dateTime === 'string'
            ? { dateTime: value.googleOriginalStartTime.dateTime }
            : {}),
          ...(typeof value.googleOriginalStartTime.timeZone === 'string'
            ? { timeZone: value.googleOriginalStartTime.timeZone }
            : {}),
        }
      : undefined,
    googleLinks,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : undefined,
  }
}

function calendarEventsFromPage(page: AppPage): DesktopCalendarEventInput[] {
  const collections = isRecord(page.data.collections) ? page.data.collections : {}
  const events = Array.isArray(collections.events) ? collections.events : []
  return events
    .map(normalizeCalendarEvent)
    .filter((event): event is DesktopCalendarEventInput => Boolean(event))
}

function googleSyncStateFromPage(page: AppPage): DesktopCalendarGoogleSyncState | null {
  const calendarSync = isRecord(page.data.calendarSync) ? page.data.calendarSync : {}
  const google = isRecord(calendarSync.google) ? calendarSync.google : null
  if (!google || google.provider !== 'google') return null
  return google as unknown as DesktopCalendarGoogleSyncState
}

function patchGoogleSyncState(
  page: AppPage,
  state: DesktopCalendarGoogleSyncState,
  events?: DesktopCalendarEventInput[],
): Record<string, unknown> {
  const collections = isRecord(page.data.collections) ? page.data.collections : {}
  const calendarSync = isRecord(page.data.calendarSync) ? page.data.calendarSync : {}
  return {
    ...page.data,
    collections: {
      ...collections,
      ...(events ? { events } : {}),
    },
    calendarSync: {
      ...calendarSync,
      google: state,
    },
  }
}

function summarizeHtmlDiff(previous: string, next: string): AppDraftDiff {
  const left = previous.split(/\r?\n/u)
  const right = next.split(/\r?\n/u)
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix + prefix < left.length &&
    suffix + prefix < right.length &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const removed = Math.max(0, left.length - prefix - suffix)
  const added = Math.max(0, right.length - prefix - suffix)
  return {
    added,
    removed,
    changed: Math.min(added, removed),
  }
}

function buildPreviewPage(input: {
  target: 'current' | 'new'
  html: string
  title: string
  summary: string
  prompt: string
  activePage: AppPage | null
  validation: ReturnType<typeof validateAppHtml>
}): AppPage {
  const now = Date.now()
  const source = input.target === 'current' ? input.activePage : null
  return {
    id: source?.id ?? `draft-${now}`,
    title: input.title,
    kind: source?.kind ?? 'custom',
    frameworkVersion: source?.frameworkVersion ?? SEPILOT_APPS_FRAMEWORK_VERSION,
    summary: input.summary,
    category: source?.category ?? 'Custom',
    accent: source?.accent ?? '#0f766e',
    origin: source?.origin ?? 'code-agent',
    version: (source?.version ?? 0) + 1,
    permissions: source?.permissions,
    dataPolicy: source?.dataPolicy,
    capabilities: source?.capabilities,
    dataSchema: source?.dataSchema,
    validation: input.validation,
    versions: source?.versions ?? [],
    storagePath: source?.storagePath,
    html: input.html,
    data: source?.data ?? {},
    prompt: input.prompt,
    createdAt: source?.createdAt ?? now,
    updatedAt: now,
  }
}

function appTabGroupLabel(page: AppPage, overrides: Record<string, string> = {}): string {
  return (
    overrides[page.id]?.trim() ||
    page.category?.trim() ||
    (page.kind === 'custom' ? 'Custom' : page.kind)
  )
}

function groupOpenAppTabs(openPages: AppPage[], overrides: Record<string, string>): AppTabGroup[] {
  const groups: AppTabGroup[] = []
  const groupByKey = new Map<string, AppTabGroup>()
  for (const page of openPages) {
    const label = appTabGroupLabel(page, overrides)
    let group = groupByKey.get(label)
    if (!group) {
      group = {
        key: label,
        label,
        pages: [],
        accent: page.accent ?? '#2563eb',
      }
      groupByKey.set(label, group)
      groups.push(group)
    }
    group.pages.push(page)
  }
  return groups
}

export function AppsWorkspace({
  onStartAssistant, onOpenResource, onOpenSession, onAssistantHomeChange, focusAppId, focusVersion = 0,
}: Partial<AssistantNavigationProps> & {
  focusAppId?: string; focusVersion?: number; onAssistantHomeChange?: (visible: boolean) => void
} = {}) {
  const [assistantHomeOpen, setAssistantHomeOpen] = useState(Boolean(onStartAssistant && !focusAppId))
  const transport = useTransport()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const appFrameWindowsRef = useRef(new WeakMap<object, string>())
  const recordAppFrame = useCallback((node: HTMLIFrameElement | null) => {
    iframeRef.current = node
    const pageId = node?.dataset.appPageId
    if (node?.contentWindow && pageId) appFrameWindowsRef.current.set(node.contentWindow, pageId)
  }, [])
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const appChatScrollRef = useRef<HTMLDivElement | null>(null)
  const appChatModelMenuRef = useRef<HTMLDivElement | null>(null)
  const sandboxOriginatedDataQueueRef = useRef<SandboxOriginatedDataEntry[]>([])
  const srcDocCacheRef = useRef<{ signature: string; value: string }>({
    signature: '',
    value: '',
  })
  const isDark = useIsDark()
  const pages = useAppsStore((state) => state.pages)
  const llm = useSettingsStore((state) => state.llm)
  const setLlm = useSettingsStore((state) => state.setLlm)
  const providers = useProviderCatalog()
  const activeId = useAppsStore((state) => state.activeId)
  const previousActiveAppId = useRef(activeId)
  const openIds = useAppsStore((state) => state.openIds)
  const tabGroupOverrides = useAppsStore((state) => state.tabGroupOverrides)
  const setActive = useAppsStore((state) => state.setActive)
  const reorderOpenPage = useAppsStore((state) => state.reorderOpenPage)
  const setTabGroupOverride = useAppsStore((state) => state.setTabGroupOverride)
  const renameTabGroupOverride = useAppsStore((state) => state.renameTabGroupOverride)
  const addGeneratedPage = useAppsStore((state) => state.addGeneratedPage)
  const addFromTemplate = useAppsStore((state) => state.addFromTemplate)
  const closePage = useAppsStore((state) => state.closePage)
  const duplicatePage = useAppsStore((state) => state.duplicatePage)
  const updatePage = useAppsStore((state) => state.updatePage)
  const updatePageData = useAppsStore((state) => state.updatePageData)
  const hydrateFromStorage = useAppsStore((state) => state.hydrateFromStorage)
  const storageHydrated = useAppsStore((state) => state.storageHydrated)
  const previouslyHydrated = useRef(storageHydrated)
  const storagePath = useAppsStore((state) => state.storagePath)
  const storageError = useAppsStore((state) => state.storageError)
  useEffect(() => {
    if (previouslyHydrated.current && previousActiveAppId.current !== activeId) setAssistantHomeOpen(false)
    previousActiveAppId.current = activeId
    previouslyHydrated.current = storageHydrated
  }, [activeId, storageHydrated])
  useEffect(() => {
    if (focusAppId) {
      setAssistantHomeOpen(false)
      setActive(focusAppId)
    }
  }, [focusAppId, focusVersion, setActive])
  const openPages = useMemo(() => {
    const listedOpenPages = openIds
      .map((id) => pages.find((page) => page.id === id) ?? null)
      .filter((page): page is AppPage => page !== null)
    const activeStoredPage = pages.find((page) => page.id === activeId) ?? null
    return listedOpenPages.length > 0 || !activeStoredPage ? listedOpenPages : [activeStoredPage]
  }, [activeId, openIds, pages])
  const activePage = openPages.find((page) => page.id === activeId) ?? openPages[0] ?? null
  const tabGroups = useMemo(
    () => groupOpenAppTabs(openPages, tabGroupOverrides),
    [openPages, tabGroupOverrides],
  )
  const activeTabGroupKey = activePage ? appTabGroupLabel(activePage, tabGroupOverrides) : null
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [draftReply, setDraftReply] = useState('')
  const [pendingDraft, setPendingDraft] = useState<PendingAppDraft | null>(null)
  const [codeAgentOpen, setCodeAgentOpen] = useState(false)
  const [buildTarget, setBuildTarget] = useState<'new' | 'current'>('new')
  const [lastDesignRequest, setLastDesignRequest] = useState('')
  const [appChatOpen, setAppChatOpen] = useState(false)
  const [appEditMode, setAppEditMode] = useState(false)
  useEffect(() => {
    onAssistantHomeChange?.(assistantHomeOpen && !codeAgentOpen)
  }, [assistantHomeOpen, codeAgentOpen, onAssistantHomeChange])
  const [appChatModelOpen, setAppChatModelOpen] = useState(false)
  const [appChatModelAnchor, setAppChatModelAnchor] = useState<HTMLDivElement | null>(null)
  const [appChatInput, setAppChatInput] = useState('')
  const [appChatBusyByPageId, setAppChatBusyByPageId] = useState<Record<string, boolean>>({})
  const [appChatMessages, setAppChatMessages] = useState<Record<string, AppChatTurn[]>>({})
  const appChatMessagesRef = useRef<Record<string, AppChatTurn[]>>({})
  const [pendingAppChatMutation, setPendingAppChatMutation] =
    useState<PendingAppChatMutation | null>(null)
  const [appChatUndo, setAppChatUndo] = useState<Record<string, AppChatUndoState>>({})
  const [iframeReloadNonceByPageId, setIframeReloadNonceByPageId] = useState<
    Record<string, number>
  >({})
  const [runtimeErrors, setRuntimeErrors] = useState<Record<string, AppRuntimeError[]>>({})
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const [tabGroupMenu, setTabGroupMenu] = useState<{
    x: number
    y: number
    groupKey: string
  } | null>(null)
  const [tabGroupEditor, setTabGroupEditor] = useState<{
    x: number
    y: number
    mode: 'assign' | 'rename'
    pageId?: string
    groupKey?: string
    value: string
  } | null>(null)
  const codeAgentPreviewPage =
    pendingDraft?.previewPage ?? (codeAgentOpen && buildTarget === 'current' ? activePage : null)
  const displayPage = codeAgentOpen
    ? codeAgentPreviewPage
    : (pendingDraft?.previewPage ?? activePage)
  const activeAppChatMessages = displayPage ? (appChatMessages[displayPage.id] ?? []) : []
  const activeAppChatBusy = displayPage ? appChatBusyByPageId[displayPage.id] === true : false
  const activeAppChatUndo = displayPage ? appChatUndo[displayPage.id] : undefined
  const activeIframeReloadNonce = displayPage ? (iframeReloadNonceByPageId[displayPage.id] ?? 0) : 0
  const activeRuntimeErrors = displayPage ? (runtimeErrors[displayPage.id] ?? []) : []
  const latestRuntimeError = activeRuntimeErrors[0] ?? null
  const theme = isDark ? 'dark' : 'light'
  const srcDocSignature = appSrcDocSignature(displayPage, theme, activeIframeReloadNonce)
  if (srcDocCacheRef.current.signature !== srcDocSignature) {
    srcDocCacheRef.current = {
      signature: srcDocSignature,
      value: displayPage ? buildAppSrcDoc(displayPage, { theme }) : '',
    }
  }
  const srcDoc = srcDocCacheRef.current.value
  const appChatProvider = providers.find((provider) => provider.id === llm.providerId) ?? null
  const appChatModel = appChatProvider?.models.find((model) => model.id === llm.modelId) ?? null
  const appChatModelLabel =
    appChatProvider && llm.modelId
      ? `${appChatProvider.label} / ${appChatModel?.label ?? llm.modelId}`
      : '기본 모델'

  useEffect(() => {
    appChatMessagesRef.current = appChatMessages
  }, [appChatMessages])

  useEffect(() => {
    if (!transport || llm.providerId || llm.modelId) return undefined
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const current = await (await createSettingsApi(transport)).getLlm()
        if (!cancelled && (current.providerId || current.modelId)) setLlm(current)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [llm.modelId, llm.providerId, setLlm, transport])

  useEffect(() => {
    if (!appChatOpen) return undefined
    const frame = requestAnimationFrame(() => {
      const container = appChatScrollRef.current
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [
    activeAppChatBusy,
    activeAppChatMessages.length,
    appChatOpen,
    displayPage?.id,
    pendingAppChatMutation?.applied.length,
    pendingAppChatMutation?.pageId,
  ])

  useEffect(() => {
    if (!appChatModelOpen) return undefined
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!appChatModelAnchor?.contains(target) && !appChatModelMenuRef.current?.contains(target)) {
        setAppChatModelOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [appChatModelAnchor, appChatModelOpen])

  useEffect(() => {
    if (!tabMenu) return undefined
    const close = () => setTabMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [tabMenu])

  useEffect(() => {
    if (!tabGroupMenu) return undefined
    const close = () => setTabGroupMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [tabGroupMenu])

  useEffect(() => {
    if (!tabGroupEditor) return undefined
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      setTabGroupEditor(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [tabGroupEditor])

  function assignTabGroup(pageId: string, groupName: string): void {
    const nextName = groupName.trim()
    if (!nextName) return
    setTabGroupOverride(pageId, nextName)
  }

  function renameTabGroup(groupKey: string, name: string): void {
    const nextName = name.trim()
    if (!nextName || nextName === groupKey) return
    const group = tabGroups.find((candidate) => candidate.key === groupKey)
    if (!group) return
    renameTabGroupOverride(groupKey, nextName)
  }

  function submitTabGroupEditor(): void {
    const editor = tabGroupEditor
    if (!editor) return
    if (editor.mode === 'assign' && editor.pageId) {
      assignTabGroup(editor.pageId, editor.value)
    } else if (editor.mode === 'rename' && editor.groupKey) {
      renameTabGroup(editor.groupKey, editor.value)
    }
    setTabGroupEditor(null)
  }

  function resetTabGroup(pageId: string): void {
    setTabGroupOverride(pageId, null)
  }

  function closeAppTabsWithUndo(pageIds: string[]): void {
    const closedTabs = [...new Set(pageIds)]
      .map((id) => {
        const index = openPages.findIndex((page) => page.id === id)
        const page = index >= 0 ? openPages[index] : null
        return page ? { id: page.id, title: page.title, index } : null
      })
      .filter((tab): tab is { id: string; title: string; index: number } => tab !== null)
    if (closedTabs.length === 0) return

    const activeBeforeClose = activeId
    for (const tab of closedTabs) closePage(tab.id)

    toast.success(
      closedTabs.length === 1
        ? '앱 탭을 닫았습니다.'
        : `${closedTabs.length}개 앱 탭을 닫았습니다.`,
      {
        description:
          closedTabs.length === 1 ? closedTabs[0].title : '실수로 닫았다면 되돌릴 수 있습니다.',
        action: {
          label: '되돌리기',
          onClick: () => {
            const restoredTabs = closedTabs
              .filter((tab) => useAppsStore.getState().pages.some((page) => page.id === tab.id))
              .sort((left, right) => left.index - right.index)
            for (const tab of restoredTabs) {
              setActive(tab.id)
              reorderOpenPage(tab.id, tab.index)
            }
            const activeTab = restoredTabs.find((tab) => tab.id === activeBeforeClose)
            setActive(activeTab?.id ?? restoredTabs[0]?.id ?? null)
          },
        },
      },
    )
  }

  function postAppApiResponse(
    requestId: string | undefined,
    response: { ok: true; result: unknown } | { ok: false; error: AppApiErrorPayload },
  ): void {
    if (!requestId || !displayPage) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'sepilot-apps:api-response',
        pageId: displayPage.id,
        requestId,
        ...response,
      },
      '*',
    )
  }

  function openSettingsTab(tabKey: string): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('sepilot:open-settings-tab', { detail: tabKey }))
  }

  async function handleAppApiRequest(payload: AppApiRequestPayload): Promise<void> {
    const display = displayPage
    if (!payload.requestId || !payload.op || !display || payload.pageId !== display.id) return
    const page =
      useAppsStore.getState().pages.find((candidate) => candidate.id === payload.pageId) ?? display
    let auditStatus: NonNullable<DesktopAppAuditInput['status']> = 'success'
    let auditMessage: string | undefined
    const recordAudit = (status: NonNullable<DesktopAppAuditInput['status']>, message?: string) => {
      auditStatus = status
      auditMessage = message
    }
    const flushAudit = async (): Promise<void> => {
      const capability = payload.op?.split('.')[0] || 'apps'
      const recordAuditApi = getDesktopApi()?.apps?.recordAudit
      if (!recordAuditApi) return
      try {
        await recordAuditApi({
          appId: page.id,
          operation: payload.op ?? 'unknown',
          capability,
          status: auditStatus,
          source: 'sandbox',
          message: auditMessage,
        })
      } catch {
      }
    }
    try {
      const input = payload.input ?? {}
      const readablePages = pages.filter((page) => isAppDataReadableByApps(pageDataPolicy(page)))
      if (payload.op === 'apps.list') {
        postAppApiResponse(payload.requestId, {
          ok: true,
          result: readablePages.map(readableAppSummary),
        })
        recordAudit('success')
        return
      }
      if (payload.op === 'apps.read') {
        const id = typeof input.id === 'string' ? input.id : ''
        const page = readablePages.find((candidate) => candidate.id === id)
        if (!page) throw new Error(`App is not readable or not found: ${id}`)
        postAppApiResponse(payload.requestId, { ok: true, result: readableAppRecord(page) })
        recordAudit('success')
        return
      }
      if (payload.op === 'apps.search') {
        const query = typeof input.query === 'string' ? input.query : ''
        const limit = clampAppReadLimit(input.limit)
        const matches = rankAppSearchRecords(readablePages.map(readableAppRecord), query, {
          limit,
        })
        postAppApiResponse(payload.requestId, { ok: true, result: matches })
        recordAudit('success')
        return
      }
      if (payload.op === 'apps.syncSharedWorkspace') {
        const changedPageIds = useAppsStore.getState().syncSharedWorkspace(page.id)
        postAppApiResponse(payload.requestId, {
          ok: true,
          result: { changedPageIds, changedCount: changedPageIds.length },
        })
        recordAudit('success', `Synced shared workspace pages: ${changedPageIds.length}`)
        return
      }
      if (payload.op.startsWith('apps.storage.')) {
        if (!isOfficialStorageExplorerPage(page)) {
          throw new Error(
            'Storage host requests are only available to the official storage explorer app.',
          )
        }
        ensureHostRequestConsent(page, payload.op)
        if (payload.op === 'apps.storage.snapshot') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await buildStorageExplorerSnapshot(),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'apps.storage.readFile') {
          const relativePath = cleanText(input.relativePath, 1200)
          if (!relativePath) throw new Error('Storage relative path is required.')
          const readFile = getDesktopApi()?.apps?.storageReadFile
          if (!readFile) throw new Error('Desktop app storage read bridge is unavailable.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await readFile({ relativePath }),
          })
          recordAudit('success', `Read storage file: ${relativePath}`)
          return
        }
        if (payload.op === 'apps.storage.writeFile') {
          const relativePath = cleanText(input.relativePath, 1200)
          if (!relativePath) throw new Error('Storage relative path is required.')
          const content = typeof input.content === 'string' ? input.content : ''
          const expectedSha256 = cleanText(input.expectedSha256, 120) || null
          const writeFile = getDesktopApi()?.apps?.storageWriteFile
          if (!writeFile) throw new Error('Desktop app storage write bridge is unavailable.')
          const result = await writeFile({ relativePath, content, expectedSha256 })
          await hydrateFromStorage()
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: {
              ...result,
              snapshot: await buildStorageExplorerSnapshot(),
            },
          })
          recordAudit('success', `Wrote storage file: ${relativePath}`)
          return
        }
        if (payload.op === 'apps.storage.exportApp') {
          const id = cleanText(input.id, 160)
          if (!id) throw new Error('App id is required.')
          const exportApp = getDesktopApi()?.apps?.exportApp
          if (!exportApp) throw new Error('Desktop app export bridge is unavailable.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: { path: await exportApp(id) },
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'apps.storage.exportBackup') {
          const exportBackup = getDesktopApi()?.apps?.exportBackup
          if (!exportBackup) throw new Error('Desktop apps backup bridge is unavailable.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: { path: await exportBackup() },
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'apps.storage.deleteApp') {
          const id = cleanText(input.id, 160)
          if (!id) throw new Error('App id is required.')
          if (id === page.id) throw new Error('The storage explorer cannot delete itself.')
          const target = useAppsStore.getState().pages.find((candidate) => candidate.id === id)
          if (!target) throw new Error(`App not found: ${id}`)
          const deleteApp = getDesktopApi()?.apps?.delete
          if (!deleteApp) throw new Error('Desktop app delete bridge is unavailable.')
          await deleteApp(id)
          await hydrateFromStorage()
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await buildStorageExplorerSnapshot(),
          })
          recordAudit('success', `Moved app to trash: ${target.title}`)
          return
        }
      }

      if (payload.op === 'clipboard.writeText') {
        const text = typeof input.text === 'string' ? input.text : ''
        if (!text) throw new Error('Clipboard text is required.')
        if (!navigator.clipboard?.writeText) {
          throw new Error('Clipboard API is unavailable in this environment.')
        }
        await navigator.clipboard.writeText(text)
        postAppApiResponse(payload.requestId, { ok: true, result: { ok: true } })
        recordAudit('success')
        return
      }
      if (payload.op === 'clipboard.write') {
        const text = typeof input.text === 'string' ? input.text : ''
        const html = typeof input.html === 'string' ? input.html : ''
        const rtf = typeof input.rtf === 'string' ? input.rtf : ''
        if (!text && !html && !rtf) throw new Error('Clipboard content is required.')
        await invokeDesktop('sepilot:apps/clipboard/write', { text, html, rtf })
        postAppApiResponse(payload.requestId, { ok: true, result: { ok: true } })
        recordAudit('success')
        return
      }
      if (payload.op === 'clipboard.readText') {
        ensureUserGrant(page, payload.op)
        const bridgeResult = await invokeDesktop<{ text?: unknown }>(
          'sepilot:apps/clipboard/read-text',
        )
        let text = typeof bridgeResult?.text === 'string' ? bridgeResult.text : ''
        if (!text && navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText()
        }
        postAppApiResponse(payload.requestId, { ok: true, result: { text } })
        recordAudit('success')
        return
      }

      if (payload.op === 'agent.write') {
        if (pageCapabilities(page).agentTools !== true) {
          throw new Error('Agent tools capability is not granted for this app.')
        }
        if (pageDataPolicy(page).aiReadable === false) {
          throw new Error('AI read policy is not granted for this app.')
        }
        if (await isBrowserPreviewTransport(transport)) {
          throw new Error('Writing assist requires the Electron daemon bridge.')
        }
        const mode = normalizeWritingAssistMode(input.mode)
        const body = cleanText(input.body, 12000)
        if (!body && mode !== 'continue') {
          throw new Error('Writing assist requires note body text.')
        }
        const api = await createChatApi(transport)
        let assistant = ''
        let streamError: Error | null = null
        await api.stream(
          undefined,
          buildWritingAssistPrompt({
            mode,
            title: cleanText(input.title, 180),
            tags: cleanText(input.tags, 240),
            body,
            locale: cleanText(input.locale, 40) || 'ko-KR',
          }),
          {
            onUpsertMessage: (message) => {
              if (message.role === 'assistant') assistant = message.content
            },
            onDone: () => {},
            onError: (error) => {
              streamError = error
            },
          },
          {
            chat: {
              mode: 'react',
              tags: [...APP_INTERNAL_CHAT_TAGS, 'surface:writing-assist'],
              intentRouting: { enabled: false },
              thinkingLevel: 'low',
              maxIterations: 2,
            },
          },
        )
        if (streamError) throw streamError
        const text = extractWritingAssistText(assistant)
        if (!text) throw new Error('Writing assist returned empty text.')
        postAppApiResponse(payload.requestId, { ok: true, result: { text } })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('workflow.github.')) {
        const capabilities = pageCapabilities(page)
        if (capabilities.workflow !== true) {
          throw new Error(
            `Workflow capability is not granted for this app. (${page.title}, ${page.kind}, ${page.origin ?? 'unknown'}, workflow=${String(capabilities.workflow)})`,
          )
        }
        const api = await createGitHubProjectsApi(transport)
        const projectRef = (): GitHubProjectRef => {
          const owner = typeof input.owner === 'string' ? input.owner.trim() : ''
          const number = typeof input.number === 'number' ? input.number : Number(input.number)
          const ownerType = input.ownerType === 'organization' ? 'organization' : 'user'
          if (!owner) throw new Error('GitHub project owner is required.')
          if (!Number.isInteger(number) || number <= 0) {
            throw new Error('GitHub project number must be a positive integer.')
          }
          return { ownerType, owner, number }
        }
        if (payload.op === 'workflow.github.status') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.status() })
          recordAudit('success')
          return
        }
        if (payload.op === 'workflow.github.listProjects') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.listProjects({
              query: typeof input.query === 'string' ? input.query : undefined,
            }),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'workflow.github.getProject') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.getProject(projectRef()),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'workflow.github.createDraft') {
          const title = typeof input.title === 'string' ? input.title.trim() : ''
          if (!title) throw new Error('Card title is required.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.createDraft(projectRef(), {
              title,
              body: typeof input.body === 'string' ? input.body : undefined,
              columnId: typeof input.columnId === 'string' ? input.columnId : undefined,
            }),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'workflow.github.moveCard') {
          const itemId = typeof input.itemId === 'string' ? input.itemId.trim() : ''
          const columnId = typeof input.columnId === 'string' ? input.columnId.trim() : ''
          if (!itemId || !columnId) throw new Error('itemId and columnId are required.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.moveCard(projectRef(), { itemId, columnId }),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'workflow.github.updateDraft') {
          const draftIssueId =
            typeof input.draftIssueId === 'string' ? input.draftIssueId.trim() : ''
          if (!draftIssueId) throw new Error('draftIssueId is required.')
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.updateDraft(projectRef(), {
              draftIssueId,
              title: typeof input.title === 'string' ? input.title : undefined,
              body: typeof input.body === 'string' ? input.body : undefined,
            }),
          })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('crypto.')) {
        if (pageCapabilities(page).encryption !== true) {
          throw new Error('Encryption capability is not granted for this app.')
        }
        if (payload.op === 'crypto.status') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: {
              available: hasAppsAesGcmCrypto(),
              provider: hasAppsAesGcmCrypto() ? 'webcrypto' : 'unavailable',
            },
          })
          recordAudit('success')
          return
        }

        const passphrase = typeof input.passphrase === 'string' ? input.passphrase : ''
        if (!passphrase) throw new Error('Passphrase is required for app encryption.')
        if (payload.op === 'crypto.encryptAesGcm') {
          const envelope = await encryptAppsAesGcmJson(input.value, passphrase)
          postAppApiResponse(payload.requestId, { ok: true, result: envelope })
          recordAudit('success')
          return
        }
        if (payload.op === 'crypto.decryptAesGcm') {
          const value = await decryptAppsAesGcmJson(input.vault, passphrase)
          postAppApiResponse(payload.requestId, { ok: true, result: { value } })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('scheduler.')) {
        if (pageCapabilities(page).scheduler !== true) {
          throw new Error('Scheduler capability is not granted for this app.')
        }
        const api = await createSchedulerApi(transport)
        const prefix = appJobPrefix(page.id)
        if (payload.op === 'scheduler.list') {
          const jobs = (await api.list()).filter((job) => job.id.startsWith(prefix))
          postAppApiResponse(payload.requestId, { ok: true, result: jobs })
          recordAudit('success')
          return
        }
        if (payload.op === 'scheduler.upsert') {
          const id = appScopedId(page.id, input.id)
          const name =
            typeof input.name === 'string' && input.name.trim()
              ? input.name.trim()
              : `${page.title} task`
          const instruction =
            typeof input.instruction === 'string' && input.instruction.trim()
              ? input.instruction.trim()
              : ''
          if (!instruction) throw new Error('Scheduler instruction is required.')
          const job = await api.upsert({
            ...input,
            id,
            name: `[${page.title}] ${name}`.slice(0, 120),
            instruction: `App "${page.title}" scheduled task: ${instruction}`,
            metadata: isRecord(input.metadata) ? input.metadata : undefined,
          })
          postAppApiResponse(payload.requestId, { ok: true, result: job })
          recordAudit('success')
          return
        }
        const id = appScopedId(page.id, input.id)
        if (!id.startsWith(prefix)) throw new Error('Scheduler job is outside this app scope.')
        if (payload.op === 'scheduler.run') {
          await api.run(id)
          postAppApiResponse(payload.requestId, { ok: true, result: { ok: true, id } })
          recordAudit('success')
          return
        }
        if (payload.op === 'scheduler.pause') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.pause(id) })
          recordAudit('success')
          return
        }
        if (payload.op === 'scheduler.resume') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.resume(id) })
          recordAudit('success')
          return
        }
        if (payload.op === 'scheduler.remove') {
          await api.remove(id)
          postAppApiResponse(payload.requestId, { ok: true, result: { ok: true, id } })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('notifications.')) {
        if (pageCapabilities(page).notifications !== true) {
          throw new Error('Notifications capability is not granted for this app.')
        }
        const api = await createNotificationsApi(transport)
        const prefix = appJobPrefix(page.id)
        if (payload.op === 'notifications.list') {
          const items = (await api.list()).filter((item) => item.id.startsWith(prefix))
          postAppApiResponse(payload.requestId, { ok: true, result: items })
          recordAudit('success')
          return
        }
        if (payload.op === 'notifications.publish') {
          const title =
            typeof input.title === 'string' && input.title.trim() ? input.title.trim() : page.title
          const item = await api.publish({
            id: appScopedId(page.id, input.id),
            title: `[${page.title}] ${title}`.slice(0, 120),
            body: typeof input.body === 'string' ? input.body.slice(0, 600) : '',
            url: typeof input.url === 'string' ? input.url : null,
          })
          postAppApiResponse(payload.requestId, { ok: true, result: item })
          recordAudit('success')
          return
        }
        if (payload.op === 'notifications.schedule') {
          const schedulerApi = await createSchedulerApi(transport)
          const id = appScopedId(page.id, input.id)
          const title =
            typeof input.title === 'string' && input.title.trim() ? input.title.trim() : page.title
          const body = typeof input.body === 'string' ? input.body.slice(0, 600) : ''
          const url = typeof input.url === 'string' ? input.url : null
          const runAt =
            typeof input.runAt === 'number' && Number.isFinite(input.runAt)
              ? input.runAt
              : undefined
          const when =
            typeof input.when === 'string' && input.when.trim() ? input.when.trim() : undefined
          if (runAt === undefined && !when) {
            throw new Error('Scheduled notification requires runAt or when.')
          }
          const source = isRecord(input.source) ? input.source : {}
          const job = await schedulerApi.upsert({
            id,
            name: `[${page.title}] ${title}`.slice(0, 120),
            ...(runAt !== undefined ? { runAt } : { when }),
            timezone:
              typeof input.timezone === 'string' && input.timezone.trim()
                ? input.timezone.trim()
                : undefined,
            instruction: '__internal:notification',
            enabled: true,
            metadata: {
              source: {
                type: 'app.notification',
                ...source,
                appId: page.id,
                appTitle: page.title,
              },
              notification: {
                id,
                title: `[${page.title}] ${title}`.slice(0, 120),
                body,
                url,
              },
            },
          })
          postAppApiResponse(payload.requestId, { ok: true, result: job })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('messageSubscription.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'inbox') {
          throw new Error('Message subscription requests are only available to the inbox app.')
        }
        if (payload.op === 'messageSubscription.openSettings') {
          openSettingsTab('message-subscription')
          postAppApiResponse(payload.requestId, { ok: true, result: { ok: true } })
          recordAudit('success')
          return
        }
        const api = await createMessageSubscriptionApi(transport)
        if (payload.op === 'messageSubscription.overview') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.getOverview() })
          recordAudit('success')
          return
        }
        if (payload.op === 'messageSubscription.list') {
          const status =
            input.status === 'pending' ||
            input.status === 'processing' ||
            input.status === 'completed' ||
            input.status === 'failed'
              ? input.status
              : undefined
          const limit =
            typeof input.limit === 'number' && Number.isFinite(input.limit)
              ? Math.max(1, Math.min(100, Math.trunc(input.limit)))
              : 30
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await api.listMessages(status, limit),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'messageSubscription.refresh') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.refresh() })
          recordAudit('success')
          return
        }
        if (payload.op === 'messageSubscription.process') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.processPending() })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('localInbox.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'inbox') {
          throw new Error('Local inbox requests are only available to the inbox app.')
        }
        if (payload.op === 'localInbox.pickFolder') {
          const result = await invokeDesktop('sepilot:apps/inbox-local-folder/pick', input)
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit('success')
          return
        }
        if (payload.op === 'localInbox.scanFolder') {
          const result = await invokeDesktop('sepilot:apps/inbox-local-folder/scan', input)
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('vault.file.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'vault') {
          throw new Error('Vault file requests are only available to the security vault app.')
        }
        const channel = VAULT_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported vault file operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop vault file bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('notes.file.') || payload.op.startsWith('notes.attachment.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'notepad') {
          throw new Error('Note file requests are only available to the notes app.')
        }
        const channel = NOTE_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported note operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop note bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('services.file.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'services') {
          throw new Error('Service file requests are only available to the services app.')
        }
        const channel = SERVICES_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported services file operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop services file bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('devices.file.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'devices') {
          throw new Error('Device file requests are only available to the device table app.')
        }
        const channel = DEVICES_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported device file operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop device file bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('stocks.file.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'stocks') {
          throw new Error('Stock file requests are only available to the stock analysis app.')
        }
        const channel = STOCKS_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported stock file operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop stock file bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('smartcar.file.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'smartcar') {
          throw new Error('Smart Car file requests are only available to the Smart Car app.')
        }
        const channel = SMARTCAR_FILE_HOST_CHANNELS.get(payload.op)
        if (!channel) throw new Error(`Unsupported Smart Car file operation: ${payload.op}`)
        const result = await invokeDesktop(channel, input)
        if (result === undefined) throw new Error('Desktop Smart Car file bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'dev.openTarget') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'gitrepos' && page.kind !== 'bookmarks') {
          throw new Error('Developer open requests are only available to development apps.')
        }
        const result = await invokeDesktop('sepilot:apps/dev/open', input)
        if (result === undefined) throw new Error('Desktop open bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'git.repo.inspect') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'gitrepos') {
          throw new Error('Git repository inspection is only available to the Git Repo app.')
        }
        let result: unknown
        const transientToken = cleanText(input.token, 4096)
        if (!transientToken) {
          try {
            const api = await createGitHubApi(transport)
            result = await api.inspectRepo({
              url: cleanText(input.url, 2048),
              owner: cleanText(input.owner, 200),
              repo: cleanText(input.repo, 200),
            })
          } catch {
            result = await invokeDesktop('sepilot:apps/git/inspect', input)
          }
        } else {
          result = await invokeDesktop('sepilot:apps/git/inspect', input)
        }
        if (result === undefined) throw new Error('Desktop Git inspection bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('github.repos.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'gitrepos') {
          throw new Error('GitHub repository requests are only available to the Git Repo app.')
        }
        const api = await createGitHubApi(transport)
        if (payload.op === 'github.repos.connectToken') {
          const token = cleanText(input.token, 4096)
          if (!token) throw new Error('GitHub token is required.')
          postAppApiResponse(payload.requestId, { ok: true, result: await api.connectToken(token) })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.disconnect') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.disconnect() })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.status') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.getStatus() })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.discover') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.discoverRepos() })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.list') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.listRepos() })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.set') {
          const repos: SyncRepo[] = Array.isArray(input.repos)
            ? input.repos
                .map((repo): SyncRepo => {
                  const record = isRecord(repo) ? repo : {}
                  const lastSyncStatus: SyncRepo['lastSyncStatus'] =
                    record.lastSyncStatus === 'success' || record.lastSyncStatus === 'error'
                      ? record.lastSyncStatus
                      : null
                  return {
                    fullName: cleanText(record.fullName, 240),
                    enabled: record.enabled !== false,
                    lastSyncedAt:
                      typeof record.lastSyncedAt === 'number' ? record.lastSyncedAt : null,
                    lastSyncStatus,
                    lastSyncError:
                      typeof record.lastSyncError === 'string' ? record.lastSyncError : null,
                  }
                })
                .filter((repo) => repo.fullName)
            : []
          postAppApiResponse(payload.requestId, { ok: true, result: await api.setRepos(repos) })
          recordAudit('success')
          return
        }
        if (payload.op === 'github.repos.sync') {
          postAppApiResponse(payload.requestId, { ok: true, result: await api.syncNow() })
          recordAudit('success')
          return
        }
      }

      if (payload.op === 'bookmarks.browser.import') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'bookmarks') {
          throw new Error('Browser bookmark import is only available to the Bookmarks app.')
        }
        const result = await invokeDesktop('sepilot:apps/bookmarks/import-browser', input)
        if (result === undefined) throw new Error('Desktop bookmarks bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'ai.usage.collect') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'subscriptions') {
          throw new Error('AI usage collection is only available to the subscriptions app.')
        }
        const result = await invokeDesktop('sepilot:apps/ai-usage/get')
        if (result === undefined) throw new Error('Desktop AI usage bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('atlassian.')) {
        ensureHostRequestConsent(page, payload.op)
        const isJiraOp = payload.op.startsWith('atlassian.jira.')
        const isConfluenceOp = payload.op.startsWith('atlassian.confluence.')
        if ((isJiraOp && page.kind !== 'jira') || (isConfluenceOp && page.kind !== 'confluence')) {
          throw new Error(
            'Atlassian Data Center requests are only available to Jira and Confluence apps.',
          )
        }
        const result = await invokeDesktop('sepilot:apps/atlassian/request', {
          op: payload.op,
          input,
        })
        if (result === undefined) throw new Error('Desktop Atlassian bridge is unavailable.')
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'services.health.check' || payload.op === 'network.health.check') {
        ensureHostRequestConsent(page, payload.op)
        const allowedKind =
          (payload.op === 'services.health.check' && page.kind === 'services') ||
          (payload.op === 'network.health.check' && page.kind === 'network')
        if (!allowedKind) {
          throw new Error('Health checks are only available to the matching infrastructure app.')
        }
        const healthCheck = getDesktopApi()?.apps?.checkServiceHealth
        if (!healthCheck) throw new Error('Desktop service health bridge is unavailable.')
        const result = await healthCheck({
          services: Array.isArray(input.services)
            ? input.services.map((service) => {
                const record = isRecord(service) ? service : {}
                return {
                  id: typeof record.id === 'string' ? record.id : '',
                  name: typeof record.name === 'string' ? record.name : undefined,
                  url: typeof record.url === 'string' ? record.url : '',
                  port: typeof record.port === 'number' ? record.port : null,
                }
              })
            : [],
          timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined,
        })
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'market.quotes.fetch') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'portfolio' && page.kind !== 'stocks') {
          throw new Error('Market quote requests are only available to finance apps.')
        }
        const fetchMarketQuotes = getDesktopApi()?.apps?.fetchMarketQuotes
        if (!fetchMarketQuotes) throw new Error('Desktop market quote bridge is unavailable.')
        const request: DesktopMarketQuotesInput = {
          assets: Array.isArray(input.assets)
            ? input.assets.map((asset, index) => {
                const record = isRecord(asset) ? asset : {}
                return {
                  id: cleanText(record.id, 160) || `asset-${index + 1}`,
                  name: cleanText(record.name, 240) || undefined,
                  symbol: cleanText(record.symbol, 80),
                  market: cleanText(record.market, 32),
                  type: cleanText(record.type, 80),
                  currency: cleanText(record.currency, 12),
                }
              })
            : [],
          range: cleanText(input.range, 12),
          interval: cleanText(input.interval, 12),
        }
        const result = await fetchMarketQuotes(request)
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'kubernetes.cluster.snapshot') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'clusters') {
          throw new Error(
            'Kubernetes cluster snapshots are only available to the cluster table app.',
          )
        }
        const fetchKubernetesSnapshot = getDesktopApi()?.apps?.fetchKubernetesSnapshot
        if (!fetchKubernetesSnapshot) throw new Error('Desktop Kubernetes bridge is unavailable.')
        const connection = isRecord(input.connection) ? input.connection : {}
        const request: DesktopKubernetesSnapshotInput = {
          connection: {
            id: cleanText(connection.id, 160) || undefined,
            name: cleanText(connection.name, 160) || undefined,
            provider: cleanText(connection.provider, 80) || undefined,
            apiUrl: cleanText(connection.apiUrl, 2048),
            token: cleanText(connection.token, 20_000) || undefined,
            caCert: cleanText(connection.caCert, 100_000) || undefined,
            insecureSkipTlsVerify: Boolean(connection.insecureSkipTlsVerify),
          },
          saveCredential: Boolean(input.saveCredential),
          timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined,
        }
        const result = await fetchKubernetesSnapshot(request)
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'kubernetes.rancher.import') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'clusters') {
          throw new Error('Rancher imports are only available to the cluster table app.')
        }
        const importRancherClusters = getDesktopApi()?.apps?.importRancherClusters
        if (!importRancherClusters) throw new Error('Desktop Rancher bridge is unavailable.')
        const request: DesktopRancherImportInput = {
          rancherUrl: cleanText(input.rancherUrl, 2048),
          token: cleanText(input.token, 20_000) || undefined,
          caCert: cleanText(input.caCert, 100_000) || undefined,
          insecureSkipTlsVerify: Boolean(input.insecureSkipTlsVerify),
          provider: cleanText(input.provider, 80) || undefined,
          timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined,
          cacheTtlMinutes:
            typeof input.cacheTtlMinutes === 'number' ? input.cacheTtlMinutes : undefined,
        }
        const result = await importRancherClusters(request)
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op === 'kubernetes.cluster.credential.delete') {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'clusters') {
          throw new Error(
            'Kubernetes credential deletion is only available to the cluster table app.',
          )
        }
        const deleteKubernetesCredential = getDesktopApi()?.apps?.deleteKubernetesCredential
        if (!deleteKubernetesCredential) {
          throw new Error('Desktop Kubernetes credential bridge is unavailable.')
        }
        const result = await deleteKubernetesCredential(cleanText(input.connectionId, 160))
        postAppApiResponse(payload.requestId, { ok: true, result })
        recordAudit('success')
        return
      }

      if (payload.op.startsWith('smarthome.')) {
        ensureHostRequestConsent(page, payload.op)
        if (page.kind !== 'smarthome') {
          throw new Error('Smart home host requests are only available to the Smart Home app.')
        }
        const apps = getDesktopApi()?.apps
        if (!apps) throw new Error('Desktop apps bridge is unavailable.')
        if (payload.op === 'smarthome.integrations.status') {
          const status = await apps.smartHomeStatus?.()
          if (!status) throw new Error('Desktop smart home status bridge is unavailable.')
          postAppApiResponse(payload.requestId, { ok: true, result: status })
          recordAudit('success')
          return
        }
        if (payload.op === 'smarthome.devices.sync') {
          const syncSmartHomeDevices = apps.syncSmartHomeDevices
          if (!syncSmartHomeDevices)
            throw new Error('Desktop smart home sync bridge is unavailable.')
          const provider = cleanText(input.provider, 80)
          const result = await syncSmartHomeDevices({
            provider: provider || undefined,
          } satisfies DesktopSmartHomeSyncInput)
          if (!result.ok && result.provider === 'SmartThings') {
            openSettingsTab('smart-home')
          }
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit(result.ok ? 'success' : 'error', result.warnings.join('; ') || undefined)
          return
        }
        if (payload.op === 'smarthome.device.command') {
          const commandSmartHomeDevice = apps.commandSmartHomeDevice
          if (!commandSmartHomeDevice) {
            throw new Error('Desktop smart home command bridge is unavailable.')
          }
          const device = isRecord(input.device) ? input.device : {}
          const request: DesktopSmartHomeDeviceCommandInput = {
            provider: cleanText(input.provider, 80) || undefined,
            deviceId: cleanText(input.deviceId, 160),
            componentId: cleanText(input.componentId, 80) || undefined,
            action: cleanText(input.action, 80),
            value: input.value,
            device,
          }
          const result = await commandSmartHomeDevice(request)
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit('success')
          return
        }
      }

      if (payload.op.startsWith('calendar.')) {
        if (payload.op === 'calendar.google.status') {
          if (isOfficialCalendarPage(page)) {
            ensureHostRequestDeclared(page, payload.op)
          } else {
            ensureHostRequestConsent(page, payload.op)
          }
          if (!desktopSettingsFeatures.google) {
            postAppApiResponse(payload.requestId, {
              ok: true,
              result: {
                available: false,
                configured: false,
                connected: false,
                appId: page.id,
              },
            })
            recordAudit('success', 'Google Calendar is disabled by the Desktop build profile.')
            return
          }
          const calendar = getDesktopApi()?.calendar
          if (!calendar) throw new Error('Desktop calendar bridge is unavailable.')
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await calendar.status(currentPage.id, googleSyncStateFromPage(currentPage)),
          })
          recordAudit('success')
          return
        }
        if (payload.op.startsWith('calendar.google.') && !desktopSettingsFeatures.google) {
          throw new Error('Google Calendar is unavailable in this Desktop build.')
        }
        ensureHostRequestConsent(page, payload.op)
        const calendar = getDesktopApi()?.calendar
        if (!calendar) throw new Error('Desktop calendar bridge is unavailable.')
        if (payload.op === 'calendar.google.connect') {
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          const currentState = googleSyncStateFromPage(currentPage)
          const status = await calendar.status(currentPage.id, currentState)
          if (!status || !status.configured) {
            openSettingsTab('google')
            postAppApiResponse(payload.requestId, {
              ok: true,
              result: status ?? { configured: false, connected: false, appId: currentPage.id },
            })
            recordAudit('success', 'Google OAuth client id is not configured; opened settings.')
            return
          }
          await calendar.connectGoogle()
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await calendar.status(currentPage.id, currentState),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'calendar.google.disconnect') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await calendar.disconnectGoogle(),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'calendar.google.listCalendars') {
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await calendar.listGoogleCalendars(page.id),
          })
          recordAudit('success')
          return
        }
        if (payload.op === 'calendar.google.configureCalendars') {
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          const selectedCalendarIds = Array.isArray(input.selectedCalendarIds)
            ? input.selectedCalendarIds.filter(
                (calendarId): calendarId is string => typeof calendarId === 'string',
              )
            : []
          const defaultCalendarId =
            typeof input.defaultCalendarId === 'string' ? input.defaultCalendarId : null
          const status = await calendar.configureGoogleCalendars({
            appId: currentPage.id,
            appTitle: currentPage.title,
            selectedCalendarIds,
            defaultCalendarId,
          })
          const currentState = googleSyncStateFromPage(currentPage) ?? {
            provider: 'google' as const,
            eventMap: {},
          }
          updatePageData(
            currentPage.id,
            patchGoogleSyncState(currentPage, {
              ...currentState,
              calendarId: status.defaultCalendarId ?? status.calendarId,
              selectedCalendarIds: status.selectedCalendarIds ?? selectedCalendarIds,
              defaultCalendarId: status.defaultCalendarId ?? status.calendarId ?? null,
            }),
          )
          postAppApiResponse(payload.requestId, { ok: true, result: status })
          recordAudit('success')
          return
        }
        if (payload.op === 'calendar.google.sync') {
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          const result = await calendar.syncAppEvents({
            appId: currentPage.id,
            appTitle: currentPage.title,
            events: calendarEventsFromPage(currentPage),
            state: googleSyncStateFromPage(currentPage),
          })
          updatePageData(
            currentPage.id,
            patchGoogleSyncState(
              currentPage,
              result.state,
              Array.isArray(result.events) ? result.events : undefined,
            ),
          )
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit(result.ok ? 'success' : 'error', result.errors.join('; ') || undefined)
          return
        }
        if (payload.op === 'calendar.google.delete') {
          if (!calendar.deleteGoogleEvent) {
            throw new Error('Desktop calendar delete bridge is unavailable.')
          }
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          const eventId = typeof input.eventId === 'string' ? input.eventId : ''
          const scope =
            input.scope === 'series' || input.scope === 'future' ? input.scope : 'single'
          const result = await calendar.deleteGoogleEvent({
            appId: currentPage.id,
            appTitle: currentPage.title,
            eventId,
            scope,
            events: calendarEventsFromPage(currentPage),
            state: googleSyncStateFromPage(currentPage),
          })
          updatePageData(
            currentPage.id,
            patchGoogleSyncState(
              currentPage,
              result.state,
              Array.isArray(result.events) ? result.events : undefined,
            ),
          )
          postAppApiResponse(payload.requestId, { ok: true, result })
          recordAudit(result.ok ? 'success' : 'error', result.errors.join('; ') || undefined)
          return
        }
        if (payload.op === 'calendar.google.configureAutoSync') {
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          const intervalMinutes =
            input.intervalMinutes == null || input.intervalMinutes === ''
              ? null
              : Number(input.intervalMinutes)
          const status = await calendar.configureAutoSync({
            appId: currentPage.id,
            appTitle: currentPage.title,
            intervalMinutes,
          })
          const currentState = googleSyncStateFromPage(currentPage) ?? {
            provider: 'google',
            eventMap: {},
          }
          updatePageData(
            currentPage.id,
            patchGoogleSyncState(currentPage, {
              ...currentState,
              autoSyncIntervalMinutes: status.autoSyncIntervalMinutes ?? null,
            }),
          )
          postAppApiResponse(payload.requestId, { ok: true, result: status })
          recordAudit('success')
          return
        }
        if (payload.op === 'calendar.ics.export') {
          const currentPage =
            useAppsStore.getState().pages.find((candidate) => candidate.id === page.id) ?? page
          postAppApiResponse(payload.requestId, {
            ok: true,
            result: await calendar.exportIcs({
              appTitle: currentPage.title,
              events: calendarEventsFromPage(currentPage),
            }),
          })
          recordAudit('success')
          return
        }
      }

      throw new Error(`Unsupported Apps API operation: ${payload.op}`)
    } catch (error) {
      postAppApiResponse(payload.requestId, {
        ok: false,
        error: appApiErrorPayload(error, payload.op),
      })
      recordAudit('error', error instanceof Error ? error.message : String(error))
    } finally {
      await flushAudit()
    }
  }

  useEffect(() => {
    if (!displayPage) return
    setRuntimeErrors((current) => {
      if (!current[displayPage.id]?.length) return current
      const next = { ...current }
      delete next[displayPage.id]
      return next
    })
  }, [displayPage?.id, displayPage?.html, isDark])

  useEffect(() => {
    if (!displayPage || !iframeRef.current?.contentWindow) return
    const dataSignature = stableJsonSignature(displayPage.data)
    const sandboxOriginatedIndex = sandboxOriginatedDataQueueRef.current.findIndex(
      (entry) => entry.pageId === displayPage.id && entry.signature === dataSignature,
    )
    if (sandboxOriginatedIndex >= 0) {
      const entry = sandboxOriginatedDataQueueRef.current[sandboxOriginatedIndex]
      if (entry.remainingEchoes <= 1) {
        sandboxOriginatedDataQueueRef.current.splice(sandboxOriginatedIndex, 1)
      } else {
        sandboxOriginatedDataQueueRef.current[sandboxOriginatedIndex] = {
          ...entry,
          remainingEchoes: entry.remainingEchoes - 1,
        }
      }
      return
    }
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'sepilot-apps:replace-data',
        pageId: displayPage.id,
        data: displayPage.data,
      },
      '*',
    )
  }, [displayPage?.id, displayPage?.data])

  useEffect(() => {
    void hydrateFromStorage()
  }, [hydrateFromStorage])

  useEffect(() => {
    if (activeId && openPages.some((page) => page.id === activeId)) return
    if (!activeId && openPages.length === 0) return
    setActive(openPages[0]?.id ?? null)
  }, [activeId, openPages, setActive])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data as
        | {
            type?: string
            pageId?: string
            data?: Record<string, unknown>
            error?: unknown
            requestId?: string
            op?: string
            input?: Record<string, unknown>
          }
        | undefined
      if (
        (payload?.type === 'sepilot-apps:update-data' ||
          payload?.type === 'sepilot-office:update-data') &&
        payload.pageId &&
        payload.data &&
        typeof payload.data === 'object'
      ) {
        if (!event.source || appFrameWindowsRef.current.get(event.source) !== payload.pageId) return
        const pageExists = useAppsStore
          .getState()
          .pages.some((candidate) => candidate.id === payload.pageId)
        if (!pageExists) return
        sandboxOriginatedDataQueueRef.current = [
          ...sandboxOriginatedDataQueueRef.current,
          {
            pageId: payload.pageId,
            signature: stableJsonSignature(payload.data),
            remainingEchoes: 2,
          },
        ].slice(-20)
        updatePageData(payload.pageId, payload.data)
        return
      }
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return
      }
      if (payload?.type === 'sepilot-apps:api-request') {
        void handleAppApiRequest(payload)
        return
      }
      if (
        payload?.type === 'sepilot-apps:runtime-error' &&
        payload.pageId &&
        payload.pageId === displayPage?.id
      ) {
        const runtimeError = normalizeAppRuntimeError(payload.error)
        if (runtimeError) {
          setRuntimeErrors((current) => ({
            ...current,
            [payload.pageId!]: [runtimeError, ...(current[payload.pageId!] ?? [])].slice(0, 5),
          }))
        }
        return
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [displayPage, pages, transport, updatePageData])

  useEffect(() => {
    function openCodeAgent() {
      setCodeAgentOpen(true)
      setBuildTarget('new')
      requestAnimationFrame(() => promptRef.current?.focus())
    }
    window.addEventListener('sepilot:apps:code-agent', openCodeAgent)
    window.addEventListener('sepilot:apps:new', openCodeAgent)
    return () => {
      window.removeEventListener('sepilot:apps:code-agent', openCodeAgent)
      window.removeEventListener('sepilot:apps:new', openCodeAgent)
    }
  }, [])

  useEffect(() => {
    if (pendingDraft?.target !== 'current') return
    if (pendingDraft.previewPage.id === activeId) return
    setPendingDraft(null)
  }, [activeId, pendingDraft])

  useEffect(() => {
    const pageId = displayPage?.id
    if (!storageHydrated || !pageId || pageId.startsWith('draft-')) return
    if (appChatMessagesRef.current[pageId]?.length) return
    let cancelled = false
    void loadPersistedAppChatHistory(pageId).then((history) => {
      if (cancelled || history.length === 0 || appChatMessagesRef.current[pageId]?.length) return
      const next = { ...appChatMessagesRef.current, [pageId]: history }
      appChatMessagesRef.current = next
      setAppChatMessages(next)
    })
    return () => {
      cancelled = true
    }
  }, [displayPage?.id, storageHydrated])

  useEffect(() => {
    if (!pendingAppChatMutation) return
    if (pendingAppChatMutation.pageId === displayPage?.id) return
    setPendingAppChatMutation(null)
  }, [displayPage?.id, pendingAppChatMutation])

  function applyPendingDraft(): void {
    if (!pendingDraft) return
    if (pendingDraft.target === 'current' && activePage) {
      updatePage(activePage.id, {
        title: pendingDraft.title,
        html: pendingDraft.html,
        prompt: pendingDraft.request,
        summary: pendingDraft.summary,
      })
    } else {
      addGeneratedPage({
        title: pendingDraft.title,
        html: pendingDraft.html,
        prompt: pendingDraft.request,
        summary: pendingDraft.summary,
      })
    }
    setPrompt('')
    setLastDesignRequest('')
    setDraftReply('')
    setPendingDraft(null)
    setCodeAgentOpen(false)
    toast.success(
      pendingDraft.target === 'current'
        ? '앱 페이지를 업데이트했습니다.'
        : '새 앱 페이지를 만들었습니다.',
    )
  }

  async function submitDesignRequest(target: 'current' | 'new' = buildTarget) {
    const request = prompt.trim()
    if (!request || busy) return
    setCodeAgentOpen(true)
    setLastDesignRequest(request)
    setBusy(true)
    setDraftReply('')
    const designSource = target === 'current' ? activePage : null

    try {
      if (await isBrowserPreviewTransport(transport)) {
        throw new Error('Apps Code Agent requires the Electron daemon bridge.')
      }
      const api = await createChatApi(transport)
      let assistant = ''
      let streamError: Error | null = null
      await api.stream(
        undefined,
        buildAppCodeAgentPrompt({
          request,
          currentPage: designSource,
        }),
        {
          onUpsertMessage: (message) => {
            if (message.role === 'assistant') {
              assistant = message.content
              setDraftReply(message.content)
            }
          },
          onDone: () => {},
          onError: (error) => {
            streamError = error
          },
        },
        {
          chat: {
            mode: 'coder',
            tags: APP_INTERNAL_CHAT_TAGS,
            intentRouting: { enabled: false },
            thinkingLevel: 'high',
            maxIterations: 32,
          },
        },
      )
      if (streamError) {
        throw streamError
      }
      const html = extractHtmlDocument(assistant)
      if (!html) {
        throw new Error('Code Agent response did not contain an HTML document')
      }
      const validation = validateAppHtml(html)
      if (!validation.ok) {
        const detail = validation.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join('; ')
        throw new Error(`Generated app did not pass validation. ${detail}`)
      }
      const title = inferAppTitle(html, designSource?.title ?? 'App Page')
      const summary = inferAppSummary(
        html,
        designSource?.summary ?? 'Code Agent generated microweb app',
      )
      const previewPage = buildPreviewPage({
        target,
        html,
        title,
        summary,
        prompt: request,
        activePage,
        validation,
      })
      const preservation = analyzeAppDataPreservation({
        previousHtml: designSource?.html,
        nextHtml: html,
        data: designSource?.data,
      })
      setPendingDraft({
        target,
        request,
        title,
        summary,
        html,
        validation,
        preservation,
        diff: summarizeHtmlDiff(designSource?.html ?? '', html),
        previewPage,
      })
      toast.success('앱 초안을 만들었습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  function appendAppChatMessage(pageId: string, message: AppChatTurn): void {
    const normalized = normalizeAppChatTurn(message)
    if (!normalized) return
    const nextHistory = [...(appChatMessagesRef.current[pageId] ?? []), normalized].slice(
      -APP_CHAT_HISTORY_LIMIT,
    )
    const next = {
      ...appChatMessagesRef.current,
      [pageId]: nextHistory,
    }
    appChatMessagesRef.current = next
    setAppChatMessages(next)
    if (!pageId.startsWith('draft-')) {
      void savePersistedAppChatHistory(pageId, nextHistory).catch((error) => {
        recordAppChatAudit(
          pageId,
          'app-chat.history.save',
          'error',
          error instanceof Error ? error.message : String(error),
        )
      })
    }
  }

  function setAppChatPageBusy(pageId: string, busy: boolean): void {
    setAppChatBusyByPageId((current) => {
      if (busy) return { ...current, [pageId]: true }
      if (!current[pageId]) return current
      const next = { ...current }
      delete next[pageId]
      return next
    })
  }

  function clearActiveAppChatHistory(): void {
    const page = displayPage
    if (!page || activeAppChatBusy) return
    const next = { ...appChatMessagesRef.current }
    delete next[page.id]
    appChatMessagesRef.current = next
    setAppChatMessages(next)
    setPendingAppChatMutation((current) => (current?.pageId === page.id ? null : current))
    setAppChatUndo((current) => {
      if (!current[page.id]) return current
      const nextUndo = { ...current }
      delete nextUndo[page.id]
      return nextUndo
    })
    if (!page.id.startsWith('draft-')) {
      void savePersistedAppChatHistory(page.id, []).catch((error) => {
        recordAppChatAudit(
          page.id,
          'app-chat.history.clear',
          'error',
          error instanceof Error ? error.message : String(error),
        )
      })
    }
    toast.success('App Chat 대화를 초기화했습니다.')
  }

  async function selectAppChatModel(providerId: string, modelId: string): Promise<void> {
    const previous = { providerId: llm.providerId, modelId: llm.modelId }
    setLlm({ providerId, modelId })
    setAppChatModelOpen(false)
    try {
      if (await isBrowserPreviewTransport(transport)) return
      await (await createSettingsApi(transport)).setLlm({ providerId, modelId })
    } catch (error) {
      setLlm(previous)
      toast.error('App Chat 모델을 변경하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }

  function recordAppChatAudit(
    pageId: string,
    operation: string,
    status: 'success' | 'error',
    message?: string,
  ): void {
    void getDesktopApi()?.apps?.recordAudit({
      appId: pageId,
      operation,
      capability: 'apps',
      status,
      source: 'agent',
      message,
    })
  }

  async function executeAppChatActions(
    pageId: string,
    pageTitle: string,
    actions: AppChatAction[],
  ): Promise<string[]> {
    const completed: string[] = []
    let schedulerApi: Awaited<ReturnType<typeof createSchedulerApi>> | null = null
    let notificationsApi: Awaited<ReturnType<typeof createNotificationsApi>> | null = null

    for (const action of actions) {
      if (action.op === 'scheduler.upsert') {
        schedulerApi ??= await createSchedulerApi(transport)
        const id = appScopedId(pageId, action.id)
        const name = cleanText(action.name, 120) || `${pageTitle} task`
        const instruction = cleanText(action.instruction, 1000)
        await schedulerApi.upsert({
          id,
          name: `[${pageTitle}] ${name}`.slice(0, 120),
          when: cleanText(action.when, 120) || undefined,
          cron: cleanText(action.cron, 120) || undefined,
          timezone: cleanText(action.timezone, 80) || undefined,
          instruction: `App "${pageTitle}" scheduled task: ${instruction}`,
          enabled: action.enabled,
          maxAttempts: action.maxAttempts,
          retryBackoffMs: action.retryBackoffMs,
        })
        completed.push(`scheduler.upsert:${id}`)
        continue
      }
      if (action.op === 'scheduler.remove') {
        schedulerApi ??= await createSchedulerApi(transport)
        const id = appScopedId(pageId, action.id)
        await schedulerApi.remove(id)
        completed.push(`scheduler.remove:${id}`)
        continue
      }
      if (action.op === 'notification.publish') {
        notificationsApi ??= await createNotificationsApi(transport)
        const id = appScopedId(pageId, action.id)
        await notificationsApi.publish({
          id,
          title: `[${pageTitle}] ${cleanText(action.title, 120)}`.slice(0, 120),
          body: cleanText(action.body, 600),
          url: typeof action.url === 'string' ? action.url : null,
        })
        completed.push(`notification.publish:${id}`)
        continue
      }
      if (action.op === 'notification.schedule') {
        schedulerApi ??= await createSchedulerApi(transport)
        const id = appScopedId(pageId, action.id)
        const title = cleanText(action.title, 120) || pageTitle
        const when = cleanText(action.when, 120) || undefined
        const runAt = Number.isFinite(action.runAt) ? action.runAt : undefined
        await schedulerApi.upsert({
          id,
          name: `[${pageTitle}] ${title}`.slice(0, 120),
          ...(runAt !== undefined ? { runAt } : { when }),
          timezone: cleanText(action.timezone, 80) || undefined,
          instruction: '__internal:notification',
          enabled: true,
          metadata: {
            source: {
              type: 'app.notification',
              appId: pageId,
              appTitle: pageTitle,
              ...(isRecord(action.source) ? action.source : {}),
            },
            notification: {
              id,
              title: `[${pageTitle}] ${title}`.slice(0, 120),
              body: cleanText(action.body, 600),
              url: typeof action.url === 'string' ? action.url : null,
            },
          },
        })
        completed.push(`notification.schedule:${id}`)
      }
    }
    return completed
  }

  async function applyPendingAppChatMutation(): Promise<void> {
    const pending = pendingAppChatMutation
    if (!pending) return
    setAppChatPageBusy(pending.pageId, true)
    let completedActions: string[] = []
    let dataApplied = false
    const reloadAppIframe = () => {
      setIframeReloadNonceByPageId((current) => ({
        ...current,
        [pending.pageId]: (current[pending.pageId] ?? 0) + 1,
      }))
    }
    try {
      if (pending.mutations.length > 0) {
        try {
          const appsApi = await createAppsApi(transport)
          const result = await appsApi.mutate(pending.pageId, pending.mutations, {
            dryRun: false,
          })
          const nextData =
            pending.localNextData ?? (isRecord(result.app.data) ? result.app.data : {})
          updatePageData(pending.pageId, nextData)
        } catch (error) {
          if (!isAppsCapabilityUnavailable(error) || !pending.localNextData) throw error
          updatePageData(pending.pageId, pending.localNextData)
        }
        dataApplied = true
        reloadAppIframe()
        setAppChatUndo((current) => ({
          ...current,
          [pending.pageId]: {
            previousData: pending.previousData,
            label: pending.request,
            createdAt: Date.now(),
          },
        }))
      }
      completedActions = await executeAppChatActions(
        pending.pageId,
        pending.pageTitle,
        pending.actions,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendAppChatMessage(pending.pageId, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `${
          dataApplied
            ? '앱 데이터는 적용했지만 일부 작업 실행에 실패했습니다.'
            : '변경 적용에 실패했습니다.'
        }\n${message}`,
        createdAt: Date.now(),
        dataChanged: dataApplied,
      })
      recordAppChatAudit(pending.pageId, 'app-chat.action.apply', 'error', message)
      setAppChatPageBusy(pending.pageId, false)
      return
    }
    appendAppChatMessage(pending.pageId, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: pending.reply || '변경을 적용했습니다.',
      createdAt: Date.now(),
      dataChanged: pending.dataChanged,
      statusLabel:
        pending.mutations.length > 0 && completedActions.length
          ? '앱 데이터 및 작업 적용됨'
          : completedActions.length
            ? '작업 실행됨'
            : pending.mutations.length > 0
              ? 'apps.mutate 적용됨'
              : undefined,
    })
    recordAppChatAudit(
      pending.pageId,
      pending.actions.length ? 'app-chat.change.apply' : 'app-chat.mutation.apply',
      'success',
      [...pending.applied, ...completedActions].join(', ').slice(0, 500),
    )
    setPendingAppChatMutation(null)
    setAppChatPageBusy(pending.pageId, false)
  }

  function discardPendingAppChatMutation(): void {
    const pending = pendingAppChatMutation
    if (!pending) return
    appendAppChatMessage(pending.pageId, {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '변경 미리보기를 취소했습니다.',
      createdAt: Date.now(),
    })
    recordAppChatAudit(pending.pageId, 'app-chat.mutation.discard', 'success', pending.request)
    setPendingAppChatMutation(null)
  }

  async function undoLastAppChatMutation(): Promise<void> {
    const page = displayPage
    if (!page) return
    const undo = appChatUndo[page.id]
    if (!undo) return
    setAppChatPageBusy(page.id, true)
    try {
      const appsApi = await createAppsApi(transport)
      await appsApi.write(page.id, { mode: 'replace', data: undo.previousData })
      updatePageData(page.id, undo.previousData)
      setIframeReloadNonceByPageId((current) => ({
        ...current,
        [page.id]: (current[page.id] ?? 0) + 1,
      }))
      appendAppChatMessage(page.id, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '최근 App Chat 변경을 되돌렸습니다.',
        createdAt: Date.now(),
        dataChanged: true,
        statusLabel: 'apps.write 적용됨',
      })
      recordAppChatAudit(page.id, 'app-chat.mutation.undo', 'success', undo.label)
      setAppChatUndo((current) => {
        const next = { ...current }
        delete next[page.id]
        return next
      })
    } catch (error) {
      if (isAppsCapabilityUnavailable(error)) {
        updatePageData(page.id, undo.previousData)
        setIframeReloadNonceByPageId((current) => ({
          ...current,
          [page.id]: (current[page.id] ?? 0) + 1,
        }))
        appendAppChatMessage(page.id, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '최근 App Chat 변경을 되돌렸습니다.',
          createdAt: Date.now(),
          dataChanged: true,
          statusLabel: 'local apps mutation undo',
        })
        recordAppChatAudit(page.id, 'app-chat.mutation.undo', 'success', undo.label)
        setAppChatUndo((current) => {
          const next = { ...current }
          delete next[page.id]
          return next
        })
        setAppChatPageBusy(page.id, false)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      appendAppChatMessage(page.id, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `되돌리기에 실패했습니다.\n${message}`,
        createdAt: Date.now(),
      })
      recordAppChatAudit(page.id, 'app-chat.mutation.undo', 'error', message)
    } finally {
      setAppChatPageBusy(page.id, false)
    }
  }

  async function loadRelatedAppChatContext(
    page: AppPage,
    request: string,
  ): Promise<SepilotReadableAppSearchResult[]> {
    if (page.id.startsWith('draft-')) return []
    try {
      const appsApi = await createAppsApi(transport)
      const matches = await appsApi.search(request, {
        type: 'hybrid',
        limit: 5,
        interAppReadableOnly: true,
      })
      return matches.filter((match) => match.id !== page.id).slice(0, 4)
    } catch (error) {
      recordAppChatAudit(
        page.id,
        'app-chat.related-context.search',
        'error',
        error instanceof Error ? error.message : String(error),
      )
      return []
    }
  }

  async function submitAppChatRequest(): Promise<void> {
    const request = appChatInput.trim()
    const page = displayPage
    if (!request || !page || appChatBusyByPageId[page.id]) return
    const savedPage = activePage?.id === page.id && !pendingDraft ? activePage : null
    const canWrite = savedPage ? pageDataPolicy(savedPage).aiWritable !== false : false
    const promptPage: AppPage = canWrite
      ? page
      : {
          ...page,
          dataPolicy: {
            ...pageDataPolicy(page),
            aiWritable: false,
          },
        }
    const userTurn: AppChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: request,
      createdAt: Date.now(),
    }
    appendAppChatMessage(page.id, userTurn)
    setAppChatInput('')
    setPendingAppChatMutation(null)
    setAppChatPageBusy(page.id, true)

    try {
      if (await isBrowserPreviewTransport(transport)) {
        throw new Error('App Chat requires the Electron daemon bridge.')
      }
      const relatedApps = await loadRelatedAppChatContext(promptPage, request)
      const api = await createChatApi(transport)
      let assistant = ''
      let streamError: Error | null = null
      await api.stream(
        undefined,
        buildAppChatAgentPrompt({
          request,
          currentPage: promptPage,
          relatedApps,
          history: activeAppChatMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        {
          onUpsertMessage: (message) => {
            if (message.role === 'assistant') assistant = message.content
          },
          onDone: () => {},
          onError: (error) => {
            streamError = error
          },
        },
        {
          chat: {
            provider: llm.providerId ?? undefined,
            model: llm.modelId ?? undefined,
            maxTokens: llm.maxTokens ?? undefined,
            temperature: llm.temperature ?? undefined,
            mode: 'react',
            tags: APP_INTERNAL_CHAT_TAGS,
            intentRouting: { enabled: false },
            thinkingLevel: 'medium',
            maxIterations: 4,
            toolNames: [],
          },
        },
      )
      if (streamError) throw streamError

      const parsed = extractAppChatAgentResponse(assistant)
      let reply = parsed?.reply?.trim() || assistant.trim() || '응답을 생성하지 못했습니다.'
      const actions = parsed?.actions ?? []
      if (parsed?.mutations?.length || actions.length) {
        if (!savedPage) {
          reply = `${reply}\n\n현재 앱은 미리보기 상태라 변경을 준비하지 않았습니다.`
          appendAppChatMessage(page.id, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: reply,
            createdAt: Date.now(),
          })
          return
        }
        const applied: string[] = []
        const issues: AppChatMutationIssue[] = []
        let dataChanged = false
        let localNextData: Record<string, unknown> | undefined
        const mutations = parsed?.mutations ?? []
        if (parsed?.mutations?.length) {
          if (!canWrite) {
            issues.push(
              appChatIssue('app_data_not_writable', 'App data write capability is not granted.'),
            )
          } else {
            const localDryRun = previewAppChatMutationsLocally(savedPage, mutations)
            if (localDryRun.ok && localDryRun.applied.length > 0) {
              localNextData = localDryRun.data
            }
            try {
              const appsApi = await createAppsApi(transport)
              const dryRun = await appsApi.mutate(savedPage.id, mutations, { dryRun: true })
              dataChanged = dryRun.applied.length > 0
              applied.push(...dryRun.applied)
              issues.push(...dryRun.issues)
            } catch (error) {
              if (isAppsCapabilityUnavailable(error)) {
                dataChanged = localDryRun.applied.length > 0
                localNextData = localDryRun.data
                applied.push(...localDryRun.applied)
                issues.push(...localDryRun.issues)
              } else {
                const daemonIssues = appChatIssuesFromDaemonError(error)
                issues.push(
                  ...(daemonIssues.length
                    ? daemonIssues
                    : [
                        appChatIssue(
                          'apps_mutate_dry_run_failed',
                          error instanceof Error ? error.message : String(error),
                        ),
                      ]),
                )
              }
            }
          }
        }
        const actionValidation = validateAppChatActions(savedPage, actions)
        applied.push(...actionValidation.applied)
        issues.push(...actionValidation.issues)

        const hasErrors = issues.some((issue) => issue.severity === 'error')
        if (hasErrors || applied.length === 0) {
          const issueLines = formatAppChatIssueLines(issues)
          appendAppChatMessage(page.id, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: `${reply}\n\n변경 검증에 실패했습니다.${issueLines ? `\n${issueLines}` : ''}`,
            createdAt: Date.now(),
          })
          recordAppChatAudit(
            page.id,
            'app-chat.change.validate',
            'error',
            issues
              .map((issue) => issue.message)
              .join('; ')
              .slice(0, 500),
          )
          return
        }
        setPendingAppChatMutation({
          pageId: savedPage.id,
          pageTitle: savedPage.title,
          request,
          reply,
          previousData: savedPage.data,
          mutations,
          dataChanged,
          actions: actionValidation.actions,
          applied,
          issues,
          localNextData,
        })
        appendAppChatMessage(page.id, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `${reply}\n\n변경 미리보기를 만들었습니다. 적용하려면 Apply를 누르세요.`,
          createdAt: Date.now(),
        })
        return
      }

      if (parsed?.dataReplace || parsed?.dataPatch) {
        appendAppChatMessage(page.id, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `${reply}\n\n이 응답은 legacy raw data mutation(dataPatch/dataReplace)을 반환해서 적용하지 않았습니다. App Chat 데이터 변경은 daemon apps.mutate가 검증할 수 있는 structured mutations만 적용합니다.`,
          createdAt: Date.now(),
        })
        recordAppChatAudit(page.id, 'app-chat.legacy-raw-mutation.reject', 'error', request)
        return
      }
      appendAppChatMessage(page.id, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      })
    } catch (error) {
      if (isChatRunCancelled(error)) {
        appendAppChatMessage(page.id, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '요청이 취소되었습니다.',
          createdAt: Date.now(),
        })
        return
      }
      const friendly = explainChatStreamError(error)
      appendAppChatMessage(page.id, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `${friendly.title}${friendly.description ? `\n${friendly.description}` : ''}`,
        createdAt: Date.now(),
      })
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setAppChatPageBusy(page.id, false)
    }
  }

  if (assistantHomeOpen && !codeAgentOpen && onStartAssistant && onOpenResource) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 justify-end border-b px-3 py-1">
          <Button size="sm" variant="ghost" onClick={() => setAssistantHomeOpen(false)}>앱 보기</Button>
        </div>
        <div className="min-h-0 flex-1">
          <PersonalAssistantHome onStartAssistant={onStartAssistant} onOpenSession={onOpenSession}
            onOpenResource={(destination) => {
              if (destination.view === 'office') {
                setAssistantHomeOpen(false)
                if (destination.appId) setActive(destination.appId)
              } else onOpenResource(destination)
            }} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      {onStartAssistant && onOpenResource ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-primary/[0.03] px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => setAssistantHomeOpen(true)}><Sparkles className="mr-1.5 h-4 w-4" />나의 비서</Button>
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenResource({ view: 'memory' })}>Memory</Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenResource({ view: 'tasks' })}>Tasks</Button>
            <Button variant="outline" size="sm" onClick={() => onStartAssistant(buildAssistantRequest({
              title: displayPage ? `${displayPage.title} · 비서 대화` : '비서 대화',
              prompt: '이 앱의 현재 내용을 확인하고, 관련 앱과 내 기억을 함께 활용해 다음에 할 일을 제안해줘. 아직 데이터를 바꾸지는 마.',
            }, displayPage ?? undefined))}>비서와 대화</Button>
          </div>
        </div>
      ) : null}
      {}
      {openPages.length > 0 || codeAgentOpen ? (
        <div
          className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-background/80 px-2 py-1"
          role="tablist"
          aria-label="Apps tab groups"
        >
          {tabGroups.map((group) => {
            const groupActive = !codeAgentOpen && group.key === activeTabGroupKey
            return (
              <div
                key={group.key}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md border px-1 py-0.5 transition-colors',
                  groupActive
                    ? 'border-border bg-muted/45'
                    : 'border-transparent bg-transparent hover:border-border/70 hover:bg-muted/25',
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupActive}
                  aria-expanded={groupActive}
                  className={cn(
                    'flex h-6 shrink-0 items-center gap-1.5 rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                    groupActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                  onClick={() => {
                    setCodeAgentOpen(false)
                    setActive(group.pages[0]?.id ?? null)
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes('application/x-sepilot-app-tab')) {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }
                  }}
                  onDrop={(event) => {
                    const sourceId = event.dataTransfer.getData('application/x-sepilot-app-tab')
                    if (!sourceId) return
                    event.preventDefault()
                    event.stopPropagation()
                    assignTabGroup(sourceId, group.key)
                    setCodeAgentOpen(false)
                    setActive(sourceId)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setTabMenu(null)
                    setTabGroupMenu({
                      x: event.clientX,
                      y: event.clientY,
                      groupKey: group.key,
                    })
                  }}
                  title={`${group.label} · ${group.pages.length}개`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: group.accent }}
                    aria-hidden="true"
                  />
                  <span className="text-[9px] text-muted-foreground">그룹</span>
                  <span className="max-w-[104px] truncate">{group.label}</span>
                  <span className="rounded border bg-background/70 px-1 text-[9px] leading-4 text-muted-foreground">
                    {group.pages.length}
                  </span>
                </button>
                {groupActive
                  ? group.pages.map((page) => {
                      const index = openPages.findIndex((candidate) => candidate.id === page.id)
                      const tabActive = !codeAgentOpen && page.id === activeId
                      return (
                        <div
                          key={page.id}
                          role="tab"
                          aria-selected={tabActive}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-sepilot-app-tab', page.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragOver={(event) => {
                            if (
                              event.dataTransfer.types.includes('application/x-sepilot-app-tab')
                            ) {
                              event.preventDefault()
                              event.dataTransfer.dropEffect = 'move'
                            }
                          }}
                          onDrop={(event) => {
                            const sourceId = event.dataTransfer.getData(
                              'application/x-sepilot-app-tab',
                            )
                            if (!sourceId || sourceId === page.id) return
                            event.preventDefault()
                            const sourceIndex = openPages.findIndex(
                              (candidate) => candidate.id === sourceId,
                            )
                            const rect = event.currentTarget.getBoundingClientRect()
                            const dropAfter = event.clientX > rect.left + rect.width / 2
                            let targetIndex = index + (dropAfter ? 1 : 0)
                            if (sourceIndex >= 0 && sourceIndex < targetIndex) targetIndex -= 1
                            reorderOpenPage(sourceId, targetIndex)
                          }}
                          onClick={() => {
                            setCodeAgentOpen(false)
                            setActive(page.id)
                          }}
                          onAuxClick={(event) => {
                            if (event.button === 1) {
                              event.preventDefault()
                              closeAppTabsWithUndo([page.id])
                            }
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setTabGroupMenu(null)
                            setTabMenu({
                              x: event.clientX,
                              y: event.clientY,
                              pageId: page.id,
                            })
                          }}
                          className={cn(
                            'group flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded border px-2 text-xs transition-colors',
                            tabActive
                              ? 'border-border bg-background text-foreground shadow-sm'
                              : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                          )}
                          title={page.title}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: page.accent ?? '#2563eb' }}
                            aria-hidden="true"
                          />
                          <span className="max-w-[160px] truncate">{page.title}</span>
                          <button
                            type="button"
                            className={cn(
                              'ml-1 rounded p-0.5 transition-opacity hover:bg-muted-foreground/15',
                              tabActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-100',
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              closeAppTabsWithUndo([page.id])
                            }}
                            aria-label={`close ${page.title}`}
                            title="Close app"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })
                  : null}
              </div>
            )
          })}
          {codeAgentOpen ? (
            <div
              role="tab"
              aria-selected="true"
              className="group flex h-7 shrink-0 items-center gap-1.5 rounded border border-border bg-muted/70 px-2 text-xs text-foreground"
              title="Code Agent"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[160px] truncate">Code Agent</span>
              <button
                type="button"
                className="ml-1 rounded p-0.5 opacity-70 transition-opacity hover:bg-muted-foreground/15"
                onClick={() => {
                  setPendingDraft(null)
                  setCodeAgentOpen(false)
                }}
                aria-label="close code agent"
                title="Close Code Agent"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded"
            onClick={() => addFromTemplate('calendar')}
            title="새 앱 (calendar 템플릿)"
            aria-label="add new app from calendar template"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LayoutGrid className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">
              {codeAgentOpen ? 'Code Agent' : (displayPage?.title ?? '앱')}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {codeAgentOpen
                ? '채팅으로 새 앱을 만들고 왼쪽에서 초안을 미리봅니다'
                : pendingDraft
                  ? `draft preview · ${pendingDraft.target === 'current' ? 'update' : 'new'}`
                  : activePage
                    ? `${activePage.category ?? activePage.kind} · ${activePage.origin ?? 'template'}`
                    : 'MicroWeb app workspace'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!storageHydrated ? (
            <span className="hidden rounded border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
              loading storage
            </span>
          ) : storageError ? (
            <span
              className="hidden max-w-[240px] truncate rounded border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive md:inline"
              title={storageError}
            >
              storage error
            </span>
          ) : storagePath ? (
            <span
              className="hidden rounded border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground md:inline"
              title={storagePath}
            >
              ~/.sepilotd/apps
            </span>
          ) : null}
          {!codeAgentOpen && displayPage?.summary ? (
            <span className="hidden max-w-[280px] truncate rounded border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground md:inline">
              {displayPage.summary}
            </span>
          ) : null}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        {codeAgentOpen ? (
          <div className="grid h-full min-h-0 gap-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
              <div className="flex h-10 shrink-0 items-center justify-between border-b bg-muted/20 px-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {codeAgentPreviewPage
                      ? `${codeAgentPreviewPage.title} 미리보기`
                      : '앱 미리보기'}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {pendingDraft
                      ? pendingDraft.target === 'current'
                        ? '현재 앱 업데이트 초안'
                        : '새 앱 초안'
                      : buildTarget === 'current' && activePage
                        ? `${activePage.title} 기반으로 수정`
                        : '채팅을 보내면 여기에 생성 결과가 표시됩니다'}
                  </div>
                </div>
                {pendingDraft ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md px-2 text-xs"
                      onClick={() => {
                        setPendingDraft(null)
                        setDraftReply('')
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 rounded-md px-2 text-xs"
                      onClick={applyPendingDraft}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Apply
                    </Button>
                  </div>
                ) : null}
              </div>

              {codeAgentPreviewPage ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/20 px-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: codeAgentPreviewPage.accent ?? '#2563eb' }}
                      />
                      <span className="truncate text-[11px] font-medium text-muted-foreground">
                        microweb://{codeAgentPreviewPage.title.toLowerCase().replace(/\s+/g, '-')}
                      </span>
                    </div>
                    <span className="rounded border bg-background px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                      preview
                    </span>
                  </div>
                  <iframe
                    ref={recordAppFrame}
                    data-app-page-id={codeAgentPreviewPage.id}
                    key={`${codeAgentPreviewPage.id}:${pendingDraft ? 'draft' : 'base'}:${isDark ? 'dark' : 'light'}`}
                    title={codeAgentPreviewPage.title}
                    className="min-h-0 flex-1 border-0"
                    style={{ background: isDark ? '#0d1117' : '#f6f7f9' }}
                    sandbox={APP_IFRAME_SANDBOX}
                    referrerPolicy="no-referrer"
                    srcDoc={srcDoc}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/10 p-6 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-foreground">
                      만들 앱을 채팅으로 설명하세요
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      업무 흐름, 필요한 입력 필드, 저장해야 할 데이터, 자동화가 필요한 부분을 한
                      번에 말하면 초안을 생성합니다.
                    </p>
                  </div>
                </div>
              )}

              {pendingDraft ? (
                <div className="shrink-0 border-t bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                      <GitCompare className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate">{pendingDraft.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded border bg-background px-1.5 py-0.5">
                        +{pendingDraft.diff.added}
                      </span>
                      <span className="rounded border bg-background px-1.5 py-0.5">
                        -{pendingDraft.diff.removed}
                      </span>
                      <span className="rounded border bg-background px-1.5 py-0.5">
                        {pendingDraft.validation.issues.length} issues
                      </span>
                    </div>
                  </div>
                  {pendingDraft.target === 'current' &&
                  pendingDraft.preservation.issues.length > 0 ? (
                    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                      <div className="flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        데이터 보존 확인 필요
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {pendingDraft.preservation.issues.map((issue) => (
                          <div key={`${issue.code}:${issue.message}`} className="truncate">
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
              <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-foreground">Code Agent</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      앱 생성 전용 채팅
                    </div>
                  </div>
                </div>
                <div className="inline-flex rounded-md border bg-muted/20 p-0.5">
                  <button
                    type="button"
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      buildTarget === 'new'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setBuildTarget('new')}
                  >
                    새 앱
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      buildTarget === 'current'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setBuildTarget('current')}
                    disabled={!activePage}
                  >
                    현재 앱
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/10 p-3">
                {!lastDesignRequest && !draftReply && !pendingDraft ? (
                  <div className="rounded-lg border border-dashed bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
                    만들고 싶은 앱을 자연어로 설명하세요. Code Agent가 HTML 앱을 만들고 왼쪽에 바로
                    미리보기를 띄웁니다.
                  </div>
                ) : null}
                {lastDesignRequest ? (
                  <div className="flex justify-end">
                    <div className="max-w-[88%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground">
                      {lastDesignRequest}
                    </div>
                  </div>
                ) : null}
                {busy ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />앱 초안 생성 중
                    </div>
                  </div>
                ) : null}
                {pendingDraft ? (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-lg border bg-background px-3 py-2 text-xs leading-5 text-foreground">
                      <div className="font-semibold">초안을 만들었습니다.</div>
                      <div className="mt-1 text-muted-foreground">
                        왼쪽 미리보기를 확인한 뒤 Apply로 앱에 반영하세요.
                      </div>
                    </div>
                  </div>
                ) : draftReply ? (
                  <div className="flex justify-start">
                    <pre className="max-h-52 max-w-[88%] overflow-auto whitespace-pre-wrap rounded-lg border bg-background px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                      {draftReply}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 border-t bg-background p-3">
                <div className="flex items-stretch gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2 rounded-lg border bg-muted/10 px-2.5 py-1.5 transition-colors focus-within:border-primary/60">
                    <Bot className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                    <textarea
                      ref={promptRef}
                      className="min-h-20 flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                          void submitDesignRequest(buildTarget)
                        }
                      }}
                      placeholder={
                        buildTarget === 'current' && activePage
                          ? '예: 이 앱에 follow-up 자동 체크리스트와 상태 요약을 추가해 줘'
                          : '예: 고객 미팅 CRM + 다음 액션 칸반을 한 화면에 쓰는 앱을 만들어 줘'
                      }
                    />
                  </div>
                  <Button
                    className="h-auto min-h-12 rounded-lg px-3"
                    onClick={() => void submitDesignRequest(buildTarget)}
                    disabled={busy || !prompt.trim()}
                    title={buildTarget === 'current' ? '현재 앱 업데이트' : '새 앱 만들기'}
                  >
                    {busy ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : buildTarget === 'new' ? (
                      <PlusCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span className="sr-only">앱 생성</span>
                  </Button>
                </div>
              </div>
            </section>
          </div>
        ) : displayPage ? (
          <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
            <div className="flex h-8 shrink-0 items-center justify-between border-b bg-muted/20 px-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: displayPage.accent ?? '#2563eb' }}
                />
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  microweb://{displayPage.title.toLowerCase().replace(/\s+/g, '-')}
                </span>
              </div>
              <span className="rounded border bg-background px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {pendingDraft ? 'preview' : 'sandboxed'}
              </span>
            </div>
            {latestRuntimeError ? (
              <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span>App runtime error</span>
                    {activeRuntimeErrors.length > 1 ? (
                      <span className="rounded-full border border-amber-500/30 bg-background/70 px-1.5 py-0.5 text-[10px]">
                        {activeRuntimeErrors.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px]">
                    {latestRuntimeError.message}
                    {latestRuntimeError.lineno ? ` · line ${latestRuntimeError.lineno}` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 rounded-md text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
                  onClick={() => {
                    if (!displayPage) return
                    setRuntimeErrors((current) => {
                      const next = { ...current }
                      delete next[displayPage.id]
                      return next
                    })
                  }}
                  aria-label="Clear app runtime errors"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
            <iframe
              ref={recordAppFrame}
              data-app-page-id={displayPage.id}
              key={`${displayPage.id}:${pendingDraft ? 'draft' : 'saved'}:${isDark ? 'dark' : 'light'}:${activeIframeReloadNonce}`}
              title={displayPage.title}
              className="min-h-0 flex-1 border-0"
              style={{ background: isDark ? '#0d1117' : '#f6f7f9' }}
              sandbox={APP_IFRAME_SANDBOX}
              referrerPolicy="no-referrer"
              srcDoc={srcDoc}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-background/70 px-5 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="max-w-sm">
              <div className="text-sm font-semibold text-foreground">MicroWeb 앱을 준비하세요</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                왼쪽 카탈로그에서 시작하거나 App Manager에서 Code Agent를 열어 필요한 업무 앱을
                생성하세요.
              </p>
            </div>
          </div>
        )}
        {!codeAgentOpen && displayPage ? (
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex max-w-[calc(100%-2rem)] flex-col items-end">
            {appChatOpen ? (
              onStartAssistant && !appEditMode ? <AppAssistantComposer
                app={displayPage} value={appChatInput} onChange={setAppChatInput}
                onStart={onStartAssistant} history={activeAppChatMessages}
                onEdit={() => setAppEditMode(true)} onClose={() => setAppChatOpen(false)}
              /> :
              <section className="pointer-events-auto flex h-[min(460px,calc(100vh-220px))] w-[min(390px,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
                {onStartAssistant ? <div className="border-b bg-primary/[0.03] px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">여러 앱·기억·예약을 함께 활용하려면 비서 대화로 이어가세요.</p>
                  <Button size="sm" variant="ghost" disabled={activeAppChatBusy} onClick={() => setAppEditMode(false)}>비서 대화로 전환 <Sparkles className="ml-1 h-3 w-3" /></Button>
                </div> : null}
                <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">앱 편집 대화</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {displayPage.title}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      ref={setAppChatModelAnchor}
                      className="relative"
                      data-testid="app-chat-model-anchor"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 max-w-36 gap-1 rounded-md px-2 text-[11px]"
                        disabled={providers.length === 0}
                        onClick={() => setAppChatModelOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={appChatModelOpen}
                        aria-label="select app chat model"
                        title={providers.length === 0 ? '사용 가능한 모델 없음' : appChatModelLabel}
                      >
                        <Cpu className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {appChatModel?.label ?? llm.modelId ?? '기본'}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                      </Button>
                      {appChatModelOpen && appChatModelAnchor ? (
                        <FloatingAppSurface
                          anchor={{
                            kind: 'element',
                            element: appChatModelAnchor,
                            align: 'end',
                          }}
                          ariaLabel="App Chat 모델 선택"
                          surfaceRef={appChatModelMenuRef}
                          testId="app-chat-model-menu"
                          className="w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
                        >
                          {providers.map((provider) => (
                            <div key={provider.id} className="py-1">
                              <div className="whitespace-nowrap px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {provider.label}
                              </div>
                              {provider.models.length === 0 ? (
                                <div className="whitespace-nowrap px-2 py-1 text-[11px] text-muted-foreground">
                                  모델 없음
                                </div>
                              ) : (
                                provider.models.map((model) => {
                                  const selected =
                                    provider.id === llm.providerId && model.id === llm.modelId
                                  return (
                                    <button
                                      key={`${provider.id}:${model.id}`}
                                      type="button"
                                      role="menuitem"
                                      className={cn(
                                        'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-sm px-2 py-1 text-left text-xs transition-colors',
                                        selected
                                          ? 'bg-accent text-accent-foreground'
                                          : 'hover:bg-accent/50',
                                      )}
                                      onClick={() => void selectAppChatModel(provider.id, model.id)}
                                    >
                                      <span className="truncate">{model.label}</span>
                                      <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {model.id}
                                      </span>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          ))}
                        </FloatingAppSurface>
                      ) : null}
                    </div>
                    {activeAppChatUndo ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-md px-2 text-[11px]"
                        onClick={() => void undoLastAppChatMutation()}
                      >
                        Undo
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md"
                      onClick={clearActiveAppChatHistory}
                      disabled={
                        activeAppChatBusy ||
                        (activeAppChatMessages.length === 0 &&
                          pendingAppChatMutation?.pageId !== displayPage.id &&
                          !activeAppChatUndo)
                      }
                      aria-label="clear app chat"
                      title="대화 초기화"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md"
                      onClick={() => setAppChatOpen(false)}
                      aria-label="close app chat"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div
                  ref={appChatScrollRef}
                  data-testid="app-chat-scroll"
                  className="min-h-0 flex-1 space-y-2 overflow-auto bg-muted/10 p-3"
                >
                  {activeAppChatMessages.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                      {displayPage.title}에 대해 물어보거나 변경을 요청하세요.
                    </div>
                  ) : (
                    activeAppChatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex min-w-0',
                          message.role === 'user' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'min-w-0 max-w-[86%] overflow-hidden whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs leading-5 [overflow-wrap:anywhere]',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'border bg-background text-foreground',
                          )}
                        >
                          {message.content}
                          {message.dataChanged || message.statusLabel ? (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {message.statusLabel ?? '앱 데이터 업데이트됨'}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                  {pendingAppChatMutation?.pageId === displayPage.id ? (
                    <div className="rounded-lg border border-primary/30 bg-background p-2.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-foreground">변경 미리보기</div>
                        <span className="rounded border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {pendingAppChatMutation.applied.length} ops
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {pendingAppChatMutation.applied.slice(0, 4).map((item) => (
                          <div
                            key={item}
                            className="truncate rounded border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                      {pendingAppChatMutation.issues.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {pendingAppChatMutation.issues.slice(0, 3).map((issue) => (
                            <div
                              key={`${issue.code}:${issue.message}`}
                              className="truncate text-[11px] text-amber-700 dark:text-amber-300"
                            >
                              {issue.severity}: {issue.message}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={discardPendingAppChatMutation}
                        >
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void applyPendingAppChatMutation()}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {activeAppChatBusy ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        응답 작성 중
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 border-t bg-background p-2">
                  <div className="flex items-end gap-2 rounded-lg border bg-muted/10 px-2 py-1.5 focus-within:border-primary/60">
                    <textarea
                      className="max-h-24 min-h-9 flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
                      value={appChatInput}
                      onChange={(event) => setAppChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          void submitAppChatRequest()
                        }
                      }}
                      placeholder="질문 또는 수정 요청"
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-md"
                      onClick={() => void submitAppChatRequest()}
                      disabled={activeAppChatBusy || !appChatInput.trim()}
                      aria-label="send app chat"
                    >
                      {activeAppChatBusy ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </section>
            ) : (
              <Button
                className="pointer-events-auto h-11 w-11 rounded-full shadow-lg"
                size="icon"
                onClick={() => { setAppEditMode(false); setAppChatOpen(true) }}
                title="App Chat"
                aria-label="open app chat"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {tabMenu ? (
        <FloatingAppSurface
          anchor={{ kind: 'point', x: tabMenu.x, y: tabMenu.y }}
          ariaLabel="앱 탭 메뉴"
          testId="app-tab-context-menu"
          className="min-w-44 rounded-md border bg-background py-1 text-sm text-foreground shadow-xl"
        >
          {(() => {
            const menuPage = openPages.find((page) => page.id === tabMenu.pageId) ?? null
            const menuPageIndex = openPages.findIndex((page) => page.id === tabMenu.pageId)
            const otherPageIds = openPages
              .filter((page) => page.id !== tabMenu.pageId)
              .map((page) => page.id)
            const rightPageIds =
              menuPageIndex >= 0 ? openPages.slice(menuPageIndex + 1).map((page) => page.id) : []
            const currentGroup = menuPage ? appTabGroupLabel(menuPage, tabGroupOverrides) : ''
            const groupTargets = tabGroups
              .filter((group) => group.key !== currentGroup)
              .map((group) => group.key)
            return [
              [
                '열기',
                () => {
                  if (!menuPage) return
                  setCodeAgentOpen(false)
                  setActive(menuPage.id)
                },
                !menuPage,
              ],
              [
                '복제',
                () => {
                  if (!menuPage) return
                  setCodeAgentOpen(false)
                  duplicatePage(menuPage.id)
                },
                !menuPage,
              ],
              [
                '새 그룹으로 이동',
                () =>
                  menuPage &&
                  setTabGroupEditor({
                    x: tabMenu.x,
                    y: tabMenu.y,
                    mode: 'assign',
                    pageId: menuPage.id,
                    value: '',
                  }),
                !menuPage,
              ],
              [
                '기본 그룹으로 되돌리기',
                () => menuPage && resetTabGroup(menuPage.id),
                !menuPage || !(menuPage.id in tabGroupOverrides),
              ],
              ...groupTargets.map(
                (groupName) =>
                  [
                    `그룹 지정: ${groupName}`,
                    () => menuPage && assignTabGroup(menuPage.id, groupName),
                    !menuPage,
                  ] as [string, () => void, boolean],
              ),
              ['닫기', () => menuPage && closeAppTabsWithUndo([menuPage.id]), !menuPage],
              [
                `다른 탭 닫기${otherPageIds.length ? ` (${otherPageIds.length})` : ''}`,
                () => {
                  closeAppTabsWithUndo(otherPageIds)
                },
                otherPageIds.length === 0,
              ],
              [
                `오른쪽 탭 닫기${rightPageIds.length ? ` (${rightPageIds.length})` : ''}`,
                () => {
                  closeAppTabsWithUndo(rightPageIds)
                },
                rightPageIds.length === 0,
              ],
            ] as Array<[string, () => void, boolean]>
          })().map(([label, handler, disabled]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                setTabMenu(null)
                handler()
              }}
            >
              {label}
            </button>
          ))}
        </FloatingAppSurface>
      ) : null}

      {tabGroupMenu ? (
        <FloatingAppSurface
          anchor={{ kind: 'point', x: tabGroupMenu.x, y: tabGroupMenu.y }}
          ariaLabel="앱 탭 그룹 메뉴"
          testId="app-tab-group-context-menu"
          className="min-w-44 rounded-md border bg-background py-1 text-sm text-foreground shadow-xl"
        >
          {(() => {
            const group = tabGroups.find((candidate) => candidate.key === tabGroupMenu.groupKey)
            const groupPageIds = group?.pages.map((page) => page.id) ?? []
            return [
              [
                '그룹 이름 바꾸기',
                () =>
                  setTabGroupEditor({
                    x: tabGroupMenu.x,
                    y: tabGroupMenu.y,
                    mode: 'rename',
                    groupKey: tabGroupMenu.groupKey,
                    value: tabGroupMenu.groupKey,
                  }),
                !group,
              ],
              [
                `그룹 닫기${groupPageIds.length ? ` (${groupPageIds.length})` : ''}`,
                () => {
                  closeAppTabsWithUndo(groupPageIds)
                },
                groupPageIds.length === 0,
              ],
            ] as Array<[string, () => void, boolean]>
          })().map(([label, handler, disabled]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={disabled}
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                setTabGroupMenu(null)
                handler()
              }}
            >
              {label}
            </button>
          ))}
        </FloatingAppSurface>
      ) : null}

      {tabGroupEditor ? (
        <FloatingAppSurface
          anchor={{ kind: 'point', x: tabGroupEditor.x, y: tabGroupEditor.y }}
          isMenu={false}
          testId="app-tab-group-editor"
          className="w-56 rounded-md border bg-background text-xs text-foreground shadow-xl"
        >
          <form
            className="w-full p-2"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              submitTabGroupEditor()
            }}
          >
            <label className="block space-y-1">
              <span className="font-medium text-muted-foreground">
                {tabGroupEditor.mode === 'assign' ? '새 그룹 이름' : '그룹 이름'}
              </span>
              <input
                autoFocus
                className="h-8 w-full rounded border bg-background px-2 text-xs outline-none focus:border-primary"
                value={tabGroupEditor.value}
                onChange={(event) =>
                  setTabGroupEditor((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setTabGroupEditor(null)
                  }
                }}
              />
            </label>
            <div className="mt-2 flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTabGroupEditor(null)}
              >
                취소
              </Button>
              <Button type="submit" size="sm" className="h-7 px-2 text-xs">
                적용
              </Button>
            </div>
          </form>
        </FloatingAppSurface>
      ) : null}
    </div>
  )
}
