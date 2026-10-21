import type { Dirent } from 'node:fs'
import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { resolveLocalCommandLaunch } from './local-command'

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const IDLE_GAP_MS = 5 * 60 * 1000
const MIN_SPAN_MS = 60 * 1000
const MAX_FILE_BYTES = 80 * 1024 * 1024
const VERSION_COMMAND_TIMEOUT_MS = 2500
const VERSION_OUTPUT_MAX_BYTES = 64 * 1024

const execFileAsync = promisify(execFile)

export interface AiToolUsage {
  id: string
  name: string
  installed: boolean
  version: string | null
  usageToday: number
  usageWeek: number
  sessions: number
  lastUsed: number | null
  usageWindowResetAt: number | null
  weekWindowResetAt: number | null
  usageWindow: AiUsageWindow | null
  weekWindow: AiUsageWindow | null
}

export interface AiUsageReport {
  tools: AiToolUsage[]
  collectedAt: number
  source: 'host'
}

export interface AiUsageWindow {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  source: 'codex-rate-limit' | 'local-activity-estimate'
}

interface TimestampReport {
  timestamps: number[]
  usageWindow?: AiUsageWindow | null
  weekWindow?: AiUsageWindow | null
}

function clusterActiveMinutes(timestamps: number[], fromMs: number, toMs: number): number {
  const ts = timestamps.filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b)
  if (ts.length === 0) return 0
  let total = 0
  let spanStart = ts[0]
  let prev = ts[0]
  for (let i = 1; i < ts.length; i += 1) {
    if (ts[i] - prev > IDLE_GAP_MS) {
      total += Math.max(prev - spanStart, MIN_SPAN_MS)
      spanStart = ts[i]
    }
    prev = ts[i]
  }
  total += Math.max(prev - spanStart, MIN_SPAN_MS)
  return Math.round(total / 60000)
}

function countSpans(timestamps: number[], fromMs: number, toMs: number): number {
  const ts = timestamps.filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b)
  if (ts.length === 0) return 0
  let spans = 1
  for (let i = 1; i < ts.length; i += 1) {
    if (ts[i] - ts[i - 1] > IDLE_GAP_MS) spans += 1
  }
  return spans
}

function latestTimestamp(timestamps: number[]): number | null {
  let latest: number | null = null
  for (const timestamp of timestamps) {
    if (!Number.isFinite(timestamp)) continue
    if (latest === null || timestamp > latest) latest = timestamp
  }
  return latest
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function collectRecentFiles(
  root: string,
  weekAgo: number,
  accept: (name: string) => boolean,
): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(path)
          return
        }
        if (!entry.isFile() || !accept(entry.name)) return
        try {
          const info = await stat(path)
          if (info.mtimeMs >= weekAgo && info.size <= MAX_FILE_BYTES) out.push(path)
        } catch {
        }
      }),
    )
  }
  await walk(root)
  return out
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value < 10_000_000_000 ? value * 1000 : value
}

function parseCodexWindow(value: unknown): AiUsageWindow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown }
  const usedPercent = Number(row.used_percent)
  const windowMinutes = Number(row.window_minutes)
  const resetSeconds = Number(row.resets_at)
  if (!Number.isFinite(usedPercent) || !Number.isFinite(windowMinutes)) return null
  return {
    usedPercent,
    windowMinutes,
    resetsAt: Number.isFinite(resetSeconds) ? resetSeconds * 1000 : null,
    source: 'codex-rate-limit',
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function localActivityWindow(
  activeMinutes: number,
  windowMinutes: number,
  resetsAt: number | null,
): AiUsageWindow {
  const minutes = Math.max(0, activeMinutes)
  const usedPercent = clampPercent((minutes / windowMinutes) * 100)
  return {
    usedPercent: minutes > 0 ? Math.max(1, usedPercent) : 0,
    windowMinutes,
    resetsAt,
    source: 'local-activity-estimate',
  }
}

function extractVersion(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const semantic = /\bv?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?\b/u
  for (const line of lines) {
    const match = line.match(semantic)
    if (match) return match[0].replace(/^v/iu, '')
  }
  return lines[0] ? lines[0].slice(0, 48) : null
}

async function commandOutput(command: readonly string[]): Promise<string | null> {
  const launch = resolveLocalCommandLaunch(command)
  if (!launch.file) return null
  try {
    const result = await execFileAsync(launch.file, launch.args, {
      encoding: 'utf8',
      timeout: VERSION_COMMAND_TIMEOUT_MS,
      maxBuffer: VERSION_OUTPUT_MAX_BYTES,
      windowsHide: true,
    })
    return `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  } catch {
    return null
  }
}

async function collectToolVersion(
  commands: readonly (readonly string[])[],
): Promise<string | null> {
  for (const command of commands) {
    const output = await commandOutput(command)
    const version = output ? extractVersion(output) : null
    if (version) return version
  }
  return null
}

async function collectClaudeTimestamps(weekAgo: number): Promise<number[]> {
  const out: number[] = []
  const root = join(homedir(), '.claude', 'projects')
  let projectDirs
  try {
    projectDirs = await readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const fp = join(dir, file)
      let info
      try {
        info = await stat(fp)
      } catch {
        continue
      }
      if (info.mtimeMs < weekAgo) continue
      if (info.size > MAX_FILE_BYTES) continue
      let content: string
      try {
        content = await readFile(fp, 'utf8')
      } catch {
        continue
      }
      for (const line of content.split('\n')) {
        if (!line || line.indexOf('"timestamp"') === -1) continue
        try {
          const obj = JSON.parse(line) as { timestamp?: string }
          if (!obj.timestamp) continue
          const t = Date.parse(obj.timestamp)
          if (!Number.isNaN(t) && t >= weekAgo) out.push(t)
        } catch {
        }
      }
    }
  }
  return out
}

async function collectCodexUsage(weekAgo: number): Promise<TimestampReport> {
  const out: number[] = []
  let usageWindow: AiUsageWindow | null = null
  let weekWindow: AiUsageWindow | null = null
  const file = join(homedir(), '.codex', 'history.jsonl')
  let content: string
  try {
    content = await readFile(file, 'utf8')
  } catch {
    content = ''
  }
  for (const line of content.split('\n')) {
    if (!line) continue
    try {
      const obj = JSON.parse(line) as { ts?: number }
      if (typeof obj.ts !== 'number') continue
      const t = obj.ts * 1000
      if (t >= weekAgo) out.push(t)
    } catch {
    }
  }
  const sessionFiles = await collectRecentFiles(
    join(homedir(), '.codex', 'sessions'),
    weekAgo,
    (name) => name.endsWith('.jsonl'),
  )
  let latestRateLimitAt = 0
  for (const sessionFile of sessionFiles) {
    let sessionContent: string
    try {
      sessionContent = await readFile(sessionFile, 'utf8')
    } catch {
      continue
    }
    for (const line of sessionContent.split('\n')) {
      if (!line) continue
      try {
        const obj = JSON.parse(line) as {
          timestamp?: string
          payload?: {
            rate_limits?: {
              primary?: unknown
              secondary?: unknown
            }
          }
        }
        const t = parseTimestamp(obj.timestamp)
        if (t != null && t >= weekAgo) out.push(t)
        const primary = parseCodexWindow(obj.payload?.rate_limits?.primary)
        const secondary = parseCodexWindow(obj.payload?.rate_limits?.secondary)
        if ((primary || secondary) && (t ?? 0) >= latestRateLimitAt) {
          latestRateLimitAt = t ?? latestRateLimitAt
          if (primary) usageWindow = primary
          if (secondary) weekWindow = secondary
        }
      } catch {
      }
    }
  }
  return { timestamps: out, usageWindow, weekWindow }
}

async function collectGeminiTimestamps(weekAgo: number): Promise<number[]> {
  const out: number[] = []
  const tmp = join(homedir(), '.gemini', 'tmp')
  let projects: Dirent[]
  try {
    projects = await readdir(tmp, { withFileTypes: true })
  } catch {
    projects = []
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const chats = join(tmp, project.name, 'chats')
    let files: string[]
    try {
      files = await readdir(chats)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const info = await stat(join(chats, file))
        if (info.mtimeMs >= weekAgo) out.push(info.mtimeMs)
      } catch {
      }
    }
  }
  const antigravityFiles = await collectRecentFiles(
    join(homedir(), '.gemini', 'antigravity'),
    weekAgo,
    (name) => name.endsWith('.jsonl') || name.endsWith('.log') || name.endsWith('.json'),
  )
  for (const file of antigravityFiles) {
    try {
      const info = await stat(file)
      if (info.mtimeMs >= weekAgo) out.push(info.mtimeMs)
    } catch {
    }
    if (!file.endsWith('.jsonl')) continue
    let content: string
    try {
      content = await readFile(file, 'utf8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      if (!line) continue
      try {
        const obj = JSON.parse(line) as { timestamp?: string; created_at?: string }
        const t = parseTimestamp(obj.timestamp ?? obj.created_at)
        if (t != null && t >= weekAgo) out.push(t)
      } catch {
      }
    }
  }
  return out
}

async function buildToolUsage(
  id: string,
  name: string,
  installed: boolean,
  version: string | null,
  timestamps: number[],
  now: number,
  windows: Pick<TimestampReport, 'usageWindow' | 'weekWindow'> = {},
): Promise<AiToolUsage> {
  const fiveHoursAgo = now - FIVE_HOURS_MS
  const weekAgo = now - WEEK_MS
  const lastUsed = latestTimestamp(timestamps)
  const fiveHourTimestamps = timestamps
    .filter((t) => t >= fiveHoursAgo && t <= now)
    .sort((a, b) => a - b)
  const weekTimestamps = timestamps.filter((t) => t >= weekAgo && t <= now).sort((a, b) => a - b)
  const usageWindowResetAt =
    fiveHourTimestamps.length > 0
      ? fiveHourTimestamps[0] + FIVE_HOURS_MS
      : lastUsed === null
        ? null
        : lastUsed + FIVE_HOURS_MS
  const weekWindowResetAt = weekTimestamps.length > 0 ? weekTimestamps[0] + WEEK_MS : null
  const usageToday = clusterActiveMinutes(timestamps, fiveHoursAgo, now)
  const usageWeek = clusterActiveMinutes(timestamps, weekAgo, now)
  return {
    id,
    name,
    installed: installed || version !== null,
    version,
    usageToday,
    usageWeek,
    sessions: countSpans(timestamps, weekAgo, now),
    lastUsed,
    usageWindowResetAt: windows.usageWindow?.resetsAt ?? usageWindowResetAt,
    weekWindowResetAt: windows.weekWindow?.resetsAt ?? weekWindowResetAt,
    usageWindow: windows.usageWindow ?? localActivityWindow(usageToday, 5 * 60, usageWindowResetAt),
    weekWindow: windows.weekWindow ?? localActivityWindow(usageWeek, 7 * 24 * 60, weekWindowResetAt),
  }
}

export async function collectAiUsage(): Promise<AiUsageReport> {
  const now = Date.now()
  const weekAgo = now - WEEK_MS
  const home = homedir()

  const [
    claudeInstalled,
    codexInstalled,
    geminiInstalled,
    claudeTs,
    codexUsage,
    geminiTs,
    claudeVersion,
    codexVersion,
    geminiVersion,
  ] = await Promise.all([
    dirExists(join(home, '.claude')),
    pathExists(join(home, '.codex')),
    dirExists(join(home, '.gemini')),
    collectClaudeTimestamps(weekAgo),
    collectCodexUsage(weekAgo),
    collectGeminiTimestamps(weekAgo),
    collectToolVersion([
      ['claude.cmd', '--version'],
      ['claude', '--version'],
    ]),
    collectToolVersion([
      ['codex.cmd', '--version'],
      ['codex', '--version'],
    ]),
    collectToolVersion([
      ['gemini.cmd', '--version'],
      ['gemini', '--version'],
    ]),
  ])

  const tools = await Promise.all([
    buildToolUsage('claude', 'Claude', claudeInstalled, claudeVersion, claudeTs, now),
    buildToolUsage(
      'codex',
      'Codex CLI',
      codexInstalled,
      codexVersion,
      codexUsage.timestamps,
      now,
      codexUsage,
    ),
    buildToolUsage('gemini', 'Gemini CLI', geminiInstalled, geminiVersion, geminiTs, now),
  ])

  return { tools, collectedAt: now, source: 'host' }
}
