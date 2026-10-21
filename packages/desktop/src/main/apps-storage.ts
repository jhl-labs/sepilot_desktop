import { createHash, randomUUID } from 'node:crypto'
import type { Dirent, Stats } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  DesktopAppBundle,
  DesktopAppAuditEntry,
  DesktopAppAuditInput,
  DesktopAppChatTurn,
  DesktopAppManifest,
  DesktopAppPermissions,
  DesktopAppSaveInput,
  DesktopAppStorageDiagnostic,
  DesktopAppStorageFileEntry,
  DesktopAppStorageFileKind,
  DesktopAppStorageOwner,
  DesktopAppStorageReadInput,
  DesktopAppStorageReadResult,
  DesktopAppStorageSnapshot,
  DesktopAppStorageWriteInput,
  DesktopAppStorageWriteResult,
  DesktopAppValidationResult,
  DesktopAppVersionInfo,
  SepilotAppCapabilities,
  SepilotAppDataPolicy,
  SepilotAppDataSchema,
  SepilotAppHostRequestPermission,
} from '@sepilotd/api-client'
import {
  SEPILOT_APP_DATA_FILE,
  SEPILOT_APP_ENTRY_FILE,
  SEPILOT_APP_MANIFEST_FILE,
  SEPILOT_APP_SENSITIVE_KEY_PATTERN,
  SEPILOT_APPS_FRAMEWORK_VERSION,
  SEPILOT_APPS_ROOT_DIR,
  SEPILOT_APPS_SCHEMA_VERSION,
  normalizeAppDataPolicy,
} from '@sepilotd/api-client'
import {
  APP_IFRAME_SANDBOX,
  DEFAULT_APP_PERMISSIONS,
  validateAppHtml,
} from '../../lib/apps/runtime'
import {
  DESKTOP_APP_ID_PATTERN,
  DESKTOP_APP_HOST_REQUEST_OP_PATTERN,
  DESKTOP_APP_VERSION_FILE_PATTERN,
  isSafeDesktopAppId,
  isValidDesktopAppVersionInfo,
  validateDesktopAppManifest,
  validateDesktopAppPackage,
} from '../../lib/apps/package-validation'
import { getDesktopDataDir } from './runtime-config'

const PORTABLE_APP_FORMAT = 'sepilotd.desktop.app'
const PORTABLE_APP_FORMAT_VERSION = 1
const PORTABLE_APPS_BACKUP_FORMAT = 'sepilotd.desktop.apps.backup'
const PORTABLE_APPS_BACKUP_FORMAT_VERSION = 1
const APP_AUDIT_FILE = 'audit.jsonl'
const APP_CHAT_FILE = 'chat.json'
const APP_TRASH_DIR = '.trash'
const APP_CHAT_HISTORY_LIMIT = 80
const APP_CHAT_CONTENT_LIMIT = 4000
const STORAGE_TREE_MAX_DEPTH = 8
const STORAGE_TREE_MAX_ENTRIES = 5000
const STORAGE_FILE_MAX_BYTES = 2_000_000
const DEFAULT_APP_DATA_POLICY: SepilotAppDataPolicy = {
  aiReadable: true,
  aiWritable: true,
  interAppReadable: true,
  backup: 'included',
  sensitivePaths: [],
  redactedKeys: [],
}
const DEFAULT_APP_CAPABILITIES: SepilotAppCapabilities = {
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

interface PortableAppVersion extends DesktopAppVersionInfo {
  html: string
}

interface PortableAppBundle {
  format: typeof PORTABLE_APP_FORMAT
  formatVersion: typeof PORTABLE_APP_FORMAT_VERSION
  exportedAt: number
  manifest: DesktopAppManifest
  html: string
  data: Record<string, unknown>
  versions: PortableAppVersion[]
}

interface PortableAppsBackup {
  format: typeof PORTABLE_APPS_BACKUP_FORMAT
  formatVersion: typeof PORTABLE_APPS_BACKUP_FORMAT_VERSION
  exportedAt: number
  apps: PortableAppBundle[]
}

function appsRoot(): string {
  return join(getDesktopDataDir(), SEPILOT_APPS_ROOT_DIR)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createAppId(title?: string): string {
  const base = (title ?? 'app')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40)
  return `${base || 'app'}-${randomUUID().slice(0, 8)}`
}

function sanitizeExportName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
  return normalized || 'app'
}

export function createDesktopAppExportFilename(bundle: DesktopAppBundle): string {
  return `${sanitizeExportName(bundle.manifest.title)}-${bundle.manifest.id}.sepilotapp`
}

export function createDesktopAppsBackupFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  return `sepilotd-apps-backup-${stamp}.sepilotapps`
}

function assertAppId(id: string): string {
  if (!isSafeDesktopAppId(id)) {
    throw new Error(`Invalid app id: ${id}`)
  }
  return id
}

function normalizePermissions(
  value: Partial<DesktopAppPermissions> | undefined,
): DesktopAppPermissions {
  const source = isRecord(value) ? value : {}
  return {
    ...DEFAULT_APP_PERMISSIONS,
    ...source,
    network: false,
    clipboard: false,
    fileSystem: false,
    shell: false,
    storage: true,
  }
}

function normalizeValidation(value: DesktopAppValidationResult): DesktopAppValidationResult {
  return {
    ok: value.ok,
    issues: value.issues.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })),
  }
}

function normalizeCapabilities(value: unknown): SepilotAppCapabilities {
  if (!isRecord(value)) return { ...DEFAULT_APP_CAPABILITIES }
  const out: SepilotAppCapabilities = { ...DEFAULT_APP_CAPABILITIES }
  for (const key of Object.keys(DEFAULT_APP_CAPABILITIES) as Array<keyof SepilotAppCapabilities>) {
    const candidate = value[key]
    if (typeof candidate === 'boolean') out[key] = candidate
  }
  return out
}

function normalizeDataSchema(value: unknown): SepilotAppDataSchema | undefined {
  return isRecord(value) ? (value as SepilotAppDataSchema) : undefined
}

function normalizeHostRequests(value: unknown): SepilotAppHostRequestPermission[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const out: SepilotAppHostRequestPermission[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.op !== 'string') continue
    const op = entry.op.trim()
    if (!DESKTOP_APP_HOST_REQUEST_OP_PATTERN.test(op) || seen.has(op)) continue
    seen.add(op)
    out.push({
      op,
      reason:
        typeof entry.reason === 'string' && entry.reason.trim()
          ? entry.reason.trim().slice(0, 240)
          : undefined,
    })
  }
  return out.length > 0 ? out : undefined
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function writeTextAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, content, 'utf-8')
  await rename(tmp, path)
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

function appDir(id: string): string {
  return join(appsRoot(), assertAppId(id))
}

function appTrashDir(): string {
  return join(appsRoot(), APP_TRASH_DIR)
}

function isReservedAppStorageDirectory(name: string): boolean {
  return name === APP_TRASH_DIR
}

interface StorageOwnerMeta {
  id: string
  title: string
  kind: string
  path: string
  status: DesktopAppStorageOwner['status']
  validation?: DesktopAppValidationResult
  dataPolicy?: SepilotAppDataPolicy
  capabilities?: SepilotAppCapabilities
}

interface StorageTreeCollection {
  entries: DesktopAppStorageFileEntry[]
  truncated: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeStorageRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Storage relative path must be a non-empty string.')
  }
  if (value.includes('\0')) throw new Error('Storage relative path contains an invalid character.')
  const normalized = value.replace(/\\/gu, '/').replace(/^\/+/u, '')
  if (isAbsolute(value) || normalized.startsWith('/')) {
    throw new Error('Storage relative path must not be absolute.')
  }
  const parts = normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new Error('Storage relative path is empty.')
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Storage relative path must stay inside the apps root.')
  }
  return parts.join('/')
}

function assertInsideStorageRoot(root: string, target: string): void {
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Storage path escapes the apps root.')
  }
}

function resolveStoragePath(relativePath: unknown): {
  root: string
  relativePath: string
  path: string
} {
  const root = resolve(appsRoot())
  const normalized = normalizeStorageRelativePath(relativePath)
  const path = resolve(root, ...normalized.split('/'))
  assertInsideStorageRoot(root, path)
  return { root, relativePath: normalized, path }
}

function storageRelativePath(root: string, path: string): string {
  return relative(root, path).replace(/\\/gu, '/')
}

function storagePathDepth(relativePath: string): number {
  return relativePath.split('/').filter(Boolean).length
}

function ownerIdFromRelativePath(relativePath: string): string | null {
  const first = relativePath.split('/')[0] ?? ''
  if (!first || first === APP_TRASH_DIR || first === APP_AUDIT_FILE) return null
  return first
}

function storageFileKind(relativePath: string, name: string): DesktopAppStorageFileKind {
  const normalized = relativePath.replace(/\\/gu, '/')
  const lowerName = name.toLowerCase()
  const parts = normalized.split('/')
  if (parts.length === 1 && lowerName === APP_AUDIT_FILE) return 'audit'
  if (parts.length >= 2 && lowerName === SEPILOT_APP_MANIFEST_FILE) return 'manifest'
  if (parts.length >= 2 && lowerName === SEPILOT_APP_ENTRY_FILE) return 'html'
  if (parts.length >= 2 && lowerName === SEPILOT_APP_DATA_FILE) return 'data'
  if (parts.length >= 2 && lowerName === APP_CHAT_FILE) return 'chat'
  if (
    parts.length >= 3 &&
    parts[1] === 'versions' &&
    DESKTOP_APP_VERSION_FILE_PATTERN.test(parts.slice(1).join('/'))
  ) {
    return 'version'
  }
  if (lowerName.endsWith('.sepilotapp') || lowerName.endsWith('.sepilotapps')) return 'backup'
  return 'unknown'
}

function storageFileLanguage(path: string): DesktopAppStorageReadResult['language'] {
  const extension = extname(path).toLowerCase()
  if (extension === '.json' || extension === '.jsonl') return 'json'
  if (extension === '.html' || extension === '.htm') return 'html'
  if (extension === '.md' || extension === '.markdown') return 'markdown'
  if (extension === '.yaml' || extension === '.yml') return 'yaml'
  return 'text'
}

function isReadableStorageTextFile(kind: DesktopAppStorageFileKind, path: string): boolean {
  if (
    kind === 'manifest' ||
    kind === 'html' ||
    kind === 'data' ||
    kind === 'chat' ||
    kind === 'version' ||
    kind === 'audit' ||
    kind === 'backup'
  ) {
    return true
  }
  return new Set([
    '',
    '.css',
    '.csv',
    '.html',
    '.js',
    '.json',
    '.jsonl',
    '.log',
    '.md',
    '.text',
    '.txt',
    '.yaml',
    '.yml',
  ]).has(extname(path).toLowerCase())
}

function isEditableStorageTextFile(kind: DesktopAppStorageFileKind, path: string): boolean {
  if (kind === 'version') return false
  if (kind === 'audit') return false
  if (kind === 'manifest' || kind === 'html' || kind === 'data' || kind === 'chat') return true
  return new Set([
    '.css',
    '.csv',
    '.html',
    '.js',
    '.json',
    '.jsonl',
    '.log',
    '.md',
    '.txt',
    '.yaml',
    '.yml',
  ]).has(extname(path).toLowerCase())
}

function isSensitiveStorageFile(
  kind: DesktopAppStorageFileKind,
  relativePath: string,
  owner: StorageOwnerMeta | undefined,
): boolean {
  const policy = owner?.dataPolicy
  if (kind === 'chat' || kind === 'audit') return true
  if (kind === 'data') {
    return (
      owner?.kind === 'vault' ||
      policy?.encrypted === true ||
      (policy?.sensitivePaths?.length ?? 0) > 0 ||
      (policy?.redactedKeys?.length ?? 0) > 0
    )
  }
  return SEPILOT_APP_SENSITIVE_KEY_PATTERN.test(relativePath)
}

async function buildStorageOwnerMetas(): Promise<Map<string, StorageOwnerMeta>> {
  const [bundles, diagnostics] = await Promise.all([listDesktopApps(), listDesktopAppDiagnostics()])
  return buildStorageOwnerMetaMap(bundles, diagnostics)
}

function buildStorageOwnerMetaMap(
  bundles: DesktopAppBundle[],
  diagnostics: DesktopAppStorageDiagnostic[],
): Map<string, StorageOwnerMeta> {
  const owners = new Map<string, StorageOwnerMeta>()
  for (const bundle of bundles) {
    owners.set(bundle.manifest.id, {
      id: bundle.manifest.id,
      title: bundle.manifest.title,
      kind: bundle.manifest.kind,
      path: bundle.path,
      status: 'valid',
      validation: bundle.manifest.validation,
      dataPolicy: bundle.manifest.dataPolicy,
      capabilities: bundle.manifest.capabilities,
    })
  }
  for (const diagnostic of diagnostics) {
    if (owners.has(diagnostic.directoryName)) continue
    owners.set(diagnostic.directoryName, {
      id: diagnostic.directoryName,
      title: diagnostic.manifest?.title ?? diagnostic.directoryName,
      kind: diagnostic.manifest?.kind ?? 'unknown',
      path: diagnostic.path,
      status: diagnostic.status,
      validation: diagnostic.validation,
    })
  }
  return owners
}

function storageEntryFromStats(input: {
  root: string
  path: string
  stats: Stats
  owners: Map<string, StorageOwnerMeta>
}): DesktopAppStorageFileEntry {
  const relativePath = storageRelativePath(input.root, input.path)
  const name = basename(input.path)
  const ownerId = ownerIdFromRelativePath(relativePath)
  const owner = ownerId ? input.owners.get(ownerId) : undefined
  const appId = owner ? ownerId : null
  const nodeType = input.stats.isSymbolicLink()
    ? 'symlink'
    : input.stats.isDirectory()
      ? 'directory'
      : 'file'
  const fileKind = storageFileKind(relativePath, name)
  const fileSize = nodeType === 'file' ? input.stats.size : null
  const readable =
    nodeType === 'file' &&
    (fileSize ?? 0) <= STORAGE_FILE_MAX_BYTES &&
    isReadableStorageTextFile(fileKind, input.path)
  const editable = readable && isEditableStorageTextFile(fileKind, input.path)
  return {
    id: relativePath,
    appId,
    appTitle: owner?.title,
    appKind: owner?.kind,
    name,
    path: input.path,
    relativePath,
    virtualPath: relativePath,
    nodeType,
    fileKind,
    sizeBytes: fileSize,
    updatedAt: Number.isFinite(input.stats.mtimeMs) ? input.stats.mtimeMs : null,
    depth: storagePathDepth(relativePath),
    readable,
    editable,
    sensitive: isSensitiveStorageFile(fileKind, relativePath, owner),
  }
}

function storageOwnerMetrics(
  files: DesktopAppStorageFileEntry[],
): DesktopAppStorageOwner['metrics'] {
  return files.reduce<DesktopAppStorageOwner['metrics']>(
    (metrics, file) => {
      if (file.nodeType === 'directory') metrics.directoryCount += 1
      if (file.nodeType === 'file') metrics.fileCount += 1
      metrics.totalBytes += file.sizeBytes ?? 0
      if (file.editable) metrics.editableCount += 1
      if (file.sensitive) metrics.sensitiveCount += 1
      return metrics
    },
    {
      fileCount: 0,
      directoryCount: 0,
      totalBytes: 0,
      editableCount: 0,
      sensitiveCount: 0,
    },
  )
}

async function collectStorageTreeEntries(input: {
  root: string
  current: string
  owners: Map<string, StorageOwnerMeta>
  depth: number
  collection: StorageTreeCollection
}): Promise<void> {
  if (input.collection.truncated || input.depth >= STORAGE_TREE_MAX_DEPTH) return
  let dirents: Dirent[]
  try {
    dirents = await readdir(input.current, { withFileTypes: true })
  } catch {
    return
  }
  const sorted = dirents.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  for (const dirent of sorted) {
    if (input.collection.entries.length >= STORAGE_TREE_MAX_ENTRIES) {
      input.collection.truncated = true
      return
    }
    const path = join(input.current, dirent.name)
    let stats: Stats
    try {
      stats = await lstat(path)
    } catch {
      continue
    }
    const entry = storageEntryFromStats({
      root: input.root,
      path,
      stats,
      owners: input.owners,
    })
    input.collection.entries.push(entry)
    if (entry.nodeType === 'directory') {
      await collectStorageTreeEntries({
        root: input.root,
        current: path,
        owners: input.owners,
        depth: input.depth + 1,
        collection: input.collection,
      })
    }
  }
}

function manifestSaveInputFromBundle(
  bundle: DesktopAppBundle,
  html: string,
  data: Record<string, unknown>,
  prompt: string,
): DesktopAppSaveInput {
  return {
    id: bundle.manifest.id,
    manifest: {
      title: bundle.manifest.title,
      kind: bundle.manifest.kind,
      summary: bundle.manifest.summary,
      category: bundle.manifest.category,
      accent: bundle.manifest.accent,
      origin: bundle.manifest.origin,
      permissions: bundle.manifest.permissions,
      dataPolicy: bundle.manifest.dataPolicy,
      capabilities: bundle.manifest.capabilities,
      hostRequests: bundle.manifest.hostRequests,
      dataSchema: bundle.manifest.dataSchema,
    },
    html,
    data,
    prompt,
  }
}

function parseStorageJsonObject(content: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown
  if (!isRecord(parsed)) throw new Error(`${label} must contain a JSON object.`)
  return parsed
}

function storageAppIdFromEntry(entry: DesktopAppStorageFileEntry): string {
  if (!entry.appId || !isSafeDesktopAppId(entry.appId)) {
    throw new Error('Storage file is not owned by a valid app directory.')
  }
  return entry.appId
}

async function writeDesktopAppManifestStorageFile(appId: string, content: string): Promise<void> {
  const parsed = parseStorageJsonObject(content, 'App manifest') as unknown as DesktopAppManifest
  if (parsed.id !== appId) {
    throw new Error('Manifest id must match the owning app directory.')
  }
  const dir = appDir(appId)
  const html = await readFile(join(dir, SEPILOT_APP_ENTRY_FILE), 'utf-8')
  const data = await readJson<Record<string, unknown>>(join(dir, SEPILOT_APP_DATA_FILE))
  const normalizedData = normalizeRecord(data)
  assertVaultDataEncrypted(parsed, normalizedData)
  const versions = Array.isArray(parsed.versions)
    ? parsed.versions.filter(isValidDesktopAppVersionInfo)
    : []
  const validation = validateDesktopAppPackage({
    manifest: parsed,
    html,
    data: normalizedData,
    expectedId: appId,
    versionFileHashes: await collectVersionFileHashes(dir, versions),
  })
  assertPackageValidation(validation, 'Edited app manifest is invalid')
  await writeJsonAtomic(join(dir, SEPILOT_APP_MANIFEST_FILE), {
    ...parsed,
    frameworkVersion: parsed.frameworkVersion ?? SEPILOT_APPS_FRAMEWORK_VERSION,
    entry: SEPILOT_APP_ENTRY_FILE,
    dataFile: SEPILOT_APP_DATA_FILE,
    sandbox: APP_IFRAME_SANDBOX,
    validation: normalizeValidation(validation),
  })
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isEncryptedVaultEnvelope(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.salt === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.cipher === 'string'
  )
}

function assertVaultDataEncrypted(
  manifest: DesktopAppManifest,
  data: Record<string, unknown>,
): void {
  if (manifest.kind !== 'vault') return
  if (data.vault != null && !isEncryptedVaultEnvelope(data.vault)) {
    throw new Error('Vault apps must store encrypted AES-GCM envelope data only.')
  }
  for (const key of ['items', 'entries', 'secrets', 'collections']) {
    if (key in data) {
      throw new Error(`Vault apps must not store plaintext ${key} data.`)
    }
  }
}

function normalizeChatTurn(value: unknown): DesktopAppChatTurn | null {
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

function normalizeChatHistory(value: unknown): DesktopAppChatTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeChatTurn)
    .filter((turn): turn is DesktopAppChatTurn => Boolean(turn))
    .slice(-APP_CHAT_HISTORY_LIMIT)
}

function manifestIdRecoveredIssue(
  previousId: string,
  canonicalId: string,
): DesktopAppValidationResult['issues'][number] {
  return {
    severity: 'warning',
    code: 'manifest_id_recovered',
    message: `manifest id "${previousId}" was recovered as app directory "${canonicalId}".`,
  }
}

function canonicalManifestForDirectory(
  value: DesktopAppManifest | null,
  directoryId: string,
): { manifest: DesktopAppManifest | null; recoveredFromId: string | null } {
  if (!isRecord(value)) return { manifest: null, recoveredFromId: null }
  if (value.id === directoryId) return { manifest: value, recoveredFromId: null }
  if (!isSafeDesktopAppId(value.id) || !isSafeDesktopAppId(directoryId)) {
    return { manifest: value, recoveredFromId: null }
  }
  return {
    manifest: { ...value, id: directoryId } as DesktopAppManifest,
    recoveredFromId: value.id,
  }
}

function addRecoveredManifestIdWarning(
  validation: DesktopAppValidationResult,
  recoveredFromId: string | null,
  canonicalId: string,
): DesktopAppValidationResult {
  if (!recoveredFromId) return validation
  return {
    ok: validation.ok,
    issues: [manifestIdRecoveredIssue(recoveredFromId, canonicalId), ...validation.issues],
  }
}

function isValidManifest(
  value: DesktopAppManifest | null,
  expectedId: string,
): value is DesktopAppManifest {
  return validateDesktopAppManifest(value, { expectedId }).ok
}

function formatValidationIssues(result: DesktopAppValidationResult): string {
  return result.issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join('; ')
}

function assertPackageValidation(result: DesktopAppValidationResult, label: string): void {
  if (!result.ok) {
    const detail = formatValidationIssues(result)
    throw new Error(detail ? `${label}. ${detail}` : label)
  }
}

async function collectVersionFileHashes(
  dir: string,
  versions: DesktopAppVersionInfo[],
): Promise<Record<string, string | null>> {
  const hashes: Record<string, string | null> = {}
  for (const version of versions) {
    if (!isValidDesktopAppVersionInfo(version)) continue
    try {
      hashes[version.file] = sha256(await readFile(join(dir, version.file), 'utf-8'))
    } catch {
      hashes[version.file] = null
    }
  }
  return hashes
}

async function loadBundle(id: string): Promise<DesktopAppBundle | null> {
  const dir = appDir(id)
  const manifestRaw = await readJson<DesktopAppManifest>(join(dir, SEPILOT_APP_MANIFEST_FILE))
  const { manifest, recoveredFromId } = canonicalManifestForDirectory(manifestRaw, id)
  if (!isValidManifest(manifest, id)) return null
  try {
    const html = await readFile(join(dir, manifest.entry ?? SEPILOT_APP_ENTRY_FILE), 'utf-8')
    const data = await readJson<Record<string, unknown>>(
      join(dir, manifest.dataFile ?? SEPILOT_APP_DATA_FILE),
    )
    const validation = addRecoveredManifestIdWarning(
      validateDesktopAppPackage({
        manifest,
        html,
        data,
        expectedId: id,
        versionFileHashes: await collectVersionFileHashes(dir, manifest.versions),
      }),
      recoveredFromId,
      id,
    )
    if (!validation.ok) return null
    return {
      manifest: {
        ...manifest,
        frameworkVersion: manifest.frameworkVersion ?? SEPILOT_APPS_FRAMEWORK_VERSION,
        dataPolicy: normalizeAppDataPolicy(manifest.dataPolicy, DEFAULT_APP_DATA_POLICY),
        capabilities: normalizeCapabilities(manifest.capabilities),
        hostRequests: normalizeHostRequests(manifest.hostRequests),
        dataSchema: normalizeDataSchema(manifest.dataSchema),
        validation: normalizeValidation(validation),
      },
      html,
      data: isRecord(data) ? data : {},
      path: dir,
    }
  } catch {
    return null
  }
}

function diagnosticManifestExcerpt(value: unknown): DesktopAppStorageDiagnostic['manifest'] {
  if (!isRecord(value)) return undefined
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    kind: typeof value.kind === 'string' ? value.kind : undefined,
    version: typeof value.version === 'number' ? value.version : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : undefined,
  }
}

async function inspectAppDirectory(entryName: string): Promise<DesktopAppStorageDiagnostic> {
  const dir = join(appsRoot(), entryName)
  const canDelete = isSafeDesktopAppId(entryName)
  if (!canDelete) {
    return {
      directoryName: entryName,
      path: dir,
      status: 'invalid',
      canDelete: false,
      validation: {
        ok: false,
        issues: [
          {
            severity: 'error',
            code: 'directory_name_invalid',
            message: 'App directory name is not a safe app id.',
          },
        ],
      },
    }
  }

  const manifestRaw = await readJson<DesktopAppManifest>(join(dir, SEPILOT_APP_MANIFEST_FILE))
  const { manifest, recoveredFromId } = canonicalManifestForDirectory(manifestRaw, entryName)
  let html: string | undefined
  try {
    html = await readFile(join(dir, SEPILOT_APP_ENTRY_FILE), 'utf-8')
  } catch {
    html = undefined
  }
  const data = await readJson<Record<string, unknown>>(join(dir, SEPILOT_APP_DATA_FILE))
  const versions = isRecord(manifest) && Array.isArray(manifest.versions) ? manifest.versions : []
  const versionFileHashes = await collectVersionFileHashes(
    dir,
    versions.filter(isValidDesktopAppVersionInfo),
  )
  const validation = addRecoveredManifestIdWarning(
    validateDesktopAppPackage({
      manifest,
      html,
      data,
      expectedId: entryName,
      versionFileHashes,
    }),
    recoveredFromId,
    entryName,
  )

  return {
    directoryName: entryName,
    path: dir,
    status: validation.ok ? 'valid' : 'invalid',
    canDelete,
    manifest: diagnosticManifestExcerpt(manifest),
    validation,
  }
}

export async function listDesktopAppDiagnostics(): Promise<DesktopAppStorageDiagnostic[]> {
  await mkdir(appsRoot(), { recursive: true })
  const entries = await readdir(appsRoot(), { withFileTypes: true })
  const diagnostics = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !isReservedAppStorageDirectory(entry.name))
      .map((entry) => inspectAppDirectory(entry.name)),
  )
  return diagnostics.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'invalid' ? -1 : 1
    const leftUpdated = left.manifest?.updatedAt ?? 0
    const rightUpdated = right.manifest?.updatedAt ?? 0
    if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated
    return left.directoryName.localeCompare(right.directoryName)
  })
}

export async function listDesktopAppStorageTree(): Promise<DesktopAppStorageSnapshot> {
  const root = resolve(appsRoot())
  await mkdir(root, { recursive: true })
  const [bundles, diagnostics] = await Promise.all([listDesktopApps(), listDesktopAppDiagnostics()])
  const owners = buildStorageOwnerMetaMap(bundles, diagnostics)
  const collection: StorageTreeCollection = {
    entries: [],
    truncated: false,
  }
  await collectStorageTreeEntries({
    root,
    current: root,
    owners,
    depth: 0,
    collection,
  })

  const filesByApp = new Map<string, DesktopAppStorageFileEntry[]>()
  const looseFiles: DesktopAppStorageFileEntry[] = []
  for (const entry of collection.entries) {
    if (entry.appId && owners.has(entry.appId)) {
      if (entry.nodeType === 'directory' && entry.relativePath === entry.appId) continue
      filesByApp.set(entry.appId, [...(filesByApp.get(entry.appId) ?? []), entry])
      continue
    }
    looseFiles.push(entry)
  }

  const apps: DesktopAppStorageOwner[] = [...owners.values()]
    .map((owner) => {
      const files = filesByApp.get(owner.id) ?? []
      return {
        id: owner.id,
        title: owner.title,
        kind: owner.kind,
        path: owner.path,
        status: owner.status,
        validation: owner.validation,
        metrics: storageOwnerMetrics(files),
        files,
      }
    })
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'invalid' ? -1 : 1
      const leftUpdated = Math.max(0, ...left.files.map((file) => file.updatedAt ?? 0))
      const rightUpdated = Math.max(0, ...right.files.map((file) => file.updatedAt ?? 0))
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated
      return left.title.localeCompare(right.title)
    })

  return {
    rootPath: root,
    collectedAt: Date.now(),
    apps,
    looseFiles,
    diagnostics,
    truncated: collection.truncated,
  }
}

export async function readDesktopAppStorageFile(
  input: DesktopAppStorageReadInput,
): Promise<DesktopAppStorageReadResult> {
  if (!isRecord(input as unknown) || typeof input.relativePath !== 'string') {
    throw new Error('Invalid storage read input.')
  }
  const resolved = resolveStoragePath(input.relativePath)
  const [stats, owners] = await Promise.all([lstat(resolved.path), buildStorageOwnerMetas()])
  const entry = storageEntryFromStats({
    root: resolved.root,
    path: resolved.path,
    stats,
    owners,
  })
  if (entry.nodeType !== 'file') {
    throw new Error('Storage path is not a file.')
  }
  if (!entry.readable) {
    throw new Error('Storage file is not readable as a supported text file.')
  }
  const content = await readFile(resolved.path, 'utf-8')
  if (Buffer.byteLength(content, 'utf-8') > STORAGE_FILE_MAX_BYTES) {
    throw new Error('Storage file is too large to read.')
  }
  return {
    file: entry,
    content,
    encoding: 'utf-8',
    sha256: sha256(content),
    language: storageFileLanguage(resolved.path),
  }
}

export async function writeDesktopAppStorageFile(
  input: DesktopAppStorageWriteInput,
): Promise<DesktopAppStorageWriteResult> {
  if (
    !isRecord(input as unknown) ||
    typeof input.relativePath !== 'string' ||
    typeof input.content !== 'string' ||
    (input.expectedSha256 != null && typeof input.expectedSha256 !== 'string')
  ) {
    throw new Error('Invalid storage write input.')
  }
  if (Buffer.byteLength(input.content, 'utf-8') > STORAGE_FILE_MAX_BYTES) {
    throw new Error('Storage file is too large to write.')
  }

  const current = await readDesktopAppStorageFile({ relativePath: input.relativePath })
  const entry = current.file
  if (!entry.editable) {
    throw new Error('Storage file is not editable.')
  }
  if (input.expectedSha256 && input.expectedSha256 !== current.sha256) {
    throw new Error('Storage file changed before save. Refresh and retry.')
  }

  const parts = entry.relativePath.split('/').filter(Boolean)
  const isRootAppFile = Boolean(entry.appId && parts.length === 2)
  if (isRootAppFile && entry.fileKind === 'manifest') {
    await writeDesktopAppManifestStorageFile(storageAppIdFromEntry(entry), input.content)
  } else if (isRootAppFile && entry.fileKind === 'html') {
    const appId = storageAppIdFromEntry(entry)
    const bundle = await loadBundle(appId)
    if (!bundle) throw new Error(`App not found: ${appId}`)
    await saveDesktopApp(
      manifestSaveInputFromBundle(bundle, input.content, bundle.data, 'Debug storage HTML edit'),
    )
  } else if (isRootAppFile && entry.fileKind === 'data') {
    await saveDesktopAppData(
      storageAppIdFromEntry(entry),
      parseStorageJsonObject(input.content, 'App data'),
    )
  } else if (isRootAppFile && entry.fileKind === 'chat') {
    const parsed = JSON.parse(input.content) as unknown
    if (!Array.isArray(parsed)) throw new Error('App chat history must contain a JSON array.')
    await saveDesktopAppChat(storageAppIdFromEntry(entry), parsed as DesktopAppChatTurn[])
  } else {
    await writeTextAtomic(entry.path, input.content)
  }

  const saved = await readDesktopAppStorageFile({ relativePath: entry.relativePath })
  return {
    ...saved,
    savedAt: Date.now(),
  }
}

function normalizeImportedVersions(versions: unknown): PortableAppVersion[] {
  if (!Array.isArray(versions)) return []
  const seen = new Set<number>()
  const normalized: PortableAppVersion[] = []
  for (const entry of versions) {
    if (
      !isRecord(entry) ||
      !isValidDesktopAppVersionInfo(entry) ||
      typeof entry.html !== 'string'
    ) {
      continue
    }
    const html = entry.html
    if (sha256(html) !== entry.sha256) continue
    if (!validateAppHtml(html).ok) continue
    if (seen.has(entry.version)) continue
    seen.add(entry.version)
    normalized.push({
      version: entry.version,
      createdAt: entry.createdAt,
      file: entry.file,
      sha256: entry.sha256,
      prompt: entry.prompt,
      html,
    })
  }
  return normalized.sort((a, b) => a.version - b.version)
}

function parsePortableAppBundle(content: string): PortableAppBundle {
  const parsed = JSON.parse(content) as unknown
  return parsePortableAppBundleValue(parsed)
}

function parsePortableAppBundleValue(parsed: unknown): PortableAppBundle {
  if (!isRecord(parsed)) throw new Error('Invalid app bundle.')
  if (parsed.format !== PORTABLE_APP_FORMAT) {
    throw new Error('Unsupported app bundle format.')
  }
  if (parsed.formatVersion !== PORTABLE_APP_FORMAT_VERSION) {
    throw new Error('Unsupported app bundle version.')
  }
  const manifest = parsed.manifest as DesktopAppManifest | null
  if (!manifest || !isRecord(manifest) || typeof manifest.id !== 'string') {
    throw new Error('App bundle is missing a manifest.')
  }
  if (typeof parsed.html !== 'string') {
    throw new Error('App bundle is missing index HTML.')
  }
  const data = normalizeRecord(parsed.data)
  assertVaultDataEncrypted(manifest, data)
  assertPackageValidation(
    validateDesktopAppPackage({
      manifest,
      html: parsed.html,
      data,
      expectedId: manifest.id,
    }),
    'App bundle package is invalid',
  )
  return {
    format: PORTABLE_APP_FORMAT,
    formatVersion: PORTABLE_APP_FORMAT_VERSION,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
    manifest,
    html: parsed.html,
    data,
    versions: normalizeImportedVersions(parsed.versions),
  }
}

function parsePortableAppsBackup(content: string): PortableAppsBackup {
  const parsed = JSON.parse(content) as unknown
  if (!isRecord(parsed)) throw new Error('Invalid apps backup.')
  if (parsed.format !== PORTABLE_APPS_BACKUP_FORMAT) {
    throw new Error('Unsupported apps backup format.')
  }
  if (parsed.formatVersion !== PORTABLE_APPS_BACKUP_FORMAT_VERSION) {
    throw new Error('Unsupported apps backup version.')
  }
  if (!Array.isArray(parsed.apps)) {
    throw new Error('Apps backup is missing apps.')
  }
  return {
    format: PORTABLE_APPS_BACKUP_FORMAT,
    formatVersion: PORTABLE_APPS_BACKUP_FORMAT_VERSION,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
    apps: parsed.apps.map(parsePortableAppBundleValue),
  }
}

function buildManifest(input: {
  id: string
  now: number
  html: string
  prompt?: string
  existing?: DesktopAppManifest | null
  manifest: DesktopAppSaveInput['manifest']
  validation: DesktopAppValidationResult
  createVersion: boolean
}): { manifest: DesktopAppManifest; versionToWrite: DesktopAppVersionInfo | null } {
  const existing = input.existing
  const previousVersions = existing?.versions ?? []
  const htmlHash = sha256(input.html)
  const previousHash = previousVersions.at(-1)?.sha256
  const shouldVersion = input.createVersion && previousHash !== htmlHash
  const version = shouldVersion ? (existing?.version ?? 0) + 1 : (existing?.version ?? 1)
  const versions: DesktopAppVersionInfo[] = shouldVersion
    ? [
        ...previousVersions,
        {
          version,
          createdAt: input.now,
          file: `versions/v${String(version).padStart(6, '0')}.html`,
          sha256: htmlHash,
          prompt: input.prompt,
        },
      ]
    : previousVersions

  const manifest: DesktopAppManifest = {
    schemaVersion: SEPILOT_APPS_SCHEMA_VERSION,
    frameworkVersion: SEPILOT_APPS_FRAMEWORK_VERSION,
    id: input.id,
    title: input.manifest.title.trim() || existing?.title || 'Untitled App',
    kind: input.manifest.kind || existing?.kind || 'custom',
    summary: input.manifest.summary ?? existing?.summary,
    category: input.manifest.category ?? existing?.category ?? 'Custom',
    accent: input.manifest.accent ?? existing?.accent ?? '#0f766e',
    origin: input.manifest.origin ?? existing?.origin ?? 'code-agent',
    entry: SEPILOT_APP_ENTRY_FILE,
    dataFile: SEPILOT_APP_DATA_FILE,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    version,
    permissions: normalizePermissions(input.manifest.permissions),
    dataPolicy: normalizeAppDataPolicy(
      input.manifest.dataPolicy,
      normalizeAppDataPolicy(existing?.dataPolicy, DEFAULT_APP_DATA_POLICY),
    ),
    capabilities: normalizeCapabilities(input.manifest.capabilities ?? existing?.capabilities),
    hostRequests: normalizeHostRequests(input.manifest.hostRequests ?? existing?.hostRequests),
    dataSchema: normalizeDataSchema(input.manifest.dataSchema ?? existing?.dataSchema),
    sandbox: APP_IFRAME_SANDBOX,
    versions,
    validation: normalizeValidation(input.validation),
  }
  return {
    manifest,
    versionToWrite: shouldVersion ? (versions.at(-1) ?? null) : null,
  }
}

export async function listDesktopApps(): Promise<DesktopAppBundle[]> {
  await mkdir(appsRoot(), { recursive: true })
  const entries = await readdir(appsRoot(), { withFileTypes: true })
  const bundles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && DESKTOP_APP_ID_PATTERN.test(entry.name))
      .map((entry) => loadBundle(entry.name)),
  )
  return bundles
    .filter((bundle): bundle is DesktopAppBundle => Boolean(bundle))
    .sort((a, b) => b.manifest.updatedAt - a.manifest.updatedAt)
}

export async function saveDesktopApp(input: DesktopAppSaveInput): Promise<DesktopAppBundle> {
  if (
    !isRecord(input as unknown) ||
    !isRecord(input.manifest) ||
    typeof input.manifest.title !== 'string' ||
    typeof input.manifest.kind !== 'string' ||
    typeof input.html !== 'string' ||
    (input.id != null && typeof input.id !== 'string') ||
    (input.data != null && !isRecord(input.data))
  ) {
    throw new Error('Invalid app save input.')
  }
  const id = input.id ? assertAppId(input.id) : createAppId(input.manifest.title)
  const validation = validateAppHtml(input.html)
  assertPackageValidation(validation, 'Invalid app HTML')

  const dir = appDir(id)
  await mkdir(join(dir, 'versions'), { recursive: true })
  const existingRaw = await readJson<DesktopAppManifest>(join(dir, SEPILOT_APP_MANIFEST_FILE))
  const existing = isValidManifest(existingRaw, id) ? existingRaw : null
  const now = Date.now()
  const { manifest, versionToWrite } = buildManifest({
    id,
    now,
    html: input.html,
    prompt: input.prompt,
    existing,
    manifest: input.manifest,
    validation,
    createVersion: input.createVersion !== false,
  })
  const data = input.data ?? {}
  assertVaultDataEncrypted(manifest, data)
  const packageValidation = validateDesktopAppPackage({
    manifest,
    html: input.html,
    data,
    expectedId: id,
  })
  assertPackageValidation(packageValidation, 'Invalid app package')
  manifest.validation = normalizeValidation(packageValidation)

  await writeTextAtomic(join(dir, manifest.entry), input.html)
  if (versionToWrite) {
    await writeTextAtomic(join(dir, versionToWrite.file), input.html)
  }
  await writeJsonAtomic(join(dir, manifest.dataFile), data)
  await writeJsonAtomic(join(dir, SEPILOT_APP_MANIFEST_FILE), manifest)
  return {
    manifest,
    html: input.html,
    data,
    path: dir,
  }
}

export async function saveDesktopAppData(
  id: string,
  data: Record<string, unknown>,
): Promise<DesktopAppBundle> {
  if (!isRecord(data)) throw new Error('Invalid app data.')
  const bundle = await loadBundle(id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const now = Date.now()
  const manifest: DesktopAppManifest = {
    ...bundle.manifest,
    updatedAt: now,
  }
  assertVaultDataEncrypted(manifest, data)
  const dir = appDir(id)
  await writeJsonAtomic(join(dir, manifest.dataFile), data)
  await writeJsonAtomic(join(dir, SEPILOT_APP_MANIFEST_FILE), manifest)
  return { ...bundle, manifest, data }
}

export async function readDesktopAppChat(id: string): Promise<DesktopAppChatTurn[]> {
  const bundle = await loadBundle(id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const value = await readJson<unknown>(join(appDir(id), APP_CHAT_FILE))
  return normalizeChatHistory(value)
}

export async function saveDesktopAppChat(
  id: string,
  history: DesktopAppChatTurn[],
): Promise<DesktopAppChatTurn[]> {
  const bundle = await loadBundle(id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const normalized = normalizeChatHistory(history)
  await writeJsonAtomic(join(appDir(id), APP_CHAT_FILE), normalized)
  return normalized
}

export async function restoreDesktopAppVersion(
  id: string,
  version: number,
): Promise<DesktopAppBundle> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Invalid app version.')
  }
  const bundle = await loadBundle(id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const target = bundle.manifest.versions.find((entry) => entry.version === version)
  if (!target || !DESKTOP_APP_VERSION_FILE_PATTERN.test(target.file)) {
    throw new Error(`App version not found: ${id}@${version}`)
  }

  const restoredHtml = await readFile(join(appDir(id), target.file), 'utf-8')
  if (sha256(restoredHtml) !== target.sha256) {
    throw new Error(`App version hash mismatch: ${id}@${version}`)
  }
  return saveDesktopApp({
    id,
    manifest: {
      title: bundle.manifest.title,
      kind: bundle.manifest.kind,
      summary: bundle.manifest.summary,
      category: bundle.manifest.category,
      accent: bundle.manifest.accent,
      origin: bundle.manifest.origin,
      permissions: bundle.manifest.permissions,
      dataPolicy: bundle.manifest.dataPolicy,
      capabilities: bundle.manifest.capabilities,
      hostRequests: bundle.manifest.hostRequests,
      dataSchema: bundle.manifest.dataSchema,
    },
    html: restoredHtml,
    data: bundle.data,
    prompt: `Restore version ${version}`,
  })
}

export async function exportDesktopAppPortable(id: string): Promise<string> {
  const bundle = await loadBundle(id)
  if (!bundle) throw new Error(`App not found: ${id}`)
  const portable = await buildPortableAppBundle(bundle)
  return `${JSON.stringify(portable, null, 2)}\n`
}

async function buildPortableAppBundle(bundle: DesktopAppBundle): Promise<PortableAppBundle> {
  const versions: PortableAppVersion[] = []
  for (const version of bundle.manifest.versions) {
    if (!DESKTOP_APP_VERSION_FILE_PATTERN.test(version.file)) continue
    const html = await readFile(join(appDir(bundle.manifest.id), version.file), 'utf-8')
    if (sha256(html) !== version.sha256) {
      throw new Error(`App version hash mismatch: ${bundle.manifest.id}@${version.version}`)
    }
    versions.push({ ...version, html })
  }
  return {
    format: PORTABLE_APP_FORMAT,
    formatVersion: PORTABLE_APP_FORMAT_VERSION,
    exportedAt: Date.now(),
    manifest: bundle.manifest,
    html: bundle.html,
    data: bundle.data,
    versions,
  }
}

export async function importDesktopAppPortable(content: string): Promise<DesktopAppBundle> {
  const portable = parsePortableAppBundle(content)
  const id = createAppId(portable.manifest.title)
  return writePortableAppBundle(portable, {
    id,
    preserveTimestamps: false,
    importPrompt: 'Imported app',
  })
}

async function writePortableAppBundle(
  portable: PortableAppBundle,
  options: {
    id: string
    preserveTimestamps: boolean
    importPrompt: string
  },
): Promise<DesktopAppBundle> {
  const id = assertAppId(options.id)
  const dir = appDir(id)
  await rm(dir, { recursive: true, force: true })
  await mkdir(join(dir, 'versions'), { recursive: true })
  const now = Date.now()
  const currentHash = sha256(portable.html)
  let versions = portable.versions
    .filter((version) => DESKTOP_APP_VERSION_FILE_PATTERN.test(version.file))
    .map((version) => ({
      version: version.version,
      createdAt: version.createdAt,
      file: version.file,
      sha256: version.sha256,
      prompt: version.prompt,
    }))

  if (!versions.some((version) => version.sha256 === currentHash)) {
    const version = Math.max(0, ...versions.map((entry) => entry.version)) + 1
    versions = [
      ...versions,
      {
        version,
        createdAt: options.preserveTimestamps ? portable.manifest.updatedAt : now,
        file: `versions/v${String(version).padStart(6, '0')}.html`,
        sha256: currentHash,
        prompt: options.importPrompt,
      },
    ]
  }
  versions = versions.sort((a, b) => a.version - b.version)
  const currentVersion = versions.find((version) => version.sha256 === currentHash)
  const validation = validateAppHtml(portable.html)
  const manifest: DesktopAppManifest = {
    ...portable.manifest,
    id,
    createdAt: options.preserveTimestamps ? portable.manifest.createdAt : now,
    updatedAt: options.preserveTimestamps ? portable.manifest.updatedAt : now,
    version: currentVersion?.version ?? Math.max(1, ...versions.map((entry) => entry.version)),
    frameworkVersion: SEPILOT_APPS_FRAMEWORK_VERSION,
    entry: SEPILOT_APP_ENTRY_FILE,
    dataFile: SEPILOT_APP_DATA_FILE,
    permissions: normalizePermissions(portable.manifest.permissions),
    dataPolicy: normalizeAppDataPolicy(portable.manifest.dataPolicy, DEFAULT_APP_DATA_POLICY),
    capabilities: normalizeCapabilities(portable.manifest.capabilities),
    hostRequests: normalizeHostRequests(portable.manifest.hostRequests),
    dataSchema: normalizeDataSchema(portable.manifest.dataSchema),
    sandbox: APP_IFRAME_SANDBOX,
    validation: normalizeValidation(validation),
    versions,
  }
  const versionFileHashes: Record<string, string> = {}
  for (const version of portable.versions) {
    if (!versions.some((entry) => entry.file === version.file)) continue
    versionFileHashes[version.file] = sha256(version.html)
  }
  if (currentVersion) versionFileHashes[currentVersion.file] = currentHash
  const packageValidation = validateDesktopAppPackage({
    manifest,
    html: portable.html,
    data: portable.data,
    expectedId: id,
    versionFileHashes,
  })
  assertPackageValidation(packageValidation, 'Imported app package is invalid')
  manifest.validation = normalizeValidation(packageValidation)

  await writeTextAtomic(join(dir, manifest.entry), portable.html)
  for (const version of portable.versions) {
    if (!versions.some((entry) => entry.sha256 === version.sha256)) continue
    await writeTextAtomic(join(dir, version.file), version.html)
  }
  if (currentVersion) {
    await writeTextAtomic(join(dir, currentVersion.file), portable.html)
  }
  await writeJsonAtomic(join(dir, manifest.dataFile), portable.data)
  await writeJsonAtomic(join(dir, SEPILOT_APP_MANIFEST_FILE), manifest)
  return {
    manifest,
    html: portable.html,
    data: portable.data,
    path: dir,
  }
}

export async function exportDesktopAppsBackup(): Promise<string> {
  const bundles = await listDesktopApps()
  const apps = await Promise.all(
    bundles
      .filter((bundle) => bundle.manifest.dataPolicy?.backup !== 'excluded')
      .map((bundle) => buildPortableAppBundle(bundle)),
  )
  const backup: PortableAppsBackup = {
    format: PORTABLE_APPS_BACKUP_FORMAT,
    formatVersion: PORTABLE_APPS_BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    apps,
  }
  return `${JSON.stringify(backup, null, 2)}\n`
}

export async function restoreDesktopAppsBackup(content: string): Promise<DesktopAppBundle[]> {
  const backup = parsePortableAppsBackup(content)
  await rm(appsRoot(), { recursive: true, force: true })
  await mkdir(appsRoot(), { recursive: true })
  const bundles: DesktopAppBundle[] = []
  for (const portable of backup.apps) {
    bundles.push(
      await writePortableAppBundle(portable, {
        id: portable.manifest.id,
        preserveTimestamps: true,
        importPrompt: 'Restored from backup',
      }),
    )
  }
  return bundles.sort((a, b) => b.manifest.updatedAt - a.manifest.updatedAt)
}

export async function deleteDesktopApp(id: string): Promise<void> {
  const source = appDir(id)
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const target = join(appTrashDir(), `${id}-${stamp}-${randomUUID().slice(0, 8)}`)
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(source, target)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}

export async function resetDesktopApps(inputs: DesktopAppSaveInput[]): Promise<DesktopAppBundle[]> {
  await rm(appsRoot(), { recursive: true, force: true })
  await mkdir(appsRoot(), { recursive: true })
  const bundles: DesktopAppBundle[] = []
  for (const input of inputs) {
    bundles.push(await saveDesktopApp(input))
  }
  return bundles
}

function normalizeAuditInput(input: DesktopAppAuditInput): DesktopAppAuditEntry {
  const now = Date.now()
  return {
    id: `${now}-${randomUUID().slice(0, 8)}`,
    appId: typeof input.appId === 'string' ? input.appId.slice(0, 120) : 'unknown',
    operation:
      typeof input.operation === 'string' && input.operation.trim()
        ? input.operation.trim().slice(0, 120)
        : 'unknown',
    capability:
      typeof input.capability === 'string' && input.capability.trim()
        ? input.capability.trim().slice(0, 80)
        : 'apps',
    status: input.status === 'error' ? 'error' : 'success',
    source:
      input.source === 'agent' || input.source === 'manager' || input.source === 'sandbox'
        ? input.source
        : 'sandbox',
    message:
      typeof input.message === 'string' && input.message.trim()
        ? input.message.trim().slice(0, 500)
        : undefined,
    createdAt: now,
  }
}

function isValidAuditEntry(value: unknown): value is DesktopAppAuditEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.appId === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.capability === 'string' &&
    (value.status === 'success' || value.status === 'error') &&
    (value.source === 'sandbox' || value.source === 'agent' || value.source === 'manager') &&
    typeof value.createdAt === 'number'
  )
}

export async function recordDesktopAppAudit(input: DesktopAppAuditInput): Promise<void> {
  await mkdir(appsRoot(), { recursive: true })
  const entry = normalizeAuditInput(input)
  await writeFile(join(appsRoot(), APP_AUDIT_FILE), `${JSON.stringify(entry)}\n`, {
    encoding: 'utf-8',
    flag: 'a',
  })
}

export async function listDesktopAppAudit(
  options: {
    appId?: string
    limit?: number
  } = {},
): Promise<DesktopAppAuditEntry[]> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 80))
  let content = ''
  try {
    content = await readFile(join(appsRoot(), APP_AUDIT_FILE), 'utf-8')
  } catch {
    return []
  }
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        return null
      }
    })
    .filter(isValidAuditEntry)
    .filter((entry) => !options.appId || entry.appId === options.appId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}
