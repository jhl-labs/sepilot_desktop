'use client'
import { create } from 'zustand'
import type { DesktopShellKind } from '@sepilotd/api-client'

export interface ShellTabSshTarget {
  host: string
  user?: string
  port: number
  identityFile?: string
  jumpHost?: string
  proxyCommand?: string
  localForwards?: string[]
  remoteEnv?: string[]
  keepAlive?: boolean
  agentForwarding?: boolean
  x11Forwarding?: boolean
  compression?: boolean
  terminalType?: string
  encoding?: string
}

export interface ShellProfileGroup {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type ShellProfileSort = 'recent' | 'title' | 'host'
export type ShellReconnectMode = 'never' | 'on-exit' | 'always'

export interface ShellPreferences {
  copyOnSelect: boolean
  confirmPaste: boolean
  bracketedPaste: boolean
  warnDestructiveCommands: boolean
  restoreTabs: boolean
  reconnectMode: ShellReconnectMode
  reconnectDelayMs: number
  scrollback: number
  fontSize: number
  keymap: {
    copy: string
    paste: string
    clear: string
    find: string
    reconnect: string
    duplicate: string
    close: string
  }
}

export interface ShellProfile {
  id: string
  title: string
  kind: DesktopShellKind
  createdAt: number
  updatedAt: number
  cwd?: string
  startupCommand?: string
  terminalType?: string
  encoding?: string
  ssh?: ShellTabSshTarget
  tags: string[]
  color: string
  groupId?: string
  favorite: boolean
  reconnectMode?: ShellReconnectMode
  reconnectDelayMs?: number
  restoreOnLaunch: boolean
  lastConnectedAt?: number
  connectionCount: number
}

export interface ShellSnippet {
  id: string
  title: string
  command: string
  createdAt: number
  updatedAt: number
}

export interface ShellTab {
  id: string
  profileId?: string
  title: string
  kind: DesktopShellKind
  status: 'idle' | 'connecting' | 'connected' | 'exited' | 'error'
  createdAt: number
  cwd?: string
  ssh?: ShellTabSshTarget
  sessionId?: string
  command?: string
  startupCommand?: string
  terminalType?: string
  encoding?: string
  reconnectMode?: ShellReconnectMode
  reconnectDelayMs?: number
  restoreOnLaunch?: boolean
  exitCode?: number
  error?: string
  diagnostic?: string
  pid?: number
  restartNonce: number
  color?: string
}

export interface ShellActivityItem {
  id: string
  kind:
    | 'connect'
    | 'exit'
    | 'error'
    | 'diagnostic'
    | 'reconnect'
    | 'command'
    | 'chat'
    | 'profile'
    | 'import'
  title: string
  message: string
  at: number
  severity: 'info' | 'success' | 'warning' | 'error'
  tabId?: string
  profileId?: string
}

export interface ShellCommandHistoryItem {
  id: string
  command: string
  at: number
  title?: string
  tabId?: string
  profileId?: string
}

export interface ShellProfileInput {
  title: string
  kind: DesktopShellKind
  cwd?: string
  startupCommand?: string
  terminalType?: string
  encoding?: string
  ssh?: ShellTabSshTarget
  tags?: string[]
  color?: string
  groupId?: string
  favorite?: boolean
  reconnectMode?: ShellReconnectMode
  reconnectDelayMs?: number
  restoreOnLaunch?: boolean
}

interface ShellSnippetInput {
  title: string
  command: string
}

interface ShellState {
  tabs: ShellTab[]
  activeId: string | null
  profiles: ShellProfile[]
  groups: ShellProfileGroup[]
  snippets: ShellSnippet[]
  preferences: ShellPreferences
  profileSearch: string
  activeGroupId: string | null
  profileSort: ShellProfileSort
  selectedProfileIds: string[]
  activity: ShellActivityItem[]
  commandHistory: ShellCommandHistoryItem[]
  addLocalTab: (input?: {
    cwd?: string
    title?: string
    profileId?: string
    startupCommand?: string
    color?: string
    terminalType?: string
    encoding?: string
    reconnectMode?: ShellReconnectMode
    reconnectDelayMs?: number
    restoreOnLaunch?: boolean
  }) => string
  addSshTab: (
    input: ShellTabSshTarget & {
      title?: string
      profileId?: string
      startupCommand?: string
      color?: string
      reconnectMode?: ShellReconnectMode
      reconnectDelayMs?: number
      restoreOnLaunch?: boolean
    },
  ) => string
  addTabFromProfile: (profileId: string) => string | null
  duplicateTab: (id: string) => string | null
  restartTab: (id: string) => void
  updateTab: (id: string, patch: Partial<ShellTab>) => void
  removeTab: (id: string) => void
  reorderTab: (id: string, targetIndex: number) => void
  closeAll: () => void
  setActive: (id: string | null) => void
  setProfileSearch: (query: string) => void
  setActiveGroup: (groupId: string | null) => void
  setProfileSort: (sort: ShellProfileSort) => void
  toggleProfileSelection: (profileId: string) => void
  clearProfileSelection: () => void
  addGroup: (title: string) => string
  updateGroup: (id: string, title: string) => void
  removeGroup: (id: string) => void
  addProfile: (input: ShellProfileInput) => string
  updateProfile: (id: string, patch: Partial<ShellProfileInput>) => void
  removeProfile: (id: string) => void
  removeProfiles: (ids: string[]) => void
  duplicateProfile: (id: string) => string | null
  toggleFavorite: (id: string) => void
  moveProfilesToGroup: (ids: string[], groupId: string | null) => void
  touchProfile: (id: string) => void
  setPreferences: (patch: Partial<ShellPreferences>) => void
  exportLibrary: () => ShellLibraryExport
  importLibrary: (value: unknown) => boolean
  importSshConfig: (content: string) => number
  recordActivity: (input: Omit<ShellActivityItem, 'id' | 'at'> & { at?: number }) => void
  clearActivity: () => void
  recordCommand: (input: Omit<ShellCommandHistoryItem, 'id' | 'at'> & { at?: number }) => void
  clearCommandHistory: () => void
  addSnippet: (input: ShellSnippetInput) => string
  updateSnippet: (id: string, patch: Partial<ShellSnippetInput>) => void
  removeSnippet: (id: string) => void
  resetSnippets: () => void
}

const SHELL_STORAGE_KEY = 'sepilotd.shell.library.v1'
const DEFAULT_PROFILE_COLOR = '#38bdf8'
const DEFAULT_GROUP_ID = 'default'
const SSH_CONFIG_GROUP_TITLE = 'SSH Config'
const MAX_ACTIVITY_ITEMS = 200
const MAX_COMMAND_HISTORY_ITEMS = 200
const DEFAULT_SNIPPETS: Array<Pick<ShellSnippet, 'title' | 'command'>> = [
  { title: 'pwd', command: 'pwd' },
  { title: 'list files', command: 'ls -la' },
  { title: 'git status', command: 'git status --short' },
  { title: 'running containers', command: 'docker ps' },
  { title: 'pnpm test', command: 'pnpm test' },
]

export interface ShellLibrarySnapshot {
  profiles: ShellProfile[]
  groups: ShellProfileGroup[]
  snippets: ShellSnippet[]
  preferences: ShellPreferences
  tabs: ShellTab[]
  activeId: string | null
  activity: ShellActivityItem[]
  commandHistory: ShellCommandHistoryItem[]
}

export interface ShellLibraryExport {
  version: 1
  exportedAt: string
  library: ShellLibrarySnapshot
}

const DEFAULT_PREFERENCES: ShellPreferences = {
  copyOnSelect: true,
  confirmPaste: true,
  bracketedPaste: true,
  warnDestructiveCommands: true,
  restoreTabs: false,
  reconnectMode: 'never',
  reconnectDelayMs: 1500,
  scrollback: 20_000,
  fontSize: 13,
  keymap: {
    copy: 'Ctrl+Shift+C',
    paste: 'Ctrl+Shift+V',
    clear: 'Ctrl+Shift+K',
    find: 'Ctrl+Shift+F',
    reconnect: 'Ctrl+Shift+R',
    duplicate: 'Ctrl+Shift+D',
    close: 'Ctrl+Shift+W',
  },
}

const LEGACY_KEYMAP_DEFAULTS = {
  clear: 'Ctrl+L',
  find: 'Ctrl+F',
  reconnect: 'Ctrl+R',
} as const

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `shell-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeReconnectMode(value: unknown): ShellReconnectMode | undefined {
  return value === 'on-exit' || value === 'always' || value === 'never' ? value : undefined
}

function normalizeDelay(value: unknown, fallback = DEFAULT_PREFERENCES.reconnectDelayMs): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(250, Math.min(60_000, Math.floor(value)))
    : fallback
}

function normalizeForwardList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeSshTarget(value: unknown): ShellTabSshTarget | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<ShellTabSshTarget>
  const host = cleanString(record.host)
  if (!host) return undefined
  const port =
    typeof record.port === 'number' && Number.isFinite(record.port)
      ? Math.max(1, Math.min(65_535, Math.floor(record.port)))
      : 22
  return {
    host,
    user: cleanString(record.user),
    port,
    identityFile: cleanString(record.identityFile),
    jumpHost: cleanString(record.jumpHost),
    proxyCommand: cleanString(record.proxyCommand),
    localForwards: normalizeForwardList(record.localForwards),
    remoteEnv: normalizeForwardList(record.remoteEnv),
    keepAlive: Boolean(record.keepAlive),
    agentForwarding: Boolean(record.agentForwarding),
    x11Forwarding: Boolean(record.x11Forwarding),
    compression: Boolean(record.compression),
    terminalType: cleanString(record.terminalType),
    encoding: cleanString(record.encoding),
  }
}

function defaultGroups(now = Date.now()): ShellProfileGroup[] {
  return [
    {
      id: DEFAULT_GROUP_ID,
      title: 'Default',
      createdAt: now,
      updatedAt: now,
    },
  ]
}

function normalizeGroup(value: unknown): ShellProfileGroup | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellProfileGroup>
  const id = cleanString(record.id)
  const title = cleanString(record.title)
  if (!id || !title) return null
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now()
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt
  return { id, title, createdAt, updatedAt }
}

function normalizePreferences(value: unknown): ShellPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES
  const record = value as Partial<ShellPreferences>
  const keymap = record.keymap && typeof record.keymap === 'object' ? record.keymap : {}
  return {
    copyOnSelect:
      typeof record.copyOnSelect === 'boolean'
        ? record.copyOnSelect
        : DEFAULT_PREFERENCES.copyOnSelect,
    confirmPaste:
      typeof record.confirmPaste === 'boolean'
        ? record.confirmPaste
        : DEFAULT_PREFERENCES.confirmPaste,
    bracketedPaste:
      typeof record.bracketedPaste === 'boolean'
        ? record.bracketedPaste
        : DEFAULT_PREFERENCES.bracketedPaste,
    warnDestructiveCommands:
      typeof record.warnDestructiveCommands === 'boolean'
        ? record.warnDestructiveCommands
        : DEFAULT_PREFERENCES.warnDestructiveCommands,
    restoreTabs:
      typeof record.restoreTabs === 'boolean'
        ? record.restoreTabs
        : DEFAULT_PREFERENCES.restoreTabs,
    reconnectMode:
      normalizeReconnectMode(record.reconnectMode) ?? DEFAULT_PREFERENCES.reconnectMode,
    reconnectDelayMs: normalizeDelay(record.reconnectDelayMs),
    scrollback:
      typeof record.scrollback === 'number' && Number.isFinite(record.scrollback)
        ? Math.max(1000, Math.min(100_000, Math.floor(record.scrollback)))
        : DEFAULT_PREFERENCES.scrollback,
    fontSize:
      typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)
        ? Math.max(8, Math.min(32, Math.floor(record.fontSize)))
        : DEFAULT_PREFERENCES.fontSize,
    keymap: migrateKeymap(keymap as Partial<ShellPreferences['keymap']>),
  }
}

function migrateKeymap(
  stored: Partial<ShellPreferences['keymap']>,
): ShellPreferences['keymap'] {
  const pick = (
    key: keyof ShellPreferences['keymap'],
    legacy?: string,
  ): string => {
    const value = stored[key]
    if (typeof value !== 'string' || !value) return DEFAULT_PREFERENCES.keymap[key]
    if (legacy && value === legacy) return DEFAULT_PREFERENCES.keymap[key]
    return value
  }
  return {
    copy: pick('copy'),
    paste: pick('paste'),
    clear: pick('clear', LEGACY_KEYMAP_DEFAULTS.clear),
    find: pick('find', LEGACY_KEYMAP_DEFAULTS.find),
    reconnect: pick('reconnect', LEGACY_KEYMAP_DEFAULTS.reconnect),
    duplicate: pick('duplicate'),
    close: pick('close'),
  }
}

function defaultSnippets(now = Date.now()): ShellSnippet[] {
  return DEFAULT_SNIPPETS.map((snippet, index) => ({
    id: `default-${index + 1}`,
    title: snippet.title,
    command: snippet.command,
    createdAt: now + index,
    updatedAt: now + index,
  }))
}

function normalizeProfile(value: unknown): ShellProfile | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellProfile>
  const id = cleanString(record.id)
  const title = cleanString(record.title)
  const kind = record.kind === 'ssh' ? 'ssh' : record.kind === 'local' ? 'local' : null
  if (!id || !title || !kind) return null
  const ssh = kind === 'ssh' ? normalizeSshTarget(record.ssh) : undefined
  if (kind === 'ssh' && !ssh) return null
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now()
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt
  return {
    id,
    title,
    kind,
    createdAt,
    updatedAt,
    cwd: cleanString(record.cwd),
    startupCommand: cleanString(record.startupCommand),
    terminalType: cleanString(record.terminalType),
    encoding: cleanString(record.encoding),
    ssh,
    tags: normalizeTags(record.tags),
    color: cleanString(record.color) ?? DEFAULT_PROFILE_COLOR,
    groupId: cleanString(record.groupId) ?? DEFAULT_GROUP_ID,
    favorite: Boolean(record.favorite),
    reconnectMode: normalizeReconnectMode(record.reconnectMode),
    reconnectDelayMs:
      typeof record.reconnectDelayMs === 'number' && Number.isFinite(record.reconnectDelayMs)
        ? normalizeDelay(record.reconnectDelayMs)
        : undefined,
    restoreOnLaunch: Boolean(record.restoreOnLaunch),
    lastConnectedAt:
      typeof record.lastConnectedAt === 'number' && Number.isFinite(record.lastConnectedAt)
        ? record.lastConnectedAt
        : undefined,
    connectionCount:
      typeof record.connectionCount === 'number' && Number.isFinite(record.connectionCount)
        ? Math.max(0, Math.floor(record.connectionCount))
        : 0,
  }
}

function normalizeTab(value: unknown): ShellTab | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellTab>
  const id = cleanString(record.id)
  const title = cleanString(record.title)
  const kind = record.kind === 'ssh' ? 'ssh' : record.kind === 'local' ? 'local' : null
  if (!id || !title || !kind) return null
  const ssh = kind === 'ssh' ? normalizeSshTarget(record.ssh) : undefined
  if (kind === 'ssh' && !ssh) return null
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now()
  return {
    id,
    profileId: cleanString(record.profileId),
    title,
    kind,
    status: 'idle',
    createdAt,
    cwd: cleanString(record.cwd),
    ssh,
    startupCommand: cleanString(record.startupCommand),
    terminalType: cleanString(record.terminalType),
    encoding: cleanString(record.encoding),
    reconnectMode: normalizeReconnectMode(record.reconnectMode),
    reconnectDelayMs:
      typeof record.reconnectDelayMs === 'number' && Number.isFinite(record.reconnectDelayMs)
        ? normalizeDelay(record.reconnectDelayMs)
        : undefined,
    restoreOnLaunch: Boolean(record.restoreOnLaunch),
    restartNonce: 0,
    color: cleanString(record.color),
  }
}

function tabFromProfile(profile: ShellProfile): ShellTab | null {
  if (profile.kind === 'ssh' && !profile.ssh) return null
  return {
    id: createId(),
    profileId: profile.id,
    title: profile.title,
    kind: profile.kind,
    status: 'idle',
    createdAt: Date.now(),
    cwd: profile.cwd,
    ssh: profile.ssh,
    startupCommand: profile.startupCommand,
    terminalType: profile.terminalType,
    encoding: profile.encoding,
    reconnectMode: profile.reconnectMode,
    reconnectDelayMs: profile.reconnectDelayMs,
    restoreOnLaunch: profile.restoreOnLaunch,
    restartNonce: 0,
    color: profile.color,
  }
}

function normalizeSnippet(value: unknown): ShellSnippet | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellSnippet>
  const id = cleanString(record.id)
  const title = cleanString(record.title)
  const command = cleanString(record.command)
  if (!id || !title || !command) return null
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now()
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt
  return { id, title, command, createdAt, updatedAt }
}

function normalizeActivity(value: unknown): ShellActivityItem | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellActivityItem>
  const id = cleanString(record.id)
  const title = cleanString(record.title)
  const message = cleanString(record.message)
  if (!id || !title || !message) return null
  const kind =
    record.kind === 'connect' ||
    record.kind === 'exit' ||
    record.kind === 'error' ||
    record.kind === 'diagnostic' ||
    record.kind === 'reconnect' ||
    record.kind === 'command' ||
    record.kind === 'chat' ||
    record.kind === 'profile' ||
    record.kind === 'import'
      ? record.kind
      : 'profile'
  const severity =
    record.severity === 'success' ||
    record.severity === 'warning' ||
    record.severity === 'error' ||
    record.severity === 'info'
      ? record.severity
      : 'info'
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now()
  return {
    id,
    kind,
    title,
    message,
    at,
    severity,
    tabId: cleanString(record.tabId),
    profileId: cleanString(record.profileId),
  }
}

function normalizeCommandHistory(value: unknown): ShellCommandHistoryItem | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<ShellCommandHistoryItem>
  const id = cleanString(record.id)
  const command = cleanString(record.command)
  if (!id || !command) return null
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now()
  return {
    id,
    command,
    at,
    title: cleanString(record.title),
    tabId: cleanString(record.tabId),
    profileId: cleanString(record.profileId),
  }
}

function tokenizeSshConfigValue(value: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of value) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function parseSshConfigLine(line: string): { key: string; value: string } | null {
  const trimmed = line.replace(/\s+#.*$/, '').trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s+(.*)$/)
  if (!match) return null
  return { key: match[1].toLowerCase(), value: match[2].trim() }
}

function addSshOption(
  options: Record<string, string[]>,
  key: string,
  value: string,
): Record<string, string[]> {
  return {
    ...options,
    [key]: [...(options[key] ?? []), value],
  }
}

function lastSshOption(options: Record<string, string[]>, key: string): string | undefined {
  return options[key]?.at(-1)
}

function isConcreteSshHost(pattern: string): boolean {
  return (
    Boolean(pattern) && !pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('!')
  )
}

function parseSshConfigProfiles(content: string, groupId: string): ShellProfileInput[] {
  const blocks: Array<{ hosts: string[]; options: Record<string, string[]> }> = []
  let current: { hosts: string[]; options: Record<string, string[]> } | null = null
  let globalOptions: Record<string, string[]> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const parsed = parseSshConfigLine(rawLine)
    if (!parsed) continue
    if (parsed.key === 'host') {
      current = { hosts: tokenizeSshConfigValue(parsed.value), options: {} }
      blocks.push(current)
      continue
    }
    if (current) {
      current.options = addSshOption(current.options, parsed.key, parsed.value)
    } else {
      globalOptions = addSshOption(globalOptions, parsed.key, parsed.value)
    }
  }

  const wildcardOptions = blocks
    .filter((block) => block.hosts.some((host) => host === '*'))
    .reduce<Record<string, string[]>>((acc, block) => ({ ...acc, ...block.options }), globalOptions)

  return blocks.flatMap((block) => {
    const concreteHosts = block.hosts.filter(isConcreteSshHost)
    if (concreteHosts.length === 0) return []
    const options = { ...wildcardOptions, ...block.options }
    return concreteHosts.map((alias) => {
      const port = Number.parseInt(lastSshOption(options, 'port') ?? '22', 10)
      const host = lastSshOption(options, 'hostname') ?? alias
      const identityFile = options.identityfile?.[0]
      const proxyJump = lastSshOption(options, 'proxyjump')
      const compression = lastSshOption(options, 'compression')?.toLowerCase() === 'yes'
      const agentForwarding = lastSshOption(options, 'forwardagent')?.toLowerCase() === 'yes'
      const x11Forwarding = lastSshOption(options, 'forwardx11')?.toLowerCase() === 'yes'
      const keepAlive = Boolean(lastSshOption(options, 'serveraliveinterval'))
      const setEnv = options.setenv?.flatMap(tokenizeSshConfigValue) ?? []
      return {
        title: alias,
        kind: 'ssh',
        ssh: {
          host,
          user: lastSshOption(options, 'user'),
          port: Number.isFinite(port) ? port : 22,
          identityFile,
          jumpHost: proxyJump && proxyJump !== 'none' ? proxyJump : undefined,
          proxyCommand: lastSshOption(options, 'proxycommand'),
          localForwards: options.localforward ?? [],
          remoteEnv: setEnv,
          keepAlive,
          agentForwarding,
          x11Forwarding,
          compression,
        },
        tags: ['ssh-config'],
        groupId,
        color: '#22c55e',
      } satisfies ShellProfileInput
    })
  })
}

function normalizeLibrarySnapshot(value: unknown): ShellLibrarySnapshot {
  const parsed =
    value && typeof value === 'object' && 'library' in value
      ? (value as Partial<ShellLibraryExport>).library
      : value
  const record =
    parsed && typeof parsed === 'object' ? (parsed as Partial<ShellLibrarySnapshot>) : {}
  const groups = Array.isArray(record.groups)
    ? record.groups
        .map(normalizeGroup)
        .filter((group): group is ShellProfileGroup => Boolean(group))
    : []
  const normalizedGroups = groups.length > 0 ? groups : defaultGroups()
  const profiles = Array.isArray(record.profiles)
    ? record.profiles
        .map(normalizeProfile)
        .filter((profile): profile is ShellProfile => Boolean(profile))
    : []
  const snippets = Array.isArray(record.snippets)
    ? record.snippets
        .map(normalizeSnippet)
        .filter((snippet): snippet is ShellSnippet => Boolean(snippet))
    : []
  const activity = Array.isArray(record.activity)
    ? record.activity
        .map(normalizeActivity)
        .filter((item): item is ShellActivityItem => Boolean(item))
        .slice(0, MAX_ACTIVITY_ITEMS)
    : []
  const commandHistory = Array.isArray(record.commandHistory)
    ? record.commandHistory
        .map(normalizeCommandHistory)
        .filter((item): item is ShellCommandHistoryItem => Boolean(item))
        .slice(0, MAX_COMMAND_HISTORY_ITEMS)
    : []
  const preferences = normalizePreferences(record.preferences)
  const restoredTabs =
    preferences.restoreTabs && Array.isArray(record.tabs)
      ? record.tabs.map(normalizeTab).filter((tab): tab is ShellTab => Boolean(tab))
      : []
  const profileRestoreTabs = preferences.restoreTabs
    ? profiles
        .filter(
          (profile) =>
            profile.restoreOnLaunch && !restoredTabs.some((tab) => tab.profileId === profile.id),
        )
        .map(tabFromProfile)
        .filter((tab): tab is ShellTab => Boolean(tab))
    : []
  const tabs = dedupeById([...restoredTabs, ...profileRestoreTabs])
  const activeId =
    typeof record.activeId === 'string' && tabs.some((tab) => tab.id === record.activeId)
      ? record.activeId
      : (tabs[0]?.id ?? null)

  return {
    profiles: profiles.map((profile) => ({
      ...profile,
      groupId: normalizedGroups.some((group) => group.id === profile.groupId)
        ? profile.groupId
        : DEFAULT_GROUP_ID,
    })),
    groups: normalizedGroups,
    snippets: snippets.length > 0 ? snippets : defaultSnippets(),
    preferences,
    tabs,
    activeId,
    activity,
    commandHistory,
  }
}

function loadLibrary(): ShellLibrarySnapshot {
  if (typeof window === 'undefined') {
    return {
      profiles: [],
      groups: defaultGroups(),
      snippets: defaultSnippets(),
      preferences: DEFAULT_PREFERENCES,
      tabs: [],
      activeId: null,
      activity: [],
      commandHistory: [],
    }
  }
  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY)
    if (!raw) {
      return {
        profiles: [],
        groups: defaultGroups(),
        snippets: defaultSnippets(),
        preferences: DEFAULT_PREFERENCES,
        tabs: [],
        activeId: null,
        activity: [],
        commandHistory: [],
      }
    }
    return normalizeLibrarySnapshot(JSON.parse(raw))
  } catch {
    return {
      profiles: [],
      groups: defaultGroups(),
      snippets: defaultSnippets(),
      preferences: DEFAULT_PREFERENCES,
      tabs: [],
      activeId: null,
      activity: [],
      commandHistory: [],
    }
  }
}

function persistLibrary(snapshot: ShellLibrarySnapshot): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    SHELL_STORAGE_KEY,
    JSON.stringify({
      ...snapshot,
      tabs: snapshot.preferences.restoreTabs ? snapshot.tabs.map(snapshotTab) : [],
      activeId: snapshot.preferences.restoreTabs ? snapshot.activeId : null,
    }),
  )
}

function snapshotTab(tab: ShellTab): ShellTab {
  return {
    id: tab.id,
    profileId: tab.profileId,
    title: tab.title,
    kind: tab.kind,
    status: 'idle',
    createdAt: tab.createdAt,
    cwd: tab.cwd,
    ssh: tab.ssh,
    startupCommand: tab.startupCommand,
    terminalType: tab.terminalType,
    encoding: tab.encoding,
    reconnectMode: tab.reconnectMode,
    reconnectDelayMs: tab.reconnectDelayMs,
    restoreOnLaunch: tab.restoreOnLaunch,
    restartNonce: 0,
    color: tab.color,
  }
}

function libraryFromState(
  state: Pick<
    ShellState,
    | 'profiles'
    | 'groups'
    | 'snippets'
    | 'preferences'
    | 'tabs'
    | 'activeId'
    | 'activity'
    | 'commandHistory'
  >,
): ShellLibrarySnapshot {
  return {
    profiles: state.profiles,
    groups: state.groups,
    snippets: state.snippets,
    preferences: state.preferences,
    tabs: state.tabs,
    activeId: state.activeId,
    activity: state.activity.slice(0, MAX_ACTIVITY_ITEMS),
    commandHistory: state.commandHistory.slice(0, MAX_COMMAND_HISTORY_ITEMS),
  }
}

function commitLibrary(
  state: Pick<
    ShellState,
    | 'profiles'
    | 'groups'
    | 'snippets'
    | 'preferences'
    | 'tabs'
    | 'activeId'
    | 'activity'
    | 'commandHistory'
  >,
) {
  persistLibrary(libraryFromState(state))
  return state
}

function stampProfileConnection(profiles: ShellProfile[], id?: string): ShellProfile[] {
  if (!id) return profiles
  const now = Date.now()
  return profiles.map((profile) =>
    profile.id === id
      ? {
          ...profile,
          updatedAt: now,
          lastConnectedAt: now,
          connectionCount: profile.connectionCount + 1,
        }
      : profile,
  )
}

function createProfile(input: ShellProfileInput): ShellProfile {
  const now = Date.now()
  return {
    id: createId(),
    title: input.title.trim() || (input.kind === 'ssh' ? 'SSH Host' : 'Local Shell'),
    kind: input.kind,
    createdAt: now,
    updatedAt: now,
    cwd: cleanString(input.cwd),
    startupCommand: cleanString(input.startupCommand),
    terminalType: cleanString(input.terminalType),
    encoding: cleanString(input.encoding),
    ssh: input.kind === 'ssh' ? normalizeSshTarget(input.ssh) : undefined,
    tags: normalizeTags(input.tags),
    color: cleanString(input.color) ?? DEFAULT_PROFILE_COLOR,
    groupId: cleanString(input.groupId) ?? DEFAULT_GROUP_ID,
    favorite: Boolean(input.favorite),
    reconnectMode: input.reconnectMode,
    reconnectDelayMs:
      typeof input.reconnectDelayMs === 'number' && Number.isFinite(input.reconnectDelayMs)
        ? normalizeDelay(input.reconnectDelayMs)
        : undefined,
    restoreOnLaunch: Boolean(input.restoreOnLaunch),
    connectionCount: 0,
  }
}

function createSnippet(input: ShellSnippetInput): ShellSnippet {
  const now = Date.now()
  return {
    id: createId(),
    title: input.title.trim() || input.command.trim().slice(0, 40) || 'snippet',
    command: input.command.trim(),
    createdAt: now,
    updatedAt: now,
  }
}

const initialLibrary = loadLibrary()

export const useShellStore = create<ShellState>((set, get) => ({
  tabs: initialLibrary.tabs,
  activeId: initialLibrary.activeId,
  profiles: initialLibrary.profiles,
  groups: initialLibrary.groups,
  snippets: initialLibrary.snippets,
  preferences: initialLibrary.preferences,
  profileSearch: '',
  activeGroupId: null,
  profileSort: 'recent',
  selectedProfileIds: [],
  activity: initialLibrary.activity,
  commandHistory: initialLibrary.commandHistory,
  addLocalTab: (input) => {
    const id = createId()
    const profileId = input?.profileId
    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id,
          profileId,
          kind: 'local',
          title: input?.title?.trim() || 'Local',
          status: 'idle',
          cwd: input?.cwd,
          startupCommand: input?.startupCommand,
          terminalType: input?.terminalType,
          encoding: input?.encoding,
          reconnectMode: input?.reconnectMode,
          reconnectDelayMs: input?.reconnectDelayMs,
          restoreOnLaunch: input?.restoreOnLaunch,
          createdAt: Date.now(),
          restartNonce: 0,
          color: input?.color,
        },
      ],
      activeId: id,
      profiles: stampProfileConnection(state.profiles, profileId),
      groups: state.groups,
      snippets: state.snippets,
      preferences: state.preferences,
    }))
    persistLibrary(libraryFromState(get()))
    return id
  },
  addSshTab: (input) => {
    const id = createId()
    const title = input.title?.trim() || (input.user ? `${input.user}@${input.host}` : input.host)
    const profileId = input.profileId
    set((state) => ({
      tabs: [
        ...state.tabs,
        {
          id,
          profileId,
          kind: 'ssh',
          title,
          status: 'idle',
          ssh: input,
          startupCommand: input.startupCommand,
          terminalType: input.terminalType,
          encoding: input.encoding,
          reconnectMode: input.reconnectMode,
          reconnectDelayMs: input.reconnectDelayMs,
          restoreOnLaunch: input.restoreOnLaunch,
          createdAt: Date.now(),
          restartNonce: 0,
          color: input.color,
        },
      ],
      activeId: id,
      profiles: stampProfileConnection(state.profiles, profileId),
      groups: state.groups,
      snippets: state.snippets,
      preferences: state.preferences,
    }))
    persistLibrary(libraryFromState(get()))
    return id
  },
  addTabFromProfile: (profileId) => {
    const profile = get().profiles.find((item) => item.id === profileId)
    if (!profile) return null
    if (profile.kind === 'ssh' && profile.ssh) {
      return get().addSshTab({
        ...profile.ssh,
        title: profile.title,
        profileId: profile.id,
        startupCommand: profile.startupCommand,
        color: profile.color,
        terminalType: profile.terminalType,
        encoding: profile.encoding,
        reconnectMode: profile.reconnectMode,
        reconnectDelayMs: profile.reconnectDelayMs,
        restoreOnLaunch: profile.restoreOnLaunch,
      })
    }
    return get().addLocalTab({
      cwd: profile.cwd,
      title: profile.title,
      profileId: profile.id,
      startupCommand: profile.startupCommand,
      color: profile.color,
      terminalType: profile.terminalType,
      encoding: profile.encoding,
      reconnectMode: profile.reconnectMode,
      reconnectDelayMs: profile.reconnectDelayMs,
      restoreOnLaunch: profile.restoreOnLaunch,
    })
  },
  duplicateTab: (id) => {
    const tab = get().tabs.find((item) => item.id === id)
    if (!tab) return null
    if (tab.kind === 'ssh' && tab.ssh) {
      return get().addSshTab({
        ...tab.ssh,
        title: tab.title,
        profileId: tab.profileId,
        startupCommand: tab.startupCommand,
        color: tab.color,
        reconnectMode: tab.reconnectMode,
        reconnectDelayMs: tab.reconnectDelayMs,
        restoreOnLaunch: tab.restoreOnLaunch,
      })
    }
    return get().addLocalTab({
      cwd: tab.cwd,
      title: tab.title,
      profileId: tab.profileId,
      startupCommand: tab.startupCommand,
      color: tab.color,
      terminalType: tab.terminalType,
      encoding: tab.encoding,
      reconnectMode: tab.reconnectMode,
      reconnectDelayMs: tab.reconnectDelayMs,
      restoreOnLaunch: tab.restoreOnLaunch,
    })
  },
  restartTab: (id) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              status: 'idle',
              sessionId: undefined,
              command: undefined,
              pid: undefined,
              exitCode: undefined,
              error: undefined,
              diagnostic: undefined,
              restartNonce: tab.restartNonce + 1,
            }
          : tab,
      ),
    })),
  updateTab: (id, patch) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    })),
  removeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeId = state.activeId === id ? (tabs.at(-1)?.id ?? null) : state.activeId
      persistLibrary(libraryFromState({ ...state, tabs, activeId }))
      return { tabs, activeId }
    }),
  reorderTab: (id, targetIndex) =>
    set((state) => {
      const from = state.tabs.findIndex((tab) => tab.id === id)
      if (from < 0) return {}
      const clamped = Math.max(0, Math.min(state.tabs.length - 1, targetIndex))
      if (clamped === from) return {}
      const tabs = state.tabs.slice()
      const [moved] = tabs.splice(from, 1)
      tabs.splice(clamped, 0, moved)
      persistLibrary(libraryFromState({ ...state, tabs }))
      return { tabs }
    }),
  closeAll: () =>
    set((state) => {
      persistLibrary(libraryFromState({ ...state, tabs: [], activeId: null }))
      return { tabs: [], activeId: null }
    }),
  setActive: (id) =>
    set((state) => {
      const activeId = id && state.tabs.some((tab) => tab.id === id) ? id : null
      persistLibrary(libraryFromState({ ...state, activeId }))
      return { activeId }
    }),
  setProfileSearch: (query) => set({ profileSearch: query }),
  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),
  setProfileSort: (sort) => set({ profileSort: sort }),
  toggleProfileSelection: (profileId) =>
    set((state) => ({
      selectedProfileIds: state.selectedProfileIds.includes(profileId)
        ? state.selectedProfileIds.filter((id) => id !== profileId)
        : [...state.selectedProfileIds, profileId],
    })),
  clearProfileSelection: () => set({ selectedProfileIds: [] }),
  addGroup: (title) => {
    const now = Date.now()
    const group: ShellProfileGroup = {
      id: createId(),
      title: title.trim() || 'New group',
      createdAt: now,
      updatedAt: now,
    }
    set((state) =>
      commitLibrary({
        ...state,
        groups: [...state.groups, group],
      }),
    )
    return group.id
  },
  updateGroup: (id, title) =>
    set((state) =>
      commitLibrary({
        ...state,
        groups: state.groups.map((group) =>
          group.id === id
            ? { ...group, title: title.trim() || group.title, updatedAt: Date.now() }
            : group,
        ),
      }),
    ),
  removeGroup: (id) =>
    set((state) => {
      if (id === DEFAULT_GROUP_ID) return state
      const groups = state.groups.filter((group) => group.id !== id)
      const profiles = state.profiles.map((profile) =>
        profile.groupId === id ? { ...profile, groupId: DEFAULT_GROUP_ID } : profile,
      )
      const activeGroupId = state.activeGroupId === id ? null : state.activeGroupId
      persistLibrary(libraryFromState({ ...state, groups, profiles }))
      return {
        groups,
        profiles,
        activeGroupId,
      }
    }),
  addProfile: (input) => {
    const profile = createProfile(input)
    if (profile.kind === 'ssh' && !profile.ssh) return ''
    set((state) =>
      commitLibrary({
        ...state,
        profiles: [...state.profiles, profile],
      }),
    )
    return profile.id
  },
  updateProfile: (id, patch) =>
    set((state) =>
      commitLibrary({
        profiles: state.profiles.map((profile) => {
          if (profile.id !== id) return profile
          const next = createProfile({
            title: patch.title ?? profile.title,
            kind: patch.kind ?? profile.kind,
            cwd: patch.cwd ?? profile.cwd,
            startupCommand: patch.startupCommand ?? profile.startupCommand,
            terminalType: patch.terminalType ?? profile.terminalType,
            encoding: patch.encoding ?? profile.encoding,
            ssh: patch.ssh ?? profile.ssh,
            tags: patch.tags ?? profile.tags,
            color: patch.color ?? profile.color,
            groupId: patch.groupId ?? profile.groupId,
            favorite: patch.favorite ?? profile.favorite,
            reconnectMode: patch.reconnectMode ?? profile.reconnectMode,
            reconnectDelayMs: patch.reconnectDelayMs ?? profile.reconnectDelayMs,
            restoreOnLaunch: patch.restoreOnLaunch ?? profile.restoreOnLaunch,
          })
          return {
            ...profile,
            ...next,
            id: profile.id,
            createdAt: profile.createdAt,
            updatedAt: Date.now(),
            lastConnectedAt: profile.lastConnectedAt,
            connectionCount: profile.connectionCount,
          }
        }),
        groups: state.groups,
        snippets: state.snippets,
        preferences: state.preferences,
        tabs: state.tabs,
        activeId: state.activeId,
        activity: state.activity,
        commandHistory: state.commandHistory,
      }),
    ),
  removeProfile: (id) =>
    set((state) => {
      const profiles = state.profiles.filter((profile) => profile.id !== id)
      const selectedProfileIds = state.selectedProfileIds.filter((profileId) => profileId !== id)
      persistLibrary(libraryFromState({ ...state, profiles }))
      return { profiles, selectedProfileIds }
    }),
  removeProfiles: (ids) =>
    set((state) => {
      const profiles = state.profiles.filter((profile) => !ids.includes(profile.id))
      const selectedProfileIds = state.selectedProfileIds.filter(
        (profileId) => !ids.includes(profileId),
      )
      persistLibrary(libraryFromState({ ...state, profiles }))
      return { profiles, selectedProfileIds }
    }),
  duplicateProfile: (id) => {
    const profile = get().profiles.find((item) => item.id === id)
    if (!profile) return null
    const duplicate = {
      ...profile,
      id: createId(),
      title: `${profile.title} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastConnectedAt: undefined,
      connectionCount: 0,
    }
    set((state) =>
      commitLibrary({
        ...state,
        profiles: [...state.profiles, duplicate],
      }),
    )
    return duplicate.id
  },
  toggleFavorite: (id) =>
    set((state) =>
      commitLibrary({
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === id
            ? { ...profile, favorite: !profile.favorite, updatedAt: Date.now() }
            : profile,
        ),
      }),
    ),
  moveProfilesToGroup: (ids, groupId) =>
    set((state) => {
      const profiles = state.profiles.map((profile) =>
        ids.includes(profile.id)
          ? { ...profile, groupId: groupId ?? DEFAULT_GROUP_ID, updatedAt: Date.now() }
          : profile,
      )
      persistLibrary(libraryFromState({ ...state, profiles }))
      return { profiles, selectedProfileIds: [] }
    }),
  touchProfile: (id) =>
    set((state) =>
      commitLibrary({
        ...state,
        profiles: stampProfileConnection(state.profiles, id),
      }),
    ),
  setPreferences: (patch) =>
    set((state) => {
      const preferences = normalizePreferences({ ...state.preferences, ...patch })
      return commitLibrary({ ...state, preferences })
    }),
  exportLibrary: () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    library: libraryFromState(get()),
  }),
  importLibrary: (value) => {
    try {
      const snapshot = normalizeLibrarySnapshot(
        typeof value === 'string' ? JSON.parse(value) : value,
      )
      set({
        tabs: snapshot.tabs,
        activeId: snapshot.activeId,
        profiles: snapshot.profiles,
        groups: snapshot.groups,
        snippets: snapshot.snippets,
        preferences: snapshot.preferences,
        activeGroupId: null,
        selectedProfileIds: [],
        activity: snapshot.activity,
        commandHistory: snapshot.commandHistory,
      })
      persistLibrary(snapshot)
      return true
    } catch {
      return false
    }
  },
  importSshConfig: (content) => {
    let imported = 0
    set((state) => {
      const now = Date.now()
      const existingGroup = state.groups.find((group) => group.title === SSH_CONFIG_GROUP_TITLE)
      const sshConfigGroup =
        existingGroup ??
        ({
          id: createId(),
          title: SSH_CONFIG_GROUP_TITLE,
          createdAt: now,
          updatedAt: now,
        } satisfies ShellProfileGroup)
      const inputs = parseSshConfigProfiles(content, sshConfigGroup.id)
      const profiles = [...state.profiles]
      for (const input of inputs) {
        const ssh = input.ssh
        if (!ssh) continue
        const duplicate = profiles.some(
          (profile) =>
            profile.kind === 'ssh' &&
            profile.ssh?.host === ssh.host &&
            profile.ssh?.user === ssh.user &&
            profile.ssh?.port === ssh.port,
        )
        if (duplicate) continue
        const profile = createProfile(input)
        if (profile.kind === 'ssh' && profile.ssh) {
          profiles.push(profile)
          imported += 1
        }
      }
      const groups = existingGroup ? state.groups : [...state.groups, sshConfigGroup]
      const activity =
        imported > 0
          ? [
              {
                id: createId(),
                kind: 'import' as const,
                title: 'SSH config imported',
                message: `${imported} profile${imported === 1 ? '' : 's'} imported from SSH config.`,
                at: now,
                severity: 'success' as const,
              },
              ...state.activity,
            ].slice(0, MAX_ACTIVITY_ITEMS)
          : state.activity
      persistLibrary(libraryFromState({ ...state, groups, profiles, activity }))
      return { groups, profiles, activity }
    })
    return imported
  },
  recordActivity: (input) =>
    set((state) => {
      const activity = [
        {
          id: createId(),
          at: input.at ?? Date.now(),
          ...input,
        },
        ...state.activity,
      ].slice(0, MAX_ACTIVITY_ITEMS)
      persistLibrary(libraryFromState({ ...state, activity }))
      return { activity }
    }),
  clearActivity: () =>
    set((state) => {
      persistLibrary(libraryFromState({ ...state, activity: [] }))
      return { activity: [] }
    }),
  recordCommand: (input) =>
    set((state) => {
      const command = input.command.trim()
      if (!command) return state
      const commandHistory = [
        {
          id: createId(),
          at: input.at ?? Date.now(),
          command,
          title: input.title,
          tabId: input.tabId,
          profileId: input.profileId,
        },
        ...state.commandHistory.filter((item) => item.command !== command),
      ].slice(0, MAX_COMMAND_HISTORY_ITEMS)
      persistLibrary(libraryFromState({ ...state, commandHistory }))
      return { commandHistory }
    }),
  clearCommandHistory: () =>
    set((state) => {
      persistLibrary(libraryFromState({ ...state, commandHistory: [] }))
      return { commandHistory: [] }
    }),
  addSnippet: (input) => {
    const snippet = createSnippet(input)
    if (!snippet.command) return ''
    set((state) =>
      commitLibrary({
        ...state,
        snippets: [...state.snippets, snippet],
      }),
    )
    return snippet.id
  },
  updateSnippet: (id, patch) =>
    set((state) =>
      commitLibrary({
        ...state,
        snippets: state.snippets.map((snippet) =>
          snippet.id === id
            ? {
                ...snippet,
                title: patch.title?.trim() || snippet.title,
                command: patch.command?.trim() || snippet.command,
                updatedAt: Date.now(),
              }
            : snippet,
        ),
      }),
    ),
  removeSnippet: (id) =>
    set((state) =>
      commitLibrary({
        ...state,
        snippets: state.snippets.filter((snippet) => snippet.id !== id),
      }),
    ),
  resetSnippets: () =>
    set((state) =>
      commitLibrary({
        ...state,
        snippets: defaultSnippets(),
      }),
    ),
}))

export function resetShellStoreForTests(): void {
  useShellStore.setState({
    tabs: [],
    activeId: null,
    profiles: [],
    groups: defaultGroups(),
    snippets: defaultSnippets(),
    preferences: DEFAULT_PREFERENCES,
    profileSearch: '',
    activeGroupId: null,
    profileSort: 'recent',
    selectedProfileIds: [],
    activity: [],
    commandHistory: [],
  })
}
