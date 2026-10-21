import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, dialog, safeStorage, shell, type BrowserWindow } from 'electron'
import type {
  DesktopAppBundle,
  DesktopCalendarAutoSyncInput,
  DesktopCalendarEventInput,
  DesktopCalendarGoogleDeleteInput,
  DesktopCalendarGoogleDeleteResult,
  DesktopCalendarGoogleEventDateTime,
  DesktopCalendarGoogleCalendar,
  DesktopCalendarGoogleEventLink,
  DesktopCalendarGoogleStatus,
  DesktopCalendarGoogleSyncInput,
  DesktopCalendarGoogleSyncResult,
  DesktopCalendarGoogleSyncState,
  DesktopCalendarIcsExportInput,
} from '@sepilotd/api-client'
import { getDesktopDataDir } from './runtime-config'
import { loadDesktopSettings, saveDesktopSettings } from './desktop-settings'
import {
  listDesktopApps,
  recordDesktopAppAudit,
  saveDesktopAppData,
} from './apps-storage'
import {
  googleCalendarRequest,
  postGoogleToken,
} from './google-calendar-http'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_FULL_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const
const GOOGLE_CALENDAR_SCOPE = GOOGLE_CALENDAR_SCOPES.join(' ')
const GOOGLE_PRIMARY_CALENDAR_ID = 'primary'
const CALENDAR_SETTINGS_FILE = 'desktop-calendar-google.json'
const ENCRYPTED_PREFIX = 'enc1:'
const AUTO_SYNC_MINUTES_MIN = 15
const AUTO_SYNC_MINUTES_MAX = 24 * 60
const GOOGLE_SYNC_PAST_DAYS = 366
const GOOGLE_SYNC_FUTURE_DAYS = 730
const CALENDAR_OWNER_KIND = 'calendar'
const EXTERNAL_SHARED_ID_PATTERN = /^(todo|meetings|scrum|timeline|kanban):/u

interface StoredGoogleTokens {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
  scope?: string
  tokenType?: string
  connectedAt?: number
}

interface StoredAppCalendar {
  calendarId: string
  createdAt: number
  updatedAt: number
}

interface StoredAppCalendarSelection {
  selectedCalendarIds: string[]
  defaultCalendarId: string | null
  createdAt: number
  updatedAt: number
}

interface StoredAutoSync {
  appTitle: string
  intervalMinutes: number
  lastRunAt?: number
  lastStatus?: 'success' | 'error'
  lastMessage?: string
}

interface CalendarSettings {
  google: {
    tokens: StoredGoogleTokens
    appCalendars: Record<string, StoredAppCalendar>
    appCalendarSelections: Record<string, StoredAppCalendarSelection>
    autoSync: Record<string, StoredAutoSync>
  }
}

interface GoogleEventDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

interface GoogleEventResponse {
  id?: string
  iCalUID?: string
  summary?: string
  description?: string
  location?: string
  start?: GoogleEventDateTime
  end?: GoogleEventDateTime
  recurrence?: string[]
  recurringEventId?: string
  originalStartTime?: GoogleEventDateTime
  updated?: string
  extendedProperties?: {
    private?: Record<string, string>
  }
}

interface GoogleCalendarListEntry {
  id?: string
  summary?: string
  primary?: boolean
  selected?: boolean
  accessRole?: string
  backgroundColor?: string
  foregroundColor?: string
  timeZone?: string
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarListEntry[]
  nextPageToken?: string
}

interface GoogleEventsListResponse {
  items?: GoogleEventResponse[]
  nextPageToken?: string
}

interface NormalizedCalendarEvent extends DesktopCalendarEventInput {
  title: string
  date: string
}

const timers = new Map<string, NodeJS.Timeout>()
let autoSyncStarted = false

function settingsPath(): string {
  return join(getDesktopDataDir(), CALENDAR_SETTINGS_FILE)
}

function emptySettings(): CalendarSettings {
  return {
    google: {
      tokens: {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      },
      appCalendars: {},
      appCalendarSelections: {},
      autoSync: {},
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function encryptionAvailable(): boolean {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable?.())
  } catch {
    return false
  }
}

function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!encryptionAvailable()) return value
  return `${ENCRYPTED_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
}

function decryptSecret(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith(ENCRYPTED_PREFIX)) return trimmed
  if (!encryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(trimmed.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

function normalizeTokens(value: unknown): StoredGoogleTokens {
  const record = isRecord(value) ? value : {}
  const expiresAt =
    typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
      ? record.expiresAt
      : null
  return {
    accessToken: decryptSecret(record.accessToken),
    refreshToken: decryptSecret(record.refreshToken),
    expiresAt,
    scope: typeof record.scope === 'string' ? record.scope : undefined,
    tokenType: typeof record.tokenType === 'string' ? record.tokenType : undefined,
    connectedAt:
      typeof record.connectedAt === 'number' && Number.isFinite(record.connectedAt)
        ? record.connectedAt
        : undefined,
  }
}

function normalizeAppCalendars(value: unknown): Record<string, StoredAppCalendar> {
  if (!isRecord(value)) return {}
  const out: Record<string, StoredAppCalendar> = {}
  for (const [appId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate.calendarId !== 'string') continue
    const calendarId = candidate.calendarId.trim()
    if (!calendarId) continue
    out[appId] = {
      calendarId,
      createdAt:
        typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : Date.now(),
      updatedAt:
        typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : Date.now(),
    }
  }
  return out
}

function normalizeCalendarId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 1024) return null
  return trimmed
}

function uniqueCalendarIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map(normalizeCalendarId)
        .filter((calendarId): calendarId is string => Boolean(calendarId)),
    ),
  ).slice(0, 50)
}

function normalizeAppCalendarSelections(
  value: unknown,
  legacy: Record<string, StoredAppCalendar>,
): Record<string, StoredAppCalendarSelection> {
  const out: Record<string, StoredAppCalendarSelection> = {}
  if (isRecord(value)) {
    for (const [appId, candidate] of Object.entries(value)) {
      if (!isRecord(candidate)) continue
      const selectedCalendarIds = uniqueCalendarIds(candidate.selectedCalendarIds)
      const defaultCalendarId = normalizeCalendarId(candidate.defaultCalendarId)
      if (selectedCalendarIds.length === 0 && !defaultCalendarId) continue
      const selected = selectedCalendarIds.length
        ? selectedCalendarIds
        : defaultCalendarId
          ? [defaultCalendarId]
          : []
      if (selected.length === 0) continue
      out[appId] = {
        selectedCalendarIds: selected,
        defaultCalendarId:
          defaultCalendarId && selected.includes(defaultCalendarId)
            ? defaultCalendarId
            : selected[0]!,
        createdAt:
          typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
            ? candidate.createdAt
            : Date.now(),
        updatedAt:
          typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : Date.now(),
      }
    }
  }
  for (const [appId, calendar] of Object.entries(legacy)) {
    if (out[appId]) continue
    out[appId] = {
      selectedCalendarIds: [calendar.calendarId],
      defaultCalendarId: calendar.calendarId,
      createdAt: calendar.createdAt,
      updatedAt: calendar.updatedAt,
    }
  }
  return out
}

function normalizeAutoSync(value: unknown): Record<string, StoredAutoSync> {
  if (!isRecord(value)) return {}
  const out: Record<string, StoredAutoSync> = {}
  for (const [appId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue
    const intervalMinutes = normalizeAutoSyncInterval(candidate.intervalMinutes)
    if (intervalMinutes == null) continue
    out[appId] = {
      appTitle: typeof candidate.appTitle === 'string' ? candidate.appTitle.slice(0, 120) : appId,
      intervalMinutes,
      lastRunAt:
        typeof candidate.lastRunAt === 'number' && Number.isFinite(candidate.lastRunAt)
          ? candidate.lastRunAt
          : undefined,
      lastStatus:
        candidate.lastStatus === 'success' || candidate.lastStatus === 'error'
          ? candidate.lastStatus
          : undefined,
      lastMessage:
        typeof candidate.lastMessage === 'string' ? candidate.lastMessage.slice(0, 500) : undefined,
    }
  }
  return out
}

function normalizeSettings(value: unknown): CalendarSettings {
  const root = isRecord(value) ? value : {}
  const google = isRecord(root.google) ? root.google : {}
  const appCalendars = normalizeAppCalendars(google.appCalendars)
  return {
    google: {
      tokens: normalizeTokens(google.tokens),
      appCalendars,
      appCalendarSelections: normalizeAppCalendarSelections(
        google.appCalendarSelections,
        appCalendars,
      ),
      autoSync: normalizeAutoSync(google.autoSync),
    },
  }
}

async function readSettings(): Promise<CalendarSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    return normalizeSettings(JSON.parse(raw) as unknown)
  } catch {
    return emptySettings()
  }
}

function serializeSettings(settings: CalendarSettings): unknown {
  return {
    google: {
      tokens: {
        ...settings.google.tokens,
        accessToken: encryptSecret(settings.google.tokens.accessToken),
        refreshToken: encryptSecret(settings.google.tokens.refreshToken),
      },
      appCalendars: settings.google.appCalendars,
      appCalendarSelections: settings.google.appCalendarSelections,
      autoSync: settings.google.autoSync,
    },
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  await rename(tmp, path)
  try {
    await chmod(path, 0o600)
  } catch {
  }
}

async function writeSettings(settings: CalendarSettings): Promise<void> {
  await writeJsonAtomic(settingsPath(), serializeSettings(settings))
}

function getConfiguredGoogleClientId(): string | null {
  const saved = loadDesktopSettings().googleOAuthClientId?.trim()
  return saved || null
}

function getConfiguredGoogleClientSecret(): string | null {
  const saved = loadDesktopSettings().googleOAuthClientSecret?.trim()
  return saved || null
}

function hasRequiredGoogleScope(scope: string | undefined): boolean {
  const scopes = new Set((scope ?? '').split(/\s+/u).filter(Boolean))
  if (scopes.has(GOOGLE_FULL_CALENDAR_SCOPE)) return true
  return GOOGLE_CALENDAR_SCOPES.every((required) => scopes.has(required))
}

function normalizeAutoSyncInterval(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.min(AUTO_SYNC_MINUTES_MAX, Math.max(AUTO_SYNC_MINUTES_MIN, Math.floor(numeric)))
}

function selectionFromSettings(
  settings: CalendarSettings,
  appId: string | undefined,
  state?: DesktopCalendarGoogleSyncState | null,
): StoredAppCalendarSelection {
  const fromSettings = appId ? settings.google.appCalendarSelections[appId] : undefined
  const fromState = state
    ? {
        selectedCalendarIds: uniqueCalendarIds(state.selectedCalendarIds),
        defaultCalendarId: normalizeCalendarId(state.defaultCalendarId ?? state.calendarId),
      }
    : null
  const selected = fromSettings?.selectedCalendarIds.length
    ? fromSettings.selectedCalendarIds
    : fromState?.selectedCalendarIds.length
      ? fromState.selectedCalendarIds
      : fromState?.defaultCalendarId
        ? [fromState.defaultCalendarId]
        : [GOOGLE_PRIMARY_CALENDAR_ID]
  const defaultCalendarId =
    (fromSettings?.defaultCalendarId && selected.includes(fromSettings.defaultCalendarId)
      ? fromSettings.defaultCalendarId
      : fromState?.defaultCalendarId && selected.includes(fromState.defaultCalendarId)
        ? fromState.defaultCalendarId
        : selected[0]) ?? GOOGLE_PRIMARY_CALENDAR_ID
  return {
    selectedCalendarIds: selected,
    defaultCalendarId,
    createdAt: fromSettings?.createdAt ?? Date.now(),
    updatedAt: fromSettings?.updatedAt ?? Date.now(),
  }
}

function statusFromSettings(
  settings: CalendarSettings,
  appId?: string,
  state?: DesktopCalendarGoogleSyncState | null,
): DesktopCalendarGoogleStatus {
  const clientId = getConfiguredGoogleClientId()
  const clientSecret = getConfiguredGoogleClientSecret()
  const autoSync = appId ? settings.google.autoSync[appId] : undefined
  const selection = selectionFromSettings(settings, appId, state)
  const configured = Boolean(clientId && clientSecret)
  const hasToken = Boolean(
    settings.google.tokens.refreshToken || settings.google.tokens.accessToken,
  )
  const connected = configured && hasToken && hasRequiredGoogleScope(settings.google.tokens.scope)
  return {
    configured,
    connected,
    appId,
    appTitle: autoSync?.appTitle,
    calendarId: connected ? (selection.defaultCalendarId ?? undefined) : undefined,
    selectedCalendarIds: connected ? selection.selectedCalendarIds : [],
    defaultCalendarId: connected ? selection.defaultCalendarId : null,
    autoSyncIntervalMinutes: autoSync?.intervalMinutes ?? null,
    lastAutoSyncAt: autoSync?.lastRunAt,
    lastAutoSyncStatus: autoSync?.lastStatus,
    lastAutoSyncMessage: autoSync?.lastMessage,
  }
}

export async function getDesktopCalendarStatus(
  appId?: string,
  state?: DesktopCalendarGoogleSyncState | null,
): Promise<DesktopCalendarGoogleStatus> {
  return statusFromSettings(await readSettings(), appId, state)
}

export async function configureDesktopGoogleCalendar(input: {
  clientId?: string | null
  clientSecret?: string | null
}): Promise<DesktopCalendarGoogleStatus> {
  const before = getConfiguredGoogleClientId()
  const beforeSecret = getConfiguredGoogleClientSecret()
  const nextClientId =
    typeof input.clientId === 'string' && input.clientId.trim() ? input.clientId.trim() : null
  const nextClientSecret =
    typeof input.clientSecret === 'string' ? input.clientSecret.trim() || null : undefined
  saveDesktopSettings({
    googleOAuthClientId: nextClientId,
    ...(nextClientSecret !== undefined ? { googleOAuthClientSecret: nextClientSecret } : {}),
  })
  const after = getConfiguredGoogleClientId()
  const afterSecret = getConfiguredGoogleClientSecret()
  const settings = await readSettings()
  const credentialsChanged = before !== after || beforeSecret !== afterSecret
  const integrationDisabled = !after || !afterSecret
  if (credentialsChanged) {
    settings.google.tokens = {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    }
  }
  if (integrationDisabled) {
    settings.google.autoSync = {}
  }
  if (credentialsChanged || integrationDisabled) {
    await writeSettings(settings)
    refreshDesktopCalendarAutoSync()
  }
  return statusFromSettings(settings)
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

function sha256Base64Url(value: string): string {
  return base64Url(createHash('sha256').update(value).digest())
}

async function waitForOAuthCode(input: {
  clientId: string
  verifier: string
  challenge: string
  state: string
}): Promise<{ code: string; redirectUri: string }> {
  let server: Server | null = null
  let timeout: NodeJS.Timeout | null = null

  return await new Promise((resolve, reject) => {
    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      timeout = null
      if (server) {
        try {
          server.close()
        } catch {
        }
      }
      server = null
    }

    const complete = (code: string, redirectUri: string) => {
      cleanup()
      resolve({ code, redirectUri })
    }

    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }

    server = createServer((request, response) => {
      const host = request.headers.host ?? '127.0.0.1'
      const url = new URL(request.url ?? '/', `http://${host}`)
      if (url.pathname !== '/oauth/google-calendar/callback') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Not found')
        return
      }
      const returnedState = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (returnedState !== input.state) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body><h1>Invalid OAuth state.</h1></body></html>')
        fail(new Error('Google OAuth state did not match.'))
        return
      }
      if (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body><h1>Google Calendar authorization failed.</h1></body></html>')
        fail(new Error(`Google OAuth failed: ${error}`))
        return
      }
      if (!code) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body><h1>Missing OAuth code.</h1></body></html>')
        fail(new Error('Google OAuth code was missing.'))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        '<html><body><h1>Google Calendar connected.</h1><p>You can close this tab.</p></body></html>',
      )
      complete(code, `http://${host}/oauth/google-calendar/callback`)
    })

    server.once('error', (error) => {
      fail(error instanceof Error ? error : new Error(String(error)))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      if (!address || typeof address === 'string') {
        fail(new Error('Failed to bind Google OAuth loopback server.'))
        return
      }
      const redirectUri = `http://127.0.0.1:${address.port}/oauth/google-calendar/callback`
      const url = new URL(GOOGLE_AUTH_URL)
      url.searchParams.set('client_id', input.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('code_challenge', input.challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', input.state)
      shell.openExternal(url.toString()).catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error(String(error)))
      })
    })

    timeout = setTimeout(
      () => {
        fail(new Error('Google OAuth timed out.'))
      },
      5 * 60 * 1000,
    )
    timeout.unref?.()
  })
}

export async function connectDesktopGoogleCalendar(): Promise<DesktopCalendarGoogleStatus> {
  const clientId = getConfiguredGoogleClientId()
  if (!clientId) {
    throw new Error('Google OAuth client id is not configured in Desktop settings.')
  }
  const clientSecret = getConfiguredGoogleClientSecret()
  if (!clientSecret) {
    throw new Error('Google OAuth client secret is not configured in Desktop settings.')
  }
  const verifier = base64Url(randomBytes(48))
  const challenge = sha256Base64Url(verifier)
  const state = base64Url(randomBytes(32))
  const { code, redirectUri } = await waitForOAuthCode({
    clientId,
    verifier,
    challenge,
    state,
  })
  const tokenBody: Record<string, string> = {
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }
  if (clientSecret) tokenBody.client_secret = clientSecret
  const payload = await postGoogleToken(tokenBody)
  if (!payload.access_token && !payload.refresh_token) {
    throw new Error('Google OAuth did not return usable tokens.')
  }
  const settings = await readSettings()
  settings.google.tokens = {
    accessToken: payload.access_token ?? null,
    refreshToken: payload.refresh_token ?? settings.google.tokens.refreshToken ?? null,
    expiresAt:
      typeof payload.expires_in === 'number'
        ? Date.now() + Math.max(60, payload.expires_in - 60) * 1000
        : null,
    scope: payload.scope,
    tokenType: payload.token_type,
    connectedAt: Date.now(),
  }
  await writeSettings(settings)
  return statusFromSettings(settings)
}

export async function disconnectDesktopGoogleCalendar(): Promise<DesktopCalendarGoogleStatus> {
  const settings = await readSettings()
  settings.google.tokens = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  }
  settings.google.autoSync = {}
  await writeSettings(settings)
  refreshDesktopCalendarAutoSync()
  return statusFromSettings(settings)
}

async function getAccessToken(settings: CalendarSettings): Promise<string> {
  const clientId = getConfiguredGoogleClientId()
  if (!clientId) {
    throw new Error('Google OAuth client id is not configured in Desktop settings.')
  }
  const clientSecret = getConfiguredGoogleClientSecret()
  if (!clientSecret) {
    throw new Error('Google OAuth client secret is not configured in Desktop settings.')
  }
  const tokens = settings.google.tokens
  if (!hasRequiredGoogleScope(tokens.scope)) {
    throw new Error('Google Calendar 권한이 변경되었습니다. Google 연결을 다시 진행하세요.')
  }
  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken
  }
  if (!tokens.refreshToken) {
    throw new Error('Google Calendar is not connected.')
  }
  const refreshBody: Record<string, string> = {
    client_id: clientId,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  }
  if (clientSecret) refreshBody.client_secret = clientSecret
  const payload = await postGoogleToken(refreshBody)
  if (!payload.access_token) throw new Error('Google OAuth refresh did not return an access token.')
  settings.google.tokens = {
    ...tokens,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? tokens.refreshToken,
    expiresAt:
      typeof payload.expires_in === 'number'
        ? Date.now() + Math.max(60, payload.expires_in - 60) * 1000
        : null,
    scope: payload.scope ?? tokens.scope,
    tokenType: payload.token_type ?? tokens.tokenType,
  }
  await writeSettings(settings)
  return payload.access_token
}

function isWritableGoogleCalendar(calendar: DesktopCalendarGoogleCalendar): boolean {
  return calendar.accessRole === 'owner' || calendar.accessRole === 'writer'
}

function googleCalendarListEntryToDesktop(
  entry: GoogleCalendarListEntry,
): DesktopCalendarGoogleCalendar | null {
  const id = normalizeCalendarId(entry.id)
  if (!id) return null
  const accessRole = typeof entry.accessRole === 'string' ? entry.accessRole : undefined
  return {
    id,
    summary: cleanText(entry.summary, 240) ?? id,
    primary: entry.primary === true,
    selected: entry.selected === true,
    accessRole,
    backgroundColor: cleanText(entry.backgroundColor, 40),
    foregroundColor: cleanText(entry.foregroundColor, 40),
    timeZone: cleanText(entry.timeZone, 80),
    writable: accessRole === 'owner' || accessRole === 'writer',
  }
}

function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

async function listGoogleCalendarEntries(
  accessToken: string,
): Promise<DesktopCalendarGoogleCalendar[]> {
  const calendars: DesktopCalendarGoogleCalendar[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      maxResults: '250',
      showHidden: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const payload = await googleCalendarRequest<GoogleCalendarListResponse>(
      accessToken,
      `/users/me/calendarList?${params.toString()}`,
    )
    for (const item of payload.items ?? []) {
      const calendar = googleCalendarListEntryToDesktop(item)
      if (calendar) calendars.push(calendar)
    }
    pageToken = payload.nextPageToken
  } while (pageToken)
  calendars.sort(
    (left, right) =>
      Number(right.primary === true) - Number(left.primary === true) ||
      Number(right.writable) - Number(left.writable) ||
      left.summary.localeCompare(right.summary),
  )
  return calendars
}

function calendarIdMatches(
  left: string,
  right: string,
  calendars: DesktopCalendarGoogleCalendar[],
): boolean {
  if (left === right) return true
  const primary = calendars.find((calendar) => calendar.primary)
  return Boolean(
    primary &&
    ((left === GOOGLE_PRIMARY_CALENDAR_ID && right === primary.id) ||
      (right === GOOGLE_PRIMARY_CALENDAR_ID && left === primary.id)),
  )
}

function calendarById(
  calendars: DesktopCalendarGoogleCalendar[],
  calendarId: string,
): DesktopCalendarGoogleCalendar | undefined {
  return calendars.find((calendar) => calendarIdMatches(calendar.id, calendarId, calendars))
}

export async function listDesktopGoogleCalendars(
  appId?: string,
): Promise<DesktopCalendarGoogleCalendar[]> {
  const settings = await readSettings()
  const accessToken = await getAccessToken(settings)
  const calendars = await listGoogleCalendarEntries(accessToken)
  const selection = selectionFromSettings(settings, appId)
  return calendars.map((calendar) => ({
    ...calendar,
    selected: selection.selectedCalendarIds.some((calendarId) =>
      calendarIdMatches(calendarId, calendar.id, calendars),
    ),
  }))
}

export async function configureDesktopGoogleCalendarSelection(input: {
  appId?: string
  appTitle?: string
  selectedCalendarIds?: unknown
  defaultCalendarId?: unknown
}): Promise<DesktopCalendarGoogleStatus> {
  const appId = typeof input.appId === 'string' ? input.appId.trim() : ''
  if (!appId) throw new Error('Calendar selection requires an app id.')
  const requestedIds = uniqueCalendarIds(input.selectedCalendarIds)
  if (requestedIds.length === 0) {
    throw new Error('하나 이상의 Google Calendar를 선택하세요.')
  }
  const requestedDefaultId = normalizeCalendarId(input.defaultCalendarId)
  const settings = await readSettings()
  const accessToken = await getAccessToken(settings)
  const calendars = await listGoogleCalendarEntries(accessToken)
  const writableCalendars = calendars.filter(isWritableGoogleCalendar)
  const selectedCalendarIds = requestedIds.map((calendarId) => {
    const calendar = calendarById(writableCalendars, calendarId)
    if (!calendar)
      throw new Error(`수정 권한이 있는 Google Calendar만 sync할 수 있습니다: ${calendarId}`)
    return calendar.id
  })
  const uniqueSelectedCalendarIds = Array.from(new Set(selectedCalendarIds))
  const defaultCalendar =
    (requestedDefaultId ? calendarById(writableCalendars, requestedDefaultId) : undefined) ??
    calendarById(writableCalendars, uniqueSelectedCalendarIds[0]!)
  if (!defaultCalendar || !uniqueSelectedCalendarIds.includes(defaultCalendar.id)) {
    throw new Error('기본 Google Calendar는 선택된 캘린더 중 하나여야 합니다.')
  }
  const previous = settings.google.appCalendarSelections[appId]
  settings.google.appCalendarSelections[appId] = {
    selectedCalendarIds: uniqueSelectedCalendarIds,
    defaultCalendarId: defaultCalendar.id,
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
  if (input.appTitle && settings.google.autoSync[appId]) {
    settings.google.autoSync[appId] = {
      ...settings.google.autoSync[appId],
      appTitle: input.appTitle.slice(0, 120),
    }
  }
  await writeSettings(settings)
  return statusFromSettings(settings, appId)
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/u.test(value)
}

function normalizeGoogleEventDateTime(value: unknown): DesktopCalendarGoogleEventDateTime | undefined {
  if (!isRecord(value)) return undefined
  const date = isIsoDate(value.date) ? value.date : undefined
  const dateTime = typeof value.dateTime === 'string' && value.dateTime.trim()
    ? value.dateTime.trim()
    : undefined
  const timeZone = cleanText(value.timeZone, 80)
  if (!date && !dateTime) return undefined
  return {
    ...(date ? { date } : {}),
    ...(dateTime ? { dateTime } : {}),
    ...(timeZone ? { timeZone } : {}),
  }
}

function normalizeGoogleEventLink(value: unknown): DesktopCalendarGoogleEventLink | null {
  if (!isRecord(value)) return null
  const googleEventId = cleanText(value.googleEventId, 1024)
  const googleCalendarId = normalizeCalendarId(value.googleCalendarId)
  if (!googleEventId || !googleCalendarId) return null
  return {
    googleEventId,
    googleCalendarId,
    googleCalendarSummary: cleanText(value.googleCalendarSummary, 240),
    googleICalUID: cleanText(value.googleICalUID, 1024),
    googleRecurringEventId: cleanText(value.googleRecurringEventId, 1024),
    googleOriginalStartTime: normalizeGoogleEventDateTime(value.googleOriginalStartTime),
    remoteUpdatedAt: typeof value.remoteUpdatedAt === 'string' ? value.remoteUpdatedAt : undefined,
  }
}

function googleLinkKey(link: DesktopCalendarGoogleEventLink): string {
  return googleRemoteEventKey(link.googleCalendarId, link.googleEventId)
}

function googleRemoteEventKey(calendarId: string, googleEventId: string): string {
  return `${calendarId}\u0000${googleEventId}`
}

function normalizeHiddenEventKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const key = item.trim()
    if (!key || key.length > 2200 || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= 1000) break
  }
  return out
}

function addHiddenGoogleLink(
  hiddenEventKeys: Set<string>,
  link: DesktopCalendarGoogleEventLink,
): void {
  if (!link.googleCalendarId || !link.googleEventId) return
  hiddenEventKeys.add(googleRemoteEventKey(link.googleCalendarId, link.googleEventId))
}

function uniqueGoogleLinks(links: Array<DesktopCalendarGoogleEventLink | null | undefined>) {
  const out: DesktopCalendarGoogleEventLink[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (!link) continue
    const key = googleLinkKey(link)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(link)
  }
  return out
}

function normalizeEvent(value: unknown): NormalizedCalendarEvent | null {
  if (!isRecord(value)) return null
  const id = cleanText(value.id, 160)
  const title = cleanText(value.title, 240)
  if (!id || !title || !isIsoDate(value.date)) return null
  const primaryGoogleLink = normalizeGoogleEventLink({
    googleEventId: value.googleEventId,
    googleCalendarId: value.googleCalendarId,
    googleCalendarSummary: value.googleCalendarSummary,
    googleICalUID: value.googleICalUID,
    googleRecurringEventId: value.googleRecurringEventId,
    googleOriginalStartTime: value.googleOriginalStartTime,
  })
  const googleLinks = uniqueGoogleLinks([
    primaryGoogleLink,
    ...(Array.isArray(value.googleLinks) ? value.googleLinks.map(normalizeGoogleEventLink) : []),
  ])
  return {
    id,
    title,
    date: value.date,
    time: isTime(value.time) ? value.time : undefined,
    endDate: isIsoDate(value.endDate) ? value.endDate : undefined,
    endTime: isTime(value.endTime) ? value.endTime : undefined,
    type: cleanText(value.type, 80),
    notes: cleanText(value.notes, 4000),
    location: cleanText(value.location, 400),
    timezone: cleanText(value.timezone, 80),
    sharedOriginKind: cleanText(value.sharedOriginKind, 80),
    sharedOriginTitle: cleanText(value.sharedOriginTitle, 160),
    sharedOriginId: cleanText(value.sharedOriginId, 160),
    sharedReadonly: value.sharedReadonly === true,
    googleEventId: googleLinks[0]?.googleEventId ?? cleanText(value.googleEventId, 1024),
    googleCalendarId: googleLinks[0]?.googleCalendarId ?? cleanText(value.googleCalendarId, 1024),
    googleCalendarSummary:
      googleLinks[0]?.googleCalendarSummary ?? cleanText(value.googleCalendarSummary, 240),
    googleICalUID: googleLinks[0]?.googleICalUID ?? cleanText(value.googleICalUID, 1024),
    googleRecurringEventId:
      googleLinks[0]?.googleRecurringEventId ?? cleanText(value.googleRecurringEventId, 1024),
    googleOriginalStartTime:
      googleLinks[0]?.googleOriginalStartTime ??
      normalizeGoogleEventDateTime(value.googleOriginalStartTime),
    googleLinks,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : undefined,
  }
}

function googleLocalEventId(calendarId: string, googleEventId: string): string {
  const slug = `${calendarId}-${googleEventId}`
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120)
  return `google-${slug || createHash('sha256').update(`${calendarId}:${googleEventId}`).digest('hex').slice(0, 20)}`
}

function isExternalSharedEvent(event: Pick<DesktopCalendarEventInput, 'id' | 'sharedOriginKind' | 'sharedReadonly'>): boolean {
  const ownerKind = cleanText(event.sharedOriginKind, 80)
  return Boolean(
    event.sharedReadonly === true ||
      (ownerKind && ownerKind !== CALENDAR_OWNER_KIND) ||
      EXTERNAL_SHARED_ID_PATTERN.test(event.id),
  )
}

function setSyncMapEntryForEvent(
  eventMap: DesktopCalendarGoogleSyncState['eventMap'],
  event: NormalizedCalendarEvent,
  links: DesktopCalendarGoogleEventLink[],
  contentHash: string,
  updatedAt = Date.now(),
): void {
  if (isExternalSharedEvent(event)) {
    delete eventMap[event.id]
    return
  }
  const entry = syncMapEntry(event, links, contentHash, updatedAt)
  if (entry) eventMap[event.id] = entry
}

function parseGoogleDateTime(value: GoogleEventDateTime | undefined): {
  date?: string
  time?: string
  timezone?: string
} {
  if (!value) return {}
  if (isIsoDate(value.date)) return { date: value.date, timezone: value.timeZone }
  if (typeof value.dateTime === 'string') {
    const date = value.dateTime.slice(0, 10)
    const time = value.dateTime.slice(11, 16)
    return {
      date: isIsoDate(date) ? date : undefined,
      time: isTime(time) ? time : undefined,
      timezone: value.timeZone,
    }
  }
  return {}
}

function parseGoogleDescription(description: string | undefined): {
  notes?: string
  type?: string
} {
  const raw = typeof description === 'string' ? description : ''
  const typeMatch = raw.match(/(?:^|\n)Type:\s*(.+?)\s*$/u)
  const notes = raw.replace(/\n?\n?Type:\s*.+?\s*$/u, '').trim()
  return {
    notes: notes ? notes.slice(0, 4000) : undefined,
    type: typeMatch?.[1]?.trim().slice(0, 80) || undefined,
  }
}

function googleEventToLocal(
  localId: string,
  event: GoogleEventResponse,
  calendar: DesktopCalendarGoogleCalendar,
): NormalizedCalendarEvent | null {
  const title = cleanText(event.summary, 240)
  const start = parseGoogleDateTime(event.start)
  if (!event.id || !title || !start.date) return null
  const end = parseGoogleDateTime(event.end)
  const description = parseGoogleDescription(event.description)
  const googleLink = {
    googleEventId: event.id,
    googleCalendarId: calendar.id,
    googleCalendarSummary: calendar.summary,
    googleICalUID: cleanText(event.iCalUID, 1024),
    googleRecurringEventId: cleanText(event.recurringEventId, 1024),
    googleOriginalStartTime: normalizeGoogleEventDateTime(event.originalStartTime),
    remoteUpdatedAt: event.updated,
  }
  return {
    id: localId,
    title,
    date: start.date,
    time: start.time,
    endDate: end.date,
    endTime: end.time,
    type: description.type,
    notes: description.notes,
    location: cleanText(event.location, 400),
    timezone: start.timezone,
    googleEventId: event.id,
    googleCalendarId: calendar.id,
    googleCalendarSummary: calendar.summary,
    googleICalUID: cleanText(event.iCalUID, 1024),
    googleRecurringEventId: cleanText(event.recurringEventId, 1024),
    googleOriginalStartTime: normalizeGoogleEventDateTime(event.originalStartTime),
    googleLinks: [googleLink],
    updatedAt: event.updated ? Date.parse(event.updated) || undefined : undefined,
  }
}

async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
): Promise<GoogleEventResponse[]> {
  const events: GoogleEventResponse[] = []
  let pageToken: string | undefined
  const timeMin = new Date(Date.now() - GOOGLE_SYNC_PAST_DAYS * 86_400_000).toISOString()
  const timeMax = new Date(Date.now() + GOOGLE_SYNC_FUTURE_DAYS * 86_400_000).toISOString()
  do {
    const params = new URLSearchParams({
      maxResults: '2500',
      singleEvents: 'true',
      showDeleted: 'false',
      orderBy: 'startTime',
      timeMin,
      timeMax,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const payload = await googleCalendarRequest<GoogleEventsListResponse>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    )
    if (Array.isArray(payload.items)) events.push(...payload.items)
    pageToken = payload.nextPageToken
  } while (pageToken)
  return events
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day + days)
  return [
    String(next.getFullYear()).padStart(4, '0'),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-')
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const next = new Date(year, month - 1, day, hour, minute + minutes)
  return {
    date: [
      String(next.getFullYear()).padStart(4, '0'),
      String(next.getMonth() + 1).padStart(2, '0'),
      String(next.getDate()).padStart(2, '0'),
    ].join('-'),
    time: `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`,
  }
}

function eventHash(event: NormalizedCalendarEvent): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        endDate: event.endDate,
        endTime: event.endTime,
        type: event.type,
        notes: event.notes,
        location: event.location,
        timezone: event.timezone,
      }),
    )
    .digest('hex')
}

function normalizeSemanticText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase()
}

function eventSemanticKey(event: NormalizedCalendarEvent): string | null {
  const title = normalizeSemanticText(event.title)
  if (!title || !event.date) return null
  const location = normalizeSemanticText(event.location)
  const allDay = !event.time
  const rawEndDate = event.endDate ?? ''
  const endDate =
    allDay
      ? !rawEndDate || rawEndDate === addDays(event.date, 1)
        ? ''
        : rawEndDate
      : !rawEndDate || rawEndDate === event.date
        ? ''
        : rawEndDate
  return [
    title,
    event.date,
    event.time ?? '',
    endDate,
    allDay ? '' : event.endTime ?? '',
    location,
  ].join('\u0000')
}

function googleLinkFromRemote(
  event: GoogleEventResponse & { id: string },
  calendar: DesktopCalendarGoogleCalendar,
): DesktopCalendarGoogleEventLink {
  return {
    googleEventId: event.id,
    googleCalendarId: calendar.id,
    googleCalendarSummary: calendar.summary,
    googleICalUID: cleanText(event.iCalUID, 1024),
    googleRecurringEventId: cleanText(event.recurringEventId, 1024),
    googleOriginalStartTime: normalizeGoogleEventDateTime(event.originalStartTime),
    remoteUpdatedAt: event.updated,
  }
}

function googleLinksFromMapped(
  mapped: DesktopCalendarGoogleSyncState['eventMap'][string] | undefined,
  fallbackCalendarId: string,
): DesktopCalendarGoogleEventLink[] {
  if (!mapped) return []
  return uniqueGoogleLinks([
    {
      googleEventId: mapped.googleEventId,
      googleCalendarId: mapped.calendarId ?? fallbackCalendarId,
      googleICalUID: mapped.iCalUID,
      googleRecurringEventId: mapped.recurringEventId,
      googleOriginalStartTime: mapped.originalStartTime,
      remoteUpdatedAt: mapped.remoteUpdatedAt,
    },
    ...(Array.isArray(mapped.links) ? mapped.links.map(normalizeGoogleEventLink) : []),
  ])
}

function googleLinksFromEvent(
  event: NormalizedCalendarEvent,
  mapped: DesktopCalendarGoogleSyncState['eventMap'][string] | undefined,
  fallbackCalendarId: string,
): DesktopCalendarGoogleEventLink[] {
  const directLink = normalizeGoogleEventLink({
    googleEventId: event.googleEventId,
    googleCalendarId: event.googleCalendarId,
    googleCalendarSummary: event.googleCalendarSummary,
    googleICalUID: event.googleICalUID,
  })
  return uniqueGoogleLinks([
    directLink,
    ...(Array.isArray(event.googleLinks) ? event.googleLinks.map(normalizeGoogleEventLink) : []),
    ...googleLinksFromMapped(mapped, fallbackCalendarId),
  ])
}

function withGoogleLinks(
  event: NormalizedCalendarEvent,
  links: DesktopCalendarGoogleEventLink[],
): NormalizedCalendarEvent {
  const normalizedLinks = uniqueGoogleLinks(links)
  const primary = normalizedLinks[0]
  return {
    ...event,
    googleEventId: primary?.googleEventId,
    googleCalendarId: primary?.googleCalendarId,
    googleCalendarSummary: primary?.googleCalendarSummary,
    googleICalUID: primary?.googleICalUID,
    googleRecurringEventId: primary?.googleRecurringEventId,
    googleOriginalStartTime: primary?.googleOriginalStartTime,
    googleLinks: normalizedLinks,
  }
}

function syncMapEntry(
  event: NormalizedCalendarEvent,
  links: DesktopCalendarGoogleEventLink[],
  contentHash: string,
  updatedAt = Date.now(),
): DesktopCalendarGoogleSyncState['eventMap'][string] | null {
  const normalizedLinks = uniqueGoogleLinks(links)
  const primary = normalizedLinks[0]
  if (!primary) return null
  return {
    googleEventId: primary.googleEventId,
    calendarId: primary.googleCalendarId,
    iCalUID: event.googleICalUID ?? primary.googleICalUID,
    recurringEventId: event.googleRecurringEventId ?? primary.googleRecurringEventId,
    originalStartTime: event.googleOriginalStartTime ?? primary.googleOriginalStartTime,
    contentHash,
    updatedAt,
    remoteUpdatedAt: primary.remoteUpdatedAt,
    links: normalizedLinks,
  }
}

function googleEventBody(appId: string, event: NormalizedCalendarEvent): Record<string, unknown> {
  const timezone = event.timezone || currentTimeZone()
  const description = [event.notes, event.type ? `Type: ${event.type}` : null]
    .filter(Boolean)
    .join('\n\n')
  if (!event.time) {
    return {
      summary: event.title,
      description,
      location: event.location,
      start: { date: event.date },
      end: { date: event.endDate || addDays(event.date, 1) },
      extendedProperties: {
        private: {
          sepilotdAppId: appId,
          sepilotdEventId: event.id,
        },
      },
    }
  }
  const fallbackEnd = addMinutes(event.date, event.time, 30)
  const endDate = event.endDate || fallbackEnd.date
  const endTime = event.endTime || fallbackEnd.time
  return {
    summary: event.title,
    description,
    location: event.location,
    start: { dateTime: `${event.date}T${event.time}:00`, timeZone: timezone },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone: timezone },
    extendedProperties: {
      private: {
        sepilotdAppId: appId,
        sepilotdEventId: event.id,
      },
    },
  }
}

function normalizeSyncState(value: unknown): DesktopCalendarGoogleSyncState {
  if (!isRecord(value) || value.provider !== 'google') {
    return {
      provider: 'google',
      eventMap: {},
    }
  }
  const fallbackCalendarId = normalizeCalendarId(value.calendarId) ?? GOOGLE_PRIMARY_CALENDAR_ID
  const selectedCalendarIds = uniqueCalendarIds(value.selectedCalendarIds)
  const defaultCalendarId = normalizeCalendarId(value.defaultCalendarId) ?? fallbackCalendarId
  const hiddenEventKeys = normalizeHiddenEventKeys(value.hiddenEventKeys)
  const eventMap: DesktopCalendarGoogleSyncState['eventMap'] = {}
  if (isRecord(value.eventMap)) {
    for (const [id, candidate] of Object.entries(value.eventMap)) {
      if (!isRecord(candidate) || typeof candidate.googleEventId !== 'string') continue
      eventMap[id] = {
        googleEventId: candidate.googleEventId,
        calendarId: normalizeCalendarId(candidate.calendarId) ?? fallbackCalendarId,
        iCalUID: cleanText(candidate.iCalUID, 1024),
        recurringEventId: cleanText(candidate.recurringEventId, 1024),
        originalStartTime: normalizeGoogleEventDateTime(candidate.originalStartTime),
        contentHash: typeof candidate.contentHash === 'string' ? candidate.contentHash : undefined,
        updatedAt:
          typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
            ? candidate.updatedAt
            : undefined,
        remoteUpdatedAt:
          typeof candidate.remoteUpdatedAt === 'string' ? candidate.remoteUpdatedAt : undefined,
        links: uniqueGoogleLinks([
          normalizeGoogleEventLink({
            googleEventId: candidate.googleEventId,
            googleCalendarId: normalizeCalendarId(candidate.calendarId) ?? fallbackCalendarId,
            googleICalUID: candidate.iCalUID,
            googleRecurringEventId: candidate.recurringEventId,
            googleOriginalStartTime: candidate.originalStartTime,
            remoteUpdatedAt: candidate.remoteUpdatedAt,
          }),
          ...(Array.isArray(candidate.links)
            ? candidate.links.map(normalizeGoogleEventLink)
            : []),
        ]),
      }
    }
  }
  return {
    provider: 'google',
    calendarId: fallbackCalendarId,
    selectedCalendarIds: selectedCalendarIds.length ? selectedCalendarIds : [defaultCalendarId],
    defaultCalendarId,
    ...(hiddenEventKeys.length ? { hiddenEventKeys } : {}),
    eventMap,
    autoSyncIntervalMinutes: normalizeAutoSyncInterval(value.autoSyncIntervalMinutes),
    lastSyncedAt:
      typeof value.lastSyncedAt === 'number' && Number.isFinite(value.lastSyncedAt)
        ? value.lastSyncedAt
        : undefined,
    lastSyncStatus:
      value.lastSyncStatus === 'success' || value.lastSyncStatus === 'error'
        ? value.lastSyncStatus
        : undefined,
    lastSyncMessage:
      typeof value.lastSyncMessage === 'string' ? value.lastSyncMessage.slice(0, 500) : undefined,
  }
}

export async function syncDesktopCalendarAppEvents(
  input: DesktopCalendarGoogleSyncInput,
): Promise<DesktopCalendarGoogleSyncResult> {
  if (!input || typeof input.appId !== 'string' || !input.appId.trim()) {
    throw new Error('Calendar sync requires an app id.')
  }
  const appId = input.appId.trim()
  const settings = await readSettings()
  const accessToken = await getAccessToken(settings)
  const previousState = normalizeSyncState(input.state)
  const selection = selectionFromSettings(settings, appId, previousState)
  const calendars = await listGoogleCalendarEntries(accessToken)
  const selectedCalendars = selection.selectedCalendarIds
    .map((calendarId) => calendarById(calendars, calendarId))
    .filter((calendar): calendar is DesktopCalendarGoogleCalendar =>
      Boolean(calendar && isWritableGoogleCalendar(calendar)),
    )
  const uniqueSelectedCalendars = Array.from(
    new Map(selectedCalendars.map((calendar) => [calendar.id, calendar])).values(),
  )
  if (uniqueSelectedCalendars.length === 0) {
    throw new Error('수정 권한이 있는 Google Calendar를 하나 이상 선택하세요.')
  }
  const defaultCalendar =
    (selection.defaultCalendarId
      ? calendarById(uniqueSelectedCalendars, selection.defaultCalendarId)
      : undefined) ?? uniqueSelectedCalendars[0]!
  const selectedCalendarIds = uniqueSelectedCalendars.map((calendar) => calendar.id)
  const selectedCalendarIdSet = new Set(selectedCalendarIds)
  const selectedCalendarCount = selectedCalendarIds.length
  const eventMap: DesktopCalendarGoogleSyncState['eventMap'] = { ...previousState.eventMap }
  const hiddenEventKeys = new Set(previousState.hiddenEventKeys ?? [])
  const remoteKey = (calendarId: string, googleEventId: string) =>
    googleRemoteEventKey(calendarId, googleEventId)
  let mergedEvents = (Array.isArray(input.events) ? input.events : [])
    .map(normalizeEvent)
    .filter((event): event is NormalizedCalendarEvent => Boolean(event))
  const localById = new Map(mergedEvents.map((event) => [event.id, event]))
  let inserted = 0
  let updated = 0
  let deleted = 0
  let pulled = 0
  let skipped = 0
  const errors: string[] = []
  for (const event of mergedEvents) {
    const links = googleLinksFromEvent(event, eventMap[event.id], defaultCalendar.id)
    if (links.length > 0) {
      const eventWithLinks = withGoogleLinks(event, links)
      localById.set(event.id, eventWithLinks)
      setSyncMapEntryForEvent(
        eventMap,
        eventWithLinks,
        links,
        eventHash(eventWithLinks),
        event.updatedAt ?? Date.now(),
      )
    }
  }
  const remoteRecords: Array<{
    calendar: DesktopCalendarGoogleCalendar
    event: GoogleEventResponse & { id: string }
  }> = []
  for (const calendar of uniqueSelectedCalendars) {
    const events = await listGoogleEvents(accessToken, calendar.id)
    for (const event of events) {
      if (event.id && hiddenEventKeys.has(remoteKey(calendar.id, event.id))) {
        skipped += 1
        continue
      }
      if (typeof event.id === 'string')
        remoteRecords.push({ calendar, event: { ...event, id: event.id } })
    }
  }
  const remoteIdentityKey = (calendarId: string, event: GoogleEventResponse & { id: string }) =>
    event.iCalUID ? `ical:${event.iCalUID}` : `event:${remoteKey(calendarId, event.id)}`
  const mappedCalendarId = (
    mapped: DesktopCalendarGoogleSyncState['eventMap'][string] | undefined,
  ): string => mapped?.calendarId ?? previousState.calendarId ?? defaultCalendar.id
  const mappedMatchesRemote = (
    mapped: DesktopCalendarGoogleSyncState['eventMap'][string] | undefined,
    calendarId: string,
    googleEventId: string,
  ): boolean =>
    Boolean(
      mapped &&
        googleLinksFromMapped(mapped, mappedCalendarId(mapped)).some(
          (link) =>
            link.googleEventId === googleEventId &&
            calendarIdMatches(link.googleCalendarId, calendarId, calendars),
        ),
    )
  const remoteByKey = new Map(
    remoteRecords.map((record) => [remoteKey(record.calendar.id, record.event.id), record]),
  )
  const localIdentity = (
    event: NormalizedCalendarEvent,
    mapped?: DesktopCalendarGoogleSyncState['eventMap'][string],
  ): string | null => {
    const iCalUID = event.googleICalUID ?? mapped?.iCalUID
    if (iCalUID) return `ical:${iCalUID}`
    const link = googleLinksFromEvent(event, mapped, defaultCalendar.id)[0]
    return link ? `event:${remoteKey(link.googleCalendarId, link.googleEventId)}` : null
  }
  const localIdByIdentity = new Map<string, string>()
  for (const event of localById.values()) {
    const identity = localIdentity(event, eventMap[event.id])
    if (!identity) continue
    const existingId = localIdByIdentity.get(identity)
    if (!existingId) {
      localIdByIdentity.set(identity, event.id)
      continue
    }
    const existing = localById.get(existingId)
    const keepExisting =
      !existing ||
      (isExternalSharedEvent(existing) !== isExternalSharedEvent(event)
        ? isExternalSharedEvent(existing)
        : Boolean(eventMap[existingId]?.googleEventId) ||
          (existing.updatedAt ?? 0) >= (event.updatedAt ?? 0))
    if (keepExisting) {
      localById.delete(event.id)
      delete eventMap[event.id]
    } else {
      localById.delete(existingId)
      delete eventMap[existingId]
      localIdByIdentity.set(identity, event.id)
    }
    skipped += 1
  }
  const localIdBySemanticKey = new Map<string, string>()
  const shouldKeepExistingSemantic = (existing: NormalizedCalendarEvent, incoming: NormalizedCalendarEvent) => {
    const existingIsExternal = isExternalSharedEvent(existing)
    const incomingIsExternal = isExternalSharedEvent(incoming)
    if (existingIsExternal !== incomingIsExternal) return existingIsExternal
    const existingIsGoogleImport = existing.id.startsWith('google-')
    const incomingIsGoogleImport = incoming.id.startsWith('google-')
    if (existingIsGoogleImport !== incomingIsGoogleImport) return !existingIsGoogleImport
    return (existing.updatedAt ?? 0) >= (incoming.updatedAt ?? 0)
  }
  for (const event of Array.from(localById.values())) {
    const semanticKey = eventSemanticKey(event)
    if (!semanticKey) continue
    const existingId = localIdBySemanticKey.get(semanticKey)
    if (!existingId) {
      localIdBySemanticKey.set(semanticKey, event.id)
      continue
    }
    const existing = localById.get(existingId)
    if (!existing) {
      localIdBySemanticKey.set(semanticKey, event.id)
      continue
    }
    const existingLinks = googleLinksFromEvent(existing, eventMap[existing.id], defaultCalendar.id)
    const incomingLinks = googleLinksFromEvent(event, eventMap[event.id], defaultCalendar.id)
    if (existingLinks.length === 0 && incomingLinks.length === 0) continue
    const mergedLinks = uniqueGoogleLinks([...existingLinks, ...incomingLinks])
    const keepExisting = shouldKeepExistingSemantic(existing, event)
    const keep = keepExisting ? existing : event
    const drop = keepExisting ? event : existing
    const mergedEvent = withGoogleLinks(keep, mergedLinks)
    localById.set(keep.id, mergedEvent)
    setSyncMapEntryForEvent(eventMap, mergedEvent, mergedLinks, eventHash(mergedEvent), Date.now())
    localById.delete(drop.id)
    delete eventMap[drop.id]
    localIdBySemanticKey.set(semanticKey, keep.id)
    for (const link of mergedLinks) {
      localIdByIdentity.set(`event:${remoteKey(link.googleCalendarId, link.googleEventId)}`, keep.id)
      if (link.googleICalUID) localIdByIdentity.set(`ical:${link.googleICalUID}`, keep.id)
    }
    skipped += 1
  }

  const seenRemoteIdentities = new Map<string, string>()
  for (const { calendar, event: remote } of remoteRecords) {
    const privateId = cleanText(remote.extendedProperties?.private?.sepilotdEventId, 160)
    const mappedLocalId = Object.entries(eventMap).find(([, mapped]) =>
      mappedMatchesRemote(mapped, calendar.id, remote.id),
    )?.[0]
    const identity = remoteIdentityKey(calendar.id, remote)
    const seenLocalId = seenRemoteIdentities.get(identity)
    if (seenLocalId) {
      skipped += 1
      continue
    }
    const identityLocalId = localIdByIdentity.get(identity)
    const previewRemoteEvent = googleEventToLocal(
      privateId ?? googleLocalEventId(calendar.id, remote.id),
      remote,
      calendar,
    )
    const semanticLocalId = previewRemoteEvent
      ? localIdBySemanticKey.get(eventSemanticKey(previewRemoteEvent) ?? '')
      : undefined
    let localId =
      mappedLocalId ??
      identityLocalId ??
      (privateId && localById.has(privateId) ? privateId : undefined) ??
      semanticLocalId ??
      privateId ??
      googleLocalEventId(calendar.id, remote.id)
    if (privateId && !mappedLocalId) {
      const existingMap = eventMap[privateId]
      if (existingMap && !mappedMatchesRemote(existingMap, calendar.id, remote.id)) {
        localId = semanticLocalId ?? googleLocalEventId(calendar.id, remote.id)
      }
    }
    const remoteEvent = googleEventToLocal(localId, remote, calendar)
    if (!remoteEvent) continue
    const remoteLink = googleLinkFromRemote(remote, calendar)
    const remoteSemanticKey = eventSemanticKey(remoteEvent)
    if (remoteSemanticKey && !localIdBySemanticKey.has(remoteSemanticKey)) {
      localIdBySemanticKey.set(remoteSemanticKey, localId)
    }
    seenRemoteIdentities.set(identity, localId)
    localIdByIdentity.set(identity, localId)
    const mapped = eventMap[localId]
    const local = localById.get(localId)
    const remoteHash = eventHash(remoteEvent)
    const remoteUpdatedAt = remote.updated
    if (!local) {
      const remoteWithLinks = withGoogleLinks(remoteEvent, [remoteLink])
      localById.set(localId, remoteWithLinks)
      setSyncMapEntryForEvent(
        eventMap,
        remoteWithLinks,
        [remoteLink],
        eventHash(remoteWithLinks),
        Date.now(),
      )
      pulled += 1
      continue
    }
    const localHash = eventHash(local)
    const localUnchanged = Boolean(mapped?.contentHash && mapped.contentHash === localHash)
    const mergedLinks = uniqueGoogleLinks([
      ...googleLinksFromEvent(local, mapped, defaultCalendar.id),
      remoteLink,
    ])
    const remoteChanged =
      typeof remoteUpdatedAt === 'string' &&
      (!mapped?.remoteUpdatedAt || Date.parse(remoteUpdatedAt) > Date.parse(mapped.remoteUpdatedAt))
    if (
      mappedMatchesRemote(mapped, calendar.id, remote.id) &&
      localUnchanged &&
      remoteHash !== localHash &&
      remoteChanged
    ) {
      const remoteWithLinks = withGoogleLinks(remoteEvent, mergedLinks)
      localById.set(localId, remoteWithLinks)
      setSyncMapEntryForEvent(
        eventMap,
        remoteWithLinks,
        mergedLinks,
        eventHash(remoteWithLinks),
        Date.now(),
      )
      pulled += 1
      continue
    }
    if (!mappedMatchesRemote(mapped, calendar.id, remote.id) || mergedLinks.length > 1) {
      const localWithLinks = withGoogleLinks(local, mergedLinks)
      localById.set(localId, localWithLinks)
      setSyncMapEntryForEvent(eventMap, localWithLinks, mergedLinks, eventHash(localWithLinks), Date.now())
    }
  }

  mergedEvents = Array.from(localById.values()).sort((left, right) =>
    `${left.date}${left.time ?? ''}${left.title}`.localeCompare(
      `${right.date}${right.time ?? ''}${right.title}`,
    ),
  )
  const localIds = new Set(mergedEvents.map((event) => event.id))

  for (const event of mergedEvents) {
    const contentHash = eventHash(event)
    const mapped = eventMap[event.id]
    const mappedLinks = googleLinksFromEvent(event, mapped, defaultCalendar.id)
    const selectedMappedLinks = mappedLinks.filter((link) =>
      Boolean(calendarById(uniqueSelectedCalendars, link.googleCalendarId)),
    )
    if (mappedLinks.length > 0 && selectedMappedLinks.length === 0) {
      skipped += 1
      continue
    }
    const targetCalendar =
      (event.googleCalendarId
        ? calendarById(uniqueSelectedCalendars, event.googleCalendarId)
        : undefined) ??
      defaultCalendar
    const targetCalendarId = targetCalendar.id
    if (isExternalSharedEvent(event)) {
      if (mappedLinks.length > 0) {
        const refreshedLinks = mappedLinks.map((link) => {
          const remote = remoteByKey.get(remoteKey(link.googleCalendarId, link.googleEventId))?.event
          return {
            ...link,
            remoteUpdatedAt: remote?.updated ?? link.remoteUpdatedAt,
          }
        })
        localById.set(event.id, withGoogleLinks(event, refreshedLinks))
      }
      delete eventMap[event.id]
      skipped += 1
      continue
    }
    if (selectedMappedLinks.length > 0 && mapped?.contentHash === contentHash) {
      const refreshedLinks = selectedMappedLinks.map((link) => {
        const remote = remoteByKey.get(remoteKey(link.googleCalendarId, link.googleEventId))?.event
        return {
          ...link,
          remoteUpdatedAt: remote?.updated ?? link.remoteUpdatedAt,
        }
      })
      const allLinks = uniqueGoogleLinks([
        ...refreshedLinks,
        ...mappedLinks.filter(
          (link) =>
            !refreshedLinks.some((refreshed) => googleLinkKey(refreshed) === googleLinkKey(link)),
        ),
      ])
      const linkedEvent = withGoogleLinks(event, allLinks)
      setSyncMapEntryForEvent(eventMap, linkedEvent, allLinks, contentHash, Date.now())
      localById.set(event.id, linkedEvent)
      skipped += 1
      continue
    }
    try {
      if (selectedMappedLinks.length > 0) {
        const patchedLinks: DesktopCalendarGoogleEventLink[] = []
        for (const link of selectedMappedLinks) {
          const linkCalendar = calendarById(uniqueSelectedCalendars, link.googleCalendarId)
          if (!linkCalendar) continue
          const patched = await googleCalendarRequest<GoogleEventResponse>(
            accessToken,
            `/calendars/${encodeURIComponent(linkCalendar.id)}/events/${encodeURIComponent(link.googleEventId)}`,
            {
              method: 'PATCH',
              body: googleEventBody(appId, event),
            },
          )
          updated += 1
          patchedLinks.push({
            googleEventId: link.googleEventId,
            googleCalendarId: linkCalendar.id,
            googleCalendarSummary: linkCalendar.summary,
            googleICalUID: link.googleICalUID ?? cleanText(patched.iCalUID, 1024),
            googleRecurringEventId:
              link.googleRecurringEventId ?? cleanText(patched.recurringEventId, 1024),
            googleOriginalStartTime:
              link.googleOriginalStartTime ?? normalizeGoogleEventDateTime(patched.originalStartTime),
            remoteUpdatedAt: patched.updated,
          })
        }
        const allLinks = uniqueGoogleLinks([
          ...patchedLinks,
          ...mappedLinks.filter(
            (link) =>
              !patchedLinks.some((patched) => googleLinkKey(patched) === googleLinkKey(link)),
          ),
        ])
        const linkedEvent = withGoogleLinks(event, allLinks)
        setSyncMapEntryForEvent(eventMap, linkedEvent, allLinks, contentHash, Date.now())
        localById.set(event.id, linkedEvent)
      } else {
        const created = await googleCalendarRequest<GoogleEventResponse>(
          accessToken,
          `/calendars/${encodeURIComponent(targetCalendarId)}/events`,
          {
            method: 'POST',
            body: googleEventBody(appId, event),
          },
        )
        if (!created.id) throw new Error('Google did not return an event id.')
        inserted += 1
        const createdLink = {
          googleEventId: created.id,
          googleCalendarId: targetCalendarId,
          googleCalendarSummary: targetCalendar.summary,
          googleICalUID: cleanText(created.iCalUID, 1024),
          remoteUpdatedAt: created.updated,
        }
        const linkedEvent = withGoogleLinks(event, [createdLink])
        setSyncMapEntryForEvent(eventMap, linkedEvent, [createdLink], contentHash, Date.now())
        localById.set(event.id, linkedEvent)
      }
    } catch (error) {
      errors.push(`${event.title}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const [eventId, mapped] of Object.entries(eventMap)) {
    if (localIds.has(eventId)) continue
    if (EXTERNAL_SHARED_ID_PATTERN.test(eventId)) {
      delete eventMap[eventId]
      skipped += 1
      continue
    }
    const links = googleLinksFromMapped(mapped, mappedCalendarId(mapped)).filter((link) =>
      selectedCalendarIdSet.has(link.googleCalendarId),
    )
    if (links.length === 0) continue
    try {
      for (const link of links) {
        await googleCalendarRequest<null>(
          accessToken,
          `/calendars/${encodeURIComponent(link.googleCalendarId)}/events/${encodeURIComponent(link.googleEventId)}`,
          { method: 'DELETE' },
        )
        deleted += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/HTTP 404|HTTP 410|not found/i.test(message)) {
        errors.push(`deleted local event ${eventId}: ${message}`)
      }
    } finally {
      delete eventMap[eventId]
    }
  }

  const ok = errors.length === 0
  const state: DesktopCalendarGoogleSyncState = {
    provider: 'google',
    calendarId: defaultCalendar.id,
    selectedCalendarIds,
    defaultCalendarId: defaultCalendar.id,
    ...(hiddenEventKeys.size ? { hiddenEventKeys: Array.from(hiddenEventKeys) } : {}),
    eventMap,
    autoSyncIntervalMinutes: input.intervalMinutes ?? previousState.autoSyncIntervalMinutes ?? null,
    lastSyncedAt: Date.now(),
    lastSyncStatus: ok ? 'success' : 'error',
    lastSyncMessage: ok
      ? `calendars ${selectedCalendarCount}, pulled ${pulled}, inserted ${inserted}, updated ${updated}, deleted ${deleted}, skipped ${skipped}`
      : errors.slice(0, 3).join('; '),
  }

  return {
    ok,
    inserted,
    updated,
    deleted,
    pulled,
    skipped,
    state,
    events: Array.from(localById.values()).sort((left, right) =>
      `${left.date}${left.time ?? ''}${left.title}`.localeCompare(
        `${right.date}${right.time ?? ''}${right.title}`,
      ),
    ),
    errors,
  }
}

function normalizeDeleteScope(value: unknown): DesktopCalendarGoogleDeleteInput['scope'] {
  return value === 'series' || value === 'future' ? value : 'single'
}

function isGoogleNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /HTTP 404|HTTP 410|not found|notFound/i.test(message)
}

async function fetchGoogleEventForDelete(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<(GoogleEventResponse & { id: string }) | null> {
  try {
    const event = await googleCalendarRequest<GoogleEventResponse>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    )
    return typeof event.id === 'string' ? { ...event, id: event.id } : null
  } catch (error) {
    if (isGoogleNotFoundError(error)) return null
    throw error
  }
}

async function enrichGoogleLinkForDelete(
  accessToken: string,
  link: DesktopCalendarGoogleEventLink,
): Promise<DesktopCalendarGoogleEventLink> {
  if (link.googleRecurringEventId && link.googleOriginalStartTime) return link
  const remote = await fetchGoogleEventForDelete(
    accessToken,
    link.googleCalendarId,
    link.googleEventId,
  )
  if (!remote) return link
  return {
    ...link,
    googleICalUID: link.googleICalUID ?? cleanText(remote.iCalUID, 1024),
    googleRecurringEventId:
      link.googleRecurringEventId ?? cleanText(remote.recurringEventId, 1024),
    googleOriginalStartTime:
      link.googleOriginalStartTime ?? normalizeGoogleEventDateTime(remote.originalStartTime),
    remoteUpdatedAt: remote.updated ?? link.remoteUpdatedAt,
  }
}

function formatGoogleUntil(value: DesktopCalendarGoogleEventDateTime | undefined): string | null {
  if (!value) return null
  if (isIsoDate(value.date)) return addDays(value.date, -1).replace(/-/gu, '')
  if (typeof value.dateTime === 'string') {
    const millis = Date.parse(value.dateTime)
    if (Number.isFinite(millis)) {
      return new Date(millis - 1000)
        .toISOString()
        .replace(/[-:]/gu, '')
        .replace(/\.\d{3}Z$/u, 'Z')
    }
  }
  return null
}

function trimRecurringRule(rule: string, until: string): string {
  const prefix = rule.toUpperCase().startsWith('RRULE:') ? rule.slice(0, 6) : ''
  const body = prefix ? rule.slice(6) : rule
  const parts = body
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !/^UNTIL=/iu.test(part) && !/^COUNT=/iu.test(part))
  return `${prefix || 'RRULE:'}${[...parts, `UNTIL=${until}`].join(';')}`
}

async function trimGoogleRecurringEvent(
  accessToken: string,
  link: DesktopCalendarGoogleEventLink,
): Promise<void> {
  const recurringEventId = link.googleRecurringEventId
  const until = formatGoogleUntil(link.googleOriginalStartTime)
  if (!recurringEventId || !until) {
    throw new Error('반복 일정의 기준 시각을 확인할 수 없습니다.')
  }
  const master = await fetchGoogleEventForDelete(accessToken, link.googleCalendarId, recurringEventId)
  if (!master) return
  const recurrence = Array.isArray(master.recurrence) ? master.recurrence : []
  let changed = false
  const nextRecurrence = recurrence.map((rule) => {
    if (!/^RRULE:/iu.test(rule)) return rule
    changed = true
    return trimRecurringRule(rule, until)
  })
  if (!changed) throw new Error('Google 반복 규칙을 찾을 수 없습니다.')
  await googleCalendarRequest<GoogleEventResponse>(
    accessToken,
    `/calendars/${encodeURIComponent(link.googleCalendarId)}/events/${encodeURIComponent(recurringEventId)}`,
    { method: 'PATCH', body: { recurrence: nextRecurrence } },
  )
}

async function deleteGoogleEventLink(
  accessToken: string,
  link: DesktopCalendarGoogleEventLink,
  googleEventId: string,
): Promise<boolean> {
  try {
    await googleCalendarRequest<null>(
      accessToken,
      `/calendars/${encodeURIComponent(link.googleCalendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: 'DELETE' },
    )
    return true
  } catch (error) {
    if (isGoogleNotFoundError(error)) return false
    throw error
  }
}

function eventStartSortKey(
  event: NormalizedCalendarEvent,
  link?: DesktopCalendarGoogleEventLink,
): string {
  const original = link?.googleOriginalStartTime ?? event.googleOriginalStartTime
  if (isIsoDate(original?.date)) return `${original.date}T00:00`
  if (typeof original?.dateTime === 'string' && original.dateTime.length >= 16) {
    return original.dateTime.slice(0, 16)
  }
  return `${event.date}T${event.time ?? '00:00'}`
}

function googleEventIdBelongsToSeries(googleEventId: string | undefined, recurringId: string) {
  return Boolean(googleEventId && recurringId && googleEventId.startsWith(`${recurringId}_`))
}

function eventMatchesRecurringSeries(
  event: NormalizedCalendarEvent,
  links: DesktopCalendarGoogleEventLink[],
  recurringIds: Set<string>,
  iCalUIDs: Set<string>,
): boolean {
  if (event.googleRecurringEventId && recurringIds.has(event.googleRecurringEventId)) return true
  for (const link of links) {
    if (link.googleRecurringEventId && recurringIds.has(link.googleRecurringEventId)) return true
    if ([...recurringIds].some((recurringId) => googleEventIdBelongsToSeries(link.googleEventId, recurringId))) {
      return true
    }
    if (link.googleICalUID && iCalUIDs.has(link.googleICalUID)) return true
  }
  return false
}

export async function deleteDesktopCalendarGoogleEvent(
  input: DesktopCalendarGoogleDeleteInput,
): Promise<DesktopCalendarGoogleDeleteResult> {
  if (!input || typeof input.appId !== 'string' || !input.appId.trim()) {
    throw new Error('Calendar deletion requires an app id.')
  }
  const eventId = cleanText(input.eventId, 160)
  if (!eventId) throw new Error('삭제할 일정 ID가 필요합니다.')
  const scope = normalizeDeleteScope(input.scope)
  const previousState = normalizeSyncState(input.state)
  const settings = await readSettings()
  const accessToken = await getAccessToken(settings)
  const mergedEvents = (Array.isArray(input.events) ? input.events : [])
    .map(normalizeEvent)
    .filter((event): event is NormalizedCalendarEvent => Boolean(event))
  const event = mergedEvents.find((candidate) => candidate.id === eventId)
  if (!event) throw new Error('삭제할 일정을 찾을 수 없습니다.')
  const defaultCalendarId = previousState.defaultCalendarId ?? previousState.calendarId ?? GOOGLE_PRIMARY_CALENDAR_ID
  const rawLinks = googleLinksFromEvent(event, previousState.eventMap[event.id], defaultCalendarId).map(
    (link) => ({
      ...link,
      googleRecurringEventId: link.googleRecurringEventId ?? event.googleRecurringEventId,
      googleOriginalStartTime: link.googleOriginalStartTime ?? event.googleOriginalStartTime,
    }),
  )
  const needsEnrichedLinks =
    scope === 'future' || (scope === 'series' && rawLinks.some((link) => !link.googleRecurringEventId))
  const links = needsEnrichedLinks
    ? uniqueGoogleLinks(
        await Promise.all(rawLinks.map((link) => enrichGoogleLinkForDelete(accessToken, link))),
      )
    : rawLinks
  const eventMap: DesktopCalendarGoogleSyncState['eventMap'] = { ...previousState.eventMap }
  let deleted = 0
  let updated = 0
  const errors: string[] = []

  try {
    if (links.length === 0) {
      deleted = 0
    } else if (scope === 'single') {
      for (const link of links) {
        if (await deleteGoogleEventLink(accessToken, link, link.googleEventId)) deleted += 1
      }
    } else if (scope === 'series') {
      const seen = new Set<string>()
      for (const link of links) {
        const googleEventId = link.googleRecurringEventId ?? link.googleEventId
        const key = `${link.googleCalendarId}\u0000${googleEventId}`
        if (seen.has(key)) continue
        seen.add(key)
        if (await deleteGoogleEventLink(accessToken, link, googleEventId)) deleted += 1
      }
    } else {
      const seen = new Set<string>()
      for (const link of links) {
        const recurringEventId = link.googleRecurringEventId
        if (!recurringEventId) {
          throw new Error('반복 일정 정보가 없어 이후 일정을 삭제할 수 없습니다.')
        }
        const key = `${link.googleCalendarId}\u0000${recurringEventId}`
        if (seen.has(key)) continue
        seen.add(key)
        await trimGoogleRecurringEvent(accessToken, link)
        updated += 1
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  const recurringIds = new Set(links.map((link) => link.googleRecurringEventId).filter(Boolean) as string[])
  const iCalUIDs = new Set(links.map((link) => link.googleICalUID).filter(Boolean) as string[])
  const targetSortKey = eventStartSortKey(event, links[0])
  const hiddenEventKeys = new Set(previousState.hiddenEventKeys ?? [])
  const shouldRemoveCandidate = (candidate: NormalizedCalendarEvent) => {
    const candidateLinks = googleLinksFromEvent(
      candidate,
      eventMap[candidate.id],
      defaultCalendarId,
    )
    if (scope === 'single') return candidate.id === eventId
    const sameSeries = eventMatchesRecurringSeries(candidate, candidateLinks, recurringIds, iCalUIDs)
    if (!sameSeries) return false
    if (scope === 'series') return true
    return eventStartSortKey(candidate, candidateLinks[0]) >= targetSortKey
  }
  const removedEvents = mergedEvents.filter(shouldRemoveCandidate)
  const nextEvents = mergedEvents.filter((candidate) => !shouldRemoveCandidate(candidate))
  for (const removedEvent of removedEvents) {
    for (const link of googleLinksFromEvent(removedEvent, eventMap[removedEvent.id], defaultCalendarId)) {
      addHiddenGoogleLink(hiddenEventKeys, link)
    }
  }
  for (const link of links) addHiddenGoogleLink(hiddenEventKeys, link)
  const keptIds = new Set(nextEvents.map((candidate) => candidate.id))
  for (const id of Object.keys(eventMap)) {
    if (!keptIds.has(id)) delete eventMap[id]
  }
  const state: DesktopCalendarGoogleSyncState = {
    ...previousState,
    provider: 'google',
    eventMap,
    ...(hiddenEventKeys.size ? { hiddenEventKeys: Array.from(hiddenEventKeys) } : {}),
    lastSyncedAt: Date.now(),
    lastSyncStatus: errors.length > 0 ? 'error' : 'success',
    lastSyncMessage:
      errors.length > 0
        ? `hidden locally after remote delete failed: ${errors.slice(0, 2).join('; ')}`
        : scope === 'future'
          ? `recurring future updated ${updated}`
          : `deleted ${deleted} google event${deleted === 1 ? '' : 's'}`,
  }
  return {
    ok: true,
    deleted,
    updated,
    state,
    events: nextEvents,
    errors,
  }
}

export async function configureDesktopCalendarAutoSync(
  input: DesktopCalendarAutoSyncInput,
): Promise<DesktopCalendarGoogleStatus> {
  if (!input || typeof input.appId !== 'string' || !input.appId.trim()) {
    throw new Error('Auto sync requires an app id.')
  }
  const appId = input.appId.trim()
  const intervalMinutes = normalizeAutoSyncInterval(input.intervalMinutes)
  const settings = await readSettings()
  if (intervalMinutes == null) {
    delete settings.google.autoSync[appId]
  } else {
    settings.google.autoSync[appId] = {
      ...(settings.google.autoSync[appId] ?? {}),
      appTitle: cleanText(input.appTitle, 120) ?? appId,
      intervalMinutes,
    }
  }
  await writeSettings(settings)
  refreshDesktopCalendarAutoSync()
  return statusFromSettings(settings, appId)
}

function extractCalendarSyncState(
  data: Record<string, unknown>,
): DesktopCalendarGoogleSyncState | null {
  const sync = isRecord(data.calendarSync) ? data.calendarSync : {}
  const google = isRecord(sync.google) ? sync.google : null
  return google ? normalizeSyncState(google) : null
}

function extractEventsFromAppData(data: Record<string, unknown>): DesktopCalendarEventInput[] {
  const collections = isRecord(data.collections) ? data.collections : {}
  const events = Array.isArray(collections.events) ? collections.events : []
  return events
    .map(normalizeEvent)
    .filter((event): event is NormalizedCalendarEvent => Boolean(event))
}

function bundleAllowsCalendarSync(bundle: DesktopAppBundle): boolean {
  return Boolean(
    bundle.manifest.hostRequests?.some((request) => request.op === 'calendar.google.sync'),
  )
}

function updateAppCalendarSyncData(
  data: Record<string, unknown>,
  state: DesktopCalendarGoogleSyncState,
  events?: DesktopCalendarEventInput[],
): Record<string, unknown> {
  const sync = isRecord(data.calendarSync) ? data.calendarSync : {}
  const collections = isRecord(data.collections) ? data.collections : {}
  return {
    ...data,
    collections: {
      ...collections,
      ...(events ? { events } : {}),
    },
    calendarSync: {
      ...sync,
      google: state,
    },
  }
}

async function runAutoSync(appId: string): Promise<void> {
  const settings = await readSettings()
  const config = settings.google.autoSync[appId]
  if (!config) return
  if (!statusFromSettings(settings).connected) return
  const bundle = (await listDesktopApps()).find((candidate) => candidate.manifest.id === appId)
  if (!bundle) {
    delete settings.google.autoSync[appId]
    await writeSettings(settings)
    refreshDesktopCalendarAutoSync()
    return
  }
  if (!bundleAllowsCalendarSync(bundle)) {
    throw new Error(`App ${bundle.manifest.title} has not declared calendar.google.sync.`)
  }
  const result = await syncDesktopCalendarAppEvents({
    appId,
    appTitle: bundle.manifest.title,
    events: extractEventsFromAppData(bundle.data),
    state: extractCalendarSyncState(bundle.data),
    intervalMinutes: config.intervalMinutes,
  })
  await saveDesktopAppData(
    appId,
    updateAppCalendarSyncData(bundle.data, result.state, result.events),
  )
  const next = await readSettings()
  const nextConfig = next.google.autoSync[appId]
  if (nextConfig) {
    next.google.autoSync[appId] = {
      ...nextConfig,
      lastRunAt: Date.now(),
      lastStatus: result.ok ? 'success' : 'error',
      lastMessage: result.state.lastSyncMessage,
    }
    await writeSettings(next)
  }
  await recordDesktopAppAudit({
    appId,
    operation: 'calendar.google.autoSync',
    capability: 'calendar',
    status: result.ok ? 'success' : 'error',
    source: 'manager',
    message: result.state.lastSyncMessage,
  })
}

function clearAutoSyncTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
}

function scheduleAutoSync(appId: string, config: StoredAutoSync): void {
  const intervalMs = config.intervalMinutes * 60 * 1000
  const elapsed = config.lastRunAt ? Date.now() - config.lastRunAt : intervalMs
  const delay = Math.max(5_000, intervalMs - elapsed)
  const timer = setTimeout(() => {
    timers.delete(appId)
    void runAutoSync(appId)
      .catch(async (error) => {
        const settings = await readSettings()
        const current = settings.google.autoSync[appId]
        if (current) {
          settings.google.autoSync[appId] = {
            ...current,
            lastRunAt: Date.now(),
            lastStatus: 'error',
            lastMessage: error instanceof Error ? error.message : String(error),
          }
          await writeSettings(settings)
        }
        await recordDesktopAppAudit({
          appId,
          operation: 'calendar.google.autoSync',
          capability: 'calendar',
          status: 'error',
          source: 'manager',
          message: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (!autoSyncStarted) return
        void readSettings().then((settings) => {
          const next = settings.google.autoSync[appId]
          if (next && statusFromSettings(settings).connected) scheduleAutoSync(appId, next)
        })
      })
  }, delay)
  timer.unref?.()
  timers.set(appId, timer)
}

export function startDesktopCalendarAutoSync(): void {
  if (autoSyncStarted) return
  autoSyncStarted = true
  refreshDesktopCalendarAutoSync()
}

export function stopDesktopCalendarAutoSync(): void {
  autoSyncStarted = false
  clearAutoSyncTimers()
}

export function refreshDesktopCalendarAutoSync(): void {
  clearAutoSyncTimers()
  if (!autoSyncStarted) return
  void readSettings().then((settings) => {
    if (!statusFromSettings(settings).connected) return
    for (const [appId, config] of Object.entries(settings.google.autoSync)) {
      scheduleAutoSync(appId, config)
    }
  })
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/\n/gu, '\\n')
    .replace(/,/gu, '\\,')
    .replace(/;/gu, '\\;')
}

function formatIcsDate(date: string): string {
  return date.replace(/-/gu, '')
}

function formatIcsDateTime(date: string, time: string): string {
  return `${formatIcsDate(date)}T${time.replace(/:/gu, '')}00`
}

function foldIcsLine(line: string): string[] {
  if (line.length <= 75) return [line]
  const lines: string[] = []
  let rest = line
  while (rest.length > 75) {
    lines.push(rest.slice(0, 75))
    rest = ` ${rest.slice(75)}`
  }
  lines.push(rest)
  return lines
}

function buildIcs(input: DesktopCalendarIcsExportInput): string {
  const events = (Array.isArray(input.events) ? input.events : [])
    .map(normalizeEvent)
    .filter((event): event is NormalizedCalendarEvent => Boolean(event))
  const now = new Date()
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//sepilotd//Desktop Apps Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(cleanText(input.appTitle, 120) ?? 'sepilotd calendar')}`,
  ]
  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${icsEscape(event.id)}@sepilotd.local`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`SUMMARY:${icsEscape(event.title)}`)
    if (event.time) {
      const fallbackEnd = addMinutes(event.date, event.time, 30)
      const endDate = event.endDate || fallbackEnd.date
      const endTime = event.endTime || fallbackEnd.time
      const timezone = event.timezone || currentTimeZone()
      lines.push(`DTSTART;TZID=${timezone}:${formatIcsDateTime(event.date, event.time)}`)
      lines.push(`DTEND;TZID=${timezone}:${formatIcsDateTime(endDate, endTime)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.date)}`)
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.endDate || addDays(event.date, 1))}`)
    }
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`)
    if (event.notes || event.type) {
      lines.push(`DESCRIPTION:${icsEscape([event.notes, event.type].filter(Boolean).join('\\n'))}`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}

function safeExportName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 48) || 'calendar'
  )
}

export async function exportDesktopCalendarIcs(
  input: DesktopCalendarIcsExportInput,
  parentWindow?: BrowserWindow | null,
): Promise<string | null> {
  const appTitle = cleanText(input.appTitle, 120) ?? 'calendar'
  const defaultPath = join(app.getPath('documents'), `${safeExportName(appTitle)}.ics`)
  const options = {
    title: 'Export calendar as iCalendar',
    defaultPath,
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
  }
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, buildIcs(input), 'utf-8')
  return result.filePath
}
