import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { request as httpRequest, type RequestOptions as HttpRequestOptions } from 'node:http'
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from 'node:https'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  DesktopRancherImportFailure,
  DesktopRancherImportInput,
  DesktopRancherImportResult,
  DesktopKubernetesClusterSnapshot,
  DesktopKubernetesConnectionInput,
  DesktopKubernetesConnectionSummary,
  DesktopKubernetesCredentialDeleteResult,
  DesktopKubernetesDeploymentSnapshot,
  DesktopKubernetesEventSnapshot,
  DesktopKubernetesNamespaceSnapshot,
  DesktopKubernetesSnapshotInput,
  DesktopKubernetesSnapshotResult,
} from '@sepilotd/api-client'
import { safeStorage } from 'electron'
import YAML from 'yaml'

const KUBERNETES_TIMEOUT_MS = 20_000
const KUBERNETES_MAX_BYTES = 15 * 1024 * 1024
const KUBERNETES_MAX_PAGES = 20
const KUBERNETES_PAGE_LIMIT = 500
const RANCHER_KUBECONFIG_CACHE_TTL_MINUTES = 7 * 24 * 60
const ENCRYPTED_PREFIX = 'enc1:'

interface NormalizedKubernetesConnection extends DesktopKubernetesConnectionInput {
  id: string
  name: string
  provider: string
  apiUrl: string
  token: string
  caCert?: string
  insecureSkipTlsVerify: boolean
  credentialType?: 'serviceAccount' | 'rancher'
  rancherSourceId?: string
  rancherUrl?: string
  rancherClusterId?: string
  rancherClusterName?: string
}

interface NormalizedKubernetesConnectionBase extends Omit<NormalizedKubernetesConnection, 'token'> {
  token?: string
}

interface StoredKubernetesCredential {
  token?: string | null
  kubeconfig?: string | null
  kubeconfigFetchedAt?: number
  kubeconfigExpiresAt?: number
  rancherSourceId?: string
  rancherClusterId?: string
  rancherClusterName?: string
  updatedAt?: number
}

interface StoredRancherSource {
  url?: string
  token?: string | null
  caCert?: string | null
  insecureSkipTlsVerify?: boolean
  updatedAt?: number
}

interface StoredKubernetesCredentials {
  version?: number
  credentials?: Record<string, StoredKubernetesCredential>
  rancherSources?: Record<string, StoredRancherSource>
}

type K8sRecord = Record<string, unknown>

interface NodeMetricsUsage {
  cpuCores: number
  memoryBytes: number
}

interface NamespaceStats {
  workloads: number
  podsReady: number
  podsTotal: number
  restarts: number
  cpuCores: number
  memoryBytes: number
  warningEvents: number
  incidentEvents: number
}

function isRecord(value: unknown): value is K8sRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 160)
}

function credentialsPath(): string {
  const dataDir = process.env.SEPILOTD_DATA_DIR?.trim() || join(homedir(), '.sepilotd')
  return join(dataDir, 'desktop-kubernetes-credentials.json')
}

function encryptionAvailable(): boolean {
  try {
    return Boolean(safeStorage?.isEncryptionAvailable?.())
  } catch {
    return false
  }
}

function encryptSecret(value: string): string {
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

function readCredentialStore(): StoredKubernetesCredentials {
  const path = credentialsPath()
  if (!existsSync(path)) return { version: 2, credentials: {}, rancherSources: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as StoredKubernetesCredentials
    return {
      version: 2,
      credentials: isRecord(parsed.credentials) ? parsed.credentials : {},
      rancherSources: isRecord(parsed.rancherSources) ? parsed.rancherSources : {},
    }
  } catch (error) {
    console.warn('[desktop-kubernetes] failed to read credential store:', error)
    return { version: 2, credentials: {}, rancherSources: {} }
  }
}

function writeCredentialStore(store: StoredKubernetesCredentials): void {
  const path = credentialsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 2,
        credentials: store.credentials ?? {},
        rancherSources: store.rancherSources ?? {},
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  )
  try {
    chmodSync(path, 0o600)
  } catch {
  }
  if (!encryptionAvailable()) {
    console.warn(
      '[desktop-kubernetes] OS keyring unavailable - Kubernetes tokens and kubeconfigs persisted in plaintext at',
      path,
    )
  }
}

function readStoredCredential(connectionId: string): string | null {
  const id = safeId(connectionId)
  if (!id) return null
  const store = readCredentialStore()
  return decryptSecret(store.credentials?.[id]?.token)
}

function storeCredential(connectionId: string, token: string): void {
  const id = safeId(connectionId)
  if (!id || !token) return
  const store = readCredentialStore()
  store.credentials = store.credentials ?? {}
  store.credentials[id] = {
    ...(store.credentials[id] ?? {}),
    token: encryptSecret(token),
    updatedAt: Date.now(),
  }
  writeCredentialStore(store)
}

function readStoredKubeconfig(connectionId: string): {
  kubeconfig: string
  fetchedAt: number
  expiresAt: number
} | null {
  const id = safeId(connectionId)
  if (!id) return null
  const store = readCredentialStore()
  const credential = store.credentials?.[id]
  const kubeconfig = decryptSecret(credential?.kubeconfig)
  if (!kubeconfig) return null
  return {
    kubeconfig,
    fetchedAt: numberValue(credential?.kubeconfigFetchedAt),
    expiresAt: numberValue(credential?.kubeconfigExpiresAt),
  }
}

function storeKubeconfigCache(
  connectionId: string,
  input: {
    kubeconfig: string
    token?: string
    fetchedAt: number
    expiresAt: number
    rancherSourceId: string
    rancherClusterId: string
    rancherClusterName?: string
  },
): void {
  const id = safeId(connectionId)
  if (!id || !input.kubeconfig) return
  const store = readCredentialStore()
  store.credentials = store.credentials ?? {}
  store.credentials[id] = {
    ...(store.credentials[id] ?? {}),
    ...(input.token ? { token: encryptSecret(input.token) } : {}),
    kubeconfig: encryptSecret(input.kubeconfig),
    kubeconfigFetchedAt: input.fetchedAt,
    kubeconfigExpiresAt: input.expiresAt,
    rancherSourceId: input.rancherSourceId,
    rancherClusterId: input.rancherClusterId,
    rancherClusterName: input.rancherClusterName,
    updatedAt: Date.now(),
  }
  writeCredentialStore(store)
}

function storeRancherSource(
  sourceId: string,
  input: { url: string; token: string; caCert?: string; insecureSkipTlsVerify?: boolean },
): void {
  const id = safeId(sourceId)
  if (!id || !input.token) return
  const store = readCredentialStore()
  store.rancherSources = store.rancherSources ?? {}
  store.rancherSources[id] = {
    url: input.url,
    token: encryptSecret(input.token),
    ...(input.caCert ? { caCert: encryptSecret(input.caCert) } : {}),
    insecureSkipTlsVerify: Boolean(input.insecureSkipTlsVerify),
    updatedAt: Date.now(),
  }
  writeCredentialStore(store)
}

function readStoredRancherSource(sourceId: string): {
  url: string
  token: string
  caCert?: string
  insecureSkipTlsVerify?: boolean
} | null {
  const id = safeId(sourceId)
  if (!id) return null
  const source = readCredentialStore().rancherSources?.[id]
  const url = cleanText(source?.url, 2048)
  const token = decryptSecret(source?.token)
  if (!url || !token) return null
  const caCert = decryptSecret(source?.caCert)
  return {
    url,
    token,
    ...(caCert ? { caCert } : {}),
    insecureSkipTlsVerify: Boolean(source?.insecureSkipTlsVerify),
  }
}

export function deleteDesktopKubernetesCredential(
  connectionId: unknown,
): DesktopKubernetesCredentialDeleteResult {
  const id = safeId(cleanText(connectionId, 160))
  if (!id) return { ok: true, deleted: false }
  const store = readCredentialStore()
  const deleted = Boolean(store.credentials?.[id])
  if (store.credentials) delete store.credentials[id]
  if (deleted) writeCredentialStore(store)
  return { ok: true, deleted }
}

function valueAtPath(record: K8sRecord, path: string[]): unknown {
  let cursor: unknown = record
  for (const key of path) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[key]
  }
  return cursor
}

function stringAtPath(record: K8sRecord, path: string[], fallback = ''): string {
  return cleanText(valueAtPath(record, path), 1000) || fallback
}

function recordAtPath(record: K8sRecord, path: string[]): K8sRecord {
  const value = valueAtPath(record, path)
  return isRecord(value) ? value : {}
}

function arrayAtPath(record: K8sRecord, path: string[]): unknown[] {
  const value = valueAtPath(record, path)
  return Array.isArray(value) ? value : []
}

function k8sName(item: K8sRecord): string {
  return stringAtPath(item, ['metadata', 'name'])
}

function k8sNamespace(item: K8sRecord): string {
  return stringAtPath(item, ['metadata', 'namespace'])
}

function k8sUid(item: K8sRecord): string {
  return stringAtPath(item, ['metadata', 'uid'])
}

function k8sLabels(item: K8sRecord): Record<string, string> {
  const labels = recordAtPath(item, ['metadata', 'labels'])
  return Object.fromEntries(
    Object.entries(labels)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key, value.slice(0, 300)]),
  )
}

function normalizeConnection(input: unknown): NormalizedKubernetesConnectionBase {
  const root = isRecord(input) ? input : {}
  const raw = isRecord(root.connection) ? root.connection : {}
  const apiUrl = cleanText(raw.apiUrl, 2048)
  if (!apiUrl) throw new Error('Kubernetes API URL이 필요합니다.')

  const token = cleanText(raw.token, 20_000)
  const caCert = cleanText(raw.caCert, 100_000)
  const parsed = new URL(apiUrl)
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1')

  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('Kubernetes API URL은 HTTPS여야 합니다. 로컬 프록시는 localhost HTTP만 허용됩니다.')
  }

  parsed.hash = ''
  parsed.search = ''
  const apiBasePath = parsed.pathname.replace(/\/+$/u, '')
  const normalizedApiUrl = apiBasePath ? `${parsed.origin}${apiBasePath}` : parsed.origin
  const id =
    safeId(cleanText(raw.id, 160)) ||
    `k8s-${createHash('sha256').update(normalizedApiUrl).digest('hex').slice(0, 12)}`
  return {
    id,
    name: cleanText(raw.name, 160) || parsed.hostname,
    provider: cleanText(raw.provider, 80) || 'Auto',
    apiUrl: normalizedApiUrl,
    ...(token ? { token } : {}),
    ...(caCert ? { caCert } : {}),
    insecureSkipTlsVerify: Boolean(raw.insecureSkipTlsVerify),
    credentialType: raw.credentialType === 'rancher' ? 'rancher' : 'serviceAccount',
    rancherSourceId: safeId(cleanText(raw.rancherSourceId, 160)),
    rancherUrl: cleanText(raw.rancherUrl, 2048),
    rancherClusterId: cleanText(raw.rancherClusterId, 180),
    rancherClusterName: cleanText(raw.rancherClusterName, 180),
  }
}

async function connectionWithCredential(
  connection: NormalizedKubernetesConnectionBase,
  timeoutMs: number,
  forceRefresh = false,
): Promise<NormalizedKubernetesConnection> {
  if (connection.credentialType === 'rancher') {
    return connectionWithRancherKubeconfig(connection, timeoutMs, forceRefresh)
  }
  const token = connection.token || readStoredCredential(connection.id)
  if (!token) {
    throw new Error('저장된 서비스 어카운트 토큰이 없습니다. 연결 다이얼로그에서 토큰을 입력해 동기화하세요.')
  }
  return { ...connection, token }
}

function normalizeTimeout(input: unknown): number {
  const root = isRecord(input) ? input : {}
  const timeoutMs = numberValue(root.timeoutMs, KUBERNETES_TIMEOUT_MS)
  return Math.max(5_000, Math.min(60_000, timeoutMs))
}

function httpErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback
  const message = cleanText(payload.message, 400)
  if (message) return message
  const status = cleanText(payload.status, 120)
  const reason = cleanText(payload.reason, 120)
  return [status, reason].filter(Boolean).join(' ') || fallback
}

class KubernetesHttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'KubernetesHttpError'
    this.statusCode = statusCode
  }
}

function isAuthError(error: unknown): boolean {
  return error instanceof KubernetesHttpError && (error.statusCode === 401 || error.statusCode === 403)
}

function normalizeRancherUrl(value: unknown): string {
  const raw = cleanText(value, 2048)
  if (!raw) throw new Error('Rancher API URL이 필요합니다.')
  const parsed = new URL(raw)
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1')
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('Rancher API URL은 HTTPS여야 합니다. 로컬 테스트는 localhost HTTP만 허용됩니다.')
  }
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '').replace(/\/v3$/u, '')
  return parsed.pathname ? `${parsed.origin}${parsed.pathname}` : parsed.origin
}

function rancherSourceId(rancherUrl: string): string {
  return `rancher-${createHash('sha256').update(rancherUrl).digest('hex').slice(0, 12)}`
}

function rancherRequestUrl(rancherUrl: string, path: string): URL {
  const baseUrl = new URL(rancherUrl)
  if (/^https?:\/\//iu.test(path)) {
    const url = new URL(path)
    if (url.origin !== baseUrl.origin) {
      throw new Error('Rancher API 응답의 다음 URL이 입력한 Rancher 호스트와 다릅니다.')
    }
    return url
  }
  const url = new URL(rancherUrl)
  const queryIndex = path.indexOf('?')
  const pathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path
  const search = queryIndex >= 0 ? path.slice(queryIndex + 1) : ''
  const basePath = url.pathname.replace(/\/+$/u, '')
  const endpointPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  url.pathname =
    basePath && endpointPath.startsWith(`${basePath}/`)
      ? endpointPath
      : `${basePath}${endpointPath}` || '/'
  url.search = search
  return url
}

function rancherAuthorization(token: string, mode: 'bearer' | 'basic'): string {
  if (mode === 'basic') return `Basic ${Buffer.from(token).toString('base64')}`
  return `Bearer ${token}`
}

function rancherJsonRequest(
  input: {
    rancherUrl: string
    token: string
    caCert?: string
    insecureSkipTlsVerify?: boolean
    method?: 'GET' | 'POST'
    path: string
    body?: unknown
    authMode?: 'bearer' | 'basic'
  },
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolveRequest, rejectRequest) => {
    const url = rancherRequestUrl(input.rancherUrl, input.path)
    const body = input.body == null ? '' : JSON.stringify(input.body)
    const options: HttpRequestOptions & HttpsRequestOptions = {
      method: input.method ?? 'GET',
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        authorization: rancherAuthorization(input.token, input.authMode ?? 'bearer'),
        'content-type': 'application/json',
        'user-agent': 'sepilotd-desktop-rancher/1.0',
        ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
      },
    }
    if (url.protocol === 'https:') {
      options.ca = input.caCert
      options.rejectUnauthorized = !input.insecureSkipTlsVerify
    }

    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      options,
      (response) => {
        const chunks: Buffer[] = []
        let totalBytes = 0
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength
          if (totalBytes > KUBERNETES_MAX_BYTES) {
            request.destroy(new Error('Rancher API 응답이 너무 큽니다.'))
            return
          }
          chunks.push(chunk)
        })
        response.once('end', () => {
          const statusCode = response.statusCode ?? 0
          const text = Buffer.concat(chunks).toString('utf-8')
          let payload: unknown = null
          if (text) {
            try {
              payload = JSON.parse(text)
            } catch (error) {
              rejectRequest(error)
              return
            }
          }
          if (statusCode < 200 || statusCode >= 300) {
            rejectRequest(
              new KubernetesHttpError(
                statusCode,
                httpErrorMessage(payload, `Rancher API가 HTTP ${statusCode}를 반환했습니다.`),
              ),
            )
            return
          }
          resolveRequest(payload)
        })
      },
    )
    request.once('timeout', () => {
      request.destroy(new Error(`Rancher API 조회가 ${timeoutMs}ms 안에 끝나지 않았습니다.`))
    })
    request.once('error', rejectRequest)
    if (body) request.write(body)
    request.end()
  })
}

async function rancherJsonRequestWithFallback(
  input: Omit<Parameters<typeof rancherJsonRequest>[0], 'authMode'>,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await rancherJsonRequest({ ...input, authMode: 'bearer' }, timeoutMs)
  } catch (error) {
    if (!isAuthError(error) || !input.token.includes(':')) throw error
    return rancherJsonRequest({ ...input, authMode: 'basic' }, timeoutMs)
  }
}

function kubeconfigStringFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return ''
  return cleanText(payload.config, KUBERNETES_MAX_BYTES) || cleanText(payload.kubeconfig, KUBERNETES_MAX_BYTES)
}

function kubeconfigValue(record: K8sRecord, key: string): unknown {
  return record[key]
}

function parseKubeconfig(kubeconfig: string): NormalizedKubernetesConnectionBase {
  const parsed = YAML.parse(kubeconfig) as unknown
  if (!isRecord(parsed)) throw new Error('Rancher kubeconfig 형식을 읽을 수 없습니다.')
  const contexts = arrayAtPath(parsed, ['contexts']).filter(isRecord)
  const clusters = arrayAtPath(parsed, ['clusters']).filter(isRecord)
  const users = arrayAtPath(parsed, ['users']).filter(isRecord)
  const currentContext = cleanText(parsed['current-context'], 240)
  const contextEntry =
    contexts.find((entry) => cleanText(entry.name, 240) === currentContext) ?? contexts[0]
  const context = isRecord(contextEntry?.context) ? contextEntry.context : {}
  const clusterName = cleanText(context.cluster, 240)
  const userName = cleanText(context.user, 240)
  const clusterEntry =
    clusters.find((entry) => cleanText(entry.name, 240) === clusterName) ?? clusters[0]
  const userEntry = users.find((entry) => cleanText(entry.name, 240) === userName) ?? users[0]
  const cluster = isRecord(clusterEntry?.cluster) ? clusterEntry.cluster : {}
  const user = isRecord(userEntry?.user) ? userEntry.user : {}
  const server = cleanText(kubeconfigValue(cluster, 'server'), 2048)
  const token =
    cleanText(kubeconfigValue(user, 'token'), 20_000) ||
    cleanText(valueAtPath(user, ['auth-provider', 'config', 'access-token']), 20_000)
  const caCertData = cleanText(kubeconfigValue(cluster, 'certificate-authority-data'), 200_000)
  const caCert = caCertData
    ? Buffer.from(caCertData, 'base64').toString('utf-8')
    : cleanText(kubeconfigValue(cluster, 'certificate-authority'), 100_000)
  if (!server) throw new Error('Rancher kubeconfig에 Kubernetes server URL이 없습니다.')
  if (!token) throw new Error('Rancher kubeconfig에 bearer token이 없습니다.')
  return normalizeConnection({
    connection: {
      apiUrl: server,
      token,
      ...(caCert ? { caCert } : {}),
      insecureSkipTlsVerify: Boolean(kubeconfigValue(cluster, 'insecure-skip-tls-verify')),
    },
  })
}

function cacheFresh(cache: { expiresAt: number } | null): boolean {
  return Boolean(cache && cache.expiresAt > Date.now() + 60_000)
}

function rancherCacheTtlMs(value: unknown): number {
  const minutes = numberValue(value, RANCHER_KUBECONFIG_CACHE_TTL_MINUTES)
  return Math.max(5, Math.min(60 * 24 * 30, minutes)) * 60_000
}

async function generateRancherKubeconfig(
  input: {
    rancherUrl: string
    token: string
    caCert?: string
    insecureSkipTlsVerify?: boolean
    clusterId: string
    actionUrl?: string
  },
  timeoutMs: number,
): Promise<string> {
  const actionPath =
    input.actionUrl ||
    `/v3/clusters/${encodeURIComponent(input.clusterId)}?action=generateKubeconfig`
  const payload = await rancherJsonRequestWithFallback(
    {
      rancherUrl: input.rancherUrl,
      token: input.token,
      caCert: input.caCert,
      insecureSkipTlsVerify: input.insecureSkipTlsVerify,
      method: 'POST',
      path: actionPath,
    },
    timeoutMs,
  )
  const kubeconfig = kubeconfigStringFromPayload(payload)
  if (!kubeconfig) throw new Error('Rancher가 kubeconfig를 반환하지 않았습니다.')
  return kubeconfig
}

async function refreshRancherConnectionKubeconfig(
  connection: NormalizedKubernetesConnectionBase,
  timeoutMs: number,
): Promise<NormalizedKubernetesConnection> {
  const rancherSourceId = connection.rancherSourceId || ''
  const rancherClusterId = connection.rancherClusterId || ''
  if (!rancherSourceId || !rancherClusterId) {
    throw new Error('Rancher 연결 메타데이터가 없습니다. Rancher 토큰으로 다시 가져오세요.')
  }
  const source = readStoredRancherSource(rancherSourceId)
  if (!source) throw new Error('저장된 Rancher API token이 없습니다. Rancher 연결을 다시 실행하세요.')
  const kubeconfig = await generateRancherKubeconfig(
    {
      rancherUrl: source.url,
      token: source.token,
      caCert: source.caCert,
      insecureSkipTlsVerify: source.insecureSkipTlsVerify,
      clusterId: rancherClusterId,
    },
    timeoutMs,
  )
  const parsed = parseKubeconfig(kubeconfig)
  const fetchedAt = Date.now()
  const expiresAt = fetchedAt + rancherCacheTtlMs(undefined)
  const resolved = normalizeConnection({
    connection: {
      ...connection,
      apiUrl: parsed.apiUrl,
      token: parsed.token,
      caCert: parsed.caCert || connection.caCert,
      insecureSkipTlsVerify: parsed.insecureSkipTlsVerify || connection.insecureSkipTlsVerify,
      credentialType: 'rancher',
    },
  }) as NormalizedKubernetesConnectionBase
  storeKubeconfigCache(connection.id, {
    kubeconfig,
    ...(parsed.token ? { token: parsed.token } : {}),
    fetchedAt,
    expiresAt,
    rancherSourceId,
    rancherClusterId,
    rancherClusterName: connection.rancherClusterName,
  })
  return { ...resolved, token: parsed.token || '' }
}

async function connectionWithRancherKubeconfig(
  connection: NormalizedKubernetesConnectionBase,
  timeoutMs: number,
  forceRefresh: boolean,
): Promise<NormalizedKubernetesConnection> {
  const cache = readStoredKubeconfig(connection.id)
  if (!forceRefresh && cacheFresh(cache)) {
    const parsed = parseKubeconfig(cache!.kubeconfig)
    return {
      ...connection,
      apiUrl: parsed.apiUrl,
      token: parsed.token || '',
      caCert: parsed.caCert || connection.caCert,
      insecureSkipTlsVerify: parsed.insecureSkipTlsVerify || connection.insecureSkipTlsVerify,
      credentialType: 'rancher',
    }
  }
  return refreshRancherConnectionKubeconfig(connection, timeoutMs)
}

function kubernetesJsonRequest(
  connection: NormalizedKubernetesConnection,
  path: string,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolveRequest, rejectRequest) => {
    const url = kubernetesRequestUrl(connection.apiUrl, path)
    const options: HttpRequestOptions & HttpsRequestOptions = {
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${connection.token}`,
        'user-agent': 'sepilotd-desktop-kubernetes/1.0',
      },
    }
    if (url.protocol === 'https:') {
      options.ca = connection.caCert
      options.rejectUnauthorized = !connection.insecureSkipTlsVerify
    }

    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      options,
      (response) => {
        const chunks: Buffer[] = []
        let totalBytes = 0
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength
          if (totalBytes > KUBERNETES_MAX_BYTES) {
            request.destroy(new Error('Kubernetes API 응답이 너무 큽니다.'))
            return
          }
          chunks.push(chunk)
        })
        response.once('end', () => {
          const statusCode = response.statusCode ?? 0
          const body = Buffer.concat(chunks).toString('utf-8')
          let payload: unknown = null
          if (body) {
            try {
              payload = JSON.parse(body)
            } catch (error) {
              rejectRequest(error)
              return
            }
          }
          if (statusCode < 200 || statusCode >= 300) {
            rejectRequest(
              new KubernetesHttpError(
                statusCode,
                httpErrorMessage(payload, `Kubernetes API가 HTTP ${statusCode}를 반환했습니다.`),
              ),
            )
            return
          }
          resolveRequest(payload)
        })
      },
    )
    request.once('timeout', () => {
      request.destroy(new Error(`Kubernetes API 조회가 ${timeoutMs}ms 안에 끝나지 않았습니다.`))
    })
    request.once('error', rejectRequest)
    request.end()
  })
}

function kubernetesRequestUrl(apiUrl: string, requestPath: string): URL {
  const url = new URL(apiUrl)
  const queryIndex = requestPath.indexOf('?')
  const pathname = queryIndex >= 0 ? requestPath.slice(0, queryIndex) : requestPath
  const search = queryIndex >= 0 ? requestPath.slice(queryIndex + 1) : ''
  const basePath = url.pathname.replace(/\/+$/u, '')
  const endpointPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  url.pathname = `${basePath}${endpointPath}` || '/'
  url.search = search
  return url
}

async function kubernetesList(
  connection: NormalizedKubernetesConnection,
  path: string,
  timeoutMs: number,
): Promise<K8sRecord[]> {
  const items: K8sRecord[] = []
  let continueToken = ''
  for (let page = 0; page < KUBERNETES_MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const requestPath = `${path}${separator}limit=${KUBERNETES_PAGE_LIMIT}${
      continueToken ? `&continue=${encodeURIComponent(continueToken)}` : ''
    }`
    const payload = await kubernetesJsonRequest(connection, requestPath, timeoutMs)
    if (!isRecord(payload)) return items
    for (const item of arrayAtPath(payload, ['items'])) {
      if (isRecord(item)) items.push(item)
    }
    continueToken = cleanText(valueAtPath(payload, ['metadata', 'continue']), 4000)
    if (!continueToken) break
  }
  return items
}

function parseCpuCores(raw: unknown): number {
  const value = cleanText(raw, 80)
  if (!value) return 0
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric)) return 0
  if (value.endsWith('n')) return numeric / 1_000_000_000
  if (value.endsWith('u')) return numeric / 1_000_000
  if (value.endsWith('m')) return numeric / 1000
  return numeric
}

function parseMemoryBytes(raw: unknown): number {
  const value = cleanText(raw, 80)
  if (!value) return 0
  const match = value.match(/^([+-]?\d+(?:\.\d+)?)([EPTGMK]i?|[numkMGTPE])?$/u)
  if (!match) return 0
  const numeric = Number.parseFloat(match[1] ?? '0')
  if (!Number.isFinite(numeric)) return 0
  const suffix = match[2] ?? ''
  const binary: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  }
  const decimal: Record<string, number> = {
    n: 1e-9,
    u: 1e-6,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  }
  return numeric * (binary[suffix] ?? decimal[suffix] ?? 1)
}

function allocatableCpu(node: K8sRecord): number {
  return parseCpuCores(valueAtPath(node, ['status', 'allocatable', 'cpu']))
}

function allocatableMemory(node: K8sRecord): number {
  return parseMemoryBytes(valueAtPath(node, ['status', 'allocatable', 'memory']))
}

function roundPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function nodeReady(node: K8sRecord): boolean {
  return arrayAtPath(node, ['status', 'conditions']).some((condition) => {
    if (!isRecord(condition)) return false
    return condition.type === 'Ready' && condition.status === 'True'
  })
}

function nodeRegion(nodes: K8sRecord[]): string {
  for (const node of nodes) {
    const labels = k8sLabels(node)
    const region = labels['topology.kubernetes.io/region'] ?? labels['failure-domain.beta.kubernetes.io/region']
    if (region) return region
  }
  return ''
}

function inferProvider(requestedProvider: string, nodes: K8sRecord[]): string {
  if (requestedProvider && requestedProvider !== 'Auto') return requestedProvider
  for (const node of nodes) {
    const providerId = stringAtPath(node, ['spec', 'providerID']).toLowerCase()
    const labels = k8sLabels(node)
    if (providerId.startsWith('aws://') || labels['eks.amazonaws.com/nodegroup']) return 'AWS'
    if (providerId.startsWith('gce://') || labels['cloud.google.com/gke-nodepool']) return 'GCP'
    if (providerId.startsWith('azure://') || labels['kubernetes.azure.com/cluster']) return 'Azure'
    if (labels['k3s.io/hostname']) return 'K3s'
    if (providerId.startsWith('vsphere://')) return 'On-Prem'
  }
  return 'Kubernetes'
}

function latestTimestamp(...values: unknown[]): number {
  let latest = 0
  for (const value of values) {
    const text = cleanText(value, 80)
    if (!text) continue
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) latest = Math.max(latest, parsed)
  }
  return latest
}

function ageText(timestampMs: number): string {
  if (!timestampMs) return ''
  const diffMs = Math.max(0, Date.now() - timestampMs)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return new Date(timestampMs).toLocaleDateString('ko-KR')
}

function eventSeverity(event: K8sRecord): '정보' | '경고' | '장애' {
  const type = cleanText(event.type, 80)
  const reason = cleanText(event.reason, 160).toLowerCase()
  const message = (
    cleanText(event.message, 400) ||
    cleanText(event.note, 400) ||
    cleanText(event.action, 160)
  ).toLowerCase()
  if (
    reason.includes('failed') ||
    reason.includes('backoff') ||
    reason.includes('unhealthy') ||
    reason.includes('crashloop') ||
    message.includes('crashloop') ||
    message.includes('imagepullbackoff')
  ) {
    return '장애'
  }
  return type === 'Warning' ? '경고' : '정보'
}

function eventNamespace(event: K8sRecord): string {
  const regarding = recordAtPath(event, ['regarding'])
  const involvedObject = recordAtPath(event, ['involvedObject'])
  return (
    cleanText(regarding.namespace, 160) ||
    cleanText(involvedObject.namespace, 160) ||
    k8sNamespace(event)
  )
}

function normalizeEvents(events: K8sRecord[], clusterId: string): DesktopKubernetesEventSnapshot[] {
  return events
    .map((event, index): DesktopKubernetesEventSnapshot => {
      const reason = cleanText(event.reason, 160) || cleanText(event.action, 160) || 'Event'
      const message =
        cleanText(event.message, 360) ||
        cleanText(event.note, 360) ||
        cleanText(event.reportingController, 160)
      const createdAt = latestTimestamp(
        event.eventTime,
        event.deprecatedLastTimestamp,
        event.lastTimestamp,
        event.firstTimestamp,
        valueAtPath(event, ['metadata', 'creationTimestamp']),
      )
      return {
        id: `${clusterId}-event-${safeId(k8sUid(event) || `${reason}-${index}`)}`,
        clusterId,
        severity: eventSeverity(event),
        title: message ? `${reason}: ${message}`.slice(0, 220) : reason,
        namespace: eventNamespace(event),
        age: ageText(createdAt),
        status: 'open',
        createdAt: createdAt || Date.now(),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 80)
}

function podReady(pod: K8sRecord): boolean {
  const phase = stringAtPath(pod, ['status', 'phase'])
  if (phase === 'Succeeded') return true
  if (phase !== 'Running') return false
  const statuses = arrayAtPath(pod, ['status', 'containerStatuses']).filter(isRecord)
  return statuses.length > 0 && statuses.every((status) => status.ready === true)
}

function podOperationallyRelevant(pod: K8sRecord): boolean {
  return stringAtPath(pod, ['status', 'phase']) !== 'Succeeded'
}

function podRestarts(pod: K8sRecord): number {
  return arrayAtPath(pod, ['status', 'containerStatuses'])
    .filter(isRecord)
    .reduce((sum, status) => sum + numberValue(status.restartCount), 0)
}

function deploymentStatus(deployment: K8sRecord): '안정' | '진행중' | '실패' | '대기' {
  const replicas = numberValue(valueAtPath(deployment, ['spec', 'replicas']), 1)
  if (replicas === 0) return '대기'
  const conditions = arrayAtPath(deployment, ['status', 'conditions']).filter(isRecord)
  if (
    conditions.some(
      (condition) =>
        condition.type === 'Progressing' &&
        condition.status === 'False' &&
        cleanText(condition.reason, 160) === 'ProgressDeadlineExceeded',
    )
  ) {
    return '실패'
  }
  const readyReplicas = numberValue(valueAtPath(deployment, ['status', 'readyReplicas']))
  const updatedReplicas = numberValue(valueAtPath(deployment, ['status', 'updatedReplicas']))
  const unavailableReplicas = numberValue(valueAtPath(deployment, ['status', 'unavailableReplicas']))
  if (readyReplicas < replicas || updatedReplicas < replicas || unavailableReplicas > 0) {
    return '진행중'
  }
  return '안정'
}

function deploymentImageVersion(deployment: K8sRecord): string {
  const container = arrayAtPath(deployment, ['spec', 'template', 'spec', 'containers']).find(isRecord)
  const image = isRecord(container) ? cleanText(container.image, 240) : ''
  if (!image) return ''
  const atIndex = image.indexOf('@')
  if (atIndex >= 0) return image.slice(atIndex + 1, atIndex + 20)
  const colonIndex = image.lastIndexOf(':')
  return colonIndex >= 0 ? image.slice(colonIndex + 1, colonIndex + 80) : image
}

function normalizeDeployments(
  deployments: K8sRecord[],
  clusterId: string,
): DesktopKubernetesDeploymentSnapshot[] {
  return deployments
    .map((deployment, index): DesktopKubernetesDeploymentSnapshot => {
      const name = k8sName(deployment) || `deployment-${index + 1}`
      const namespace = k8sNamespace(deployment) || 'default'
      const replicas = numberValue(valueAtPath(deployment, ['spec', 'replicas']), 1)
      const readyReplicas = numberValue(valueAtPath(deployment, ['status', 'readyReplicas']))
      const status = deploymentStatus(deployment)
      const updatedAt =
        cleanText(valueAtPath(deployment, ['metadata', 'creationTimestamp']), 80) ||
        new Date().toISOString()
      return {
        id: `${clusterId}-deploy-${safeId(`${namespace}-${name}-${k8sUid(deployment) || index}`)}`,
        clusterId,
        service: name,
        namespace,
        version: deploymentImageVersion(deployment),
        status,
        progress: replicas > 0 ? Math.max(0, Math.min(100, Math.round((readyReplicas / replicas) * 100))) : 0,
        updatedAt,
      }
    })
    .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.service.localeCompare(b.service))
}

function namespaceStatsFor(
  namespaces: K8sRecord[],
  pods: K8sRecord[],
  deployments: DesktopKubernetesDeploymentSnapshot[],
  events: DesktopKubernetesEventSnapshot[],
  podMetricByNamespace: Map<string, NodeMetricsUsage>,
): Map<string, NamespaceStats> {
  const stats = new Map<string, NamespaceStats>()
  const ensure = (namespace: string): NamespaceStats => {
    const key = namespace || 'default'
    const current = stats.get(key)
    if (current) return current
    const next: NamespaceStats = {
      workloads: 0,
      podsReady: 0,
      podsTotal: 0,
      restarts: 0,
      cpuCores: 0,
      memoryBytes: 0,
      warningEvents: 0,
      incidentEvents: 0,
    }
    stats.set(key, next)
    return next
  }

  for (const namespace of namespaces) ensure(k8sName(namespace))
  for (const deployment of deployments) ensure(deployment.namespace).workloads += 1
  for (const pod of pods) {
    const namespace = k8sNamespace(pod) || 'default'
    const stat = ensure(namespace)
    if (podOperationallyRelevant(pod)) {
      stat.podsTotal += 1
      if (podReady(pod)) stat.podsReady += 1
    }
    stat.restarts += podRestarts(pod)
  }
  for (const event of events) {
    const stat = ensure(event.namespace || 'default')
    if (event.severity === '장애') stat.incidentEvents += 1
    if (event.severity === '경고') stat.warningEvents += 1
  }
  for (const [namespace, usage] of podMetricByNamespace.entries()) {
    const stat = ensure(namespace)
    stat.cpuCores = usage.cpuCores
    stat.memoryBytes = usage.memoryBytes
  }
  return stats
}

function normalizeNamespaces(
  namespaceItems: K8sRecord[],
  clusterId: string,
  stats: Map<string, NamespaceStats>,
  clusterCpu: number,
  clusterMemoryBytes: number,
): DesktopKubernetesNamespaceSnapshot[] {
  const names = new Set<string>(namespaceItems.map(k8sName).filter(Boolean))
  for (const name of stats.keys()) names.add(name)
  return Array.from(names)
    .sort((a, b) => a.localeCompare(b))
    .map((name): DesktopKubernetesNamespaceSnapshot => {
      const stat = stats.get(name) ?? {
        workloads: 0,
        podsReady: 0,
        podsTotal: 0,
        restarts: 0,
        cpuCores: 0,
        memoryBytes: 0,
        warningEvents: 0,
        incidentEvents: 0,
      }
      const status =
        stat.incidentEvents > 0 || stat.podsReady < stat.podsTotal
          ? '장애'
          : stat.warningEvents > 0 || stat.restarts > 0
            ? '경고'
            : '정상'
      return {
        id: `${clusterId}-ns-${safeId(name)}`,
        clusterId,
        name,
        workloads: stat.workloads,
        podsReady: stat.podsReady,
        podsTotal: stat.podsTotal,
        restarts: stat.restarts,
        cpuUsage: clusterCpu > 0 ? roundPercent((stat.cpuCores / clusterCpu) * 100) : null,
        memoryUsage:
          clusterMemoryBytes > 0 ? roundPercent((stat.memoryBytes / clusterMemoryBytes) * 100) : null,
        status,
      }
    })
}

function normalizeNodeMetrics(items: K8sRecord[]): Map<string, NodeMetricsUsage> {
  const metrics = new Map<string, NodeMetricsUsage>()
  for (const item of items) {
    const name = k8sName(item)
    if (!name) continue
    metrics.set(name, {
      cpuCores: parseCpuCores(valueAtPath(item, ['usage', 'cpu'])),
      memoryBytes: parseMemoryBytes(valueAtPath(item, ['usage', 'memory'])),
    })
  }
  return metrics
}

function normalizePodMetricNamespaces(items: K8sRecord[]): Map<string, NodeMetricsUsage> {
  const metrics = new Map<string, NodeMetricsUsage>()
  for (const item of items) {
    const namespace = k8sNamespace(item) || 'default'
    const current = metrics.get(namespace) ?? { cpuCores: 0, memoryBytes: 0 }
    for (const container of arrayAtPath(item, ['containers']).filter(isRecord)) {
      current.cpuCores += parseCpuCores(valueAtPath(container, ['usage', 'cpu']))
      current.memoryBytes += parseMemoryBytes(valueAtPath(container, ['usage', 'memory']))
    }
    metrics.set(namespace, current)
  }
  return metrics
}

function clusterStatus(
  nodes: number,
  readyNodes: number,
  events: DesktopKubernetesEventSnapshot[],
  deployments: DesktopKubernetesDeploymentSnapshot[],
): 'Healthy' | 'Degraded' | 'Down' {
  if (nodes === 0 || readyNodes === 0) return 'Down'
  if (
    readyNodes < nodes ||
    events.some((event) => event.severity === '장애') ||
    deployments.some((deployment) => deployment.status === '실패')
  ) {
    return 'Degraded'
  }
  return 'Healthy'
}

function rancherClusterId(item: K8sRecord): string {
  return cleanText(item.id, 180) || cleanText(valueAtPath(item, ['metadata', 'name']), 180)
}

function rancherClusterName(item: K8sRecord): string {
  return (
    cleanText(item.name, 180) ||
    cleanText(item.displayName, 180) ||
    cleanText(valueAtPath(item, ['spec', 'displayName']), 180) ||
    rancherClusterId(item)
  )
}

function rancherGenerateAction(item: K8sRecord): string {
  return cleanText(valueAtPath(item, ['actions', 'generateKubeconfig']), 2048)
}

async function listRancherClusters(
  source: {
    rancherUrl: string
    token: string
    caCert?: string
    insecureSkipTlsVerify?: boolean
  },
  timeoutMs: number,
): Promise<K8sRecord[]> {
  const clusters: K8sRecord[] = []
  let path = '/v3/clusters?limit=1000'
  for (let page = 0; page < KUBERNETES_MAX_PAGES && path; page += 1) {
    const payload = await rancherJsonRequestWithFallback({ ...source, path }, timeoutMs)
    if (!isRecord(payload)) break
    for (const item of arrayAtPath(payload, ['data'])) {
      if (isRecord(item) && rancherClusterId(item)) clusters.push(item)
    }
    const next = cleanText(valueAtPath(payload, ['pagination', 'next']), 2048)
    if (!next) break
    path = next
  }
  return clusters
}

function rancherConnectionId(sourceId: string, clusterId: string): string {
  return safeId(`${sourceId}-${clusterId}`)
}

export async function importDesktopRancherClusters(
  input: DesktopRancherImportInput | unknown,
): Promise<DesktopRancherImportResult> {
  const root = isRecord(input) ? input : {}
  const rancherUrl = normalizeRancherUrl(root.rancherUrl)
  const sourceId = rancherSourceId(rancherUrl)
  const storedSource = readStoredRancherSource(sourceId)
  const token = cleanText(root.token, 20_000) || storedSource?.token || ''
  if (!token) throw new Error('Rancher API token이 필요합니다.')
  const timeoutMs = normalizeTimeout(input)
  const caCert = cleanText(root.caCert, 100_000) || storedSource?.caCert || ''
  const insecureSkipTlsVerify =
    'insecureSkipTlsVerify' in root
      ? Boolean(root.insecureSkipTlsVerify)
      : Boolean(storedSource?.insecureSkipTlsVerify)
  const provider = cleanText(root.provider, 80) || 'Rancher'
  const cacheTtlMs = rancherCacheTtlMs(root.cacheTtlMinutes)
  const cacheTtlMinutes = Math.round(cacheTtlMs / 60_000)
  const checkedAt = Date.now()
  const source = {
    rancherUrl,
    token,
    ...(caCert ? { caCert } : {}),
    insecureSkipTlsVerify,
  }
  storeRancherSource(sourceId, { url: rancherUrl, token, caCert, insecureSkipTlsVerify })
  const rancherClusters = await listRancherClusters(source, timeoutMs)
  const snapshots: DesktopKubernetesSnapshotResult[] = []
  const connections: DesktopKubernetesConnectionSummary[] = []
  const failures: DesktopRancherImportFailure[] = []
  const warnings: string[] = []

  for (const rancherCluster of rancherClusters) {
    const clusterId = rancherClusterId(rancherCluster)
    const name = rancherClusterName(rancherCluster)
    try {
      const kubeconfig = await generateRancherKubeconfig(
        {
          rancherUrl,
          token,
          caCert,
          insecureSkipTlsVerify,
          clusterId,
          actionUrl: rancherGenerateAction(rancherCluster),
        },
        timeoutMs,
      )
      const parsed = parseKubeconfig(kubeconfig)
      const connectionId = rancherConnectionId(sourceId, clusterId)
      const fetchedAt = Date.now()
      const expiresAt = fetchedAt + cacheTtlMs
      const connection = normalizeConnection({
        connection: {
          id: connectionId,
          name,
          provider,
          apiUrl: parsed.apiUrl,
          token: parsed.token,
          caCert: parsed.caCert,
          insecureSkipTlsVerify: parsed.insecureSkipTlsVerify || insecureSkipTlsVerify,
          credentialType: 'rancher',
          rancherSourceId: sourceId,
          rancherUrl,
          rancherClusterId: clusterId,
          rancherClusterName: name,
        },
      })
      storeKubeconfigCache(connectionId, {
        kubeconfig,
        ...(parsed.token ? { token: parsed.token } : {}),
        fetchedAt,
        expiresAt,
        rancherSourceId: sourceId,
        rancherClusterId: clusterId,
        rancherClusterName: name,
      })
      const snapshot = await fetchDesktopKubernetesSnapshot({
        connection,
        saveCredential: false,
        timeoutMs,
      })
      snapshots.push(snapshot)
      connections.push(snapshot.connection)
      warnings.push(...snapshot.warnings)
    } catch (error) {
      failures.push({
        clusterId,
        name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    ok: true,
    checkedAt,
    source: {
      id: sourceId,
      url: rancherUrl,
      credentialStored: Boolean(readStoredRancherSource(sourceId)),
      kubeconfigCacheTtlMinutes: cacheTtlMinutes,
    },
    connections,
    snapshots,
    failures,
    warnings,
  }
}

export async function fetchDesktopKubernetesSnapshot(
  input: DesktopKubernetesSnapshotInput | unknown,
): Promise<DesktopKubernetesSnapshotResult> {
  const root = isRecord(input) ? input : {}
  const connectionBase = normalizeConnection(input)
  const saveCredential = Boolean(root.saveCredential)
  const timeoutMs = normalizeTimeout(input)
  let connection = await connectionWithCredential(connectionBase, timeoutMs)
  const checkedAt = Date.now()
  const warnings: string[] = []

  const loadCoreResources = (resolved: NormalizedKubernetesConnection) =>
    Promise.all([
      kubernetesJsonRequest(resolved, '/version', timeoutMs),
      kubernetesList(resolved, '/api/v1/nodes', timeoutMs),
      kubernetesList(resolved, '/api/v1/namespaces', timeoutMs),
      kubernetesList(resolved, '/api/v1/pods', timeoutMs),
      kubernetesList(resolved, '/apis/apps/v1/deployments', timeoutMs),
    ])
  let versionPayload: unknown
  let nodes: K8sRecord[]
  let namespaces: K8sRecord[]
  let pods: K8sRecord[]
  let deploymentsRaw: K8sRecord[]
  try {
    ;[versionPayload, nodes, namespaces, pods, deploymentsRaw] = await loadCoreResources(connection)
  } catch (error) {
    if (connectionBase.credentialType !== 'rancher' || !isAuthError(error)) throw error
    connection = await connectionWithCredential(connectionBase, timeoutMs, true)
    ;[versionPayload, nodes, namespaces, pods, deploymentsRaw] = await loadCoreResources(connection)
  }

  let eventsRaw: K8sRecord[] = []
  try {
    eventsRaw = await kubernetesList(connection, '/apis/events.k8s.io/v1/events', timeoutMs)
  } catch {
    try {
      eventsRaw = await kubernetesList(connection, '/api/v1/events', timeoutMs)
    } catch (fallbackError) {
      warnings.push(
        `Event 조회 실패: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
      )
    }
  }

  let nodeMetricItems: K8sRecord[] = []
  let podMetricItems: K8sRecord[] = []
  try {
    ;[nodeMetricItems, podMetricItems] = await Promise.all([
      kubernetesList(connection, '/apis/metrics.k8s.io/v1beta1/nodes', timeoutMs),
      kubernetesList(connection, '/apis/metrics.k8s.io/v1beta1/pods', timeoutMs),
    ])
  } catch (error) {
    warnings.push(
      `metrics-server 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const clusterId = `cluster-${connection.id}`
  const nodeCount = nodes.length
  const readyNodes = nodes.filter(nodeReady).length
  const totalCpu = nodes.reduce((sum, node) => sum + allocatableCpu(node), 0)
  const totalMemoryBytes = nodes.reduce((sum, node) => sum + allocatableMemory(node), 0)
  const nodeMetrics = normalizeNodeMetrics(nodeMetricItems)
  const totalCpuUsage = Array.from(nodeMetrics.values()).reduce((sum, usage) => sum + usage.cpuCores, 0)
  const totalMemoryUsage = Array.from(nodeMetrics.values()).reduce(
    (sum, usage) => sum + usage.memoryBytes,
    0,
  )
  const podMetricByNamespace = normalizePodMetricNamespaces(podMetricItems)
  const deployments = normalizeDeployments(deploymentsRaw, clusterId)
  const events = normalizeEvents(eventsRaw, clusterId)
  const namespaceStats = namespaceStatsFor(
    namespaces,
    pods,
    deployments,
    events,
    podMetricByNamespace,
  )
  const namespaceSnapshots = normalizeNamespaces(
    namespaces,
    clusterId,
    namespaceStats,
    totalCpu,
    totalMemoryBytes,
  )
  const version = isRecord(versionPayload)
    ? cleanText(versionPayload.gitVersion, 80) || cleanText(versionPayload.major, 20)
    : ''
  const status = clusterStatus(nodeCount, readyNodes, events, deployments)
  const provider = inferProvider(connection.provider, nodes)
  if (connectionBase.token && saveCredential) storeCredential(connection.id, connectionBase.token)
  const connectionSummary: DesktopKubernetesConnectionSummary = {
    id: connection.id,
    name: connection.name,
    provider,
    apiUrl: connection.apiUrl,
    ...(connection.caCert ? { caCert: connection.caCert } : {}),
    insecureSkipTlsVerify: connection.insecureSkipTlsVerify,
    credentialType: connection.credentialType,
    rancherSourceId: connection.rancherSourceId,
    rancherUrl: connection.rancherUrl,
    rancherClusterId: connection.rancherClusterId,
    rancherClusterName: connection.rancherClusterName,
    kubeconfigCached: connection.credentialType === 'rancher' ? Boolean(readStoredKubeconfig(connection.id)) : undefined,
    kubeconfigFetchedAt: readStoredKubeconfig(connection.id)?.fetchedAt,
    kubeconfigExpiresAt: readStoredKubeconfig(connection.id)?.expiresAt,
    credentialStored: Boolean(readStoredCredential(connection.id)),
    lastSyncAt: checkedAt,
    lastSyncStatus: 'success',
  }
  const cluster: DesktopKubernetesClusterSnapshot = {
    id: clusterId,
    connectionId: connection.id,
    name: connection.name,
    provider,
    apiUrl: connection.apiUrl,
    region: nodeRegion(nodes),
    nodes: nodeCount,
    readyNodes,
    vcpu: Math.round(totalCpu * 10) / 10,
    memoryGb: Math.round((totalMemoryBytes / 1024 ** 3) * 10) / 10,
    version,
    status,
    cpuUsage: totalCpu > 0 && nodeMetrics.size > 0 ? roundPercent((totalCpuUsage / totalCpu) * 100) : null,
    memoryUsage:
      totalMemoryBytes > 0 && nodeMetrics.size > 0
        ? roundPercent((totalMemoryUsage / totalMemoryBytes) * 100)
        : null,
    storageUsage: null,
    lastSeen: new Date(checkedAt).toLocaleString('ko-KR'),
    lastSyncAt: checkedAt,
    warnings,
  }

  return {
    ok: true,
    checkedAt,
    connection: connectionSummary,
    cluster,
    namespaces: namespaceSnapshots,
    events,
    deployments,
    warnings,
  }
}
