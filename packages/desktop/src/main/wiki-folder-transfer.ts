import type {
  DesktopWikiFolderEntry,
  DesktopWikiFolderExportApplyInput,
  DesktopWikiFolderExportConflict,
  DesktopWikiFolderExportPreview,
  DesktopWikiFolderExportResult,
  DesktopWikiFolderImportSelection,
} from '@sepilotd/api-client'
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const WIKI_FOLDER_IMPORT_CHANNEL = 'sepilot:wiki/folder/import'
export const WIKI_FOLDER_EXPORT_PREVIEW_CHANNEL = 'sepilot:wiki/folder/export/preview'
export const WIKI_FOLDER_EXPORT_APPLY_CHANNEL = 'sepilot:wiki/folder/export/apply'

const WIKI_FOLDER_MANIFEST = '.sepilot-wiki.json'
const MAX_WIKI_FOLDER_FILES = 10_001
const MAX_WIKI_FOLDER_DIRECTORIES = 10_000
const MAX_WIKI_FOLDER_ENTRIES = MAX_WIKI_FOLDER_FILES + MAX_WIKI_FOLDER_DIRECTORIES
const MAX_WIKI_FOLDER_SCANNED_ENTRIES = 50_000
const MAX_WIKI_FOLDER_FILE_BYTES = 2 * 1024 * 1024
const MAX_WIKI_FOLDER_TOTAL_BYTES = 50 * 1024 * 1024
const MAX_WIKI_FOLDER_DEPTH = 32
const MAX_WIKI_FOLDER_RELATIVE_PATH_LENGTH = 1_024
const WIKI_FOLDER_EXPORT_TOKEN_TTL_MS = 2 * 60 * 1_000
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.hg', '.svn', 'node_modules'])
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu
const INVALID_PORTABLE_SEGMENT = /[<>:"|?*\u0000-\u001f]/u

interface PreparedWikiFolderExport {
  directoryName: string
  entries: DesktopWikiFolderEntry[]
  fileCount: number
  directoryCount: number
  totalBytes: number
}

interface ExportInspection {
  createCount: number
  overwriteCount: number
  blockedConflicts: DesktopWikiFolderExportConflict[]
  snapshot: string
}

interface PendingWikiFolderExport {
  rendererId: number
  expiresAt: number
  parentRoot: string
  targetRoot: string
  payload: PreparedWikiFolderExport
  inspection: ExportInspection
}

interface WikiFolderExportBrokerOptions {
  now?: () => number
  createToken?: () => string
  tokenTtlMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function portableSegment(segment: string, label: string): string {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment !== segment.trim() ||
    segment.endsWith('.') ||
    INVALID_PORTABLE_SEGMENT.test(segment) ||
    WINDOWS_RESERVED_NAME.test(segment)
  ) {
    throw new Error(`${label}에 지원하지 않는 경로 이름이 있습니다: ${segment || '(비어 있음)'}`)
  }
  if (segment.length > 120) {
    throw new Error(`${label}의 경로 이름은 120자를 넘을 수 없습니다: ${segment}`)
  }
  return segment.normalize('NFC')
}

function portableRelativePath(value: unknown, label = 'Wiki 폴더'): string {
  if (typeof value !== 'string' || !value || value.length > MAX_WIKI_FOLDER_RELATIVE_PATH_LENGTH) {
    throw new Error(`${label} 상대 경로가 올바르지 않습니다.`)
  }
  const parts = value.split('/')
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[a-z]:/iu.test(value) ||
    isAbsolute(value) ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`${label} 상대 경로는 선택한 폴더 안에 있어야 합니다: ${value}`)
  }
  if (parts.length > MAX_WIKI_FOLDER_DEPTH || parts.some((part) => part.length === 0)) {
    throw new Error(`${label} 상대 경로의 깊이가 너무 깊거나 비어 있는 구간이 있습니다: ${value}`)
  }
  return parts.map((part) => portableSegment(part, label)).join('/')
}

function portableDirectoryName(value: unknown): string {
  if (typeof value !== 'string' || value.includes('/') || value.includes('\\')) {
    throw new Error('Wiki 내보내기 폴더 이름이 올바르지 않습니다.')
  }
  return portableSegment(value, 'Wiki 내보내기 폴더')
}

function portablePathKey(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US')
}

function assertSupportedTransferFile(relativePath: string): void {
  const extension = extname(relativePath).toLocaleLowerCase('en-US')
  if (relativePath === WIKI_FOLDER_MANIFEST || MARKDOWN_EXTENSIONS.has(extension)) return
  throw new Error(
    `Wiki 폴더는 Markdown과 ${WIKI_FOLDER_MANIFEST} 파일만 지원합니다: ${relativePath}`,
  )
}

function assertInsideRoot(root: string, target: string, allowRoot = false): void {
  const candidate = relative(root, target)
  if (
    (!allowRoot && candidate === '') ||
    candidate === '..' ||
    candidate.startsWith(`..${sep}`) ||
    isAbsolute(candidate)
  ) {
    throw new Error('Wiki 폴더 경로가 사용자가 선택한 위치를 벗어났습니다.')
  }
}

function resolveEntryPath(root: string, relativePath: string): string {
  const target = resolve(root, ...relativePath.split('/'))
  assertInsideRoot(root, target)
  return target
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function decodeUtf8(buffer: Buffer, relativePath: string): string {
  if (buffer.includes(0)) {
    throw new Error(`Wiki 파일은 UTF-8 텍스트여야 합니다: ${relativePath}`)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/u, '')
  } catch {
    throw new Error(`Wiki 파일을 UTF-8로 읽을 수 없습니다: ${relativePath}`)
  }
}

async function lstatIfExists(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

function relativePathFromRoot(root: string, target: string): string {
  return relative(root, target).replace(/\\/gu, '/')
}

function assertEntryCollection(entries: readonly DesktopWikiFolderEntry[]): void {
  const paths = new Map<string, DesktopWikiFolderEntry>()
  const filePaths = new Set<string>()
  let fileCount = 0
  let directoryCount = 0

  for (const entry of entries) {
    const relativePath = portableRelativePath(entry.relativePath)
    const key = portablePathKey(relativePath)
    if (paths.has(key)) {
      throw new Error(`Wiki 폴더에 대소문자만 다른 중복 경로가 있습니다: ${relativePath}`)
    }
    paths.set(key, entry)
    if (entry.kind === 'file') {
      assertSupportedTransferFile(relativePath)
      filePaths.add(key)
      fileCount += 1
    } else {
      directoryCount += 1
    }
  }

  if (entries.length > MAX_WIKI_FOLDER_ENTRIES) {
    throw new Error(`Wiki 폴더 항목은 최대 ${MAX_WIKI_FOLDER_ENTRIES.toLocaleString()}개입니다.`)
  }
  if (fileCount > MAX_WIKI_FOLDER_FILES) {
    throw new Error(`Wiki 폴더 파일은 최대 ${MAX_WIKI_FOLDER_FILES.toLocaleString()}개입니다.`)
  }
  if (directoryCount > MAX_WIKI_FOLDER_DIRECTORIES) {
    throw new Error(
      `Wiki 폴더 디렉터리는 최대 ${MAX_WIKI_FOLDER_DIRECTORIES.toLocaleString()}개입니다.`,
    )
  }

  for (const entry of entries) {
    const parts = entry.relativePath.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const ancestor = portablePathKey(parts.slice(0, index).join('/'))
      if (filePaths.has(ancestor)) {
        throw new Error(`Wiki 폴더 파일 아래에 다른 항목을 만들 수 없습니다: ${entry.relativePath}`)
      }
    }
  }
}

function prepareWikiFolderExport(value: unknown): PreparedWikiFolderExport {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error('Wiki 폴더 내보내기 데이터가 올바르지 않습니다.')
  }
  if (value.entries.length > MAX_WIKI_FOLDER_ENTRIES) {
    throw new Error(`Wiki 폴더 항목은 최대 ${MAX_WIKI_FOLDER_ENTRIES.toLocaleString()}개입니다.`)
  }
  const directoryName = portableDirectoryName(value.directoryName)
  const entries: DesktopWikiFolderEntry[] = value.entries.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('Wiki 폴더 항목이 올바르지 않습니다.')
    const relativePath = portableRelativePath(candidate.relativePath)
    if (candidate.kind === 'directory') return { kind: 'directory', relativePath }
    if (candidate.kind === 'file' && typeof candidate.content === 'string') {
      assertSupportedTransferFile(relativePath)
      return { kind: 'file', relativePath, content: candidate.content }
    }
    throw new Error(`Wiki 폴더 항목이 올바르지 않습니다: ${relativePath}`)
  })
  assertEntryCollection(entries)

  let totalBytes = 0
  let fileCount = 0
  let directoryCount = 0
  for (const entry of entries) {
    if (entry.kind === 'directory') {
      directoryCount += 1
      continue
    }
    fileCount += 1
    const size = byteLength(entry.content)
    if (entry.relativePath !== WIKI_FOLDER_MANIFEST && size > MAX_WIKI_FOLDER_FILE_BYTES) {
      throw new Error(`Wiki Markdown 파일은 2MB를 넘을 수 없습니다: ${entry.relativePath}`)
    }
    totalBytes += size
    if (totalBytes > MAX_WIKI_FOLDER_TOTAL_BYTES) {
      throw new Error('Wiki 폴더의 전체 파일 크기는 50MB를 넘을 수 없습니다.')
    }
  }
  return { directoryName, entries, fileCount, directoryCount, totalBytes }
}

interface ImportScanState {
  root: string
  entries: DesktopWikiFolderEntry[]
  ignoredPaths: string[]
  totalBytes: number
  scannedEntries: number
  fileCount: number
  directoryCount: number
}

function markIgnored(state: ImportScanState, relativePath: string): void {
  state.ignoredPaths.push(relativePath)
}

async function readImportFile(
  state: ImportScanState,
  path: string,
  relativePath: string,
): Promise<DesktopWikiFolderEntry> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Wiki 가져오기 중 파일 유형이 변경되었습니다: ${relativePath}`)
  }
  const maximumBytes =
    relativePath === WIKI_FOLDER_MANIFEST ? MAX_WIKI_FOLDER_TOTAL_BYTES : MAX_WIKI_FOLDER_FILE_BYTES
  if (info.size > maximumBytes) {
    throw new Error(
      relativePath === WIKI_FOLDER_MANIFEST
        ? `Wiki manifest는 50MB를 넘을 수 없습니다: ${relativePath}`
        : `Wiki Markdown 파일은 2MB를 넘을 수 없습니다: ${relativePath}`,
    )
  }
  const resolved = await realpath(path)
  assertInsideRoot(state.root, resolved)
  const buffer = await readFile(path)
  if (buffer.byteLength > maximumBytes) {
    throw new Error(`Wiki 파일이 읽는 동안 허용 크기를 초과했습니다: ${relativePath}`)
  }
  state.totalBytes += buffer.byteLength
  if (state.totalBytes > MAX_WIKI_FOLDER_TOTAL_BYTES) {
    throw new Error('Wiki 폴더의 전체 파일 크기는 50MB를 넘을 수 없습니다.')
  }
  return { kind: 'file', relativePath, content: decodeUtf8(buffer, relativePath) }
}

async function scanImportDirectory(
  state: ImportScanState,
  directoryPath: string,
  relativeDirectory: string | null,
  depth: number,
): Promise<{ entries: DesktopWikiFolderEntry[]; relevant: boolean }> {
  if (depth > MAX_WIKI_FOLDER_DEPTH) {
    throw new Error(`Wiki 폴더의 최대 깊이는 ${MAX_WIKI_FOLDER_DEPTH}단계입니다.`)
  }
  const children = await readdir(directoryPath, { withFileTypes: true })
  children.sort((left, right) => left.name.localeCompare(right.name))
  const entries: DesktopWikiFolderEntry[] = []
  let relevant = children.length === 0 && relativeDirectory !== null

  for (const child of children) {
    state.scannedEntries += 1
    if (state.scannedEntries > MAX_WIKI_FOLDER_SCANNED_ENTRIES) {
      throw new Error('Wiki 폴더에 검사할 항목이 너무 많습니다.')
    }
    const childPath = join(directoryPath, child.name)
    const rawRelativePath = relativePathFromRoot(state.root, childPath)
    let relativePath: string
    try {
      relativePath = portableRelativePath(rawRelativePath)
    } catch {
      markIgnored(state, rawRelativePath)
      continue
    }

    const info = await lstat(childPath)
    if (info.isSymbolicLink()) {
      markIgnored(state, relativePath)
      continue
    }
    if (info.isDirectory()) {
      if (SKIPPED_DIRECTORY_NAMES.has(child.name.toLocaleLowerCase('en-US'))) {
        markIgnored(state, relativePath)
        continue
      }
      const resolved = await realpath(childPath)
      assertInsideRoot(state.root, resolved)
      const nested = await scanImportDirectory(state, childPath, relativePath, depth + 1)
      if (nested.relevant) {
        state.directoryCount += 1
        if (state.directoryCount > MAX_WIKI_FOLDER_DIRECTORIES) {
          throw new Error(
            `Wiki 폴더 디렉터리는 최대 ${MAX_WIKI_FOLDER_DIRECTORIES.toLocaleString()}개입니다.`,
          )
        }
        entries.push({ kind: 'directory', relativePath }, ...nested.entries)
        relevant = true
      }
      continue
    }
    if (!info.isFile()) {
      markIgnored(state, relativePath)
      continue
    }

    const isRootManifest = depth === 0 && relativePath === WIKI_FOLDER_MANIFEST
    const isMarkdown = MARKDOWN_EXTENSIONS.has(extname(relativePath).toLocaleLowerCase('en-US'))
    if (!isRootManifest && !isMarkdown) {
      markIgnored(state, relativePath)
      continue
    }
    state.fileCount += 1
    if (state.fileCount > MAX_WIKI_FOLDER_FILES) {
      throw new Error(`Wiki 폴더 파일은 최대 ${MAX_WIKI_FOLDER_FILES.toLocaleString()}개입니다.`)
    }
    entries.push(await readImportFile(state, childPath, relativePath))
    relevant = true
  }

  return { entries, relevant }
}

export async function readWikiImportFolder(
  folderPath: string,
): Promise<DesktopWikiFolderImportSelection> {
  const root = await realpath(folderPath)
  const rootInfo = await stat(root)
  if (!rootInfo.isDirectory()) throw new Error('선택한 경로가 폴더가 아닙니다.')
  const state: ImportScanState = {
    root,
    entries: [],
    ignoredPaths: [],
    totalBytes: 0,
    scannedEntries: 0,
    fileCount: 0,
    directoryCount: 0,
  }
  const scanned = await scanImportDirectory(state, root, null, 0)
  state.entries = scanned.entries
  assertEntryCollection(state.entries)
  return {
    rootName: basename(root),
    entries: state.entries,
    ignoredPaths: state.ignoredPaths,
    totalBytes: state.totalBytes,
    directoryCount: state.directoryCount,
  }
}

function conflictKind(
  info: Awaited<ReturnType<typeof lstatIfExists>>,
): DesktopWikiFolderExportConflict['kind'] {
  if (!info) return 'other'
  if (info.isSymbolicLink()) return 'symbolic_link'
  if (info.isDirectory()) return 'directory'
  if (info.isFile()) return 'file'
  return 'other'
}

async function stateFingerprint(
  path: string,
  info: Awaited<ReturnType<typeof lstatIfExists>>,
  detailedFile: boolean,
): Promise<string> {
  if (!info) return 'missing'
  if (info.isSymbolicLink()) return 'symbolic_link'
  if (info.isDirectory()) return 'directory'
  if (info.isFile()) {
    if (!detailedFile) return 'file'
    const contentHash =
      info.size <= MAX_WIKI_FOLDER_TOTAL_BYTES
        ? createHash('sha256')
            .update(await readFile(path))
            .digest('hex')
        : 'content-too-large-to-hash'
    return `file:${info.size}:${info.mtimeMs}:${info.ino}:${contentHash}`
  }
  return `other:${info.mode}`
}

async function inspectExportTarget(
  targetRoot: string,
  payload: PreparedWikiFolderExport,
): Promise<ExportInspection> {
  const pathsToInspect = new Map<string, { path: string; detailedFile: boolean }>()
  pathsToInspect.set('.', { path: targetRoot, detailedFile: false })
  for (const entry of payload.entries) {
    const parts = entry.relativePath.split('/')
    for (let index = 1; index <= parts.length; index += 1) {
      const relativePath = parts.slice(0, index).join('/')
      const existing = pathsToInspect.get(relativePath)
      pathsToInspect.set(relativePath, {
        path: resolveEntryPath(targetRoot, relativePath),
        detailedFile:
          existing?.detailedFile === true || (index === parts.length && entry.kind === 'file'),
      })
    }
  }

  const states = new Map<string, Awaited<ReturnType<typeof lstatIfExists>>>()
  for (const [relativePath, target] of pathsToInspect) {
    states.set(relativePath, await lstatIfExists(target.path))
  }

  let createCount = 0
  let overwriteCount = 0
  const blockedConflicts: DesktopWikiFolderExportConflict[] = []
  for (const entry of payload.entries) {
    const parts = entry.relativePath.split('/')
    let blockedBy: Awaited<ReturnType<typeof lstatIfExists>> | null = null
    const rootState = states.get('.') ?? null
    if (rootState && (!rootState.isDirectory() || rootState.isSymbolicLink())) {
      blockedBy = rootState
    }
    for (let index = 1; !blockedBy && index < parts.length; index += 1) {
      const ancestor = states.get(parts.slice(0, index).join('/')) ?? null
      if (ancestor && (!ancestor.isDirectory() || ancestor.isSymbolicLink())) blockedBy = ancestor
    }
    if (blockedBy) {
      blockedConflicts.push({
        relativePath: entry.relativePath,
        kind: conflictKind(blockedBy),
      })
      continue
    }

    const finalState = states.get(entry.relativePath) ?? null
    if (!finalState) {
      createCount += 1
    } else if (finalState.isSymbolicLink()) {
      blockedConflicts.push({ relativePath: entry.relativePath, kind: 'symbolic_link' })
    } else if (entry.kind === 'directory' && !finalState.isDirectory()) {
      blockedConflicts.push({ relativePath: entry.relativePath, kind: conflictKind(finalState) })
    } else if (entry.kind === 'file' && finalState.isFile()) {
      overwriteCount += 1
    } else if (entry.kind === 'file') {
      blockedConflicts.push({ relativePath: entry.relativePath, kind: conflictKind(finalState) })
    }
  }

  const snapshotEntries = await Promise.all(
    [...pathsToInspect.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([relativePath, target]) => [
        relativePath,
        await stateFingerprint(target.path, states.get(relativePath) ?? null, target.detailedFile),
      ]),
  )
  const snapshot = JSON.stringify(snapshotEntries)
  return { createCount, overwriteCount, blockedConflicts, snapshot }
}

async function ensureDirectoryWithoutSymlinks(root: string, relativePath?: string): Promise<void> {
  const parts = relativePath ? relativePath.split('/') : []
  let current = root
  for (const part of parts) {
    current = join(current, part)
    const before = await lstatIfExists(current)
    if (!before) await mkdir(current)
    const after = await lstat(current)
    if (after.isSymbolicLink() || !after.isDirectory()) {
      throw new Error(`Wiki 내보내기 경로가 안전한 디렉터리가 아닙니다: ${relativePath}`)
    }
  }
}

async function writeExportPayload(
  targetRoot: string,
  payload: PreparedWikiFolderExport,
): Promise<void> {
  const rootBefore = await lstatIfExists(targetRoot)
  if (!rootBefore) await mkdir(targetRoot)
  const rootAfter = await lstat(targetRoot)
  if (rootAfter.isSymbolicLink() || !rootAfter.isDirectory()) {
    throw new Error('Wiki 내보내기 대상이 안전한 디렉터리가 아닙니다.')
  }

  const directories = payload.entries
    .filter(
      (entry): entry is Extract<DesktopWikiFolderEntry, { kind: 'directory' }> =>
        entry.kind === 'directory',
    )
    .sort(
      (left, right) =>
        left.relativePath.split('/').length - right.relativePath.split('/').length ||
        left.relativePath.localeCompare(right.relativePath),
    )
  for (const entry of directories) {
    await ensureDirectoryWithoutSymlinks(targetRoot, entry.relativePath)
  }

  const files = payload.entries
    .filter(
      (entry): entry is Extract<DesktopWikiFolderEntry, { kind: 'file' }> => entry.kind === 'file',
    )
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  for (const entry of files) {
    const parent = entry.relativePath.split('/').slice(0, -1).join('/')
    await ensureDirectoryWithoutSymlinks(targetRoot, parent || undefined)
    const target = resolveEntryPath(targetRoot, entry.relativePath)
    const before = await lstatIfExists(target)
    if (before && (before.isSymbolicLink() || !before.isFile())) {
      throw new Error(`Wiki 내보내기 대상 파일 유형이 변경되었습니다: ${entry.relativePath}`)
    }
    await writeFile(target, entry.content, { encoding: 'utf8', mode: 0o600 })
  }
}

export class WikiFolderExportBroker {
  private readonly now: () => number
  private readonly createToken: () => string
  private readonly tokenTtlMs: number
  private readonly pending = new Map<string, PendingWikiFolderExport>()
  private readonly rendererTokens = new Map<number, string>()

  constructor(options: WikiFolderExportBrokerOptions = {}) {
    this.now = options.now ?? Date.now
    this.createToken = options.createToken ?? randomUUID
    this.tokenTtlMs = options.tokenTtlMs ?? WIKI_FOLDER_EXPORT_TOKEN_TTL_MS
  }

  private cleanExpired(): void {
    const now = this.now()
    for (const [token, pending] of this.pending) {
      if (pending.expiresAt > now) continue
      this.pending.delete(token)
      if (this.rendererTokens.get(pending.rendererId) === token) {
        this.rendererTokens.delete(pending.rendererId)
      }
    }
  }

  async preview(
    rendererId: number,
    selectedParentPath: string,
    value: unknown,
  ): Promise<DesktopWikiFolderExportPreview> {
    this.cleanExpired()
    const payload = prepareWikiFolderExport(value)
    const parentRoot = await realpath(selectedParentPath)
    const parentInfo = await stat(parentRoot)
    if (!parentInfo.isDirectory()) throw new Error('선택한 내보내기 위치가 폴더가 아닙니다.')
    const targetRoot = resolve(parentRoot, payload.directoryName)
    assertInsideRoot(parentRoot, targetRoot)
    const inspection = await inspectExportTarget(targetRoot, payload)
    const previousToken = this.rendererTokens.get(rendererId)
    if (previousToken) this.pending.delete(previousToken)
    const token = this.createToken()
    const expiresAt = this.now() + this.tokenTtlMs
    this.pending.set(token, {
      rendererId,
      expiresAt,
      parentRoot,
      targetRoot,
      payload,
      inspection,
    })
    this.rendererTokens.set(rendererId, token)
    return {
      token,
      displayPath: targetRoot,
      expiresAt,
      entryCount: payload.entries.length,
      fileCount: payload.fileCount,
      directoryCount: payload.directoryCount,
      totalBytes: payload.totalBytes,
      createCount: inspection.createCount,
      overwriteCount: inspection.overwriteCount,
      blockedConflicts: inspection.blockedConflicts,
    }
  }

  async apply(
    rendererId: number,
    value: DesktopWikiFolderExportApplyInput | unknown,
  ): Promise<DesktopWikiFolderExportResult> {
    this.cleanExpired()
    if (
      !isRecord(value) ||
      typeof value.token !== 'string' ||
      typeof value.confirmed !== 'boolean'
    ) {
      throw new Error('Wiki 폴더 내보내기 확인 정보가 올바르지 않습니다.')
    }
    const pending = this.pending.get(value.token)
    if (!pending || pending.rendererId !== rendererId || pending.expiresAt <= this.now()) {
      throw new Error('Wiki 폴더 내보내기 미리보기가 만료되었거나 이미 사용되었습니다.')
    }
    this.pending.delete(value.token)
    if (this.rendererTokens.get(pending.rendererId) === value.token) {
      this.rendererTokens.delete(pending.rendererId)
    }
    if (pending.inspection.blockedConflicts.length > 0) {
      throw new Error('Wiki 폴더 내보내기를 막는 파일 유형 충돌이 있습니다.')
    }
    if (pending.inspection.overwriteCount > 0 && !value.confirmed) {
      throw new Error('기존 파일을 덮어쓰려면 사용자 확인이 필요합니다.')
    }

    const currentParentRoot = await realpath(pending.parentRoot)
    if (currentParentRoot !== pending.parentRoot) {
      throw new Error('Wiki 폴더 내보내기 위치가 미리보기 이후 변경되었습니다.')
    }
    const currentInspection = await inspectExportTarget(pending.targetRoot, pending.payload)
    if (currentInspection.snapshot !== pending.inspection.snapshot) {
      throw new Error('Wiki 폴더 내보내기 위치가 미리보기 이후 변경되었습니다.')
    }
    if (currentInspection.blockedConflicts.length > 0) {
      throw new Error('Wiki 폴더 내보내기를 막는 파일 유형 충돌이 있습니다.')
    }

    await writeExportPayload(pending.targetRoot, pending.payload)
    return {
      displayPath: pending.targetRoot,
      entryCount: pending.payload.entries.length,
      createdCount: pending.inspection.createCount,
      overwrittenCount: pending.inspection.overwriteCount,
    }
  }
}

function assertMainWindowSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null,
): BrowserWindow {
  const window = getMainWindow()
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('Wiki 폴더 작업은 기본 데스크톱 창에서만 실행할 수 있습니다.')
  }
  return window
}

export function registerWikiFolderTransferIpc(getMainWindow: () => BrowserWindow | null): void {
  const broker = new WikiFolderExportBroker()

  ipcMain.handle(WIKI_FOLDER_IMPORT_CHANNEL, async (event) => {
    const window = assertMainWindowSender(event, getMainWindow)
    const options: OpenDialogOptions = {
      title: 'Wiki로 가져올 폴더 선택',
      properties: ['openDirectory'],
      buttonLabel: '이 폴더 가져오기',
    }
    const result = await dialog.showOpenDialog(window, options)
    const folderPath = result.filePaths[0]
    if (result.canceled || !folderPath) return null
    return readWikiImportFolder(folderPath)
  })

  ipcMain.handle(WIKI_FOLDER_EXPORT_PREVIEW_CHANNEL, async (event, payload: unknown) => {
    const window = assertMainWindowSender(event, getMainWindow)
    const options: OpenDialogOptions = {
      title: 'Wiki 폴더를 저장할 상위 위치 선택',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '이 위치에 내보내기',
    }
    const result = await dialog.showOpenDialog(window, options)
    const parentPath = result.filePaths[0]
    if (result.canceled || !parentPath) return null
    return broker.preview(event.sender.id, parentPath, payload)
  })

  ipcMain.handle(WIKI_FOLDER_EXPORT_APPLY_CHANNEL, async (event, input: unknown) => {
    assertMainWindowSender(event, getMainWindow)
    return broker.apply(event.sender.id, input)
  })
}
