'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DaemonProviderHealth } from '@sepilotd/api-client'
import {
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  CloudCog,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { ProviderEditorHost } from '@/components/settings/models/ProviderEditorHost'
import { providerTypeSupportsDiscovery } from '@/components/settings/models/model-settings-view'
import { useAiModelsController } from '@/components/settings/models/use-ai-models-controller'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

type RuntimeMode = 'checking' | 'available' | 'preview'
type HealthStatus = DaemonProviderHealth['status']

const HEALTH_LABEL: Record<HealthStatus, string> = {
  ready: '연결 준비됨',
  env_missing: '인증 정보 필요',
  unavailable: '확인 필요',
}

interface LLMProviderProps {
  onPendingChange?: (pending: boolean) => void
}

function ProviderSetupUnavailable() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/25 p-4"
      role="status"
    >
      <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold">실행 중인 daemon 연결이 필요합니다</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          이 미리보기에서는 비밀값을 입력하지 않습니다. Desktop 앱에서 다시 열면 Provider를 직접
          연결할 수 있습니다.
        </p>
      </div>
    </div>
  )
}

function ProviderSetupLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="AI 연결 설정 불러오는 중">
      <div className="h-16 animate-pulse rounded-xl bg-muted/45" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
      </div>
      <span className="sr-only">AI 연결 설정을 불러오는 중입니다.</span>
    </div>
  )
}

function ReadinessSteps({
  hasProvider,
  hasModels,
  hasDefault,
}: {
  hasProvider: boolean
  hasModels: boolean
  hasDefault: boolean
}) {
  const steps = [
    { label: 'Provider 연결', complete: hasProvider },
    { label: '모델 준비', complete: hasModels },
    { label: '기본 모델', complete: hasDefault },
  ]

  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="AI 연결 준비 상태">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]',
            step.complete
              ? 'border-teal-500/25 bg-teal-500/[0.07] text-teal-800 dark:text-teal-200'
              : 'border-border/70 bg-muted/20 text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px]',
              step.complete ? 'bg-teal-500 text-white' : 'bg-muted text-muted-foreground',
            )}
            aria-hidden="true"
          >
            {step.complete ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span className="min-w-0 font-medium sm:truncate">
            <span className="sr-only">{step.complete ? '완료' : '미완료'} · </span>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ConnectedProviderSetup({ onPendingChange }: LLMProviderProps) {
  const controller = useAiModelsController()
  const [modelChoice, setModelChoice] = useState<{
    providerId: string
    modelId: string
  } | null>(null)
  const snapshot = controller.snapshot
  const selected = controller.selectedProvider
  const current = snapshot?.model.current ?? null
  const selectedModelId =
    modelChoice && modelChoice.providerId === selected?.id ? modelChoice.modelId : ''
  const healthById = useMemo(
    () => new Map((snapshot?.providers ?? []).map((provider) => [provider.id, provider])),
    [snapshot],
  )

  useEffect(() => {
    onPendingChange?.(controller.busyAction !== null)
    return () => onPendingChange?.(false)
  }, [controller.busyAction, onPendingChange])

  useEffect(() => {
    setModelChoice((previous) => {
      if (!selected) return null
      if (previous?.providerId === selected.id && selected.models.includes(previous.modelId)) {
        return previous
      }
      if (current?.providerId === selected.id && selected.models.includes(current.modelId)) {
        return { providerId: selected.id, modelId: current.modelId }
      }
      if (
        controller.preferredModel?.providerId === selected.id &&
        selected.models.includes(controller.preferredModel.modelId)
      ) {
        return controller.preferredModel
      }
      return selected.models[0] ? { providerId: selected.id, modelId: selected.models[0] } : null
    })
  }, [controller.preferredModel, current?.modelId, current?.providerId, selected])

  if (controller.state.kind === 'loading') return <ProviderSetupLoading />

  if (controller.state.kind === 'error') {
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.06] p-4"
        role="alert"
      >
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">AI 설정을 불러오지 못했습니다</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{controller.state.message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void controller.load()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      </div>
    )
  }

  const providers = controller.state.snapshot.config.providers
  const configuredModelCount = providers.reduce(
    (total, provider) => total + provider.models.length,
    0,
  )
  const selectedRuntime = selected ? healthById.get(selected.id) : undefined
  const selectedHealth = selectedRuntime?.health.status ?? 'unavailable'
  const switchKey = selected ? `switch:${selected.id}/${selectedModelId}` : ''
  const currentModelSelected = Boolean(
    selected &&
    selectedModelId &&
    current?.providerId === selected.id &&
    current.modelId === selectedModelId,
  )

  if (providers.length === 0) {
    return (
      <div className="space-y-4">
        <ReadinessSteps hasProvider={false} hasModels={false} hasDefault={false} />
        <section className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.09] via-background to-teal-500/[0.06] p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-indigo-500/10 blur-3xl"
          />
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-indigo-500/20 bg-background/80 text-indigo-600 shadow-sm dark:text-indigo-300">
              <CloudCog className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight">
                내 AI Provider를 연결하세요
              </h3>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                OpenAI, Anthropic, Ollama 또는 OpenAI 호환 endpoint의 Base URL과 API Key를 입력해
                바로 시작할 수 있습니다.
              </p>
            </div>
            <Button
              type="button"
              className="h-10 shrink-0 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"
              onClick={controller.startCreate}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />새 Provider 연결
            </Button>
          </div>
        </section>
        <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          저장 전에 실제 모델 요청으로 연결을 확인합니다. 실패하면 daemon 설정은 변경되지 않습니다.
        </p>
        <ProviderEditorHost controller={controller} purpose="setup" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ReadinessSteps
        hasProvider
        hasModels={configuredModelCount > 0}
        hasDefault={Boolean(current)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">AI 연결</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Provider를 선택하고 사용할 모델을 확인하세요.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={controller.startCreate}
          disabled={controller.busyAction !== null}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />새 Provider 연결
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="연결된 Provider">
        {providers.map((provider) => {
          const runtime = healthById.get(provider.id)
          const status = runtime?.health.status ?? 'unavailable'
          const isSelected = provider.id === controller.selectedProviderId
          const isCurrent = provider.id === current?.providerId
          return (
            <button
              key={provider.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => controller.setSelectedProviderId(provider.id)}
              className={cn(
                'min-w-0 rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/45',
                isSelected
                  ? 'border-indigo-500/40 bg-indigo-500/[0.08] shadow-[0_8px_24px_rgba(79,70,229,0.08)]'
                  : 'border-border/70 bg-muted/15 hover:border-indigo-500/25 hover:bg-muted/30',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    status === 'ready'
                      ? 'bg-teal-500'
                      : status === 'env_missing'
                        ? 'bg-amber-500'
                        : 'bg-destructive',
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">{HEALTH_LABEL[status]}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{provider.id}</span>
                {isCurrent ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> 기본
                  </span>
                ) : null}
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{provider.type}</span>
                <span className="shrink-0">모델 {provider.models.length}개</span>
              </span>
            </button>
          )
        })}
      </div>

      {selected ? (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-muted/10">
          <div className="flex flex-wrap items-start gap-3 border-b border-border/60 px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background shadow-sm">
              {selected.type === 'ollama' ? (
                <Server className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold">{selected.id}</h3>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    selectedHealth === 'ready'
                      ? 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                      : selectedHealth === 'env_missing'
                        ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-destructive/20 bg-destructive/[0.07] text-destructive',
                  )}
                >
                  {HEALTH_LABEL[selectedHealth]}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {selectedRuntime?.health.message ?? selected.baseUrl ?? selected.type}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {providerTypeSupportsDiscovery(selected.type) ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => void controller.refreshProviderModels(selected.id)}
                  disabled={controller.busyAction !== null}
                  aria-label={`${selected.id} 모델 다시 가져오기`}
                >
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5',
                      controller.busyAction === `refresh:${selected.id}` && 'animate-spin',
                    )}
                  />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => controller.startEdit(selected)}
                disabled={controller.busyAction !== null}
                aria-label={`${selected.id} 연결 수정`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {selected.models.length > 0 ? (
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label htmlFor="setup-default-model" className="min-w-0 space-y-1.5 text-xs">
                  <span className="font-semibold">기본 모델</span>
                  <select
                    id="setup-default-model"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                    value={selectedModelId}
                    onChange={(event) =>
                      setModelChoice({ providerId: selected.id, modelId: event.target.value })
                    }
                    disabled={controller.busyAction !== null}
                  >
                    {selected.models.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  className="h-10 rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-500"
                  onClick={() => void controller.switchDefaultModel(selected.id, selectedModelId)}
                  disabled={
                    controller.busyAction !== null || !selectedModelId || currentModelSelected
                  }
                >
                  {controller.busyAction === switchKey ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : currentModelSelected ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {controller.busyAction === switchKey
                    ? '연결 확인 중…'
                    : currentModelSelected
                      ? '현재 기본 모델'
                      : '연결 확인 후 기본값으로 사용'}
                </Button>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                실제 응답을 확인한 뒤에만 기본 모델을 바꿉니다. 실패하면 기존 모델을 그대로
                유지합니다.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4">
              <CircleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs font-semibold">사용할 모델이 아직 없습니다</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  모델을 다시 가져오거나 연결 수정에서 모델 ID를 직접 추가하세요.
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <ProviderEditorHost controller={controller} purpose="setup" />
    </div>
  )
}

export function LLMProvider({ onPendingChange }: LLMProviderProps = {}) {
  const transport = useOptionalTransport()
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('checking')

  useEffect(() => {
    let cancelled = false
    if (!transport) {
      setRuntimeMode('preview')
      return
    }
    setRuntimeMode('checking')
    void isBrowserPreviewTransport(transport)
      .then((preview) => {
        if (!cancelled) setRuntimeMode(preview ? 'preview' : 'available')
      })
      .catch(() => {
        if (!cancelled) setRuntimeMode('available')
      })
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(
    () => () => {
      onPendingChange?.(false)
    },
    [onPendingChange],
  )

  if (!transport || runtimeMode === 'preview') return <ProviderSetupUnavailable />
  if (runtimeMode === 'checking') return <ProviderSetupLoading />
  return <ConnectedProviderSetup onPendingChange={onPendingChange} />
}
