'use client'
import { useEffect, useState } from 'react'
import type { DaemonDoctorReport, DaemonHealth } from '@sepilotd/api-client'
import { Activity, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getDesktopApi,
  getDesktopNotificationDiagnostics,
  type DesktopNotificationDiagnostics,
} from '@/lib/electron/bridge'
import { useShellStore } from '@/lib/store/shell-store'
import { cn } from '@/lib/utils/cn'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'status-hub',
  section: 'system',
  label: 'Status Hub',
  search: ['status', 'diagnostics', 'daemon', 'gateway', 'desktop', 'shell'],
  render: () => <StatusHubSettingsTab />,
})

interface HubState {
  loading: boolean
  health: DaemonHealth | null
  doctor: DaemonDoctorReport | null
  notifications: DesktopNotificationDiagnostics | null
  error: string | null
}

function badgeClass(kind: 'ok' | 'warn' | 'fail'): string {
  if (kind === 'ok') return 'border-emerald-500/30 text-emerald-600'
  if (kind === 'warn') return 'border-amber-500/30 text-amber-600'
  return 'border-destructive/30 text-destructive'
}

export function StatusHubSettingsTab() {
  const tabs = useShellStore((state) => state.tabs)
  const profiles = useShellStore((state) => state.profiles)
  const activity = useShellStore((state) => state.activity)
  const diagnostics = tabs.filter((tab) => tab.diagnostic)
  const [state, setState] = useState<HubState>({
    loading: true,
    health: null,
    doctor: null,
    notifications: null,
    error: null,
  })

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const api = getDesktopApi()
      const [health, doctor, notifications] = await Promise.all([
        api?.health?.() ?? Promise.resolve(null),
        api?.doctor?.() ?? Promise.resolve(null),
        getDesktopNotificationDiagnostics(),
      ])
      setState({ loading: false, health, doctor, notifications, error: null })
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const doctorGrade = state.doctor?.summary.grade ?? 'unknown'
  const daemonOk = Boolean(state.health)
  const nativeNotificationsOk =
    state.notifications?.nativeSupported && !state.notifications.nativeDisabledByEnv

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Runtime Diagnostics</h3>
          <p className="text-xs text-muted-foreground">
            daemon, desktop bridge, notifications, Shell 상태를 한 화면에서 확인합니다.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={state.loading}>
          <RefreshCcw className={cn('h-3.5 w-3.5', state.loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard title="Daemon" value={daemonOk ? 'reachable' : 'unavailable'} ok={daemonOk} />
        <StatusCard
          title="Doctor"
          value={doctorGrade}
          ok={doctorGrade === 'Excellent' || doctorGrade === 'Good'}
          warn={doctorGrade === 'Fair' || doctorGrade === 'unknown'}
        />
        <StatusCard
          title="Notifications"
          value={nativeNotificationsOk ? 'native ready' : 'check settings'}
          ok={Boolean(nativeNotificationsOk)}
          warn={Boolean(state.notifications && !nativeNotificationsOk)}
        />
        <StatusCard
          title="Shell Bridge"
          value={typeof window !== 'undefined' && window.sepilot?.shell ? 'ready' : 'missing'}
          ok={typeof window !== 'undefined' && Boolean(window.sepilot?.shell)}
        />
      </div>

      {state.error ? (
        <div className="rounded-md border p-3 text-destructive">{state.error}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric title="Open terminal tabs" value={tabs.length} />
        <Metric title="Shell profiles" value={profiles.length} />
        <Metric title="Recent activity" value={activity.length} />
      </div>

      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Shell Diagnostics</h4>
        </div>
        {diagnostics.length === 0 ? (
          <p className="text-xs text-muted-foreground">현재 Shell 진단 경고가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {diagnostics.map((tab) => (
              <div key={tab.id} className="rounded-md border border-amber-500/30 p-2">
                <div className="text-xs font-medium">{tab.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tab.diagnostic}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusCard({
  title,
  value,
  ok,
  warn = false,
}: {
  title: string
  value: string
  ok: boolean
  warn?: boolean
}) {
  const kind = ok ? 'ok' : warn ? 'warn' : 'fail'
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div
        className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs', badgeClass(kind))}
      >
        {value}
      </div>
    </div>
  )
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{title}</div>
    </div>
  )
}
