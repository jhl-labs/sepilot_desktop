'use client'
import { TaskChatHelp } from './TaskChatHelp'
import { useEffect, useState } from 'react'
import { ArrowLeft, Newspaper, Pencil, Play, Plus, RefreshCw, Trash2, X, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { daemonSchedulerRunAgentSessionId, scheduledAppSourcesFromMetadata } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { useSessionStore } from '@/lib/store/session-store'
import {
  CapabilityUnavailableError,
  createSchedulerApi,
  type SchedulerApi,
  type SchedulerJob,
  type SchedulerJobRun,
} from '@/lib/api/scheduler'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from '@/components/settings/_shared/UnimplementedBanner'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import {
  isSchedulerActive,
  isSchedulerFailed,
  isSchedulerPaused,
  schedulerStatusLabel,
  sortSchedulerJobsForDisplay,
} from './scheduler-job-state'

interface SchedulerSurfaceConfig {
  cli: boolean
  desktop: boolean
}

const SURFACE_DISABLED_CODE = 'SCHEDULER_SURFACE_DISABLED'
const GEEKNEWS_SOURCE_TYPE = 'geeknews.insights'
const GEEKNEWS_FEED_URL = 'https://news.hada.io/rss/news'

function isSurfaceDisabledError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const message = err.message
  return message.includes(SURFACE_DISABLED_CODE) || /\(403\)/.test(message)
}

type SchedulerEditorMode = 'recurring' | 'oneshot'
type SchedulerExecutionMode = 'agent' | 'script-monitor'
type SchedulerFilter = 'all' | 'active' | 'paused' | 'failed'

const EMPTY_EDITING = {
  id: undefined as string | undefined,
  mode: 'recurring' as SchedulerEditorMode,
  name: '',
  cron: '',
  when: '',
  instruction: '',
  execution: 'agent' as SchedulerExecutionMode,
  monitorId: '',
  contractVersion: '1',
  targetKind: 'local' as 'local' | 'ssh',
  scriptPath: '',
  scriptArgs: '',
  scriptCwd: '',
  sshHost: '',
  sshUser: '',
  sshPort: '',
  timeoutSeconds: 30,
  anomalySamples: 2,
  recoverySamples: 2,
  errorSamples: 2,
  reportMinutes: '',
  timezone: '',
  parentSessionId: '',
  metadata: undefined as Record<string, unknown> | null | undefined,
  enabled: true,
}

function scheduleLabel(job: SchedulerJob): string {
  if (job.kind === 'recurring') return job.cron ?? '?'
  return job.runAt ? new Date(job.runAt).toLocaleString() : 'one-shot'
}

function formatWhen(value: number | null): string {
  return value ? new Date(value).toLocaleString() : '없음'
}

function formatRelativeTime(value: number | null): string {
  if (!value) return '기록 없음'
  const diffMs = value - Date.now()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 1) return '지금'
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes > 0 ? `${diffMinutes}분 후` : `${Math.abs(diffMinutes)}분 전`
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `${diffHours}시간 후` : `${Math.abs(diffHours)}시간 전`
  }
  const diffDays = Math.round(diffHours / 24)
  return diffDays > 0 ? `${diffDays}일 후` : `${Math.abs(diffDays)}일 전`
}

function clip(text: string | null | undefined, max = 100): string {
  if (!text) return ''
  const flat = String(text).replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function schedulerSource(job: SchedulerJob): Record<string, unknown> {
  const source = job.metadata?.source
  return source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {}
}

function scriptMonitorMetadata(job: SchedulerJob): Record<string, unknown> | null {
  const value = job.metadata?.scriptMonitor
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function sourceLabel(job: SchedulerJob): string | null {
  const monitor = scriptMonitorMetadata(job)
  if (monitor) {
    const target = monitor.target && typeof monitor.target === 'object' && !Array.isArray(monitor.target)
      ? monitor.target as Record<string, unknown>
      : {}
    return `스크립트 모니터 · ${target.kind === 'ssh' ? 'SSH' : 'Local'}`
  }
  const source = schedulerSource(job)
  if (source.type === 'app.todo') {
    const title = typeof source.todoTitle === 'string' ? source.todoTitle : job.name
    return `ToDo · ${clip(title, 42)}`
  }
  if (source.type === 'app.notification') {
    const appTitle = typeof source.appTitle === 'string' ? source.appTitle : 'App'
    return `${appTitle} 알림`
  }
  if (source.type === GEEKNEWS_SOURCE_TYPE) {
    return 'GeekNews 인사이트'
  }
  try {
    const refs = scheduledAppSourcesFromMetadata(job.metadata)
    if (refs.length) return `Apps 연결 · ${refs.map(ref => ref.appId).filter((id, index, all) => all.indexOf(id) === index).join(', ')}`
  } catch { return '앱 연결 정보 확인 필요' }
  return null
}

function sourceDetail(job: SchedulerJob): string {
  const monitor = scriptMonitorMetadata(job)
  if (monitor) {
    const path = typeof monitor.scriptPath === 'string' ? monitor.scriptPath : ''
    return path ? clip(path, 72) : '스크립트 설정 확인 필요'
  }
  const source = schedulerSource(job)
  if (source.type === 'app.todo') {
    return [
      typeof source.owner === 'string' ? source.owner : '',
      typeof source.project === 'string' ? source.project : '',
      typeof source.priority === 'string' ? source.priority : '',
    ].filter(Boolean).join(' · ')
  }
  if (source.type === GEEKNEWS_SOURCE_TYPE) {
    const maxItems = typeof source.maxItems === 'number' ? `${source.maxItems}개까지` : '최신 글'
    const lastDelivered = typeof source.lastDeliveredAt === 'string'
      ? `마지막 전달 ${new Date(source.lastDeliveredAt).toLocaleString()}`
      : '아직 전달 전'
    return `새 글만 수집 · ${maxItems} · ${lastDelivered}`
  }
  return ''
}

export function TasksWorkspace({
  focusJobId,
  focusVersion = 0,
  onOpenSession,
}: {
  focusJobId?: string | null
  focusVersion?: number
  onOpenSession?: (sessionId: string) => void
} = {}) {
  const transport = useTransport()
  const activeChatId = useSessionStore((s) => s.activeId)
  const activeChat = useSessionStore((s) =>
    s.activeId ? s.sessions.find((session) => session.id === s.activeId) ?? null : null,
  )
  const [jobs, setJobs] = useState<SchedulerJob[]>([])
  const [editing, setEditing] = useState(EMPTY_EDITING)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [filter, setFilter] = useState<SchedulerFilter>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable' | 'surface_disabled'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [runsRevision, setRunsRevision] = useState(0)
  const [runs, setRuns] = useState<SchedulerJobRun[]>([])
  const [runsStatus, setRunsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [surfaceConfig, setSurfaceConfig] = useState<SchedulerSurfaceConfig | null>(null)
  const [surfaceBusy, setSurfaceBusy] = useState<'desktop' | 'cli' | null>(null)
  useModalViewportLock(editorOpen)

  useEffect(() => {
    if (!focusJobId) return
    setSelectedJobId(focusJobId)
    setFilter('all')
  }, [focusJobId, focusVersion])

  async function fetchSurfaceConfig(): Promise<SchedulerSurfaceConfig> {
    const cfg = await transport.getConfig()
    const headers: HeadersInit = cfg.daemonToken
      ? { authorization: `Bearer ${cfg.daemonToken}` }
      : {}
    const response = await fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers })
    if (!response.ok) {
      throw new Error(`config fetch failed (${response.status})`)
    }
    const body = (await response.json()) as {
      scheduler?: { surfaces?: Partial<SchedulerSurfaceConfig> }
      data?: { scheduler?: { surfaces?: Partial<SchedulerSurfaceConfig> } }
    }
    const surfaces = body.data?.scheduler?.surfaces ?? body.scheduler?.surfaces ?? {}
    return {
      cli: surfaces.cli === true,
      desktop: surfaces.desktop === true,
    }
  }

  async function setSurfaceEnabled(
    surface: 'desktop' | 'cli',
    enabled: boolean,
  ): Promise<void> {
    setSurfaceBusy(surface)
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? {
            authorization: `Bearer ${cfg.daemonToken}`,
            'content-type': 'application/json',
          }
        : { 'content-type': 'application/json' }
      const response = await fetch(`${cfg.daemonOrigin}/api/v1/config`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ [`scheduler.surfaces.${surface}`]: enabled }),
      })
      if (!response.ok) {
        throw new Error(`config save failed (${response.status})`)
      }
      setSurfaceConfig((current) => ({
        cli: current?.cli ?? false,
        desktop: current?.desktop ?? false,
        [surface]: enabled,
      }))
      toast.success(
        enabled
          ? `Scheduler ${surface} surface를 활성화했습니다.`
          : `Scheduler ${surface} surface를 비활성화했습니다.`,
      )
      if (surface === 'desktop' && enabled && status === 'surface_disabled') {
        try {
          const api = await createSchedulerApi(transport)
          setJobs(await api.list())
          setStatus('ready')
          setError(null)
        } catch (err) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'scheduler load failed')
        }
      }
      if (surface === 'desktop' && !enabled) {
        setJobs([])
        setStatus('surface_disabled')
        setError(null)
      }
    } catch (err) {
      toast.error('Scheduler surface 설정 저장에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'config save failed',
      })
    } finally {
      setSurfaceBusy(null)
    }
  }

  const visibleJobs =
    filter === 'active'
      ? jobs.filter(isSchedulerActive)
      : filter === 'paused'
        ? jobs.filter(isSchedulerPaused)
        : filter === 'failed'
          ? jobs.filter(isSchedulerFailed)
          : sortSchedulerJobsForDisplay(jobs)
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null

  async function refresh(): Promise<void> {
    const api = await createSchedulerApi(transport)
    setJobs(await api.list())
    setRunsRevision((value) => value + 1)
  }

  function applyFilter(nextFilter: SchedulerFilter): void {
    setFilter(nextFilter)
    setSelectedJobId(null)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      let surfaces: SchedulerSurfaceConfig
      try {
        surfaces = await fetchSurfaceConfig()
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'scheduler config load failed')
        return
      }
      if (cancelled) return
      setSurfaceConfig(surfaces)

      if (!surfaces.desktop) {
        setStatus('surface_disabled')
        return
      }

      try {
        const api = await createSchedulerApi(transport)
        const nextJobs = await api.list()
        if (cancelled) return
        setJobs(nextJobs)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        if (isSurfaceDisabledError(err)) {
          setSurfaceConfig({ ...surfaces, desktop: false })
          setStatus('surface_disabled')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'scheduler load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    let watcher: ReturnType<SchedulerApi['watch']> | null = null

    void (async () => {
      try {
        const api = await createSchedulerApi(transport)
        if (cancelled) return
        watcher = api.watch((event) => {
          if (cancelled || event.type === 'heartbeat') return
          setJobs(event.jobs)
        })
        watcher.done.catch((error: unknown) => {
          if (cancelled) return
          setStatus('error')
          setError(error instanceof Error ? error.message : '예약 상태 연결을 복구하지 못했습니다.')
        })
      } catch {
      }
    })()

    return () => {
      cancelled = true
      watcher?.close()
    }
  }, [status, transport])

  useEffect(() => {
    function onTasksFilter(event: Event): void {
      const detail = (event as CustomEvent<string>).detail
      if (detail === 'all' || detail === 'active' || detail === 'paused' || detail === 'failed') {
        setFilter(detail)
        setSelectedJobId(null)
      }
    }
    window.addEventListener('sepilot:tasks-filter', onTasksFilter)
    return () => window.removeEventListener('sepilot:tasks-filter', onTasksFilter)
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(null)
    }
  }, [jobs, selectedJobId, status])

  useEffect(() => {
    const id = selectedJob?.id
    if (!id || status !== 'ready') {
      setRuns([])
      setRunsStatus('idle')
      return
    }
    let cancelled = false
    setRuns([])
    setRunsStatus('loading')
    void (async () => {
      try {
        const api = await createSchedulerApi(transport)
        const fetched = await api.runs(id, 20)
        if (!cancelled) {
          setRuns(fetched)
          setRunsStatus('ready')
        }
      } catch {
        if (!cancelled) setRunsStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedJob?.id, selectedJob?.updatedAt, selectedJob?.status, selectedJob?.lastRunAt, runsRevision, status, transport])

  function startEditing(job: SchedulerJob): void {
    const monitor = scriptMonitorMetadata(job)
    const target = monitor?.target && typeof monitor.target === 'object' && !Array.isArray(monitor.target)
      ? monitor.target as Record<string, unknown>
      : null
    setEditing({
      id: job.id,
      mode: job.kind === 'oneshot' ? 'oneshot' : 'recurring',
      name: job.name,
      cron: job.cron ?? '',
      when: job.runAt ? new Date(job.runAt).toISOString() : '',
      instruction: job.instruction,
      execution: monitor ? 'script-monitor' : 'agent',
      monitorId: typeof monitor?.monitorId === 'string' ? monitor.monitorId : '',
      contractVersion: typeof monitor?.contractVersion === 'string' ? monitor.contractVersion : '1',
      targetKind: target?.kind === 'ssh' ? 'ssh' : 'local',
      scriptPath: typeof monitor?.scriptPath === 'string' ? monitor.scriptPath : '',
      scriptArgs: Array.isArray(monitor?.args) ? monitor.args.filter((value): value is string => typeof value === 'string').join('\n') : '',
      scriptCwd: typeof monitor?.cwd === 'string' ? monitor.cwd : '',
      sshHost: typeof target?.host === 'string' ? target.host : '',
      sshUser: typeof target?.user === 'string' ? target.user : '',
      sshPort: typeof target?.port === 'number' ? String(target.port) : '',
      timeoutSeconds: typeof monitor?.timeoutMs === 'number' ? monitor.timeoutMs / 1_000 : 30,
      anomalySamples: typeof monitor?.anomalyConsecutiveSamples === 'number' ? monitor.anomalyConsecutiveSamples : 2,
      recoverySamples: typeof monitor?.recoveryConsecutiveSamples === 'number' ? monitor.recoveryConsecutiveSamples : 2,
      errorSamples: typeof monitor?.errorConsecutiveSamples === 'number' ? monitor.errorConsecutiveSamples : 2,
      reportMinutes: typeof monitor?.reportEveryMs === 'number' ? String(monitor.reportEveryMs / 60_000) : '',
      timezone: job.timezone ?? '',
      parentSessionId: job.parentSessionId ?? '',
      metadata: job.metadata,
      enabled: job.enabled,
    })
    setEditorOpen(true)
  }

  function startCreating(): void {
    setEditing({
      ...EMPTY_EDITING,
      parentSessionId: activeChatId && !activeChat?.isDraft ? activeChatId : '',
    })
    setEditorOpen(true)
  }

  function startCreatingScriptMonitor(): void {
    setEditing({
      ...EMPTY_EDITING,
      execution: 'script-monitor',
      mode: 'recurring',
      name: 'Resource monitor',
      cron: '@every 5m',
      monitorId: `resource-${Date.now()}`,
    })
    setEditorOpen(true)
  }

  function startCreatingGeekNews(): void {
    if (!activeChatId || activeChat?.isDraft) {
      toast.error('GeekNews 결과를 받을 Chat이 필요합니다.', {
        description: '먼저 Chat에서 대화를 하나 시작한 뒤 Tasks에서 다시 등록하세요.',
      })
      return
    }

    setEditing({
      ...EMPTY_EDITING,
      id: undefined,
      mode: 'recurring',
      name: 'GeekNews hourly insights',
      cron: '@hourly',
      when: '',
      instruction: 'GeekNews RSS 최신 글을 수집하고, 이번 실행에 처음 발견된 글만 한국어 인사이트로 정리합니다.',
      timezone: '',
      parentSessionId: activeChatId,
      metadata: {
        source: {
          type: GEEKNEWS_SOURCE_TYPE,
          feedUrl: GEEKNEWS_FEED_URL,
          maxItems: 8,
          seenItemIds: [],
        },
      },
      enabled: true,
    })
    setEditorOpen(true)
  }

  function resetEditor(): void {
    setEditing(EMPTY_EDITING)
    setEditorOpen(false)
  }

  async function save(): Promise<void> {
    const schedule = editing.mode === 'oneshot'
      ? editing.when.trim()
      : editing.cron.trim()
    if (!editing.name.trim() || !schedule) {
      toast.error('작업 이름과 일정을 입력하세요.')
      return
    }
    if (editing.execution === 'script-monitor' && (
      !editing.monitorId.trim()
      || !editing.scriptPath.trim()
      || (editing.targetKind === 'ssh' && !editing.sshHost.trim())
      || !Number.isInteger(editing.timeoutSeconds) || editing.timeoutSeconds < 1 || editing.timeoutSeconds > 600
      || !Number.isInteger(editing.anomalySamples) || editing.anomalySamples < 1 || editing.anomalySamples > 100
      || !Number.isInteger(editing.recoverySamples) || editing.recoverySamples < 1 || editing.recoverySamples > 100
      || !Number.isInteger(editing.errorSamples) || editing.errorSamples < 1 || editing.errorSamples > 100
      || (editing.sshPort.trim() !== '' && (!Number.isInteger(Number(editing.sshPort)) || Number(editing.sshPort) < 1 || Number(editing.sshPort) > 65_535))
      || (editing.reportMinutes.trim() !== '' && (!Number.isFinite(Number(editing.reportMinutes)) || Number(editing.reportMinutes) < 5))
    )) {
      toast.error('모니터 경로, 대상, 시간과 연속 샘플 값을 확인하세요.')
      return
    }

    setBusyKey('save')
    try {
      const api = await createSchedulerApi(transport)
      const metadataBase = { ...(editing.metadata ?? {}) }
      if (editing.execution === 'script-monitor') {
        delete metadataBase.scheduledAgent
        metadataBase.scriptMonitor = {
          version: 1,
          monitorId: editing.monitorId.trim(),
          contractVersion: editing.contractVersion.trim() || '1',
          target: editing.targetKind === 'ssh'
            ? {
                kind: 'ssh',
                host: editing.sshHost.trim(),
                ...(editing.sshUser.trim() ? { user: editing.sshUser.trim() } : {}),
                ...(editing.sshPort.trim() ? { port: Number(editing.sshPort) } : {}),
              }
            : { kind: 'local' },
          scriptPath: editing.scriptPath.trim(),
          args: editing.scriptArgs.split('\n').filter((value) => value.length > 0),
          ...(editing.scriptCwd.trim() ? { cwd: editing.scriptCwd.trim() } : {}),
          timeoutMs: Math.round(editing.timeoutSeconds * 1_000),
          anomalyConsecutiveSamples: editing.anomalySamples,
          recoveryConsecutiveSamples: editing.recoverySamples,
          errorConsecutiveSamples: editing.errorSamples,
          reportEveryMs: editing.reportMinutes.trim()
            ? Math.round(Number(editing.reportMinutes) * 60_000)
            : null,
        }
      } else {
        delete metadataBase.scriptMonitor
        delete metadataBase.scriptMonitorState
      }
      const resolvedMetadata = Object.keys(metadataBase).length > 0 ? metadataBase : null
      const saved = await api.upsert({
        id: editing.id,
        name: editing.name.trim(),
        ...(editing.mode === 'oneshot'
          ? { when: schedule }
          : { cron: schedule }),
        instruction: editing.execution === 'script-monitor' ? '' : editing.instruction.trim() || undefined,
        timezone: editing.timezone.trim() || undefined,
        parentSessionId: editing.execution === 'script-monitor' ? null : editing.parentSessionId.trim() || null,
        metadata: resolvedMetadata,
        enabled: editing.enabled,
      })
      setSelectedJobId(saved.id)
      resetEditor()
      await refresh()
      toast.success('스케줄 작업을 저장했습니다.')
    } catch (err) {
      toast.error('스케줄 작업 저장에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(id: string): Promise<void> {
    setBusyKey(`remove:${id}`)
    try {
      const api = await createSchedulerApi(transport)
      await api.remove(id)
      if (editing.id === id) resetEditor()
      if (selectedJobId === id) setSelectedJobId(null)
      await refresh()
      toast.success('스케줄 작업을 삭제했습니다.')
    } catch (err) {
      toast.error('스케줄 작업 삭제에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'remove failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function toggleEnabled(job: SchedulerJob): Promise<void> {
    setBusyKey(`toggle:${job.id}`)
    try {
      const api = await createSchedulerApi(transport)
      if (job.enabled) await api.pause(job.id)
      else await api.resume(job.id)
      await refresh()
      if (editing.id === job.id) {
        setEditing((prev) => ({ ...prev, enabled: !job.enabled }))
      }
      toast.success(
        job.enabled ? '스케줄 작업을 비활성화했습니다.' : '스케줄 작업을 활성화했습니다.',
      )
    } catch (err) {
      toast.error('스케줄 작업 상태 변경에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'toggle failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function toggleUnattended(job: SchedulerJob): Promise<void> {
    setBusyKey(`unattended:${job.id}`)
    try {
      const api = await createSchedulerApi(transport)
      await api.setUnattended(job.id, !job.unattended)
      await refresh()
      toast.success(
        job.unattended
          ? '이 작업은 다시 승인을 요청합니다.'
          : '이 작업은 이제 승인 없이 실행됩니다.',
      )
    } catch (err) {
      toast.error('무인 실행 설정 변경에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'toggle failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function runNow(id: string): Promise<void> {
    setBusyKey(`run:${id}`)
    try {
      const api = await createSchedulerApi(transport)
      await api.run(id)
      await refresh()
      toast.success('작업 실행을 시작했습니다. 결과는 실행 이력에서 확인할 수 있습니다.')
    } catch (err) {
      toast.error('작업 실행에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'run failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function refreshNow(): Promise<void> {
    setBusyKey('refresh')
    try {
      await refresh()
      toast.success('스케줄 작업 목록을 새로고침했습니다.')
    } catch (err) {
      toast.error('스케줄 작업 목록을 불러오지 못했습니다.', {
        description: err instanceof Error ? err.message : 'refresh failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  if (status === 'unavailable') return <UnimplementedBanner what="Scheduler" />
  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  if (status === 'surface_disabled') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1 space-y-2">
              <h4 className="text-sm font-semibold">
                Scheduler 기능이 비활성화되어 있습니다
              </h4>
              <p className="text-xs leading-5 text-muted-foreground">
                Cron / one-shot 작업은 daemon이 사용자 개입 없이 LLM·도구를 자동 호출하므로,
                기본값은 꺼져 있고 이 화면에서 명시적으로 켜야 합니다. 활성화하면
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">~/.sepilotd/config.yaml</code>
                의
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">scheduler.surfaces.desktop</code>
                가 <code className="rounded bg-muted px-1 py-0.5 text-[10px]">true</code>로 저장됩니다.
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={() => void setSurfaceEnabled('desktop', true)}
                  disabled={surfaceBusy === 'desktop'}
                >
                  {surfaceBusy === 'desktop' ? '활성화 중…' : 'Desktop scheduler 활성화'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {}
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">CLI scheduler surface</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">sepilot scheduler</code>
                CLI 명령으로 같은 작업 저장소에 접근할지 결정합니다.
              </p>
            </div>
            <Button
              size="sm"
              variant={surfaceConfig?.cli ? 'outline' : 'default'}
              onClick={() => void setSurfaceEnabled('cli', !(surfaceConfig?.cli ?? false))}
              disabled={surfaceBusy === 'cli'}
            >
              {surfaceBusy === 'cli'
                ? '저장 중…'
                : surfaceConfig?.cli
                  ? 'CLI 비활성화'
                  : 'CLI 활성화'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {}
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Scheduler surface 접근 권한</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Desktop UI / CLI 가 cron 작업을 등록·실행할 수 있는지 제어합니다.
              비활성화하면 해당 표면의 모든 <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/scheduler/*</code>
              호출이 daemon에서 차단됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={surfaceConfig?.desktop ? 'outline' : 'default'}
              onClick={() =>
                void setSurfaceEnabled('desktop', !(surfaceConfig?.desktop ?? false))
              }
              disabled={surfaceBusy === 'desktop'}
            >
              {surfaceBusy === 'desktop'
                ? '저장 중…'
                : surfaceConfig?.desktop
                  ? 'Desktop 비활성화'
                  : 'Desktop 활성화'}
            </Button>
            <Button
              size="sm"
              variant={surfaceConfig?.cli ? 'outline' : 'default'}
              onClick={() => void setSurfaceEnabled('cli', !(surfaceConfig?.cli ?? false))}
              disabled={surfaceBusy === 'cli'}
            >
              {surfaceBusy === 'cli'
                ? '저장 중…'
                : surfaceConfig?.cli
                  ? 'CLI 비활성화'
                  : 'CLI 활성화'}
            </Button>
          </div>
        </div>
      </div>

      <TaskChatHelp />

      <div className="min-h-[520px]">
        <div
          id="tasks-jobs"
          className={[
            'scroll-mt-3 rounded-xl border border-border',
            selectedJob ? 'hidden' : '',
          ].join(' ')}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div>
              <h4 className="text-sm font-semibold">Registered Jobs</h4>
              <p className="text-xs text-muted-foreground">
                백그라운드 작업과 예약을 관리합니다. Chat에서도 작업을 맡기고 결과를 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeChatId && onOpenSession ? (
                <Button size="sm" variant="outline" onClick={() => onOpenSession(activeChatId)}>
                  Chat에서 작업 요청
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={startCreatingGeekNews}>
                <Newspaper className="mr-1.5 h-4 w-4" />
                GeekNews 인사이트
              </Button>
              <Button size="sm" variant="outline" onClick={startCreatingScriptMonitor}>
                <Plus className="mr-1.5 h-4 w-4" />
                스크립트 모니터
              </Button>
              <Button size="sm" onClick={startCreating}>
                <Plus className="mr-1.5 h-4 w-4" />
                Job 생성
              </Button>
              <Button size="sm" variant="outline" onClick={() => void refreshNow()} disabled={busyKey === 'refresh'}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {busyKey === 'refresh' ? '새로고침 중…' : '새로고침'}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => applyFilter('all')}>전체</Button>
            <Button size="sm" variant={filter === 'active' ? 'default' : 'outline'} onClick={() => applyFilter('active')}>활성</Button>
            <Button size="sm" variant={filter === 'paused' ? 'default' : 'outline'} onClick={() => applyFilter('paused')}>일시중지</Button>
            <Button size="sm" variant={filter === 'failed' ? 'default' : 'outline'} onClick={() => applyFilter('failed')}>실패</Button>
          </div>
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="w-[30%] px-4 py-3 font-medium">Job</th>
                  <th className="w-[13%] px-3 py-3 font-medium">상태</th>
                  <th className="w-[18%] px-3 py-3 font-medium">Schedule</th>
                  <th className="w-[15%] px-3 py-3 font-medium">Next</th>
                  <th className="w-[14%] px-3 py-3 font-medium">Last</th>
                  <th className="w-[10%] px-4 py-3 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <tr
                    key={job.id}
                    className={[
                      'cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/40',
                      selectedJob?.id === job.id ? 'bg-primary/5' : '',
                    ].join(' ')}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="truncate font-medium text-foreground">{job.name}</div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {sourceLabel(job) ? (
                          <span className="max-w-full truncate rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-300">
                            {sourceLabel(job)}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate">
                          {clip(sourceDetail(job) || job.instruction, 90) || 'instruction 없음'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {schedulerStatusLabel(job)}
                        </span>
                        {job.status === 'failed' ? (
                          <span className="rounded-full border border-red-500/40 px-2 py-0.5 text-[11px] text-red-500">실패</span>
                        ) : job.lastError ? (
                          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-500">경고</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="truncate font-mono text-xs text-muted-foreground">{scheduleLabel(job)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div>{formatRelativeTime(job.nextRunAt)}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{formatWhen(job.nextRunAt)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div>{formatRelativeTime(job.lastRunAt)}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">{formatWhen(job.lastRunAt)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                        <Button size="sm" variant="outline" aria-label={`${job.name} 지금 실행`} onClick={() => void runNow(job.id)} disabled={busyKey === `run:${job.id}`}>
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          <span className="hidden 2xl:inline">{busyKey === `run:${job.id}` ? '실행 중…' : '지금 실행'}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                          aria-label={`${job.name} 삭제`}
                          title="삭제"
                          onClick={() => void remove(job.id)}
                          disabled={busyKey === `remove:${job.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleJobs.length === 0 && (
              <p className="m-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                {filter === 'all'
                  ? '예약된 작업이 없습니다.'
                  : filter === 'active'
                    ? '활성화된 작업이 없습니다.'
                    : filter === 'paused'
                      ? '일시중지된 작업이 없습니다.'
                      : '실패한 작업이 없습니다.'}
              </p>
            )}
          </div>
        </div>

        <aside className={selectedJob ? 'rounded-xl border border-border p-4' : 'hidden'}>
          {selectedJob ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Button size="sm" variant="outline" onClick={() => setSelectedJobId(null)}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    목록
                  </Button>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold">상세: {selectedJob.name}</h4>
                    {selectedJob.parentSessionId && onOpenSession ? (
                      <Button size="sm" variant="outline" onClick={() => onOpenSession(selectedJob.parentSessionId!)}>
                        연결된 Chat 열기
                      </Button>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">선택한 Job의 상세 내용</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {selectedJob.kind === 'oneshot' ? 'One-shot' : 'Recurring'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-lg border border-border/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Next Run</div>
                  <div className="mt-1 text-sm font-medium">{formatRelativeTime(selectedJob.nextRunAt)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{formatWhen(selectedJob.nextRunAt)}</div>
                </div>
                <div className="rounded-lg border border-border/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last Run</div>
                  <div className="mt-1 text-sm font-medium">{formatRelativeTime(selectedJob.lastRunAt)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatWhen(selectedJob.lastRunAt)}
                    {selectedJob.maxAttempts > 1 ? ` · 재시도 ${selectedJob.maxAttempts}회` : ''}
                  </div>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                {sourceLabel(selectedJob) ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Source</dt>
                    <dd className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-300">
                        {sourceLabel(selectedJob)}
                      </span>
                      {sourceDetail(selectedJob) ? (
                        <span className="text-muted-foreground">{sourceDetail(selectedJob)}</span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-muted-foreground">Schedule</dt>
                  <dd className="mt-1 font-mono text-xs">{scheduleLabel(selectedJob)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Timezone</dt>
                  <dd className="mt-1 text-xs">{selectedJob.timezone ? `[${selectedJob.timezone}]` : 'daemon 기본값'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Delivery</dt>
                  <dd className="mt-1 text-xs">
                    {scriptMonitorMetadata(selectedJob)
                      ? '상태 전이와 설정한 정기 보고를 Pet 및 알림 구독 대상으로 전달'
                      : selectedJob.parentSessionId
                      ? `Chat session ${clip(selectedJob.parentSessionId, 28)}`
                      : '실행 이력에만 저장'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">승인</dt>
                  <dd className="mt-1 text-xs">
                    {scriptMonitorMetadata(selectedJob)
                      ? '이 모니터를 저장하면 지정한 스크립트의 예약 실행을 허용합니다.'
                      : selectedJob.unattended
                      ? '무인 실행 — 승인 창 없이 도구를 실행합니다.'
                      : '실행 중 도구 승인이 필요하면 대기합니다.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {scriptMonitorMetadata(selectedJob) ? 'Script contract' : 'Instruction'}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-border/70 px-3 py-2 font-mono text-xs leading-5">
                    {scriptMonitorMetadata(selectedJob)
                      ? JSON.stringify(scriptMonitorMetadata(selectedJob), null, 2)
                      : selectedJob.instruction || 'instruction 없음'}
                  </dd>
                </div>
                {selectedJob.lastError ? (
                  <div>
                    <dt className="text-xs text-red-500">Last Error</dt>
                    <dd className="mt-1 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-500">
                      {clip(selectedJob.lastError, 240)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" variant="outline" onClick={() => startEditing(selectedJob)}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  편집
                </Button>
                <Button size="sm" variant="outline" onClick={() => void runNow(selectedJob.id)} disabled={busyKey === `run:${selectedJob.id}`}>
                  <Play className="mr-1.5 h-4 w-4" />
                  {busyKey === `run:${selectedJob.id}` ? '실행 중…' : '지금 실행'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void toggleEnabled(selectedJob)} disabled={busyKey === `toggle:${selectedJob.id}`}>
                  {busyKey === `toggle:${selectedJob.id}` ? '처리 중…' : selectedJob.enabled ? '비활성화' : '활성화'}
                </Button>
                {!scriptMonitorMetadata(selectedJob) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void toggleUnattended(selectedJob)}
                    disabled={busyKey === `unattended:${selectedJob.id}`}
                    title="예약 작업은 사람이 없을 때 실행되므로, 승인 창이 뜨면 아무도 답하지 못한 채 시간이 만료됩니다."
                  >
                    {busyKey === `unattended:${selectedJob.id}`
                      ? '처리 중…'
                      : selectedJob.unattended ? '승인 요구로 되돌리기' : '무인 실행 허용'}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => void remove(selectedJob.id)} disabled={busyKey === `remove:${selectedJob.id}`}>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {busyKey === `remove:${selectedJob.id}` ? '삭제 중…' : '삭제'}
                </Button>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">최근 실행 이력</div>
                {runsStatus === 'loading' ? (
                  <p className="text-xs text-muted-foreground">불러오는 중…</p>
                ) : runsStatus === 'error' ? (
                  <p className="text-xs text-red-500">실행 이력 불러오기에 실패했습니다.</p>
                ) : runs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">실행 이력이 아직 없습니다.</p>
                ) : (
                  <ul className="max-h-[260px] space-y-1.5 overflow-auto pr-1">
                    {runs.map((run) => (
                      <li key={run.id} className="rounded-lg border border-border/70 px-2.5 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'font-semibold uppercase tracking-wide',
                              run.status === 'success'
                                ? 'text-emerald-500'
                                : run.status === 'failed'
                                  ? 'text-red-500'
                                  : 'text-amber-500',
                            ].join(' ')}
                          >
                            {run.status === 'success' ? '성공' : run.status === 'failed' ? '실패' : '실행 중'}
                          </span>
                          <span className="text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</span>
                          <span className="text-muted-foreground">
                            {run.attempt === 0 ? '수동' : `${run.attempt}번째 시도`}
                            {run.durationMs != null ? ` · ${run.durationMs}ms` : ''}
                          </span>
                        </div>
                        {run.error ? <div className="mt-1 text-red-500">{clip(run.error, 200)}</div> : null}
                        {run.outputExcerpt ? <div className="mt-1 text-muted-foreground">{clip(run.outputExcerpt, 200)}</div> : null}
                        <RunAgentSessionEvidence
                          onOpenSession={onOpenSession}
                          run={run}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-xs text-muted-foreground">
              Job을 선택하거나 새 Job을 생성하세요.
            </div>
          )}
        </aside>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scheduler-job-dialog-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[560px] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h4 id="scheduler-job-dialog-title" className="text-sm font-semibold">
                  {editing.id ? 'Job 편집' : 'Job 생성'}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  실행할 내용과 시간을 입력하세요. 즉시 백그라운드 실행 또는 예약 실행을 선택할 수 있습니다.
                </p>
              </div>
              <Button size="sm" variant="ghost" aria-label="닫기" onClick={resetEditor}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div
              role="region"
              aria-label="Job 설정"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]"
            >
              <div className="flex flex-wrap gap-2 rounded-lg border border-border p-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editing.execution === 'agent' ? 'default' : 'outline'}
                  onClick={() => setEditing((prev) => ({ ...prev, execution: 'agent' }))}
                >
                  Agent 작업
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editing.execution === 'script-monitor' ? 'default' : 'outline'}
                  onClick={() => setEditing((prev) => ({ ...prev, execution: 'script-monitor', mode: 'recurring' }))}
                >
                  LLM 없는 스크립트 모니터
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={editing.mode === 'recurring' ? 'default' : 'outline'}
                  disabled={Boolean(editing.id) && editing.mode !== 'recurring'}
                  onClick={() => setEditing((prev) => ({
                    ...prev,
                    id: prev.mode === 'recurring' ? prev.id : undefined,
                    mode: 'recurring',
                  }))}
                >
                  반복 예약
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editing.mode === 'oneshot' ? 'default' : 'outline'}
                  disabled={Boolean(editing.id) && editing.mode !== 'oneshot'}
                  onClick={() => setEditing((prev) => ({
                    ...prev,
                    id: prev.mode === 'oneshot' ? prev.id : undefined,
                    mode: 'oneshot',
                  }))}
                >
                  한 번 실행
                </Button>
              </div>
              {!editing.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing((prev) => ({ ...prev, mode: 'oneshot', when: '@now' }))}
                >
                  지금 백그라운드로 실행
                </Button>
              ) : null}
              <div className="space-y-2">
                <label htmlFor="scheduler-job-name" className="text-sm font-medium">Name</label>
                <Input
                  id="scheduler-job-name"
                  value={editing.name}
                  onChange={(event) => setEditing((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="scheduler-job-cron" className="text-sm font-medium">Schedule</label>
                <Input
                  id="scheduler-job-cron"
                  value={editing.mode === 'oneshot' ? editing.when : editing.cron}
                  onChange={(event) => {
                    const value = event.target.value
                    setEditing((prev) => (
                      prev.mode === 'oneshot'
                        ? { ...prev, when: value }
                        : { ...prev, cron: value }
                    ))
                  }}
                  placeholder={editing.mode === 'oneshot'
                    ? '@now  ·  in 2 hours  ·  tomorrow at 9am'
                    : '0 */6 * * *  ·  @daily  ·  @every 30s'}
                />
              </div>
              {editing.execution === 'agent' ? <div className="space-y-2">
                <label htmlFor="scheduler-job-instruction" className="text-sm font-medium">Instruction</label>
                <textarea
                  id="scheduler-job-instruction"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={editing.instruction}
                  onChange={(event) => setEditing((prev) => ({ ...prev, instruction: event.target.value }))}
                  placeholder="어제 커밋을 요약해서 알려줘"
                  rows={5}
                />
              </div> : (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    daemon이 스크립트를 직접 실행하고 JSON 상태를 판정합니다. Agent와 LLM provider는 호출하지 않습니다.
                    SSH는 기존 <code className="rounded bg-muted px-1">~/.ssh/config</code>와 키를 사용합니다.
                    저장하면 이 스케줄에 지정한 실행 파일을 백그라운드에서 실행하도록 허용합니다.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor="monitor-id" className="text-xs font-medium">Monitor ID</label>
                      <Input id="monitor-id" value={editing.monitorId} onChange={(event) => setEditing((prev) => ({ ...prev, monitorId: event.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="monitor-contract" className="text-xs font-medium">Contract version</label>
                      <Input id="monitor-contract" value={editing.contractVersion} onChange={(event) => setEditing((prev) => ({ ...prev, contractVersion: event.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={editing.targetKind === 'local' ? 'default' : 'outline'} onClick={() => setEditing((prev) => ({ ...prev, targetKind: 'local' }))}>Local</Button>
                    <Button type="button" size="sm" variant={editing.targetKind === 'ssh' ? 'default' : 'outline'} onClick={() => setEditing((prev) => ({ ...prev, targetKind: 'ssh' }))}>SSH</Button>
                  </div>
                  {editing.targetKind === 'ssh' ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input aria-label="SSH host" placeholder="host 또는 alias" value={editing.sshHost} onChange={(event) => setEditing((prev) => ({ ...prev, sshHost: event.target.value }))} />
                      <Input aria-label="SSH user" placeholder="user (선택)" value={editing.sshUser} onChange={(event) => setEditing((prev) => ({ ...prev, sshUser: event.target.value }))} />
                      <Input aria-label="SSH port" placeholder="port (선택)" inputMode="numeric" value={editing.sshPort} onChange={(event) => setEditing((prev) => ({ ...prev, sshPort: event.target.value }))} />
                    </div>
                  ) : null}
                  <Input aria-label="Script absolute path" placeholder="/opt/monitor/resource-check.sh" value={editing.scriptPath} onChange={(event) => setEditing((prev) => ({ ...prev, scriptPath: event.target.value }))} />
                  <Input aria-label="Script working directory" placeholder="작업 폴더 절대 경로 (선택)" value={editing.scriptCwd} onChange={(event) => setEditing((prev) => ({ ...prev, scriptCwd: event.target.value }))} />
                  <textarea
                    aria-label="Script arguments"
                    className="flex min-h-[76px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    placeholder={'인자 하나당 한 줄\n--cpu-threshold\n90'}
                    value={editing.scriptArgs}
                    onChange={(event) => setEditing((prev) => ({ ...prev, scriptArgs: event.target.value }))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">Timeout (초)<Input type="number" min={1} max={600} value={editing.timeoutSeconds} onChange={(event) => setEditing((prev) => ({ ...prev, timeoutSeconds: Number(event.target.value) }))} /></label>
                    <label className="text-xs">정기 보고 간격 (분, 선택)<Input type="number" min={5} value={editing.reportMinutes} onChange={(event) => setEditing((prev) => ({ ...prev, reportMinutes: event.target.value }))} /></label>
                    <label className="text-xs">이상 연속 샘플<Input type="number" min={1} max={100} value={editing.anomalySamples} onChange={(event) => setEditing((prev) => ({ ...prev, anomalySamples: Number(event.target.value) }))} /></label>
                    <label className="text-xs">복구 연속 샘플<Input type="number" min={1} max={100} value={editing.recoverySamples} onChange={(event) => setEditing((prev) => ({ ...prev, recoverySamples: Number(event.target.value) }))} /></label>
                    <label className="text-xs">오류 연속 샘플<Input type="number" min={1} max={100} value={editing.errorSamples} onChange={(event) => setEditing((prev) => ({ ...prev, errorSamples: Number(event.target.value) }))} /></label>
                  </div>
                  <pre className="overflow-auto rounded bg-muted p-2 text-[10px]">{'stdout JSON: {"version":1,"status":"healthy|anomaly|unknown","severity":"warning|high|critical","summary":"...","metrics":{"cpu":92}}'}</pre>
                </div>
              )}
              {editing.execution === 'agent' ? <label htmlFor="scheduler-job-delivery" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-sm">
                <div className="min-w-0 pr-3">
                  <div className="font-medium">현재 Chat에 결과 표시</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {activeChatId && !activeChat?.isDraft
                      ? `실행 결과를 ${clip(activeChat?.title ?? activeChatId, 42)} 대화에 추가합니다.`
                      : '대화가 daemon에 저장된 뒤 사용할 수 있습니다.'}
                  </div>
                </div>
                <input
                  id="scheduler-job-delivery"
                  type="checkbox"
                  checked={Boolean(editing.parentSessionId)}
                  disabled={!activeChatId || activeChat?.isDraft}
                  onChange={(event) => setEditing((prev) => ({
                    ...prev,
                    parentSessionId: event.target.checked && activeChatId ? activeChatId : '',
                  }))}
                />
              </label> : null}
              <div className="space-y-2">
                <label htmlFor="scheduler-job-timezone" className="text-sm font-medium">Timezone</label>
                <Input
                  id="scheduler-job-timezone"
                  value={editing.timezone}
                  onChange={(event) => setEditing((prev) => ({ ...prev, timezone: event.target.value }))}
                  placeholder="Asia/Seoul (비우면 daemon 기본값)"
                />
              </div>
              <label htmlFor="scheduler-job-enabled" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-sm">
                <div>
                  <div className="font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">저장 직후 활성화 여부</div>
                </div>
                <input
                  id="scheduler-job-enabled"
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(event) => setEditing((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
              </label>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
              <Button size="sm" variant="ghost" onClick={resetEditor}>취소</Button>
              <Button size="sm" onClick={() => void save()} disabled={busyKey === 'save'}>
                {busyKey === 'save' ? '저장 중…' : editing.id ? '업데이트' : '추가'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RunAgentSessionEvidence({
  run,
  onOpenSession,
}: {
  run: SchedulerJobRun
  onOpenSession?: (sessionId: string) => void
}) {
  const sessionId = daemonSchedulerRunAgentSessionId(run)
  if (!sessionId) return null

  const label = `agent session: ${sessionId}`
  if (onOpenSession) {
    return (
      <button
        aria-label={`${label} 열기`}
        className="mt-1 break-all text-left font-mono text-[10px] text-primary hover:underline"
        onClick={() => onOpenSession(sessionId)}
        type="button"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
      {label}
    </div>
  )
}
