'use client'
import { useEffect, useState } from 'react'
import { DownloadCloud, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import { registerSettingsTab } from './registry'

const DISCOVERABLE_TYPES = new Set([
  'openai',
  'openai-compat',
  'openai-compatible',
  'anthropic',
  'ollama',
])

registerSettingsTab({
  key: 'provider-connections',
  section: 'models',
  label: 'Connections',
  search: ['provider', 'connection', 'baseurl', 'apikey'],
  render: () => <ProviderConnectionsTab />,
})

interface ProviderConfig {
  id: string
  type: string
  apiKey?: string
  baseUrl?: string
  models: string[]
  default?: boolean
  headers?: Record<string, string>
  defaultContextWindow?: number
  defaultMaxOutputTokens?: number
  capabilities?: Record<string, unknown>
  modelOverrides?: Array<Record<string, unknown>>
}

interface HeaderEntry {
  key: string
  value: string
}

interface EditingState {
  isNew: boolean
  originalId?: string
  id: string
  type: string
  baseUrl: string
  apiKey: string
  models: string[]
  modelInput: string
  headers: HeaderEntry[]
  default: boolean
  defaultContextWindow: string
  defaultMaxOutputTokens: string
  capabilitiesText: string
  modelOverridesText: string
}

function emptyEditing(): EditingState {
  return {
    isNew: true,
    id: '',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    models: [],
    modelInput: '',
    headers: [],
    default: false,
    defaultContextWindow: '',
    defaultMaxOutputTokens: '',
    capabilitiesText: '',
    modelOverridesText: '',
  }
}

function providerToEditing(p: ProviderConfig): EditingState {
  return {
    isNew: false,
    originalId: p.id,
    id: p.id,
    type: p.type,
    baseUrl: p.baseUrl ?? '',
    apiKey: p.apiKey ?? '',
    models: [...p.models],
    modelInput: '',
    headers: Object.entries(p.headers ?? {}).map(([key, value]) => ({
      key,
      value,
    })),
    default: !!p.default,
    defaultContextWindow: p.defaultContextWindow?.toString() ?? '',
    defaultMaxOutputTokens: p.defaultMaxOutputTokens?.toString() ?? '',
    capabilitiesText: p.capabilities
      ? JSON.stringify(p.capabilities, null, 2)
      : '',
    modelOverridesText: p.modelOverrides?.length
      ? JSON.stringify(p.modelOverrides, null, 2)
      : '',
  }
}

function canBuildProvider(state: EditingState): boolean {
  return !!state.id.trim() && !!state.type.trim()
}

function parsePositiveInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Context window와 max output tokens는 양의 정수여야 합니다.')
  }
  return parsed
}

function parseOptionalJsonObject(value: string, label: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}은 JSON 객체여야 합니다.`)
  }
  return parsed as Record<string, unknown>
}

function parseOptionalJsonArray(
  value: string,
  label: string,
): Array<Record<string, unknown>> | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`${label}은 JSON 배열이어야 합니다.`)
  }
  if (parsed.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error(`${label}의 각 항목은 JSON 객체여야 합니다.`)
  }
  return parsed as Array<Record<string, unknown>>
}

function buildProviderFromEditing(state: EditingState): ProviderConfig | null {
  if (!canBuildProvider(state)) return null
  const models = state.models.map((m) => m.trim()).filter(Boolean)
  const headers: Record<string, string> = {}
  for (const entry of state.headers) {
    const key = entry.key.trim()
    if (!key) continue
    headers[key] = entry.value
  }
  const next: ProviderConfig = {
    id: state.id.trim(),
    type: state.type.trim(),
    models,
    default: state.default,
  }
  if (state.baseUrl.trim()) next.baseUrl = state.baseUrl.trim()
  if (state.apiKey.trim()) next.apiKey = state.apiKey.trim()
  if (Object.keys(headers).length > 0) next.headers = headers
  const contextWindow = parsePositiveInt(state.defaultContextWindow)
  if (contextWindow != null) next.defaultContextWindow = contextWindow
  const maxOutputTokens = parsePositiveInt(state.defaultMaxOutputTokens)
  if (maxOutputTokens != null) next.defaultMaxOutputTokens = maxOutputTokens
  const capabilities = parseOptionalJsonObject(state.capabilitiesText, 'Capabilities')
  if (capabilities) next.capabilities = capabilities
  const modelOverrides = parseOptionalJsonArray(state.modelOverridesText, 'Model overrides')
  if (modelOverrides) next.modelOverrides = modelOverrides
  return next
}

export function ProviderConnectionsTab() {
  const transport = useTransport()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  useModalViewportLock(Boolean(editing))

  async function fetchConfig(): Promise<void> {
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? { authorization: `Bearer ${cfg.daemonToken}` }
        : {}
      const r = await fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers })
      if (!r.ok) throw new Error(`config fetch failed (${r.status})`)
      const body = (await r.json()) as {
        providers?: ProviderConfig[]
        data?: { providers?: ProviderConfig[] }
      }
      const list = body.data?.providers ?? body.providers ?? []
      setProviders(list)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
  }, [transport])

  async function persist(next: ProviderConfig[]): Promise<void> {
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
      body: JSON.stringify({ providers: next }),
    })
    if (!r.ok) throw new Error(`config save failed (${r.status})`)
  }

  async function save(): Promise<void> {
    if (!editing) return
    let built: ProviderConfig | null
    try {
      built = buildProviderFromEditing(editing)
      if (!built) {
        toast.warning('id와 type을 입력하세요.')
        return
      }
    } catch (error) {
      toast.error('Provider 설정값이 올바르지 않습니다.', {
        description: error instanceof Error ? error.message : undefined,
      })
      return
    }
    setSaving(true)
    try {
      let next: ProviderConfig[]
      if (built.default) {
        next = providers.map((p) =>
          p.id === built.id ? built : { ...p, default: false },
        )
      } else {
        next = providers.map((p) => (p.id === built.id ? built : p))
      }
      const exists = next.some((p) => p.id === built.id)
      if (!exists) next.push(built)
      if (editing.originalId && editing.originalId !== built.id) {
        next = next.filter((p) => p.id !== editing.originalId)
      }
      await persist(next)
      setProviders(next)
      setEditing(null)
      toast.success(
        editing.isNew ? 'Provider를 추가했습니다.' : 'Provider를 수정했습니다.',
      )
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function discoverModels(): Promise<void> {
    if (!editing) return
    const type = editing.type.trim().toLowerCase()
    if (!DISCOVERABLE_TYPES.has(type)) {
      toast.warning(
        '이 provider type은 자동 모델 가져오기를 지원하지 않습니다. 직접 입력하세요.',
      )
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
      const body: Record<string, unknown> = { type }
      if (editing.baseUrl.trim()) body.baseUrl = editing.baseUrl.trim()
      if (editing.apiKey.trim()) body.apiKey = editing.apiKey.trim()
      const r = await fetch(
        `${cfg.daemonOrigin}/api/v1/config/providers/discover-models`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
      )
      if (!r.ok) {
        const err = (await r.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(
          err?.error?.message ?? `discover failed (${r.status})`,
        )
      }
      const json = (await r.json()) as {
        data?: { models?: string[]; endpoint?: string }
      }
      const models = json.data?.models ?? []
      if (models.length === 0) {
        toast.warning('가져온 모델이 없습니다.', {
          description: json.data?.endpoint
            ? `endpoint: ${json.data.endpoint}`
            : undefined,
        })
        return
      }
      setEditing((s) =>
        s
          ? {
              ...s,
              models: [...models],
              modelInput: '',
            }
          : s,
      )
      toast.success(`${models.length}개 모델을 가져왔습니다.`)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setDiscovering(false)
    }
  }

  async function remove(id: string): Promise<void> {
    const ok = await confirm(
      `'${id}' provider를 삭제합니다. 이 provider를 사용하는 세션은 더 이상 응답하지 못합니다.`,
      { destructive: true },
    )
    if (!ok) return
    setSaving(true)
    try {
      const next = providers.filter((p) => p.id !== id)
      await persist(next)
      setProviders(next)
      toast.success(`Provider '${id}'를 삭제했습니다.`)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">로딩 중…</p>

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Provider Connections</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(emptyEditing())}
          disabled={saving}
        >
          <Plus className="mr-1 h-4 w-4" />
          추가
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {providers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            등록된 provider가 없습니다.
          </p>
        ) : (
          providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.id}</span>
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {p.type}
                  </span>
                  {p.default ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                      <Star className="h-2.5 w-2.5" />
                      default
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {p.baseUrl ?? '—'}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  models: {p.models.join(', ')}
                </div>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setEditing(providerToEditing(p))}
                  disabled={saving}
                  aria-label={`${p.id} 편집`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void remove(p.id)}
                  disabled={saving}
                  aria-label={`${p.id} 삭제`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="provider-editor-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (saving ? null : setEditing(null))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-border px-6 py-4">
              <h3 id="provider-editor-title" className="text-sm font-semibold">
                {editing.isNew ? '새 Provider' : 'Provider 편집'}
              </h3>
            </header>
            <div
              role="region"
              aria-label="Provider 설정"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]"
            >
            <label className="flex flex-col gap-1 text-xs">
              ID
              <Input
                type="text"
                autoFocus
                value={editing.id}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, id: e.target.value } : s))
                }
                placeholder="예: openai-main"
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Type
              <Input
                type="text"
                value={editing.type}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, type: e.target.value } : s))
                }
                placeholder="openai / anthropic / ollama / …"
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Base URL (선택)
              <Input
                type="url"
                value={editing.baseUrl}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, baseUrl: e.target.value } : s,
                  )
                }
                placeholder="https://api.example.com/v1"
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              API Key (선택)
              <Input
                type="password"
                value={editing.apiKey}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, apiKey: e.target.value } : s,
                  )
                }
                placeholder="sk-…"
                disabled={saving}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span>Models</span>
                {DISCOVERABLE_TYPES.has(editing.type.trim().toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={() => void discoverModels()}
                    disabled={saving || discovering}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
                  >
                    <DownloadCloud className="h-3 w-3" />
                    {discovering ? '가져오는 중…' : '가져오기'}
                  </button>
                ) : null}
              </div>
              {editing.models.length > 0 ? (
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1.5">
                  {editing.models.map((model, index) => (
                    <li
                      key={`${model}-${index}`}
                      className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1"
                    >
                      <span className="truncate font-mono text-[11px]">
                        {model}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing((s) =>
                            s
                              ? {
                                  ...s,
                                  models: s.models.filter(
                                    (_, i) => i !== index,
                                  ),
                                }
                              : s,
                          )
                        }
                        disabled={saving}
                        className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`${model} 제거`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  모델이 없습니다. 아래에서 추가하거나 "가져오기"로 자동 검색하세요. 비어 있어도 저장은 가능합니다.
                </p>
              )}
              <div className="flex gap-1">
                <Input
                  type="text"
                  value={editing.modelInput}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, modelInput: e.target.value } : s,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const v = editing.modelInput.trim()
                    if (!v) return
                    setEditing((s) =>
                      s && !s.models.includes(v)
                        ? { ...s, models: [...s.models, v], modelInput: '' }
                        : s
                          ? { ...s, modelInput: '' }
                          : s,
                    )
                  }}
                  placeholder="모델 이름 입력 후 Enter (예: gpt-5)"
                  disabled={saving || discovering}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    const v = editing.modelInput.trim()
                    if (!v) return
                    setEditing((s) =>
                      s && !s.models.includes(v)
                        ? { ...s, models: [...s.models, v], modelInput: '' }
                        : s
                          ? { ...s, modelInput: '' }
                          : s,
                    )
                  }}
                  disabled={
                    saving || discovering || !editing.modelInput.trim()
                  }
                >
                  추가
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span>Custom Headers (선택)</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditing((s) =>
                      s
                        ? {
                            ...s,
                            headers: [...s.headers, { key: '', value: '' }],
                          }
                        : s,
                    )
                  }
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  헤더 추가
                </button>
              </div>
              {editing.headers.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
                  추가된 헤더가 없습니다. 인증 토큰, 라우팅 헤더 등을 provider 요청마다 붙이려면 추가하세요.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {editing.headers.map((entry, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={entry.key}
                        onChange={(e) =>
                          setEditing((s) =>
                            s
                              ? {
                                  ...s,
                                  headers: s.headers.map((h, i) =>
                                    i === index ? { ...h, key: e.target.value } : h,
                                  ),
                                }
                              : s,
                          )
                        }
                        placeholder="X-Custom-Header"
                        disabled={saving}
                        className="flex-1 font-mono text-[11px]"
                        aria-label={`헤더 ${index + 1} 이름`}
                      />
                      <Input
                        type="text"
                        value={entry.value}
                        onChange={(e) =>
                          setEditing((s) =>
                            s
                              ? {
                                  ...s,
                                  headers: s.headers.map((h, i) =>
                                    i === index ? { ...h, value: e.target.value } : h,
                                  ),
                                }
                              : s,
                          )
                        }
                        placeholder="value"
                        disabled={saving}
                        className="flex-1 font-mono text-[11px]"
                        aria-label={`헤더 ${index + 1} 값`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing((s) =>
                            s
                              ? {
                                  ...s,
                                  headers: s.headers.filter(
                                    (_, i) => i !== index,
                                  ),
                                }
                              : s,
                          )
                        }
                        disabled={saving}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`헤더 ${index + 1} 제거`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-2 rounded-md border border-border p-3 text-xs md:grid-cols-2">
              <div className="space-y-1">
                <label className="font-medium">Default context window</label>
                <Input
                  type="number"
                  min={1}
                  value={editing.defaultContextWindow}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, defaultContextWindow: e.target.value } : s,
                    )
                  }
                  placeholder="예: 128000"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium">Default max output tokens</label>
                <Input
                  type="number"
                  min={1}
                  value={editing.defaultMaxOutputTokens}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, defaultMaxOutputTokens: e.target.value } : s,
                    )
                  }
                  placeholder="예: 8192"
                  disabled={saving}
                />
              </div>
              <label className="flex flex-col gap-1 md:col-span-2">
                Capabilities JSON
                <textarea
                  rows={4}
                  value={editing.capabilitiesText}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, capabilitiesText: e.target.value } : s,
                    )
                  }
                  placeholder={'{\n  "tools": true,\n  "vision": true\n}'}
                  spellCheck={false}
                  className="rounded border border-border bg-transparent p-2 font-mono text-[11px]"
                  disabled={saving}
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                Model overrides JSON
                <textarea
                  rows={4}
                  value={editing.modelOverridesText}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, modelOverridesText: e.target.value } : s,
                    )
                  }
                  placeholder={'[\n  {\n    "model": "gpt-5-mini",\n    "contextWindow": 128000\n  }\n]'}
                  spellCheck={false}
                  className="rounded border border-border bg-transparent p-2 font-mono text-[11px]"
                  disabled={saving}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editing.default}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, default: e.target.checked } : s,
                  )
                }
                disabled={saving}
              />
              Daemon 기본 provider로 설정
            </label>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={saving || !canBuildProvider(editing)}
              >
                {saving ? '저장 중…' : '저장'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        API key와 header의 redacted 값은 daemon이 기존 secret으로 복원합니다.
      </p>
    </div>
  )
}
