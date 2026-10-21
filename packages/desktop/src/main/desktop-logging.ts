import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type DesktopLogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal'

export interface DesktopLogOptions {
  id?: string
  timestamp?: string
  severity?: DesktopLogSeverity
  sessionId?: string
  runId?: string
  requestId?: string
  processType?: 'main' | 'renderer' | 'preload'
}

export interface DesktopErrorDetail {
  name?: string
  message: string
  stack?: string
}

interface PendingDesktopLogWrite {
  entry: string
  logPath: string
  result: { id: string; timestamp: string; logPath: string }
  resolve: (result: { id: string; timestamp: string; logPath: string }) => void
  settled: boolean
}

const REDACT_KEY =
  /(authorization|api[_-]?key|password|secret|token|credential|private[_-]?key|certificate|cookie)/i
const MAX_STRING_LENGTH = 12_000
const MAX_ARRAY_ITEMS = 40
const MAX_OBJECT_KEYS = 80
const MAX_DEPTH = 6
const DEFAULT_LOG_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_LOG_MAX_FILES = 5
const MIN_LOG_MAX_BYTES = 64 * 1024
const MAX_LOG_MAX_BYTES = 64 * 1024 * 1024
const MAX_LOG_FILES = 20
const DEFAULT_LOG_QUEUE_CAPACITY = 512
const MIN_LOG_QUEUE_CAPACITY = 16
const MAX_LOG_QUEUE_CAPACITY = 10_000
const DESKTOP_LOG_BATCH_WINDOW_MS = 8

let pendingDesktopLogWrites: PendingDesktopLogWrite[] = []
let desktopLogFlushTimer: ReturnType<typeof setTimeout> | null = null
let desktopLogFlushRunning = false
let desktopLogOutstandingWrites = 0
let desktopLogDroppedWrites = 0

function safeAppVersion(): string {
  try {
    return typeof app.getVersion === 'function' ? app.getVersion() : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function desktopLogPath(): string | null {
  try {
    return join(app.getPath('userData'), 'logs', 'desktop-main.log')
  } catch {
    return null
  }
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function desktopLogMaxBytes(): number {
  return parseBoundedInteger(
    process.env.SEPILOTD_DESKTOP_LOG_MAX_BYTES,
    DEFAULT_LOG_MAX_BYTES,
    MIN_LOG_MAX_BYTES,
    MAX_LOG_MAX_BYTES,
  )
}

export function desktopLogMaxFiles(): number {
  return parseBoundedInteger(
    process.env.SEPILOTD_DESKTOP_LOG_MAX_FILES,
    DEFAULT_LOG_MAX_FILES,
    1,
    MAX_LOG_FILES,
  )
}

function desktopLogQueueCapacity(): number {
  return parseBoundedInteger(
    process.env.SEPILOTD_DESKTOP_LOG_QUEUE_CAPACITY,
    DEFAULT_LOG_QUEUE_CAPACITY,
    MIN_LOG_QUEUE_CAPACITY,
    MAX_LOG_QUEUE_CAPACITY,
  )
}

function desktopRotatedLogPath(logPath: string, index: number): string {
  return join(dirname(logPath), `desktop-main.${index}.log`)
}

export function desktopLogPaths(maxFiles = desktopLogMaxFiles()): string[] | null {
  const logPath = desktopLogPath()
  if (!logPath) return null
  return [
    logPath,
    ...Array.from({ length: Math.max(0, maxFiles - 1) }, (_value, index) =>
      desktopRotatedLogPath(logPath, index + 1),
    ),
  ]
}

async function rotateDesktopLogsIfNeeded(logPath: string, nextWriteBytes: number): Promise<void> {
  const maxBytes = desktopLogMaxBytes()
  let currentSize = 0
  try {
    currentSize = (await stat(logPath)).size
  } catch {
    return
  }
  if (currentSize + nextWriteBytes <= maxBytes) return

  const maxFiles = desktopLogMaxFiles()
  if (maxFiles <= 1) {
    await rm(logPath, { force: true })
    return
  }

  const oldestPath = desktopRotatedLogPath(logPath, maxFiles - 1)
  await rm(oldestPath, { force: true })

  for (let index = maxFiles - 2; index >= 1; index -= 1) {
    const source = desktopRotatedLogPath(logPath, index)
    const target = desktopRotatedLogPath(logPath, index + 1)
    try {
      await rm(target, { force: true })
      await rename(source, target)
    } catch {
    }
  }

  try {
    await rm(desktopRotatedLogPath(logPath, 1), { force: true })
    await rename(logPath, desktopRotatedLogPath(logPath, 1))
  } catch {
  }
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH - 1)}...` : value
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) return '[max-depth]'
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return truncate(value)
  if (typeof value === 'bigint' || typeof value === 'symbol') return String(value)
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`)
    }
    return items
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>)
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      output[key] = REDACT_KEY.test(key) ? '[redacted]' : sanitizeValue(item, depth + 1)
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      output.__truncated_keys__ = entries.length - MAX_OBJECT_KEYS
    }
    return output
  }
  if (typeof value === 'undefined') return null
  return String(value)
}

async function flushDesktopLogWrites(
  writes: PendingDesktopLogWrite[],
): Promise<void> {
  const writesByPath = new Map<string, PendingDesktopLogWrite[]>()
  for (const write of writes) {
    const group = writesByPath.get(write.logPath)
    if (group) group.push(write)
    else writesByPath.set(write.logPath, [write])
  }

  for (const [logPath, group] of writesByPath) {
    const entry = group.map((write) => write.entry).join('')
    try {
      await mkdir(dirname(logPath), { recursive: true })
      await rotateDesktopLogsIfNeeded(
        logPath,
        Buffer.byteLength(entry, 'utf-8'),
      )
      await appendFile(logPath, entry, 'utf-8')
    } catch {
    }
  }
}

function settleDesktopLogWrite(write: PendingDesktopLogWrite): void {
  if (write.settled) return
  write.settled = true
  desktopLogOutstandingWrites = Math.max(0, desktopLogOutstandingWrites - 1)
  write.resolve(write.result)
}

function shouldWarnAboutDroppedWrite(dropped: number): boolean {
  return dropped > 0 && Number.isInteger(Math.log2(dropped))
}

function recordDroppedDesktopLogWrite(capacity: number): void {
  desktopLogDroppedWrites = Math.min(
    Number.MAX_SAFE_INTEGER,
    desktopLogDroppedWrites + 1,
  )
  if (!shouldWarnAboutDroppedWrite(desktopLogDroppedWrites)) return
  console.warn(
    `[desktop-logging] bounded queue full; dropped ${desktopLogDroppedWrites} log event(s) (capacity ${capacity})`,
  )
}

function scheduleDesktopLogFlush(delayMs = DESKTOP_LOG_BATCH_WINDOW_MS): void {
  if (
    desktopLogFlushRunning ||
    desktopLogFlushTimer ||
    pendingDesktopLogWrites.length === 0
  ) {
    return
  }
  desktopLogFlushTimer = setTimeout(() => {
    desktopLogFlushTimer = null
    void runDesktopLogFlush()
  }, delayMs)
}

async function runDesktopLogFlush(): Promise<void> {
  if (desktopLogFlushRunning || pendingDesktopLogWrites.length === 0) return
  desktopLogFlushRunning = true
  const batch = pendingDesktopLogWrites
  pendingDesktopLogWrites = []
  try {
    await flushDesktopLogWrites(batch)
  } catch {
  } finally {
    for (const write of batch) settleDesktopLogWrite(write)
    desktopLogFlushRunning = false
    scheduleDesktopLogFlush(0)
  }
}

function enqueueDesktopLogWrite(
  input: Omit<PendingDesktopLogWrite, 'resolve' | 'settled'>,
): Promise<PendingDesktopLogWrite['result']> {
  return new Promise((resolve) => {
    const capacity = desktopLogQueueCapacity()
    if (desktopLogOutstandingWrites >= capacity) {
      recordDroppedDesktopLogWrite(capacity)
      resolve(input.result)
      return
    }

    desktopLogOutstandingWrites += 1
    pendingDesktopLogWrites.push({ ...input, resolve, settled: false })
    scheduleDesktopLogFlush()
  })
}

export function sanitizeDesktopLogDetail(
  detail?: Record<string, unknown>,
): Record<string, unknown> | null {
  return sanitizeValue(detail ?? null) as Record<string, unknown> | null
}

export function describeUnknownError(error: unknown): DesktopErrorDetail {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
}

export async function logDesktopEvent(
  eventType: string,
  detail?: Record<string, unknown>,
  options: DesktopLogOptions = {},
): Promise<{ id: string; timestamp: string; logPath: string | null }> {
  const id = options.id ?? randomUUID()
  const timestamp = options.timestamp ?? new Date().toISOString()
  const logPath = desktopLogPath()

  if (!logPath) return { id, timestamp, logPath }

  const line = JSON.stringify({
    id,
    schemaVersion: 1,
    timestamp,
    severity: options.severity ?? 'info',
    source: 'desktop-main',
    surface: 'desktop',
    process: options.processType ?? 'main',
    eventType,
    message: eventType,
    sessionId: options.sessionId,
    runId: options.runId,
    requestId: options.requestId,
    app: {
      version: safeAppVersion(),
      isPackaged: app.isPackaged,
    },
    runtime: {
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron ?? null,
      chrome: process.versions.chrome ?? null,
      node: process.versions.node,
    },
    detail: sanitizeDesktopLogDetail(detail),
  })
  const result = { id, timestamp, logPath }
  return enqueueDesktopLogWrite({
    entry: `${line}\n`,
    logPath,
    result,
  })
}
