'use client'
import { useEffect, useState } from 'react'
import type { DaemonProviderHealth } from '@sepilotd/api-client'
import {
  Bot,
  Cable,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { ProviderEditorHost } from './ProviderEditorHost'
import { providerTypeSupportsDiscovery } from './model-settings-view'
import { useAiModelsController } from './use-ai-models-controller'

type HealthStatus = DaemonProviderHealth['status']

const HEALTH_COPY: Record<HealthStatus, { label: string; detail: string }> = {
  ready: { label: 'Configured', detail: 'daemon 런타임에 로드되었습니다.' },
  env_missing: { label: '환경변수 필요', detail: '필수 환경변수를 확인하세요.' },
  unavailable: { label: 'Not loaded', detail: '설정 또는 필수 값을 확인하세요.' },
}

function healthBadgeClass(status: HealthStatus): string {
  if (status === 'ready') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
  if (status === 'env_missing') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
  return 'border-destructive/30 bg-destructive/10 text-destructive'
}

function HealthBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        healthBadgeClass(status),
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {HEALTH_COPY[status].label}
    </span>
  )
}

function ReadinessRail({
  providersConfigured,
  runtimeLoaded,
  modelsAvailable,
  defaultSelected,
}: {
  providersConfigured: boolean
  runtimeLoaded: boolean
  modelsAvailable: boolean
  defaultSelected: boolean
}) {
  const steps = [
    {
      label: 'Provider',
      detail: providersConfigured ? '구성됨' : '추가 필요',
      done: providersConfigured,
    },
    {
      label: 'Runtime',
      detail: runtimeLoaded ? '로드됨' : '확인 필요',
      done: runtimeLoaded,
    },
    {
      label: 'Models',
      detail: modelsAvailable ? '카탈로그 준비' : '동기화 필요',
      done: modelsAvailable,
    },
    { label: 'Default', detail: defaultSelected ? '사용 중' : '선택 필요', done: defaultSelected },
  ]

  return (
    <ol
      className="grid overflow-hidden rounded-lg border border-border bg-muted/20 sm:grid-cols-4"
      aria-label="모델 준비 상태"
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={cn(
            'relative flex items-center gap-1.5 px-2.5 py-1.5',
            index > 0 && 'border-t border-border sm:border-l sm:border-t-0',
          )}
        >
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
              step.done
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-medium">{step.label}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function EmptyWorkspace({ onAdd }: { onAdd(): void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/15 px-4 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background">
        <Cable className="h-4 w-4 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-[13px] font-semibold">첫 Provider를 연결하세요</h3>
      <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        OpenAI, Anthropic, Ollama 또는 호환 endpoint를 추가하면 모델 검색과 연결 테스트를 한
        화면에서 진행할 수 있습니다.
      </p>
      <Button size="sm" className="mt-3" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Provider 추가
      </Button>
    </div>
  )
}

interface CatalogModel {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  capabilities?: {
    vision?: boolean
    toolUse?: boolean
    streaming?: boolean
    embedding?: boolean
    thinking?: boolean
  }
}

function formatTokens(value: number | undefined): string {
  if (!value) return '—'
  return value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value)
}

function ModelCapabilities({ model }: { model: CatalogModel }) {
  const capabilities = [
    ['Tools', model.capabilities?.toolUse],
    ['Vision', model.capabilities?.vision],
    ['Thinking', model.capabilities?.thinking],
    ['Embedding', model.capabilities?.embedding],
  ].filter((entry): entry is [string, true] => entry[1] === true)
  if (capabilities.length === 0) {
    return <span className="text-[10px] text-muted-foreground">capability 정보 없음</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {capabilities.map(([label]) => (
        <span
          key={label}
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

export function AIModelsWorkspace() {
  const controller = useAiModelsController()
  const [modelQuery, setModelQuery] = useState('')

  useEffect(() => {
    setModelQuery('')
  }, [controller.selectedProviderId])

  if (controller.state.kind === 'loading') {
    return (
      <div className="space-y-3" aria-live="polite" aria-busy="true">
        <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
        <div className="grid gap-2 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="h-72 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-72 animate-pulse rounded-lg bg-muted/40" />
        </div>
        <span className="sr-only">AI 모델 설정을 불러오는 중입니다.</span>
      </div>
    )
  }

  if (controller.state.kind === 'error') {
    return (
      <div
        className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 text-center"
        role="alert"
      >
        <CircleAlert className="h-7 w-7 text-destructive" />
        <h3 className="mt-2 text-[13px] font-semibold">모델 설정을 불러오지 못했습니다</h3>
        <p className="mt-1 max-w-lg text-xs text-muted-foreground">{controller.state.message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void controller.load()}>
          <RefreshCw className="h-3.5 w-3.5" />
          다시 시도
        </Button>
      </div>
    )
  }

  const snapshot = controller.state.snapshot
  const current = snapshot.model.current
  const healthById = new Map(snapshot.providers.map((provider) => [provider.id, provider]))
  const readyProviders = snapshot.providers.filter((provider) => provider.health.status === 'ready')
  const configuredModelCount = snapshot.config.providers.reduce(
    (total, provider) => total + provider.models.length,
    0,
  )
  const currentHealth = current ? healthById.get(current.providerId)?.health.status : undefined

  if (snapshot.config.providers.length === 0) {
    return (
      <>
        <ReadinessRail
          providersConfigured={false}
          runtimeLoaded={false}
          modelsAvailable={false}
          defaultSelected={false}
        />
        <div className="mt-2">
          <EmptyWorkspace onAdd={controller.startCreate} />
        </div>
        <ProviderEditorHost controller={controller} />
      </>
    )
  }

  const selected = controller.selectedProvider
  const selectedRuntime = selected ? healthById.get(selected.id) : undefined
  const selectedModelGroup = selected
    ? snapshot.model.providers.find((provider) => provider.providerId === selected.id)
    : undefined
  const runtimeModels: CatalogModel[] = selectedModelGroup?.models ?? []
  const runtimeModelById = new Map(runtimeModels.map((model) => [model.id, model]))
  const models: CatalogModel[] = (selected?.models ?? []).map(
    (modelId) => runtimeModelById.get(modelId) ?? { id: modelId, name: modelId },
  )
  const filteredModels = models.filter((model) => {
    const query = modelQuery.trim().toLowerCase()
    return (
      !query || model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query)
    )
  })
  const selectedHealth = selectedRuntime?.health.status ?? 'unavailable'
  const currentProvider = current
    ? snapshot.config.providers.find((provider) => provider.id === current.providerId)
    : undefined
  const currentModelConfigured = Boolean(
    current && currentProvider?.models.includes(current.modelId),
  )

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <ReadinessRail
        providersConfigured
        runtimeLoaded={current ? currentHealth === 'ready' : readyProviders.length > 0}
        modelsAvailable={current ? currentModelConfigured : configuredModelCount > 0}
        defaultSelected={currentModelConfigured && currentHealth === 'ready'}
      />

      <section
        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-gradient-to-r from-muted/35 via-background to-background px-3 py-2"
        aria-labelledby="active-model-title"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background shadow-sm">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="active-model-title"
              className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Active model
            </h3>
            {currentHealth ? <HealthBadge status={currentHealth} /> : null}
          </div>
          {current ? (
            <p className="mt-0.5 truncate font-mono text-[13px] font-medium">
              {current.providerId}
              <span className="text-muted-foreground">/</span>
              {current.modelId}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] font-medium">기본 모델을 선택하세요</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          기본 모델·활성 Provider 변경 전 self-test
        </div>
      </section>

      <div className="grid min-h-[360px] gap-2 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className="flex min-h-0 flex-col rounded-lg border border-border bg-muted/10"
          aria-label="Provider 목록"
        >
          <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
            <div>
              <h3 className="text-xs font-semibold">Providers</h3>
              <p className="text-[10px] text-muted-foreground">
                {readyProviders.length}/{snapshot.config.providers.length} loaded
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={controller.startCreate}
              disabled={controller.busyAction !== null}
              aria-label="Provider 추가"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
            {snapshot.config.providers.map((provider) => {
              const runtime = healthById.get(provider.id)
              const status = runtime?.health.status ?? 'unavailable'
              const isSelected = provider.id === controller.selectedProviderId
              const isCurrent = provider.id === current?.providerId
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => controller.setSelectedProviderId(provider.id)}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    isSelected
                      ? 'border-primary/40 bg-primary/10 shadow-sm'
                      : 'border-transparent hover:border-border hover:bg-accent/60',
                  )}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        status === 'ready'
                          ? 'bg-emerald-500'
                          : status === 'env_missing'
                            ? 'bg-amber-500'
                            : 'bg-destructive',
                      )}
                    />
                    <span className="sr-only">{HEALTH_COPY[status].label}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {provider.id}
                    </span>
                    {isCurrent ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-primary"
                        aria-label="현재 기본 provider"
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 pl-4 text-[10px] text-muted-foreground">
                    <span className="truncate">{provider.type}</span>
                    <span>{provider.models.length} models</span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="min-w-0 rounded-lg border border-border bg-background">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  {selected.type === 'ollama' ? (
                    <Server className="h-4 w-4" />
                  ) : (
                    <Cable className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[13px] font-semibold">{selected.id}</h3>
                    <HealthBadge status={selectedHealth} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {selected.type}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {selectedRuntime?.health.message ??
                      selected.baseUrl ??
                      HEALTH_COPY[selectedHealth].detail}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {providerTypeSupportsDiscovery(selected.type) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void controller.refreshProviderModels(selected.id)}
                      disabled={controller.busyAction !== null}
                    >
                      <RefreshCw
                        className={cn(
                          'h-3.5 w-3.5',
                          controller.busyAction === `refresh:${selected.id}` && 'animate-spin',
                        )}
                      />
                      동기화
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => controller.startEdit(selected)}
                    disabled={controller.busyAction !== null}
                    aria-label={`${selected.id} 편집`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void controller.removeProvider(selected)}
                    disabled={controller.busyAction !== null}
                    aria-label={`${selected.id} 삭제`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold">Model catalog</h4>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      모델을 선택하면 self-test 성공 후 daemon 기본값으로 적용합니다.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={modelQuery}
                      onChange={(event) => setModelQuery(event.target.value)}
                      placeholder="모델 검색"
                      aria-label="모델 검색"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                {filteredModels.length > 0 ? (
                  <ul
                    className="max-h-[min(320px,42dvh)] divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border [scrollbar-gutter:stable]"
                    aria-label={`${selected.id} 모델`}
                  >
                    {filteredModels.map((model) => {
                      const isCurrent =
                        current?.providerId === selected.id && current.modelId === model.id
                      const testKey = `validate:${selected.id}/${model.id}`
                      const switchKey = `switch:${selected.id}/${model.id}`
                      return (
                        <li
                          key={model.id}
                          className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 hover:bg-muted/20"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-mono text-xs font-medium">
                                {model.id}
                              </span>
                              {isCurrent ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  <Check className="h-3 w-3" /> Active
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5">
                              <ModelCapabilities model={model} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-right text-[10px] text-muted-foreground">
                            <span>
                              <span className="block">Context</span>
                              <strong className="font-medium text-foreground">
                                {formatTokens(model.contextWindow)}
                              </strong>
                            </span>
                            <span>
                              <span className="block">Output</span>
                              <strong className="font-medium text-foreground">
                                {formatTokens(model.maxOutputTokens)}
                              </strong>
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void controller.validateProvider(selected, model.id)}
                            disabled={controller.busyAction !== null}
                            aria-label={`${model.id} 연결 테스트`}
                          >
                            <Clock3 className="h-3.5 w-3.5" />
                            {controller.busyAction === testKey ? '테스트 중…' : '테스트'}
                          </Button>
                          <Button
                            size="sm"
                            variant={isCurrent ? 'secondary' : 'outline'}
                            onClick={() =>
                              void controller.switchDefaultModel(selected.id, model.id)
                            }
                            disabled={
                              isCurrent ||
                              controller.busyAction !== null ||
                              selectedHealth !== 'ready'
                            }
                          >
                            {controller.busyAction === switchKey
                              ? '테스트 중…'
                              : isCurrent
                                ? '사용 중'
                                : '기본값으로 사용'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                ) : selected.models.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-4 text-center">
                    <CircleAlert className="mx-auto h-5 w-5 text-amber-600 dark:text-amber-300" />
                    <p className="mt-2 text-xs font-medium">구성된 모델이 없습니다</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      동기화하거나 Provider 편집에서 모델 ID를 직접 추가하세요.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    검색과 일치하는 모델이 없습니다.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-56 items-center justify-center text-xs text-muted-foreground">
              Provider를 선택하세요.
            </div>
          )}
        </section>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" /> API Key와 header는 redacted 상태로 유지됩니다.
        </span>
        {controller.busyAction ? <span>설정을 적용하는 중…</span> : null}
      </div>

      <ProviderEditorHost controller={controller} />
    </div>
  )
}
