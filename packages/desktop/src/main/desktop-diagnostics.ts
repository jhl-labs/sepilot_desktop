import { randomUUID } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { app, dialog, type BrowserWindow } from 'electron'
import {
  describeUnknownError,
  desktopLogPaths,
  logDesktopEvent,
  sanitizeDesktopLogDetail,
} from './desktop-logging'
import type {
  DesktopDiagnosticsExportInput,
  DesktopDiagnosticsExportResult,
} from '@sepilotd/api-client'

const DIAGNOSTIC_SCHEMA_VERSION = 1
const MAX_LOG_BYTES = 2 * 1024 * 1024
const SENSITIVE_HEADER_PATTERN = /\b(Authorization|Cookie)\s*:\s*[^\r\n]+/giu
const SECRET_ASSIGNMENT_PATTERN =
  /\b(authorization|api[_-]?key|password|secret|token|credential|private[_-]?key|certificate|cookie)(\s*[:=]\s*)(["']?)[^\s"',}]{4,}\3/giu
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
    '[redacted-private-key]',
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu, 'Bearer [redacted]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/gu, 'sk-[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/gu, 'ghp_[redacted]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu, 'xoxb-[redacted]'],
]

interface DiagnosticArchiveEntry {
  name: string
  content: Buffer
}

export interface CreateDesktopDiagnosticsArchiveOptions {
  id?: string
  generatedAt?: string
  logPath?: string | null
  logPaths?: readonly string[] | null
  collectDaemonHealthReport?: () => Promise<string>
}

export interface DesktopDiagnosticsArchive {
  id: string
  filename: string
  generatedAt: string
  buffer: Buffer
  includedFiles: string[]
  sizeBytes: number
}

function safeAppVersion(): string {
  try {
    return typeof app.getVersion === 'function' ? app.getVersion() : 'unknown'
  } catch {
    return 'unknown'
  }
}

function diagnosticFilename(generatedAt: string): string {
  return `sepilotd-diagnostics-${generatedAt.replace(/[:.]/gu, '-')}.tar.gz`
}

function textEntry(name: string, content: string): DiagnosticArchiveEntry {
  return {
    name,
    content: Buffer.from(content, 'utf-8'),
  }
}

function redactDiagnosticText(value: string): string {
  let redacted = value.replace(
    SENSITIVE_HEADER_PATTERN,
    (_match, key: string) => `${key}: [redacted]`,
  )
  redacted = redacted.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, key: string, separator: string, quote: string) =>
      `${key}${separator}${quote}[redacted]${quote}`,
  )
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, replacement)
  }
  return redacted
}

function sanitizeJsonLogLine(line: string): string | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const sanitized = sanitizeDesktopLogDetail(parsed as Record<string, unknown>)
    return redactDiagnosticText(JSON.stringify(sanitized))
  } catch {
    return null
  }
}

export function sanitizeDiagnosticLogText(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => {
      if (!line.trim()) return line
      return sanitizeJsonLogLine(line) ?? redactDiagnosticText(line)
    })
    .join('\n')
}

async function readRecentTextFile(path: string, maxBytes: number): Promise<{
  content: string
  originalBytes: number
  truncated: boolean
}> {
  const file = await stat(path)
  const raw = await readFile(path)
  const truncated = raw.byteLength > maxBytes
  const selected = truncated ? raw.subarray(raw.byteLength - maxBytes) : raw
  const prefix = truncated
    ? `[truncated: showing last ${maxBytes} of ${raw.byteLength} bytes]\n`
    : ''
  return {
    content: `${prefix}${selected.toString('utf-8')}`,
    originalBytes: file.size,
    truncated,
  }
}

function writeAscii(buffer: Buffer, value: string, offset: number, length: number): void {
  buffer.write(value.slice(0, length), offset, length, 'ascii')
}

function writeOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  const octal = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, '0')
  writeAscii(buffer, `${octal}\0`, offset, length)
}

function tarHeader(entry: DiagnosticArchiveEntry): Buffer {
  if (entry.name.length > 100) {
    throw new Error(`Diagnostic archive entry name is too long: ${entry.name}`)
  }
  const header = Buffer.alloc(512)
  writeAscii(header, entry.name, 0, 100)
  writeOctal(header, 0o644, 100, 8)
  writeOctal(header, 0, 108, 8)
  writeOctal(header, 0, 116, 8)
  writeOctal(header, entry.content.byteLength, 124, 12)
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12)
  header.fill(0x20, 148, 156)
  header[156] = '0'.charCodeAt(0)
  writeAscii(header, 'ustar', 257, 6)
  writeAscii(header, '00', 263, 2)

  let checksum = 0
  for (const byte of header) checksum += byte
  const checksumText = checksum.toString(8).padStart(6, '0')
  writeAscii(header, checksumText, 148, 6)
  header[154] = 0
  header[155] = 0x20
  return header
}

function createTarGzip(entries: DiagnosticArchiveEntry[]): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    chunks.push(tarHeader(entry))
    chunks.push(entry.content)
    const remainder = entry.content.byteLength % 512
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

function normalizeDiagnosticsInput(input: unknown): DesktopDiagnosticsExportInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const value = input as Record<string, unknown>
  const pickString = (key: string): string | undefined => {
    const candidate = value[key]
    if (typeof candidate !== 'string') return undefined
    const trimmed = candidate.trim()
    return trimmed ? trimmed.slice(0, 240) : undefined
  }
  return {
    reportId: pickString('reportId'),
    requestId: pickString('requestId'),
    sessionId: pickString('sessionId'),
    runId: pickString('runId'),
    includeHealthReport:
      typeof value.includeHealthReport === 'boolean' ? value.includeHealthReport : undefined,
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function selectDesktopLogPaths(options: CreateDesktopDiagnosticsArchiveOptions): string[] {
  if (options.logPaths !== undefined) {
    return options.logPaths?.filter((path) => path.trim()) ?? []
  }
  if (options.logPath !== undefined) {
    return options.logPath ? [options.logPath] : []
  }
  return desktopLogPaths() ?? []
}

export async function createDesktopDiagnosticsArchive(
  rawInput: DesktopDiagnosticsExportInput = {},
  options: CreateDesktopDiagnosticsArchiveOptions = {},
): Promise<DesktopDiagnosticsArchive> {
  const input = normalizeDiagnosticsInput(rawInput)
  const id = options.id ?? randomUUID()
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const selectedLogPaths = selectDesktopLogPaths(options)
  const entries: DiagnosticArchiveEntry[] = [
    textEntry(
      'README.txt',
      [
        'sepilotd desktop diagnostics bundle',
        '',
        'Attach this archive to an incident report. It intentionally includes desktop diagnostic logs and runtime metadata only.',
        'It does not include .env files, user configuration, credential stores, session files, memory databases, or security token files.',
        '',
      ].join('\n'),
    ),
  ]
  const files: Array<Record<string, unknown>> = []

  for (const selectedLogPath of selectedLogPaths) {
    const entryName = basename(selectedLogPath)
    try {
      const log = await readRecentTextFile(selectedLogPath, MAX_LOG_BYTES)
      const content = sanitizeDiagnosticLogText(log.content)
      entries.push(textEntry(entryName, content.endsWith('\n') ? content : `${content}\n`))
      files.push({
        name: entryName,
        source: selectedLogPath,
        originalBytes: log.originalBytes,
        includedBytes: Buffer.byteLength(content, 'utf-8'),
        truncated: log.truncated,
      })
    } catch (error) {
      if (isMissingFileError(error)) continue
      const content = JSON.stringify(
        {
          message: 'Desktop log was not available.',
          logPath: selectedLogPath,
          error: describeUnknownError(error),
        },
        null,
        2,
      )
      const errorEntryName = `${entryName}.error.json`
      entries.push(textEntry(errorEntryName, redactDiagnosticText(content)))
      files.push({ name: errorEntryName, source: selectedLogPath, available: false })
    }
  }

  if (input.includeHealthReport !== false && options.collectDaemonHealthReport) {
    try {
      const report = await options.collectDaemonHealthReport()
      entries.push(textEntry('daemon-health.md', redactDiagnosticText(report)))
      files.push({ name: 'daemon-health.md', source: 'daemon:/api/v1/health/export' })
    } catch (error) {
      const content = JSON.stringify(
        {
          message: 'Daemon health report was not available.',
          error: describeUnknownError(error),
        },
        null,
        2,
      )
      entries.push(textEntry('daemon-health-error.json', redactDiagnosticText(content)))
      files.push({ name: 'daemon-health-error.json', source: 'daemon:/api/v1/health/export' })
    }
  }

  const manifest = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    id,
    generatedAt,
    trace: {
      reportId: input.reportId,
      requestId: input.requestId,
      sessionId: input.sessionId,
      runId: input.runId,
    },
    app: {
      name: app.name,
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
    privacy: {
      redacted: true,
      included: files.map((file) => file.name),
      excluded: [
        '.env and package manager credential files',
        'desktop settings and OAuth tokens',
        '~/.sepilotd/security',
        '~/.sepilotd/sessions',
        '~/.sepilotd/memory',
        'release artifacts, source maps, debug dumps, and crash dumps',
      ],
    },
    files,
  }

  entries.splice(1, 0, textEntry('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`))
  const buffer = createTarGzip(entries)
  return {
    id,
    filename: diagnosticFilename(generatedAt),
    generatedAt,
    buffer,
    includedFiles: entries.map((entry) => entry.name),
    sizeBytes: buffer.byteLength,
  }
}

export async function exportDesktopDiagnostics(
  input: DesktopDiagnosticsExportInput = {},
  options: {
    parentWindow?: BrowserWindow | null
    collectDaemonHealthReport?: () => Promise<string>
  } = {},
): Promise<DesktopDiagnosticsExportResult | null> {
  const archive = await createDesktopDiagnosticsArchive(input, {
    collectDaemonHealthReport: options.collectDaemonHealthReport,
  })
  const defaultPath = join(app.getPath('documents'), archive.filename)
  const dialogOptions = {
    title: 'Save sepilotd diagnostic bundle',
    defaultPath,
    buttonLabel: 'Save diagnostics',
    filters: [{ name: 'Diagnostics bundle', extensions: ['tar.gz'] }],
  }
  const result = options.parentWindow
    ? await dialog.showSaveDialog(options.parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)

  if (result.canceled || !result.filePath) {
    return null
  }

  await writeFile(result.filePath, archive.buffer)
  await logDesktopEvent(
    'desktop.diagnostics.exported',
    {
      path: result.filePath,
      filename: basename(result.filePath),
      includedFiles: archive.includedFiles,
      sizeBytes: archive.sizeBytes,
      reportId: input.reportId,
    },
    {
      id: archive.id,
      timestamp: archive.generatedAt,
      severity: 'info',
      requestId: input.requestId,
      sessionId: input.sessionId,
      runId: input.runId,
    },
  )

  return {
    id: archive.id,
    path: result.filePath,
    filename: basename(result.filePath),
    generatedAt: archive.generatedAt,
    includedFiles: archive.includedFiles,
    sizeBytes: archive.sizeBytes,
  }
}
