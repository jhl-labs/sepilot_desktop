'use client'

import { useEffect, useMemo, useState } from 'react'
import { Brain, Check, Gauge, RotateCcw, Search, ShieldCheck, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createConfigApi } from '@/lib/api/config'
import { createModelSettingsApi } from '@/lib/api/model-settings'
import { createToolsApi, type ToolCatalogItem } from '@/lib/api/tools'
import { useDirtyTracker } from '@/lib/hooks/use-dirty-tracker'
import { recordSettingsSave } from '@/lib/store/settings-save-store'
import { calculateToolContextFootprint } from '@/lib/tools/context-footprint'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'tool-catalog',
  section: 'tools',
  label: 'Tool Catalog',
  search: ['tools', 'catalog', 'enable', 'disable', 'memory', '도구', '활성', '비활성'],
  render: () => <ToolsCatalogSettingsTab />,
})

type Filter = 'all' | 'enabled' | 'disabled'

interface ActiveModelContext {
  providerId: string
  modelId: string
  contextWindow: number | null
}

const GROUP_LABELS: Record<string, string> = {
  agent: 'Agent orchestration',
  apps: 'Apps',
  browser: 'Browser',
  code: 'Code intelligence',
  computer: 'Computer use',
  doc: 'Writing documents',
  fs: 'Files',
  git: 'Git',
  image_gen: 'Image generation',
  mcp: 'MCP',
  office: 'Office',
  process: 'Processes',
  scheduler: 'Scheduler',
  service: 'Services',
  swarm: 'Swarm',
  web: 'Web',
}

function groupFor(tool: ToolCatalogItem): string {
  if (tool.name.startsWith('memory.')) {
    if (tool.recommended) return 'Memory · Core'
    if (tool.name.startsWith('memory.graph.')) return 'Memory · Graph'
    if (tool.name.startsWith('memory.documents.')) return 'Memory · Documents'
    if (tool.name.startsWith('memory.daily.')) return 'Memory · Daily'
    if (tool.name.startsWith('memory.remind') || tool.name.startsWith('memory.reminders.')) {
      return 'Memory · Reminders'
    }
    return 'Memory · Advanced'
  }
  const namespace = tool.name.split('.')[0] ?? tool.name
  return GROUP_LABELS[namespace] ?? namespace.replaceAll('_', ' ')
}

function sortTools(tools: ToolCatalogItem[]): ToolCatalogItem[] {
  return [...tools].sort((left, right) => left.name.localeCompare(right.name))
}

export function ToolsCatalogSettingsTab() {
  const transport = useTransport()
  const [tools, setTools] = useState<ToolCatalogItem[]>([])
  const [persistedDisabled, setPersistedDisabled] = useState<Set<string>>(new Set())
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [activeModel, setActiveModel] = useState<ActiveModelContext | null>(null)

  async function reload(): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const [toolsApi, configApi, modelApi] = await Promise.all([
        createToolsApi(transport),
        createConfigApi(transport),
        createModelSettingsApi(transport),
      ])
      const [catalog, config, modelSnapshot] = await Promise.all([
        toolsApi.list(),
        configApi.get(),
        modelApi.snapshot().catch(() => null),
      ])
      const nextDisabled = new Set(config.agent.disabledTools ?? [])
      setTools(sortTools(catalog))
      setPersistedDisabled(nextDisabled)
      setDisabled(new Set(nextDisabled))
      const current = modelSnapshot?.model.current
      const provider = current
        ? modelSnapshot.model.providers.find((candidate) => candidate.providerId === current.providerId)
        : undefined
      const model = current
        ? provider?.models.find((candidate) => candidate.id === current.modelId)
        : undefined
      setActiveModel(current ? {
        providerId: current.providerId,
        modelId: current.modelId,
        contextWindow: model?.contextWindow ?? null,
      } : null)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : '도구 목록을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  const dirty = useMemo(() => {
    if (disabled.size !== persistedDisabled.size) return true
    return [...disabled].some((name) => !persistedDisabled.has(name))
  }, [disabled, persistedDisabled])
  useDirtyTracker(
    'tool-catalog',
    [...disabled].sort(),
    status === 'loading' ? null : [...persistedDisabled].sort(),
  )

  const visibleTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tools.filter((tool) => {
      const isEnabled = !disabled.has(tool.name)
      if (filter === 'enabled' && !isEnabled) return false
      if (filter === 'disabled' && isEnabled) return false
      return !needle
        || tool.name.toLowerCase().includes(needle)
        || tool.description.toLowerCase().includes(needle)
        || groupFor(tool).toLowerCase().includes(needle)
    })
  }, [disabled, filter, query, tools])

  const groups = useMemo(() => {
    const grouped = new Map<string, ToolCatalogItem[]>()
    for (const tool of visibleTools) {
      const group = groupFor(tool)
      grouped.set(group, [...(grouped.get(group) ?? []), tool])
    }
    return [...grouped.entries()].sort(([left], [right]) => {
      const leftMemory = left.startsWith('Memory') ? 0 : 1
      const rightMemory = right.startsWith('Memory') ? 0 : 1
      return leftMemory - rightMemory || left.localeCompare(right)
    })
  }, [visibleTools])

  const enabledCount = tools.filter((tool) => !disabled.has(tool.name)).length
  const enabledTools = useMemo(
    () => tools.filter((tool) => !disabled.has(tool.name)),
    [disabled, tools],
  )
  const defaultExposedTools = useMemo(
    () => enabledTools.filter((tool) => tool.defaultExposure),
    [enabledTools],
  )
  const contextFootprint = useMemo(
    () => calculateToolContextFootprint(defaultExposedTools),
    [defaultExposedTools],
  )
  const globalFootprint = useMemo(
    () => calculateToolContextFootprint(enabledTools),
    [enabledTools],
  )
  const contextPercentage = activeModel?.contextWindow
    ? (contextFootprint.estimatedTokens / activeModel.contextWindow) * 100
    : null
  const memoryTools = tools.filter((tool) => tool.name.startsWith('memory.'))
  const memoryEnabled = memoryTools.filter((tool) => !disabled.has(tool.name)).length

  function updateNames(names: string[], enabled: boolean): void {
    setDisabled((current) => {
      const next = new Set(current)
      for (const name of names) {
        if (enabled) next.delete(name)
        else next.add(name)
      }
      return next
    })
  }

  function useLeanMemoryPreset(): void {
    setDisabled((current) => {
      const next = new Set(current)
      for (const tool of memoryTools) {
        if (tool.recommended) next.delete(tool.name)
        else next.add(tool.name)
      }
      return next
    })
  }

  async function save(): Promise<void> {
    setStatus('saving')
    try {
      const api = await createConfigApi(transport)
      await api.update({ 'agent.disabledTools': [...disabled].sort() })
      setPersistedDisabled(new Set(disabled))
      setTools((current) => current.map((tool) => ({
        ...tool,
        enabled: !disabled.has(tool.name),
      })))
      recordSettingsSave('tool-catalog')
      toast.success('도구 활성화 설정을 저장했습니다.')
    } catch (err) {
      toast.error('도구 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setStatus('ready')
    }
  }

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">도구 카탈로그를 불러오는 중…</p>
  }
  if (status === 'error') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-red-500">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>다시 시도</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 text-sm">
      <ContextFootprintCard
        model={activeModel}
        toolCount={defaultExposedTools.length}
        footprint={contextFootprint}
        globalToolCount={enabledCount}
        globalFootprint={globalFootprint}
        percentage={contextPercentage}
        dirty={dirty}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <Summary icon={Wrench} label="등록된 도구" value={`${tools.length}`} />
          <Summary icon={ShieldCheck} label="전역 활성" value={`${enabledCount}`} />
          <Summary icon={Brain} label="Memory 활성" value={`${memoryEnabled} / ${memoryTools.length}`} />
        </div>
        <div className="flex flex-col gap-3 border-t border-border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Memory는 핵심 도구만으로도 충분한 경우가 많습니다.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              핵심 프리셋은 기억·조회·검색·삭제와 읽기 전용 graph 탐색만 남깁니다.
              대화 모드와 작업 맥락은 이 전역 목록을 필요에 따라 더 좁힙니다.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={useLeanMemoryPreset}>핵심만 사용</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateNames(memoryTools.map((tool) => tool.name), false)}
            >
              모두 끄기
            </Button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="도구 이름, 설명, 그룹 검색"
            className="pl-9"
          />
        </div>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          <option value="all">전체 상태</option>
          <option value="enabled">활성만</option>
          <option value="disabled">비활성만</option>
        </select>
      </div>

      <div className="space-y-3">
        {groups.map(([group, groupTools]) => {
          const active = groupTools.filter((tool) => !disabled.has(tool.name)).length
          const allEnabled = active === groupTools.length
          return (
            <section key={group} className="rounded-lg border border-border bg-card/40">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h4 className="font-semibold">{group}</h4>
                  <p className="text-xs text-muted-foreground">{active} / {groupTools.length} 활성</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allEnabled}
                  aria-label={`${group} 전체 ${allEnabled ? '비활성화' : '활성화'}`}
                  className={`relative h-5 w-9 rounded-full transition-colors ${allEnabled ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => updateNames(groupTools.map((tool) => tool.name), !allEnabled)}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${allEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="divide-y divide-border">
                {groupTools.map((tool) => {
                  const enabled = !disabled.has(tool.name)
                  return (
                    <label key={tool.name} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/30">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${enabled ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                        {enabled ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={enabled}
                        onChange={(event) => updateNames([tool.name], event.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <code className="break-all text-xs font-semibold text-foreground">{tool.name}</code>
                          {tool.source === 'plugin' ? <Badge>plugin</Badge> : null}
                          {tool.name.startsWith('memory.') && tool.recommended ? <Badge>core</Badge> : null}
                          {tool.defaultExposure ? <Badge>default</Badge> : null}
                          {!tool.defaultExposure && tool.exposureGroup ? <Badge>on demand</Badge> : null}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
          )
        })}
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            검색 조건에 맞는 도구가 없습니다.
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || status === 'saving'}
          onClick={() => setDisabled(new Set(persistedDisabled))}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> 되돌리기
        </Button>
        <Button size="sm" disabled={!dirty || status === 'saving'} onClick={() => void save()}>
          {status === 'saving' ? '저장 중…' : '변경사항 저장'}
        </Button>
      </div>
    </div>
  )
}

function ContextFootprintCard({
  model,
  toolCount,
  footprint,
  globalToolCount,
  globalFootprint,
  percentage,
  dirty,
}: {
  model: ActiveModelContext | null
  toolCount: number
  footprint: ReturnType<typeof calculateToolContextFootprint>
  globalToolCount: number
  globalFootprint: ReturnType<typeof calculateToolContextFootprint>
  percentage: number | null
  dirty: boolean
}) {
  const severity = percentage == null && toolCount < 60
    ? 'unknown'
    : (percentage ?? 0) >= 35 || toolCount >= 120
      ? 'critical'
      : (percentage ?? 0) >= 20 || toolCount >= 60
        ? 'warning'
        : 'healthy'
  const severityCopy = {
    unknown: '모델 context window를 확인할 수 없습니다.',
    healthy: '도구 스키마 점유율이 관리 가능한 범위입니다.',
    warning: '도구 스키마만으로 context의 상당 부분을 사용합니다.',
    critical: '도구가 과다합니다. 모델이 선택과 계획에 실패할 가능성이 큽니다.',
  }[severity]
  const accent = severity === 'critical'
    ? 'bg-red-500'
    : severity === 'warning'
      ? 'bg-amber-500'
      : 'bg-emerald-500'
  const percentageLabel = percentage == null ? '—' : `${percentage.toFixed(1)}%`
  const modelLabel = model ? `${model.providerId} / ${model.modelId}` : '활성 모델 미확인'

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Gauge className="h-4 w-4" /> Tool context footprint
            {dirty ? <Badge>unsaved draft</Badge> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-4xl font-semibold tracking-tight text-foreground">
              ~{formatCompact(footprint.estimatedTokens)}
            </strong>
            <span className="text-sm text-muted-foreground">tokens in a default personal turn</span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            {severityCopy} Office·문서·브라우저·코딩 도구는 의도나 스킬이 선택한 턴에만 추가됩니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-5 border-t border-border pt-4 lg:min-w-[360px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <ContextDatum label="기본 노출" value={`${toolCount}`} />
          <ContextDatum label="Context 점유" value={percentageLabel} />
          <ContextDatum label="Schema 용량" value={formatBytes(footprint.utf8Bytes)} />
        </div>
      </div>
      <div className="border-t border-border bg-background/50 px-5 py-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">{modelLabel}</span>
          <span className="shrink-0 text-muted-foreground">
            {model?.contextWindow ? `${formatCompact(model.contextWindow)} context` : 'window unknown'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`도구 context 점유율 ${percentageLabel}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${accent}`}
            style={{ width: `${Math.min(100, Math.max(0, percentage ?? 0))}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          전역 상한 {globalToolCount}개 · 모두 한 번에 노출할 경우 약 {formatCompact(globalFootprint.estimatedTokens)} tokens.
          실제 값은 provider framing과 tokenizer에 따라 달라질 수 있습니다.
        </p>
      </div>
    </section>
  )
}

function ContextDatum({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block text-lg font-semibold leading-none">{value}</span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{label}</span>
    </span>
  )
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${bytes}B`
}

function Summary({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-card p-4">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
      <span><span className="block text-lg font-semibold leading-none">{value}</span><span className="mt-1 block text-xs text-muted-foreground">{label}</span></span>
    </div>
  )
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</span>
}
