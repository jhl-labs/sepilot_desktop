'use client'
import { useEffect, useMemo, useState } from 'react'
import { Cloud, DownloadCloud, HardDrive, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import type { DaemonConfig, DaemonProviderInfo } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createMemoryApi, type MemorySemanticStatus } from '@/lib/api/memory'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { SemanticPipelineStatus } from './_shared/SemanticPipelineStatus'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'embeddings',
  section: 'memory',
  label: '임베딩',
  search: ['embedding', 'model', 'local', 'cloud', 'ollama', 'openai'],
  render: () => <EmbeddingSettingsTab />,
})

type Source = 'cloud' | 'local'

interface ConfigProvider {
  id: string
  type: string
  apiKey?: string
  baseUrl?: string
  headers?: Record<string, string>
  models?: string[]
  default?: boolean
  [key: string]: unknown
}

interface ProviderOption extends DaemonProviderInfo {
  type: string
  source: Source
}

interface HeaderEntry {
  key: string
  value: string
}

interface ProviderConnectionState {
  type: string
  baseUrl: string
  apiKey: string
  headers: HeaderEntry[]
}

const LOCAL_EMBEDDING_PRESETS = [
  'nomic-embed-text',
  'mxbai-embed-large',
  'bge-m3',
  'snowflake-arctic-embed',
  'all-minilm',
]

const CLOUD_EMBEDDING_PRESETS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  'openai-compat': ['text-embedding-3-small', 'text-embedding-3-large'],
  'openai-compatible': ['text-embedding-3-small', 'text-embedding-3-large'],
  voyage: ['voyage-3-large', 'voyage-3.5', 'voyage-code-3'],
  cohere: ['embed-v4.0', 'embed-english-v3.0', 'embed-multilingual-v3.0'],
  jina: ['jina-embeddings-v3'],
  gemini: ['text-embedding-004', 'embedding-001'],
  google: ['text-embedding-004', 'embedding-001'],
}

const DISCOVERABLE_TYPES = new Set([
  'openai',
  'openai-compat',
  'openai-compatible',
  'anthropic',
  'ollama',
])

const EMBEDDING_PROVIDER_TYPES = new Set([
  'openai',
  'openai-compat',
  'openai-compatible',
  'ollama',
  'local',
  'voyage',
  'cohere',
  'jina',
  'gemini',
  'google',
  'custom',
])

function emptyConnection(type = ''): ProviderConnectionState {
  return {
    type,
    baseUrl: '',
    apiKey: '',
    headers: [],
  }
}

function headersToEntries(headers?: Record<string, string>): HeaderEntry[] {
  return Object.entries(headers ?? {}).map(([key, value]) => ({ key, value }))
}

function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const entry of entries) {
    const key = entry.key.trim()
    if (!key) continue
    headers[key] = entry.value
  }
  return headers
}

function providerToConnection(
  provider?: ConfigProvider,
  fallbackType = '',
): ProviderConnectionState {
  return {
    type: provider?.type ?? fallbackType,
    baseUrl: provider?.baseUrl ?? '',
    apiKey: provider?.apiKey ?? '',
    headers: headersToEntries(provider?.headers),
  }
}

function isLocalProvider(provider: Pick<ConfigProvider, 'type' | 'baseUrl'>): boolean {
  const type = provider.type.toLowerCase()
  if (type === 'ollama' || type === 'local') return true
  if (!provider.baseUrl) return false
  try {
    const host = new URL(provider.baseUrl).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

function looksLikeEmbeddingModel(model: string): boolean {
  const value = model.toLowerCase()
  return ['embed', 'embedding', 'nomic', 'mxbai', 'bge', 'e5', 'minilm', 'jina', 'voyage'].some(
    (token) => value.includes(token),
  )
}

function providerCanEmbedFromConfig(provider: ConfigProvider): boolean {
  const type = provider.type.toLowerCase()
  return EMBEDDING_PROVIDER_TYPES.has(type) || (provider.models ?? []).some(looksLikeEmbeddingModel)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function modelOptions(provider?: ProviderOption, currentModel?: string): string[] {
  if (!provider) return currentModel ? [currentModel] : []
  const configuredEmbeddings = provider.configuredModelIds.filter(looksLikeEmbeddingModel)
  const presets =
    provider.source === 'local'
      ? LOCAL_EMBEDDING_PRESETS
      : (CLOUD_EMBEDDING_PRESETS[provider.type.toLowerCase()] ?? [])
  return unique([
    ...provider.embeddingModelIds,
    ...configuredEmbeddings,
    ...presets,
    ...(currentModel ? [currentModel] : []),
  ])
}

function buildProviderOptions({
  configProviders,
  providerInfos,
  selectedProviderId,
}: {
  configProviders: ConfigProvider[]
  providerInfos: DaemonProviderInfo[]
  selectedProviderId: string
}): ProviderOption[] {
  const infos = new Map(providerInfos.map((provider) => [provider.id, provider]))
  const next: ProviderOption[] = []

  for (const provider of configProviders) {
    const info = infos.get(provider.id)
    const configuredModelIds = unique([
      ...(info?.configuredModelIds ?? []),
      ...(provider.models ?? []),
    ])
    const canEmbed =
      Boolean(info?.supportsEmbedding) ||
      providerCanEmbedFromConfig(provider) ||
      provider.id === selectedProviderId

    if (!canEmbed) continue

    next.push({
      id: provider.id,
      name: info?.name ?? provider.id,
      models: info?.models ?? [],
      supportsEmbedding: info?.supportsEmbedding ?? true,
      embeddingModelIds: unique([
        ...(info?.embeddingModelIds ?? []),
        ...configuredModelIds.filter(looksLikeEmbeddingModel),
      ]),
      configuredModelIds,
      health: info?.health ?? {
        status: 'unavailable',
        missingEnvVars: [],
      },
      type: provider.type,
      source: isLocalProvider(provider) ? 'local' : 'cloud',
    })
  }

  for (const info of providerInfos) {
    if (!info.supportsEmbedding || next.some((provider) => provider.id === info.id)) continue
    next.push({
      ...info,
      type: 'unknown',
      source: 'cloud',
    })
  }

  return next
}

function withSelectedProviderUpdate({
  connection,
  currentModel,
  providerConfigs,
  providerId,
  selectedProvider,
}: {
  connection: ProviderConnectionState
  currentModel: string
  providerConfigs: ConfigProvider[]
  providerId: string
  selectedProvider?: ProviderOption
}): ConfigProvider[] {
  const trimmedId = providerId.trim()
  if (!trimmedId) return providerConfigs

  const existing = providerConfigs.find((provider) => provider.id === trimmedId)
  const headers = entriesToHeaders(connection.headers)
  const models = unique([
    ...(existing?.models ?? []),
    ...(selectedProvider?.configuredModelIds ?? []),
    ...(currentModel.trim() ? [currentModel.trim()] : []),
  ])
  const next: ConfigProvider = {
    ...(existing ?? { id: trimmedId }),
    id: trimmedId,
    type: connection.type.trim() || existing?.type || selectedProvider?.type || 'openai',
    models,
  }

  if (connection.baseUrl.trim()) {
    next.baseUrl = connection.baseUrl.trim()
  } else {
    delete next.baseUrl
  }

  if (connection.apiKey.trim()) {
    next.apiKey = connection.apiKey.trim()
  } else {
    delete next.apiKey
  }

  if (Object.keys(headers).length > 0) {
    next.headers = headers
  } else {
    delete next.headers
  }

  const replaced = providerConfigs.map((provider) => (provider.id === trimmedId ? next : provider))
  return existing ? replaced : [...replaced, next]
}

export function EmbeddingSettingsTab() {
  const transport = useTransport()
  const [enabled, setEnabled] = useState(false)
  const [source, setSource] = useState<Source>('cloud')
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [providerConfigs, setProviderConfigs] = useState<ConfigProvider[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [connection, setConnection] = useState<ProviderConnectionState>(emptyConnection())
  const [semanticStatus, setSemanticStatus] = useState<MemorySemanticStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [customModelMode, setCustomModelMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discovering, setDiscovering] = useState(false)

  const providersBySource = useMemo(
    () => providers.filter((provider) => provider.source === source),
    [providers, source],
  )
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providerId, providers],
  )
  const selectedConfig = useMemo(
    () => providerConfigs.find((provider) => provider.id === providerId),
    [providerConfigs, providerId],
  )
  const options = useMemo(() => modelOptions(selectedProvider, model), [model, selectedProvider])
  const canDiscoverModels = DISCOVERABLE_TYPES.has(connection.type.trim().toLowerCase())

  async function refreshSemanticStatus(): Promise<void> {
    setStatusLoading(true)
    try {
      const api = await createMemoryApi(transport)
      setSemanticStatus(await api.status())
    } catch {
      setSemanticStatus(null)
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
      const [configResponse, providersResponse] = await Promise.all([
        fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers }),
        fetch(`${cfg.daemonOrigin}/api/v1/config/providers`, { headers }),
      ])
      if (!configResponse.ok) {
        throw new Error(`config fetch failed (${configResponse.status})`)
      }
      if (!providersResponse.ok) {
        throw new Error(`providers fetch failed (${providersResponse.status})`)
      }

      const configBody = (await configResponse.json()) as { data?: DaemonConfig }
      const providerBody = (await providersResponse.json()) as
        | {
            data?: DaemonProviderInfo[]
          }
        | DaemonProviderInfo[]
      const config = configBody.data
      if (!config) throw new Error('config response did not include data')

      const configuredProviders = (config.providers as ConfigProvider[]) ?? []
      const providerInfos = Array.isArray(providerBody) ? providerBody : (providerBody.data ?? [])
      const nextProviderId = config.memory.embeddingProvider ?? ''
      const nextProviders = buildProviderOptions({
        configProviders: configuredProviders,
        providerInfos,
        selectedProviderId: nextProviderId,
      })
      const nextProvider = nextProviders.find((provider) => provider.id === nextProviderId)
      const nextConfig = configuredProviders.find((provider) => provider.id === nextProviderId)

      setProviderConfigs(configuredProviders)
      setProviders(nextProviders)
      setEnabled(Boolean(nextProviderId && config.memory.embeddingModel))
      setProviderId(nextProviderId)
      setModel(config.memory.embeddingModel ?? '')
      setCustomModelMode(false)
      setSource(nextProvider?.source ?? 'cloud')
      setConnection(providerToConnection(nextConfig, nextProvider?.type ?? ''))
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
    void refreshSemanticStatus()
  }, [transport])

  function applySelectedProvider(nextProvider?: ProviderOption): void {
    setProviderId(nextProvider?.id ?? '')
    setModel(nextProvider ? (modelOptions(nextProvider, model)[0] ?? '') : '')
    setCustomModelMode(false)
    const config = providerConfigs.find((provider) => provider.id === nextProvider?.id)
    setConnection(providerToConnection(config, nextProvider?.type ?? ''))
  }

  function selectSource(next: Source): void {
    setSource(next)
    const first = providers.find((provider) => provider.source === next)
    applySelectedProvider(first)
  }

  function selectProvider(nextProviderId: string): void {
    const nextProvider = providers.find((provider) => provider.id === nextProviderId)
    applySelectedProvider(nextProvider)
  }

  function buildProvidersForSave(): ConfigProvider[] {
    return withSelectedProviderUpdate({
      connection,
      currentModel: enabled ? model : '',
      providerConfigs,
      providerId,
      selectedProvider,
    })
  }

  async function discoverModels(): Promise<void> {
    const type = connection.type.trim().toLowerCase()
    if (!selectedProvider || !providerId.trim()) {
      toast.warning('Embedding provider를 먼저 선택하세요.')
      return
    }
    if (!DISCOVERABLE_TYPES.has(type)) {
      toast.warning('이 provider type은 자동 모델 가져오기를 지원하지 않습니다. 직접 입력하세요.')
      return
    }

    setDiscovering(true)
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? {
            authorization: `Bearer ${cfg.daemonToken}`,
            'content-type': 'application/json',
          }
        : { 'content-type': 'application/json' }
      const customHeaders = entriesToHeaders(connection.headers)
      const body: Record<string, unknown> = { type }
      if (connection.baseUrl.trim()) body.baseUrl = connection.baseUrl.trim()
      if (connection.apiKey.trim()) body.apiKey = connection.apiKey.trim()
      if (Object.keys(customHeaders).length > 0) body.headers = customHeaders
      const response = await fetch(`${cfg.daemonOrigin}/api/v1/config/providers/discover-models`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(err?.error?.message ?? `discover failed (${response.status})`)
      }

      const json = (await response.json()) as {
        data?: { models?: string[]; endpoint?: string }
      }
      const discovered = unique(json.data?.models ?? [])
      if (discovered.length === 0) {
        toast.warning('가져온 모델이 없습니다.', {
          description: json.data?.endpoint ? `endpoint: ${json.data.endpoint}` : undefined,
        })
        return
      }

      const embeddingModels = discovered.filter(looksLikeEmbeddingModel)
      const nextModel = embeddingModels.includes(model)
        ? model
        : (embeddingModels[0] ?? discovered[0] ?? model)
      const selectedProviderId = providerId.trim()

      setProviderConfigs((current) =>
        withSelectedProviderUpdate({
          connection,
          currentModel: nextModel,
          providerConfigs: current.map((provider) =>
            provider.id === selectedProviderId
              ? {
                  ...provider,
                  models: discovered,
                }
              : provider,
          ),
          providerId: selectedProviderId,
          selectedProvider,
        }),
      )
      setProviders((current) =>
        current.map((provider) =>
          provider.id === selectedProviderId
            ? {
                ...provider,
                type: connection.type.trim() || provider.type,
                supportsEmbedding: true,
                configuredModelIds: discovered,
                embeddingModelIds: unique([...provider.embeddingModelIds, ...embeddingModels]),
              }
            : provider,
        ),
      )
      setModel(nextModel)
      setCustomModelMode(false)
      toast.success(`${discovered.length}개 모델을 가져왔습니다.`)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setDiscovering(false)
    }
  }

  async function save(): Promise<void> {
    if (enabled && (!providerId.trim() || !model.trim())) {
      toast.warning('Embedding provider와 model을 선택하세요.')
      return
    }

    setSaving(true)
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? {
            authorization: `Bearer ${cfg.daemonToken}`,
            'content-type': 'application/json',
          }
        : { 'content-type': 'application/json' }
      const nextProviderConfigs = providerId.trim() ? buildProvidersForSave() : providerConfigs
      const body: Record<string, unknown> = {
        'memory.embeddingProvider': enabled ? providerId.trim() : null,
        'memory.embeddingModel': enabled ? model.trim() : null,
      }
      if (providerId.trim()) body.providers = nextProviderConfigs
      const response = await fetch(`${cfg.daemonOrigin}/api/v1/config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`embedding save failed (${response.status})`)
      setProviderConfigs(nextProviderConfigs)
      toast.success('Embedding 모델 설정을 저장했습니다.')
      await refreshSemanticStatus()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-sm">
      <SemanticPipelineStatus value={semanticStatus} loading={statusLoading} />

      <section className="rounded-md border border-border/60 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              const checked = event.target.checked
              setEnabled(checked)
              if (checked && !providerId) {
                const first = providersBySource[0] ?? providers[0]
                if (first) {
                  setSource(first.source)
                  applySelectedProvider(first)
                }
              }
            }}
            disabled={saving}
            className="mt-1"
            aria-label="시맨틱 검색 사용"
          />
          <span>
            <span className="block font-medium">시맨틱 검색 사용</span>
            <span className="block text-xs text-muted-foreground">
              끄면 메모리와 문서 검색은 키워드 fallback만 사용합니다.
            </span>
          </span>
        </label>
      </section>

      <section className="grid gap-3 rounded-md border border-border/60 p-3">
        <div className="inline-flex w-fit rounded-md border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => selectSource('cloud')}
            disabled={saving || !enabled}
            className={
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ' +
              (source === 'cloud'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            <Cloud className="h-3.5 w-3.5" />
            Cloud
          </button>
          <button
            type="button"
            onClick={() => selectSource('local')}
            disabled={saving || !enabled}
            className={
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ' +
              (source === 'local'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            <HardDrive className="h-3.5 w-3.5" />
            Local
          </button>
        </div>

        {providersBySource.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            <span>
              {source === 'local'
                ? 'Ollama 같은 로컬 embedding provider가 없습니다. AI Models에서 provider를 먼저 추가하세요.'
                : 'Embedding을 지원하는 cloud provider가 없습니다. AI Models에서 provider를 먼저 추가하세요.'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('sepilot:open-settings-tab', { detail: 'llm' }),
                )
              }
            >
              AI Models 열기
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">임베딩 Provider</span>
              <select
                value={providerId}
                onChange={(event) => selectProvider(event.target.value)}
                disabled={saving || !enabled}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                aria-label="Embedding Provider"
              >
                {providersBySource.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Provider 유형</span>
              <Input
                type="text"
                value={connection.type}
                onChange={(event) =>
                  setConnection((prev) => ({ ...prev, type: event.target.value }))
                }
                disabled={saving || !enabled}
                placeholder="openai / openai-compatible / ollama"
                aria-label="Embedding provider type"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Base URL</span>
              <Input
                type="url"
                value={connection.baseUrl}
                onChange={(event) =>
                  setConnection((prev) => ({ ...prev, baseUrl: event.target.value }))
                }
                disabled={saving || !enabled}
                placeholder={
                  source === 'local' ? 'http://localhost:11434' : 'https://api.example.com/v1'
                }
                aria-label="Embedding provider base URL"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">API Key</span>
              <Input
                type="password"
                value={connection.apiKey}
                onChange={(event) =>
                  setConnection((prev) => ({ ...prev, apiKey: event.target.value }))
                }
                disabled={saving || !enabled}
                placeholder="sk-..."
                aria-label="Embedding provider API key"
              />
            </label>
            <div className="flex flex-col gap-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">임베딩 모델</span>
                {canDiscoverModels ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => void discoverModels()}
                    disabled={saving || discovering || !enabled}
                    className="h-7 px-2 text-xs"
                    aria-label="Embedding 모델 가져오기"
                  >
                    <DownloadCloud className="mr-1 h-3.5 w-3.5" />
                    {discovering ? '가져오는 중...' : '가져오기'}
                  </Button>
                ) : null}
              </div>
              <select
                value={customModelMode ? '__custom__' : model}
                onChange={(event) => {
                  if (event.target.value === '__custom__') {
                    setCustomModelMode(true)
                    return
                  }
                  setCustomModelMode(false)
                  setModel(event.target.value)
                }}
                disabled={saving || !enabled}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                aria-label="Embedding Model"
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="__custom__">직접 입력</option>
              </select>
            </div>
            {customModelMode ? (
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs font-medium">모델 직접 입력</span>
                <Input
                  type="text"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={saving || !enabled}
                  placeholder={
                    source === 'local' ? '예: nomic-embed-text' : '예: text-embedding-3-small'
                  }
                  aria-label="Custom embedding model"
                />
              </label>
            ) : null}

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">사용자 지정 Headers</span>
                <button
                  type="button"
                  onClick={() =>
                    setConnection((prev) => ({
                      ...prev,
                      headers: [...prev.headers, { key: '', value: '' }],
                    }))
                  }
                  disabled={saving || !enabled}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  헤더 추가
                </button>
              </div>
              {connection.headers.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  추가된 헤더가 없습니다. 모델 가져오기와 embedding 요청에 같은 provider header가
                  저장됩니다.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {connection.headers.map((entry, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={entry.key}
                        onChange={(event) =>
                          setConnection((prev) => ({
                            ...prev,
                            headers: prev.headers.map((header, headerIndex) =>
                              headerIndex === index
                                ? { ...header, key: event.target.value }
                                : header,
                            ),
                          }))
                        }
                        placeholder="X-Custom-Header"
                        disabled={saving || !enabled}
                        className="flex-1 font-mono text-[11px]"
                        aria-label={`Embedding header ${index + 1} name`}
                      />
                      <Input
                        type="text"
                        value={entry.value}
                        onChange={(event) =>
                          setConnection((prev) => ({
                            ...prev,
                            headers: prev.headers.map((header, headerIndex) =>
                              headerIndex === index
                                ? { ...header, value: event.target.value }
                                : header,
                            ),
                          }))
                        }
                        placeholder="value"
                        disabled={saving || !enabled}
                        className="flex-1 font-mono text-[11px]"
                        aria-label={`Embedding header ${index + 1} value`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setConnection((prev) => ({
                            ...prev,
                            headers: prev.headers.filter((_, headerIndex) => headerIndex !== index),
                          }))
                        }
                        disabled={saving || !enabled}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`Embedding header ${index + 1} remove`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedConfig?.apiKey === '***redacted***' ||
            Object.values(selectedConfig?.headers ?? {}).some(
              (value) => value === '***redacted***',
            ) ? (
              <p className="md:col-span-2 text-[11px] text-muted-foreground">
                redacted 값은 변경하지 않고 저장하면 daemon이 기존 secret을 보존합니다.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void fetchConfig()
            void refreshSemanticStatus()
          }}
          disabled={saving}
        >
          새로고침
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}
