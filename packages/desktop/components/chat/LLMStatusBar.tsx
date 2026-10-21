'use client'
import { CliModelSettings } from './CliModelPicker'
import { SessionExecutionBoundary } from './SessionExecutionBoundary'
import { useChatStore } from '@/lib/store/chat-store'
import { CHAT_BACKENDS, chatBackend, type ChatBackendId } from '@/lib/chat/chat-backends'
import { useTranslation } from 'react-i18next'
import { desktopFeatures } from '@/lib/feature-profile'
import { getDesktopApi } from '@/lib/electron/bridge'
import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Cpu,
  Hash,
  Settings as Cog,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Thermometer,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useProviderCatalog } from '@/lib/hooks/use-provider-catalog'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createSettingsApi } from '@/lib/api/settings'
import { useSessionWorkspaceBinding } from '@/lib/hooks/use-session-workspace-binding'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { cn } from '@/lib/utils/cn'
import { confirmExternalCliActivation } from '@/lib/chat/external-cli-disclosure'

interface Props {
  onOpenSettings?: () => void
}

const DEFAULT_TEMPERATURE = 1
const FALLBACK_MAX_OUTPUT_TOKENS = 4096
const DEFAULT_TEMPERATURE_BY_PROVIDER_TYPE: Record<string, number> = {
  ollama: 0.8,
}

export function LLMStatusBar({ onOpenSettings }: Props) {
  const llm = useSettingsStore((s) => s.llm)
  const setLlm = useSettingsStore((s) => s.setLlm)
  const { t } = useTranslation()
  const backendId = useChatModeStore((s) => s.backend)
  const setBackend = useChatModeStore((s) => s.setBackend)
  const backend = chatBackend(backendId)
  const pending = useChatStore((s) => s.pending)
  const activeSession = useSessionStore((s) =>
    s.sessions.find((session) => session.id === s.activeId) ?? null,
  )
  const providers = useProviderCatalog()
  const transport = useOptionalTransport()
  const {
    workspacePath: workingDir,
    source: workspaceSource,
    selectWorkspace,
    clearWorkspace,
  } = useSessionWorkspaceBinding(transport)
  const [modelOpen, setModelOpen] = useState(false)
  const [editingField, setEditingField] = useState<
    'maxTokens' | 'temperature' | null
  >(null)
  const [editValue, setEditValue] = useState('')
  const modelRef = useRef<HTMLDivElement>(null)

  interface DaemonLlmDefaults {
    providerMaxOutputTokens: Record<string, number | null>
    providerTypes: Record<string, string>
  }
  const [daemonDefaults, setDaemonDefaults] = useState<DaemonLlmDefaults | null>(null)

  useEffect(() => {
    if (!transport) return
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const cfg = await transport.getConfig()
        const headers: HeadersInit = cfg.daemonToken
          ? { authorization: `Bearer ${cfg.daemonToken}` }
          : {}
        const response = await fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers })
        if (!response.ok) return
        const body = (await response.json()) as {
          providers?: Array<{
            id: string
            type?: string
            defaultMaxOutputTokens?: number | null
          }>
          data?: {
            providers?: Array<{
              id: string
              type?: string
              defaultMaxOutputTokens?: number | null
            }>
          }
        }
        const data = body.data ?? body
        const providerMaxOutputTokens: Record<string, number | null> = {}
        const providerTypes: Record<string, string> = {}
        for (const p of data.providers ?? []) {
          providerMaxOutputTokens[p.id] = p.defaultMaxOutputTokens ?? null
          if (p.type) providerTypes[p.id] = p.type
        }
        if (cancelled) return
        setDaemonDefaults({
          providerMaxOutputTokens,
          providerTypes,
        })
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    if (!modelOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [modelOpen])

  useEffect(() => {
    if (!transport) return
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const current = await (await createSettingsApi(transport)).getLlm()
        if (cancelled) return
        const local = useSettingsStore.getState().llm
        if (!local.providerId || !local.modelId) {
          setLlm(current)
        }
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, setLlm])

  const provider = llm.providerId ?? activeSession?.provider ?? null
  const model = llm.modelId ?? activeSession?.model ?? null
  const externalCliMode = backend.daemonFeatures ? null : backend
  const workspaceName = workingDir
    ? workingDir.split(/[\\/]/).filter(Boolean).at(-1) ?? workingDir
    : '워크스페이스 미설정'
  const workspaceScopeLabel =
    workspaceSource === 'session'
      ? '작업공간'
      : workspaceSource === 'default'
        ? '기본 작업공간'
        : '작업공간 선택'

  async function persistLlmSelection(
    nextProviderId: string,
    nextModelId: string,
  ): Promise<void> {
    const prev = { providerId: llm.providerId, modelId: llm.modelId }
    setLlm({ providerId: nextProviderId, modelId: nextModelId })
    setModelOpen(false)
    if (!transport) return
    try {
      if (await isBrowserPreviewTransport(transport)) return
      const api = await createSettingsApi(transport)
      await api.setLlm({ providerId: nextProviderId, modelId: nextModelId })
    } catch (error) {
      setLlm(prev)
      toast.error('모델 변경을 저장하지 못했습니다.', {
        description:
          error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }

  function startEdit(field: 'maxTokens' | 'temperature'): void {
    setEditingField(field)
    setEditValue(
      field === 'maxTokens'
        ? llm.maxTokens != null
          ? String(llm.maxTokens)
          : ''
        : llm.temperature != null
          ? String(llm.temperature)
          : '',
    )
  }

  function commitEdit(): void {
    if (!editingField) return
    const raw = editValue.trim()
    if (raw === '') {
      setLlm({ [editingField]: null } as Partial<typeof llm>)
      setEditingField(null)
      return
    }
    if (editingField === 'maxTokens') {
      const n = Number.parseInt(raw, 10)
      if (Number.isFinite(n) && n > 0) {
        setLlm({ maxTokens: n })
      }
    } else {
      const n = Number.parseFloat(raw)
      if (Number.isFinite(n) && n >= 0 && n <= 2) {
        setLlm({ temperature: Math.round(n * 100) / 100 })
      }
    }
    setEditingField(null)
  }

  function onEditKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingField(null)
    }
  }

  async function selectBackend(nextBackendId: ChatBackendId): Promise<void> {
    if (await confirmExternalCliActivation(nextBackendId, t)) setBackend(nextBackendId)
  }

  const currentProvider =
    providers.find((p) => p.id === provider) ?? null
  const currentModelLabel =
    currentProvider?.models.find((m) => m.id === model)?.label ?? model

  const currentModelMaxOutputTokens =
    currentProvider?.models.find((m) => m.id === model)?.maxOutputTokens ?? null
  const resolvedMaxTokens: number =
    llm.maxTokens
    ?? currentModelMaxOutputTokens
    ?? (provider ? daemonDefaults?.providerMaxOutputTokens[provider] ?? null : null)
    ?? FALLBACK_MAX_OUTPUT_TOKENS
  const resolvedTemperature =
    llm.temperature
    ?? (provider
      ? DEFAULT_TEMPERATURE_BY_PROVIDER_TYPE[
          daemonDefaults?.providerTypes[provider]?.toLowerCase() ?? ''
        ] ?? DEFAULT_TEMPERATURE
      : DEFAULT_TEMPERATURE)
  const isMaxTokensExplicit = llm.maxTokens != null
  const isTemperatureExplicit = llm.temperature != null
  const defaultValueClass = 'italic text-foreground/70'
  const explicitValueClass = 'text-foreground'

  return (
    <div className="flex min-w-0 flex-nowrap items-center justify-between gap-x-2 whitespace-nowrap text-[11px] text-muted-foreground">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-1.5">
      <select aria-label={t('chatBackend.label')} value={backendId} disabled={pending}
        className="w-28 shrink-0 rounded border bg-background px-1 py-0.5"
        onChange={(event) => void selectBackend(event.target.value as ChatBackendId)}>
        {CHAT_BACKENDS.filter((entry) => entry.daemonFeatures || desktopFeatures.externalAgents).map((entry) => <option key={entry.id} value={entry.id}
          disabled={!entry.available || (!entry.daemonFeatures && !getDesktopApi())}>
          {entry.label}{!entry.available ? ` — ${t('chatBackend.adapterUnavailable')}` : ''}
        </option>)}
      </select>
      {desktopFeatures.externalAgents && getDesktopApi() ? <CliModelSettings backend={backendId} cwd={workingDir ?? undefined} disabled={pending} /> : null}
      {externalCliMode ? (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
          title={t('chatBackend.managedByCli')}
        >
          <Cpu className="h-3 w-3" />
          <span className="font-medium text-foreground">{externalCliMode.label}</span>
        </span>
      ) : (
      <div className="relative min-w-0 max-w-[20rem]" ref={modelRef}>
        <button
          type="button"
          disabled={providers.length === 0}
          onClick={() => setModelOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={modelOpen}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 transition-colors',
            providers.length > 0
              ? 'hover:bg-accent hover:text-foreground'
              : 'cursor-not-allowed opacity-70',
          )}
          title={
            providers.length === 0
              ? 'daemon에 등록된 provider 없음'
              : `${provider ?? '?'} / ${model ?? '?'} — 클릭하여 모델 변경`
          }
        >
          <Cpu className="h-3 w-3" />
          {provider && model ? (
            <>
              <span className="font-medium text-foreground">{provider}</span>
              <span className="opacity-60">/</span>
              <span className="truncate font-medium text-foreground">
                {currentModelLabel ?? model}
              </span>
            </>
          ) : (
            <span className="opacity-60">모델 미설정</span>
          )}
          {providers.length > 0 ? (
            <ChevronDown className="h-3 w-3 opacity-60" />
          ) : null}
        </button>
        {modelOpen ? (
          <div
            role="menu"
            className="absolute bottom-full left-0 z-30 mb-1 max-h-72 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {providers.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                provider가 없습니다. 설정에서 추가하세요.
              </div>
            ) : (
              providers.map((p) => (
                <div key={p.id} className="py-1">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {p.label}
                  </div>
                  {p.models.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-muted-foreground">
                      모델 없음
                    </div>
                  ) : (
                    p.models.map((m) => {
                      const selected =
                        p.id === provider && m.id === model
                      return (
                        <button
                          key={`${p.id}::${m.id}`}
                          type="button"
                          role="menuitem"
                          onClick={() => void persistLlmSelection(p.id, m.id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs transition-colors',
                            selected
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50',
                          )}
                        >
                          <span className="truncate">{m.label}</span>
                          <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                            {m.id}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      )}

      {!externalCliMode ? (
        <>
      <span className="opacity-30">·</span>

      {editingField === 'maxTokens' ? (
        <span className="inline-flex items-center gap-1">
          <Sigma className="h-3 w-3" />
          max
          <input
            autoFocus
            type="number"
            min={1}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={onEditKey}
            className="h-5 w-16 rounded border border-input bg-transparent px-1 text-center text-[11px] outline-none focus:border-primary"
            placeholder={String(resolvedMaxTokens)}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => startEdit('maxTokens')}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
          title={
            isMaxTokensExplicit
              ? 'max output tokens (사용자 지정)'
              : `기본 max output tokens: ${resolvedMaxTokens} (클릭하여 override)`
          }
        >
          <Sigma className="h-3 w-3" />
          max&nbsp;
          <span
            className={cn(
              'font-medium',
              isMaxTokensExplicit ? explicitValueClass : defaultValueClass,
            )}
          >
            {resolvedMaxTokens}
          </span>
        </button>
      )}

      <span className="opacity-30">·</span>

      {editingField === 'temperature' ? (
        <span className="inline-flex items-center gap-1">
          <Thermometer className="h-3 w-3" />
          temp
          <input
            autoFocus
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={onEditKey}
            className="h-5 w-14 rounded border border-input bg-transparent px-1 text-center text-[11px] outline-none focus:border-primary"
            placeholder={String(resolvedTemperature)}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => startEdit('temperature')}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
          title={
            isTemperatureExplicit
              ? 'temperature (사용자 지정)'
              : `provider 기본 temperature: ${resolvedTemperature} (클릭하여 override)`
          }
        >
          <Thermometer className="h-3 w-3" />
          temp&nbsp;
          <span
            className={cn(
              'font-medium',
              isTemperatureExplicit ? explicitValueClass : defaultValueClass,
            )}
          >
            {resolvedTemperature}
          </span>
        </button>
      )}

        </>
      ) : null}

      <span className="opacity-30">·</span>
      <span
        className={cn(
          'inline-flex min-w-0 max-w-64 items-center overflow-hidden rounded-md border shadow-sm',
          workingDir && (externalCliMode || activeSession?.workspaceIsolation !== 'policy')
            ? 'border-emerald-500/35 bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-200'
            : 'border-amber-500/45 bg-amber-500/[0.08] text-amber-800 dark:text-amber-200',
        )}
        title={
          workingDir
            ? externalCliMode ? `${workingDir}\n${t('chatBackend.cliPermissions')}`
              : activeSession?.workspaceIsolation === 'policy' ? `${workingDir}\n로컬 실행의 작업 디렉터리입니다. OS 폴더 격리는 적용되지 않습니다.`
                : `${workingDir}\n이 workspace root 밖의 파일 접근은 차단됩니다.`
            : '파일을 읽거나 수정하려면 이 대화의 워크스페이스를 선택하세요.'
        }
      >
        <button
          type="button"
          onClick={() => void selectWorkspace()}
          className="inline-flex min-w-0 items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="현재 세션 워크스페이스 변경"
        >
          {workingDir && (externalCliMode || activeSession?.workspaceIsolation !== 'policy') ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] opacity-75">
            {externalCliMode ? t('chatBackend.workingDirectory') : workspaceScopeLabel}
          </span>
          <span className="min-w-0 max-w-32 truncate font-mono text-[10px] font-semibold">
            {workspaceName}
          </span>

        </button>
        {workspaceSource === 'session' ? (
          <button
            type="button"
            onClick={() => void clearWorkspace()}
            className="inline-flex self-stretch items-center border-l border-current/15 px-1.5 transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            title="이 대화의 워크스페이스 연결 해제"
            aria-label="세션 워크스페이스 연결 해제"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </span>

      {!externalCliMode ? <SessionExecutionBoundary /> : null}

      {activeSession ? (
        <>
          <span className="opacity-30">·</span>
          <span
            className="inline-flex items-center gap-1"
            title={activeSession.id}
          >
            <Hash className="h-3 w-3" />
            <span className="font-mono">{activeSession.id.slice(0, 8)}</span>
          </span>
        </>
      ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-x-1">
        {onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="설정 열기 (Mod+,)"
            aria-label="open settings"
          >
            <Cog className="h-3 w-3" />
            설정
          </button>
        ) : null}
      </div>
    </div>
  )
}
