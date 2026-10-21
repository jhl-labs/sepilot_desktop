'use client'
import { useEffect, useState } from 'react'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { getJson, makeHttp, sendJson } from '@/lib/api/_http'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

interface UsageSnapshot {
  totalSessions: number
  totalMessages: number
  totalToolCalls: number
}

interface ObservabilitySnapshot {
  reliability: {
    totalEvents: number
    errorEvents: number
    crashReports: number
  }
  quality: {
    explicitSatisfaction: number | null
    implicitAcceptance: number | null
  }
  productivity: {
    tasksStarted: number
    tasksCompleted: number
    completionRate: number | null
    assistedTaskThroughputPerDay: number
    channelResolutionRate: number | null
    toolSuccessRate: number | null
  }
  comparison?: {
    errorEventsDelta: number
    satisfactionDelta: number | null
    completionRateDelta: number | null
    throughputPerDayDelta: number
    channelResolutionRateDelta: number | null
    toolSuccessRateDelta: number | null
  }
  trend?: Array<{
    label: string
    from: string
    errorEvents: number
    tasksStarted: number
    tasksCompleted: number
    completionRate: number | null
    channelResolutionRate: number | null
  }>
  segments?: Array<{
    key: string
    label: string
    errorEvents: number
    feedbackPositive: number
    feedbackNegative: number
    explicitSatisfaction: number | null
    tasksStarted: number
    tasksCompleted: number
    completionRate: number | null
    channelResolutionRate: number | null
  }>
  hotspots?: {
    errorEvents: Array<{
      key: string
      label: string
      count: number
      source?: string
    }>
    feedbackReasons: Array<{
      key: string
      label: string
      count: number
      source?: string
    }>
  }
  alerts?: Array<{
    id: string
    level: 'info' | 'warning' | 'critical'
    title: string
    detail: string
  }>
}

interface ObservabilityPrivacySettings {
  localCollectionEnabled: boolean
  diagnosticCollectionEnabled: boolean
  sensitiveCollectionEnabled: boolean
  feedbackCollectionEnabled: boolean
  retentionDays: number
  feedbackPromptCooldownHours: number
  updatedAt: string
}

registerSettingsTab({
  key: 'agent-stats',
  section: 'agent',
  label: 'Agent Stats',
  search: ['usage', 'metrics', 'observability', 'feedback', 'productivity'],
  render: () => <AgentStatsDashboard />,
})

function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : 'n/a'
}

function formatDecimal(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : 'n/a'
}

function formatDeltaPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  const rounded = Math.round(value * 100)
  return `${rounded >= 0 ? '+' : ''}${rounded}pp`
}

function formatDeltaDecimal(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

function barHeight(value: number, max: number): string {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return '8px'
  return `${Math.max(8, Math.round((value / max) * 72))}px`
}

export function AgentStatsDashboard() {
  const transport = useTransport()
  const [privacyDraft, setPrivacyDraft] =
    useState<ObservabilityPrivacySettings | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const state = useCapabilityResource(async () => {
    const http = await makeHttp(transport)
    const [usage, observability, privacy] = await Promise.all([
      getJson<UsageSnapshot>(http, '/usage/snapshot', 'usage'),
      getJson<{ data: ObservabilitySnapshot }>(
        http,
        '/api/v1/observability/snapshot?range=7d',
        'observability',
      ).catch(() => null),
      getJson<{ data: ObservabilityPrivacySettings }>(
        http,
        '/api/v1/observability/privacy',
        'observability',
      ).catch(() => null),
    ])
    return {
      usage,
      observability: observability?.data ?? null,
      privacy: privacy?.data ?? null,
    }
  }, [transport])
  const loadedPrivacy = state.kind === 'ready' ? state.data.privacy : null
  useEffect(() => {
    if (loadedPrivacy) {
      setPrivacyDraft(loadedPrivacy)
    }
  }, [loadedPrivacy])

  async function savePrivacy(): Promise<void> {
    if (!privacyDraft) return
    setBusyKey('privacy')
    setMessage(null)
    try {
      const http = await makeHttp(transport)
      const response = await sendJson<{ data: ObservabilityPrivacySettings }>(
        http,
        'PATCH',
        '/api/v1/observability/privacy',
        privacyDraft,
        'observability',
      )
      setPrivacyDraft(response.data)
      setMessage('관측 수집 설정을 저장했습니다.')
      setMessageTone('success')
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : '관측 수집 설정 저장에 실패했습니다.',
      )
      setMessageTone('error')
    } finally {
      setBusyKey(null)
    }
  }

  async function exportBundle(): Promise<void> {
    setBusyKey('export')
    setMessage(null)
    try {
      const http = await makeHttp(transport)
      const response = await sendJson<{
        data: { path?: string }
      }>(
        http,
        'POST',
        '/api/v1/observability/export',
        { range: '7d', persist: true },
        'observability',
      )
      setMessage(
        response.data.path
          ? `관측 번들을 내보냈습니다: ${response.data.path}`
          : '관측 번들을 생성했습니다.',
      )
      setMessageTone('success')
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : '관측 번들 내보내기에 실패했습니다.',
      )
      setMessageTone('error')
    } finally {
      setBusyKey(null)
    }
  }

  async function pruneRetention(): Promise<void> {
    setBusyKey('prune')
    setMessage(null)
    try {
      const http = await makeHttp(transport)
      const response = await sendJson<{
        data: { deletedEvents: number; deletedFeedback: number }
      }>(
        http,
        'POST',
        '/api/v1/observability/prune',
        {},
        'observability',
      )
      setMessage(
        `보존기간 정리 완료: 이벤트 ${response.data.deletedEvents}개, 피드백 ${response.data.deletedFeedback}개 삭제`,
      )
      setMessageTone('success')
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : '보존기간 정리에 실패했습니다.',
      )
      setMessageTone('error')
    } finally {
      setBusyKey(null)
    }
  }

  if (state.kind === 'unavailable') return <UnimplementedBanner what="Usage" />
  if (state.kind === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'error')
    return <p className="text-sm text-red-500">{state.error.message}</p>
  const d = state.data.usage
  const o = state.data.observability
  const p = privacyDraft ?? state.data.privacy
  const trend = o?.trend ?? []
  const trendMax = Math.max(1, ...trend.map((point) => point.tasksCompleted))
  const alerts = o?.alerts ?? []
  const segments = o?.segments?.slice(0, 4) ?? []
  const errorHotspots = o?.hotspots?.errorEvents.slice(0, 3) ?? []
  const feedbackHotspots = o?.hotspots?.feedbackReasons.slice(0, 3) ?? []
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        {(
          [
            ['Sessions', d.totalSessions],
            ['Messages', d.totalMessages],
            ['Tool calls', d.totalToolCalls],
            ['7d events', o?.reliability.totalEvents ?? 0],
            ['7d errors', o?.reliability.errorEvents ?? 0],
            ['7d crashes', o?.reliability.crashReports ?? 0],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-2xl font-semibold">{v}</dd>
          </div>
        ))}
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Satisfaction</dt>
          <dd className="text-2xl font-semibold">
            {formatPercent(o?.quality.explicitSatisfaction)}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Completed tasks</dt>
          <dd className="text-2xl font-semibold">
            {o?.productivity.tasksCompleted ?? 0}/{o?.productivity.tasksStarted ?? 0}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Completion rate</dt>
          <dd className="text-2xl font-semibold">
            {formatPercent(o?.productivity.completionRate)}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Channel resolution</dt>
          <dd className="text-2xl font-semibold">
            {formatPercent(o?.productivity.channelResolutionRate)}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Throughput/day</dt>
          <dd className="text-2xl font-semibold">
            {formatDecimal(o?.productivity.assistedTaskThroughputPerDay)}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Tool success</dt>
          <dd className="text-2xl font-semibold">
            {formatPercent(o?.productivity.toolSuccessRate)}
          </dd>
        </div>
        <div className="rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">Retention</dt>
          <dd className="text-2xl font-semibold">{p?.retentionDays ?? 30}d</dd>
          <dd className="text-xs text-muted-foreground">
            {p?.localCollectionEnabled === false
              ? 'collection paused'
              : p?.feedbackCollectionEnabled === false
                ? 'feedback paused'
                : 'local store'}
          </dd>
        </div>
      </dl>

      <section className="rounded-md border border-border p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">DX/AX Trend</h4>
            <p className="text-xs text-muted-foreground">
              기간별 완료량과 이전 기간 대비 변화를 함께 봅니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <span className="rounded-md border border-border px-2 py-1">
              Completion {formatDeltaPercent(o?.comparison?.completionRateDelta)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Throughput {formatDeltaDecimal(o?.comparison?.throughputPerDayDelta)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Satisfaction {formatDeltaPercent(o?.comparison?.satisfactionDelta)}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Channel {formatDeltaPercent(o?.comparison?.channelResolutionRateDelta)}
            </span>
          </div>
        </div>
        {trend.length > 0 ? (
          <div className="flex h-28 items-end gap-1 overflow-x-auto border-b border-border pb-2">
            {trend.map((point) => (
              <div
                key={point.from}
                className="flex min-w-8 flex-1 flex-col items-center gap-1"
                title={`${point.label}: ${point.tasksCompleted}/${point.tasksStarted} completed`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary/70"
                  style={{ height: barHeight(point.tasksCompleted, trendMax) }}
                />
                <span className="max-w-12 truncate text-[10px] text-muted-foreground">
                  {point.label.slice(-5)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">trend data unavailable</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border p-4">
          <h4 className="text-sm font-semibold">Alerts</h4>
          <div className="mt-3 space-y-2 text-sm">
            {alerts.length > 0 ? alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <strong>{alert.title}</strong>
                  <span className="text-xs uppercase text-muted-foreground">
                    {alert.level}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No active alerts</p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border p-4 lg:col-span-2">
          <h4 className="text-sm font-semibold">Segment Drilldown</h4>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {segments.length > 0 ? segments.map((segment) => (
              <div key={segment.key} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-sm">{segment.label}</strong>
                  <span className="text-xs text-muted-foreground">
                    {segment.tasksCompleted}/{segment.tasksStarted}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>completion {formatPercent(segment.completionRate)}</span>
                  <span>errors {segment.errorEvents}</span>
                  <span>satisfaction {formatPercent(segment.explicitSatisfaction)}</span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No segment data</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border p-4">
          <h4 className="text-sm font-semibold">Error Hotspots</h4>
          <div className="mt-3 space-y-2 text-sm">
            {errorHotspots.length > 0 ? errorHotspots.map((hotspot) => (
              <div key={hotspot.key} className="flex justify-between gap-3">
                <span className="truncate">{hotspot.label}</span>
                <strong>{hotspot.count}</strong>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No error hotspots</p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border p-4">
          <h4 className="text-sm font-semibold">Feedback Hotspots</h4>
          <div className="mt-3 space-y-2 text-sm">
            {feedbackHotspots.length > 0 ? feedbackHotspots.map((hotspot) => (
              <div key={hotspot.key} className="flex justify-between gap-3">
                <span className="truncate">{hotspot.label}</span>
                <strong>{hotspot.count}</strong>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No feedback hotspots</p>
            )}
          </div>
        </div>
      </section>

      {privacyDraft ? (
        <section className="rounded-md border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Privacy Controls</h4>
              <p className="text-xs text-muted-foreground">
                로컬 관측 수집 범위와 보존기간을 조정합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void exportBundle()}
                disabled={busyKey === 'export'}
              >
                {busyKey === 'export' ? '내보내는 중…' : 'Export Bundle'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void pruneRetention()}
                disabled={busyKey === 'prune'}
              >
                {busyKey === 'prune' ? '정리 중…' : 'Apply Retention'}
              </Button>
              <Button
                size="sm"
                onClick={() => void savePrivacy()}
                disabled={busyKey === 'privacy'}
              >
                {busyKey === 'privacy' ? '저장 중…' : 'Save Privacy'}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Retention Days</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={privacyDraft.retentionDays}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? {
                      ...current,
                      retentionDays: Number.parseInt(
                        event.target.value || '30',
                        10,
                      ),
                    }
                  : current)}
                />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Prompt Cooldown Hours</span>
              <Input
                type="number"
                min={1}
                max={720}
                value={privacyDraft.feedbackPromptCooldownHours}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? {
                      ...current,
                      feedbackPromptCooldownHours: Number.parseInt(
                        event.target.value || '24',
                        10,
                      ),
                    }
                  : current)}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Local Collection</span>
              <input
                type="checkbox"
                checked={privacyDraft.localCollectionEnabled}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? { ...current, localCollectionEnabled: event.target.checked }
                  : current)}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Diagnostic Fields</span>
              <input
                type="checkbox"
                checked={privacyDraft.diagnosticCollectionEnabled}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? { ...current, diagnosticCollectionEnabled: event.target.checked }
                  : current)}
                />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Sensitive Fields</span>
              <input
                type="checkbox"
                checked={privacyDraft.sensitiveCollectionEnabled}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? { ...current, sensitiveCollectionEnabled: event.target.checked }
                  : current)}
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Feedback Collection</span>
              <input
                type="checkbox"
                checked={privacyDraft.feedbackCollectionEnabled}
                onChange={(event) => setPrivacyDraft((current) => current
                  ? { ...current, feedbackCollectionEnabled: event.target.checked }
                  : current)}
              />
            </label>
          </div>
          {message ? (
            <p className={`mt-3 text-sm ${messageTone === 'success' ? 'text-green-600' : 'text-red-500'}`}>
              {message}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
