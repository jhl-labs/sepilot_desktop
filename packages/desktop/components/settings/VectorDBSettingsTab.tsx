'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { DaemonConfig } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRagApi, type RagVectorDbInfo } from '@/lib/api/rag'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { SemanticPipelineStatus } from './_shared/SemanticPipelineStatus'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'vector-db',
  section: 'memory',
  label: 'Vector DB',
  search: ['vector', 'embedding', 'rag', 'rerank', 'qdrant', 'opensearch', 'elasticsearch', 'meilisearch', 'custom api'],
  render: () => <VectorDBSettingsTab />,
})

const BACKENDS = [
  { id: 'auto', label: '자동 (sqlite-vec -> sqlite-scan)' },
  { id: 'sqlite-vec', label: 'SQLite + vector index' },
  { id: 'sqlite-scan', label: 'SQLite full scan (fallback)' },
  { id: 'qdrant', label: 'Qdrant' },
  { id: 'opensearch', label: 'OpenSearch' },
  { id: 'elasticsearch', label: 'Elasticsearch' },
  { id: 'meilisearch', label: 'Meilisearch' },
  { id: 'custom-api', label: 'Custom API' },
] as const

type Backend = (typeof BACKENDS)[number]['id']
type RerankProvider = 'local' | 'custom-api'
type AuthType = 'none' | 'bearer' | 'api-key' | 'basic'

interface BackendState {
  url: string
  index: string
  collection: string
  apiKey: string
  authType: AuthType
  authHeaderName: string
  authUsername: string
  authPassword: string
  username: string
  password: string
  embedder: string
  headers: string
  healthPath: string
  configurePath: string
  upsertPath: string
  deletePath: string
  searchPath: string
  clearPath: string
  timeoutMs: string
}

interface RagState {
  defaultLimit: string
  candidateMultiplier: string
  scoreThreshold: string
  rerankEnabled: boolean
  rerankProvider: RerankProvider
  rerankModel: string
  rerankEndpoint: string
  rerankApiKey: string
  rerankAuthType: AuthType
  rerankAuthHeaderName: string
  rerankAuthUsername: string
  rerankAuthPassword: string
  rerankHeaders: string
  rerankHealthPath: string
  rerankTimeoutMs: string
  rerankWeight: string
}

const emptyBackend: BackendState = {
  url: '',
  index: '',
  collection: '',
  apiKey: '',
  authType: 'bearer',
  authHeaderName: '',
  authUsername: '',
  authPassword: '',
  username: '',
  password: '',
  embedder: '',
  headers: '{}',
  healthPath: '/health',
  configurePath: '',
  upsertPath: '/vectors/upsert',
  deletePath: '/vectors/delete',
  searchPath: '/vectors/search',
  clearPath: '',
  timeoutMs: '15000',
}

const defaultRag: RagState = {
  defaultLimit: '8',
  candidateMultiplier: '5',
  scoreThreshold: '0',
  rerankEnabled: false,
  rerankProvider: 'local',
  rerankModel: '',
  rerankEndpoint: '',
  rerankApiKey: '',
  rerankAuthType: 'bearer',
  rerankAuthHeaderName: '',
  rerankAuthUsername: '',
  rerankAuthPassword: '',
  rerankHeaders: '{}',
  rerankHealthPath: '',
  rerankTimeoutMs: '10000',
  rerankWeight: '0.35',
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function numberInRange(
  label: string,
  value: string,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): number {
  const parsed = numberOrUndefined(value)
  if (parsed === undefined || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    const kind = integer ? '정수' : '숫자'
    throw new Error(`${label}은(는) ${min}~${max} 범위의 ${kind}여야 합니다.`)
  }
  return parsed
}

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseHeaders(value: string): Record<string, string> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object.')
  }
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, raw]) => (
      typeof raw === 'string' ? [[key, raw] as const] : []
    )),
  )
}

function stringifyHeaders(value: Record<string, string> | undefined): string {
  return JSON.stringify(value ?? {}, null, 2)
}

function stringField(value: unknown, key: string, fallback = ''): string {
  if (!value || typeof value !== 'object' || !(key in value)) return fallback
  const raw = (value as Record<string, unknown>)[key]
  return raw == null ? fallback : String(raw)
}

function authTypeField(value: unknown): AuthType {
  if (!value || typeof value !== 'object' || !('type' in value)) return 'bearer'
  const raw = (value as Record<string, unknown>).type
  return raw === 'none' || raw === 'bearer' || raw === 'api-key' || raw === 'basic'
    ? raw
    : 'bearer'
}

function authField(value: unknown, key: string): string {
  if (!value || typeof value !== 'object' || !('auth' in value)) return ''
  const auth = (value as Record<string, unknown>).auth
  return stringField(auth, key)
}

function buildAuthInput({
  headerName,
  password,
  type,
  username,
}: {
  headerName: string
  password: string
  type: AuthType
  username: string
}): Record<string, string> | undefined {
  if (type === 'bearer' && !headerName.trim()) return undefined
  return {
    type,
    ...(headerName.trim() ? { headerName: headerName.trim() } : {}),
    ...(username.trim() ? { username: username.trim() } : {}),
    ...(password.trim() ? { password: password.trim() } : {}),
  }
}

function backendFromConfig(memory: DaemonConfig['memory']): BackendState {
  const selected = memory.vectorBackend
  const remote =
    selected === 'qdrant'
      ? memory.qdrant
      : selected === 'opensearch'
        ? memory.opensearch
        : selected === 'elasticsearch'
          ? memory.elasticsearch
          : selected === 'meilisearch'
            ? memory.meilisearch
            : selected === 'custom-api'
              ? memory.customApi
              : undefined
  return {
    ...emptyBackend,
    url: remote?.url ?? '',
    index: stringField(remote, 'index'),
    collection: stringField(remote, 'collection'),
    apiKey: remote?.apiKey ?? '',
    authType: authTypeField(
      remote && typeof remote === 'object' && 'auth' in remote
        ? remote.auth
        : undefined,
    ),
    authHeaderName: authField(remote, 'headerName'),
    authUsername: authField(remote, 'username'),
    authPassword: authField(remote, 'password'),
    username: stringField(remote, 'username'),
    password: stringField(remote, 'password'),
    embedder: stringField(remote, 'embedder'),
    headers: stringifyHeaders(
      remote && typeof remote === 'object' && 'headers' in remote
        ? remote.headers as Record<string, string> | undefined
        : undefined,
    ),
    healthPath: stringField(remote, 'healthPath', '/health'),
    configurePath: stringField(remote, 'configurePath'),
    upsertPath: stringField(remote, 'upsertPath', '/vectors/upsert'),
    deletePath: stringField(remote, 'deletePath', '/vectors/delete'),
    searchPath: stringField(remote, 'searchPath', '/vectors/search'),
    clearPath: stringField(remote, 'clearPath'),
    timeoutMs: stringField(remote, 'timeoutMs', '15000'),
  }
}

function ragFromConfig(memory: DaemonConfig['memory']): RagState {
  const rag = memory.rag
  const rerank = rag?.rerank
  return {
    defaultLimit: String(rag?.defaultLimit ?? 8),
    candidateMultiplier: String(rag?.candidateMultiplier ?? 5),
    scoreThreshold: String(rag?.scoreThreshold ?? 0),
    rerankEnabled: Boolean(rerank?.enabled),
    rerankProvider: (rerank?.provider ?? 'local') as RerankProvider,
    rerankModel: rerank?.model ?? '',
    rerankEndpoint: rerank?.endpoint ?? '',
    rerankApiKey: rerank?.apiKey ?? '',
    rerankAuthType: authTypeField(rerank?.auth),
    rerankAuthHeaderName: authField(rerank, 'headerName'),
    rerankAuthUsername: authField(rerank, 'username'),
    rerankAuthPassword: authField(rerank, 'password'),
    rerankHeaders: stringifyHeaders(rerank?.headers),
    rerankHealthPath: rerank?.healthPath ?? '',
    rerankTimeoutMs: String(rerank?.timeoutMs ?? 10000),
    rerankWeight: String(rerank?.weight ?? 0.35),
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function VectorDBSettingsTab() {
  const transport = useTransport()
  const [vectorBackend, setVectorBackend] = useState<Backend>('auto')
  const [backend, setBackend] = useState<BackendState>(emptyBackend)
  const [rag, setRag] = useState<RagState>(defaultRag)
  const [runtimeInfo, setRuntimeInfo] = useState<RagVectorDbInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<'vector' | 'rerank' | null>(null)

  async function refreshRuntimeInfo(): Promise<void> {
    setStatusLoading(true)
    try {
      const api = await createRagApi(transport)
      setRuntimeInfo(await api.vectorDbInfo())
    } catch {
      setRuntimeInfo(null)
    } finally {
      setStatusLoading(false)
    }
  }

  async function fetchConfig(): Promise<void> {
    setLoading(true)
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? { authorization: `Bearer ${cfg.daemonToken}` }
        : {}
      const configResponse = await fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers })
      if (!configResponse.ok) throw new Error(`config fetch failed (${configResponse.status})`)
      const body = (await configResponse.json()) as {
        data?: DaemonConfig
      }
      const config = body.data
      if (!config) throw new Error('config response did not include data')
      setVectorBackend(config.memory.vectorBackend as Backend)
      setBackend(backendFromConfig(config.memory))
      setRag(ragFromConfig(config.memory))
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
    void refreshRuntimeInfo()
  }, [transport])

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const customHeaders = vectorBackend === 'custom-api' ? parseHeaders(backend.headers) : {}
      const customRerankEnabled = rag.rerankEnabled && rag.rerankProvider === 'custom-api'
      const rerankHeaders = customRerankEnabled ? parseHeaders(rag.rerankHeaders) : {}
      const defaultLimit = numberInRange('기본 결과 수', rag.defaultLimit, {
        min: 1,
        max: 50,
        integer: true,
      })
      const candidateMultiplier = numberInRange('후보 배수', rag.candidateMultiplier, {
        min: 1,
        max: 20,
        integer: true,
      })
      const scoreThreshold = numberInRange('최소 유사도', rag.scoreThreshold, { min: 0, max: 1 })
      const rerankWeight = numberInRange('재정렬 영향도', rag.rerankWeight, { min: 0, max: 1 })
      const rerankTimeoutMs = customRerankEnabled
        ? numberInRange('재정렬 제한 시간', rag.rerankTimeoutMs, {
            min: 1,
            max: 120000,
            integer: true,
          })
        : 10000
      const backendTimeoutMs = vectorBackend === 'custom-api'
        ? numberInRange('Backend 제한 시간', backend.timeoutMs, {
            min: 1,
            max: 120000,
            integer: true,
          })
        : 15000
      const body: Record<string, unknown> = {
        'memory.vectorBackend': vectorBackend,
        'memory.rag': {
          defaultLimit,
          candidateMultiplier,
          scoreThreshold,
          rerank: {
            enabled: rag.rerankEnabled,
            provider: rag.rerankProvider,
            model: optional(rag.rerankModel),
            endpoint: optional(rag.rerankEndpoint),
            apiKey: optional(rag.rerankApiKey),
            auth: buildAuthInput({
              type: rag.rerankAuthType,
              headerName: rag.rerankAuthHeaderName,
              username: rag.rerankAuthUsername,
              password: rag.rerankAuthPassword,
            }),
            headers: rerankHeaders,
            healthPath: optional(rag.rerankHealthPath),
            timeoutMs: rerankTimeoutMs,
            weight: rerankWeight,
          },
        },
      }
      if (vectorBackend === 'qdrant') {
        body['memory.qdrant'] = {
          url: backend.url.trim(),
          collection: optional(backend.collection),
          apiKey: optional(backend.apiKey),
        }
      } else if (vectorBackend === 'opensearch' || vectorBackend === 'elasticsearch') {
        body[`memory.${vectorBackend}`] = {
          url: backend.url.trim(),
          index: optional(backend.index),
          apiKey: optional(backend.apiKey),
          username: optional(backend.username),
          password: optional(backend.password),
        }
      } else if (vectorBackend === 'meilisearch') {
        body['memory.meilisearch'] = {
          url: backend.url.trim(),
          index: optional(backend.index),
          apiKey: optional(backend.apiKey),
          embedder: optional(backend.embedder),
        }
      } else if (vectorBackend === 'custom-api') {
        body['memory.customApi'] = {
          url: backend.url.trim(),
          apiKey: optional(backend.apiKey),
          auth: buildAuthInput({
            type: backend.authType,
            headerName: backend.authHeaderName,
            username: backend.authUsername,
            password: backend.authPassword,
          }),
          headers: customHeaders,
          healthPath: backend.healthPath.trim() || '/health',
          configurePath: optional(backend.configurePath),
          upsertPath: backend.upsertPath.trim() || '/vectors/upsert',
          deletePath: backend.deletePath.trim() || '/vectors/delete',
          searchPath: backend.searchPath.trim() || '/vectors/search',
          clearPath: optional(backend.clearPath),
          timeoutMs: backendTimeoutMs,
        }
      }

      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? {
            authorization: `Bearer ${cfg.daemonToken}`,
            'content-type': 'application/json',
          }
        : { 'content-type': 'application/json' }
      const r = await fetch(`${cfg.daemonOrigin}/api/v1/config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(`config save failed (${r.status})`)
      toast.success('Vector DB / RAG 설정을 저장했습니다.')
      await refreshRuntimeInfo()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function testConnection(kind: 'vector' | 'rerank'): Promise<void> {
    setTesting(kind)
    try {
      const api = await createRagApi(transport)
      const result = kind === 'vector'
        ? await api.testVectorDbConnection()
        : await api.testRerankConnection()
      const description = `${result.backend ?? kind} · ${result.message} · ${result.durationMs}ms`
      if (result.ok) {
        toast.success('연결 테스트 성공', { description })
      } else {
        toast.error('연결 테스트 실패', { description })
      }
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setTesting(null)
      if (kind === 'vector') void refreshRuntimeInfo()
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  }

  const showRemoteBackend = !['auto', 'sqlite-vec', 'sqlite-scan'].includes(vectorBackend)

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-sm">
      <SemanticPipelineStatus
        value={runtimeInfo}
        loading={statusLoading}
        actionLabel="저장된 backend 테스트"
        actionPending={testing === 'vector'}
        onAction={() => void testConnection('vector')}
      />

      <section className="grid gap-3 rounded-md border border-border/60 p-3">
        <div>
          <h3 className="text-xs font-semibold">벡터 저장소</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            임베딩 provider와 모델은 임베딩 탭에서 관리합니다.
          </p>
        </div>
        <Field label="Vector backend" hint="자동은 sqlite-vec을 우선 사용하고 필요할 때 안전하게 fallback합니다.">
          <select
            value={vectorBackend}
            onChange={(event) => setVectorBackend(event.target.value as Backend)}
            disabled={saving}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="Vector backend"
          >
            {BACKENDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {showRemoteBackend ? (
        <section className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-2">
          <Field label="Endpoint URL">
            <Input value={backend.url} onChange={(event) => setBackend((prev) => ({ ...prev, url: event.target.value }))} disabled={saving} placeholder="http://localhost:9200" />
          </Field>
          {vectorBackend === 'qdrant' ? (
            <Field label="Collection">
              <Input value={backend.collection} onChange={(event) => setBackend((prev) => ({ ...prev, collection: event.target.value }))} disabled={saving} placeholder="sepilotd-memory" />
            </Field>
          ) : vectorBackend !== 'custom-api' ? (
            <Field label="Index">
              <Input value={backend.index} onChange={(event) => setBackend((prev) => ({ ...prev, index: event.target.value }))} disabled={saving} placeholder="sepilotd-memory" />
            </Field>
          ) : null}
          <Field label="API Key">
            <Input value={backend.apiKey} onChange={(event) => setBackend((prev) => ({ ...prev, apiKey: event.target.value }))} disabled={saving} type="password" />
          </Field>
          {vectorBackend === 'opensearch' || vectorBackend === 'elasticsearch' ? (
            <>
              <Field label="Username">
                <Input value={backend.username} onChange={(event) => setBackend((prev) => ({ ...prev, username: event.target.value }))} disabled={saving} />
              </Field>
              <Field label="Password">
                <Input value={backend.password} onChange={(event) => setBackend((prev) => ({ ...prev, password: event.target.value }))} disabled={saving} type="password" />
              </Field>
            </>
          ) : null}
          {vectorBackend === 'meilisearch' ? (
            <Field label="Embedder">
              <Input value={backend.embedder} onChange={(event) => setBackend((prev) => ({ ...prev, embedder: event.target.value }))} disabled={saving} placeholder="sepilotd_memory" />
            </Field>
          ) : null}
          {vectorBackend === 'custom-api' ? (
            <>
              <Field label="Health Path">
                <Input value={backend.healthPath} onChange={(event) => setBackend((prev) => ({ ...prev, healthPath: event.target.value }))} disabled={saving} placeholder="/health" />
              </Field>
              <Field label="Auth Type">
                <select
                  value={backend.authType}
                  onChange={(event) => setBackend((prev) => ({ ...prev, authType: event.target.value as AuthType }))}
                  disabled={saving}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="bearer">Bearer token</option>
                  <option value="api-key">API key header</option>
                  <option value="basic">Basic auth</option>
                  <option value="none">None</option>
                </select>
              </Field>
              {backend.authType === 'api-key' || backend.authType === 'bearer' ? (
                <Field label="Auth Header">
                  <Input value={backend.authHeaderName} onChange={(event) => setBackend((prev) => ({ ...prev, authHeaderName: event.target.value }))} disabled={saving} placeholder={backend.authType === 'api-key' ? 'x-api-key' : 'authorization'} />
                </Field>
              ) : null}
              {backend.authType === 'basic' ? (
                <>
                  <Field label="Auth Username">
                    <Input value={backend.authUsername} onChange={(event) => setBackend((prev) => ({ ...prev, authUsername: event.target.value }))} disabled={saving} />
                  </Field>
                  <Field label="Auth Password">
                    <Input value={backend.authPassword} onChange={(event) => setBackend((prev) => ({ ...prev, authPassword: event.target.value }))} disabled={saving} type="password" />
                  </Field>
                </>
              ) : null}
              <Field label="Upsert Path">
                <Input value={backend.upsertPath} onChange={(event) => setBackend((prev) => ({ ...prev, upsertPath: event.target.value }))} disabled={saving} />
              </Field>
              <Field label="Search Path">
                <Input value={backend.searchPath} onChange={(event) => setBackend((prev) => ({ ...prev, searchPath: event.target.value }))} disabled={saving} />
              </Field>
              <Field label="Delete Path">
                <Input value={backend.deletePath} onChange={(event) => setBackend((prev) => ({ ...prev, deletePath: event.target.value }))} disabled={saving} />
              </Field>
              <Field label="Timeout ms">
                <Input value={backend.timeoutMs} onChange={(event) => setBackend((prev) => ({ ...prev, timeoutMs: event.target.value }))} disabled={saving} inputMode="numeric" />
              </Field>
              <Field label="Headers JSON">
                <textarea
                  value={backend.headers}
                  onChange={(event) => setBackend((prev) => ({ ...prev, headers: event.target.value }))}
                  disabled={saving}
                  className="min-h-20 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
                />
              </Field>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <h3 className="text-xs font-semibold">검색 품질</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            검색 결과 범위와 재정렬 방식을 조정합니다. 기본값은 대부분의 환경에 적합합니다.
          </p>
        </div>
        <Field label="기본 결과 수" hint="한 번에 반환할 결과, 1~50">
          <Input value={rag.defaultLimit} onChange={(event) => setRag((prev) => ({ ...prev, defaultLimit: event.target.value }))} disabled={saving} inputMode="numeric" />
        </Field>
        <Field label="후보 배수" hint="재정렬 전 후보 폭, 1~20">
          <Input value={rag.candidateMultiplier} onChange={(event) => setRag((prev) => ({ ...prev, candidateMultiplier: event.target.value }))} disabled={saving} inputMode="numeric" />
        </Field>
        <Field label="최소 유사도" hint="0이면 필터 없음, 0~1">
          <Input value={rag.scoreThreshold} onChange={(event) => setRag((prev) => ({ ...prev, scoreThreshold: event.target.value }))} disabled={saving} inputMode="decimal" />
        </Field>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={rag.rerankEnabled}
            onChange={(event) => setRag((prev) => ({ ...prev, rerankEnabled: event.target.checked }))}
            disabled={saving}
          />
          Rerank 사용
        </label>
        <Field label="재정렬 Provider">
          <select
            value={rag.rerankProvider}
            onChange={(event) => setRag((prev) => ({ ...prev, rerankProvider: event.target.value as RerankProvider }))}
            disabled={saving || !rag.rerankEnabled}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="local">Local lexical</option>
            <option value="custom-api">Custom API</option>
          </select>
        </Field>
        <Field label="재정렬 영향도" hint="원래 점수와 재정렬 점수 혼합 비율, 0~1">
          <Input value={rag.rerankWeight} onChange={(event) => setRag((prev) => ({ ...prev, rerankWeight: event.target.value }))} disabled={saving || !rag.rerankEnabled} inputMode="decimal" />
        </Field>
        {rag.rerankEnabled && rag.rerankProvider === 'custom-api' ? (
          <>
            <Field label="Rerank Endpoint">
              <Input value={rag.rerankEndpoint} onChange={(event) => setRag((prev) => ({ ...prev, rerankEndpoint: event.target.value }))} disabled={saving} placeholder="http://localhost:8080/rerank" />
            </Field>
            <Field label="Rerank Model">
              <Input value={rag.rerankModel} onChange={(event) => setRag((prev) => ({ ...prev, rerankModel: event.target.value }))} disabled={saving} />
            </Field>
            <Field label="Rerank API Key">
              <Input value={rag.rerankApiKey} onChange={(event) => setRag((prev) => ({ ...prev, rerankApiKey: event.target.value }))} disabled={saving} type="password" />
            </Field>
            <Field label="Rerank Health Path">
              <Input value={rag.rerankHealthPath} onChange={(event) => setRag((prev) => ({ ...prev, rerankHealthPath: event.target.value }))} disabled={saving} placeholder="비우면 rerank endpoint로 dry-run POST" />
            </Field>
            <Field label="Rerank Auth Type">
              <select
                value={rag.rerankAuthType}
                onChange={(event) => setRag((prev) => ({ ...prev, rerankAuthType: event.target.value as AuthType }))}
                disabled={saving}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="bearer">Bearer token</option>
                <option value="api-key">API key header</option>
                <option value="basic">Basic auth</option>
                <option value="none">None</option>
              </select>
            </Field>
            {rag.rerankAuthType === 'api-key' || rag.rerankAuthType === 'bearer' ? (
              <Field label="Rerank Auth Header">
                <Input value={rag.rerankAuthHeaderName} onChange={(event) => setRag((prev) => ({ ...prev, rerankAuthHeaderName: event.target.value }))} disabled={saving} placeholder={rag.rerankAuthType === 'api-key' ? 'x-api-key' : 'authorization'} />
              </Field>
            ) : null}
            {rag.rerankAuthType === 'basic' ? (
              <>
                <Field label="Rerank Auth Username">
                  <Input value={rag.rerankAuthUsername} onChange={(event) => setRag((prev) => ({ ...prev, rerankAuthUsername: event.target.value }))} disabled={saving} />
                </Field>
                <Field label="Rerank Auth Password">
                  <Input value={rag.rerankAuthPassword} onChange={(event) => setRag((prev) => ({ ...prev, rerankAuthPassword: event.target.value }))} disabled={saving} type="password" />
                </Field>
              </>
            ) : null}
            <Field label="Rerank Headers JSON">
              <textarea
                value={rag.rerankHeaders}
                onChange={(event) => setRag((prev) => ({ ...prev, rerankHeaders: event.target.value }))}
                disabled={saving}
                className="min-h-20 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
              />
            </Field>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testConnection('rerank')}
                disabled={saving || testing !== null}
              >
                {testing === 'rerank' ? '테스트 중...' : '저장된 rerank 테스트'}
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void fetchConfig()
            void refreshRuntimeInfo()
          }}
          disabled={saving}
        >
          새로고침
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
