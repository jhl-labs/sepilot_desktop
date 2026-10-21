'use client'
import { useEffect, useState } from 'react'
import { Cpu, Folder, RefreshCcw, Server, Settings2 } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import {
  createSystemApi,
  CapabilityUnavailableError,
  type BootInfo,
} from '@/lib/api/system'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'boot-info',
  section: 'system',
  label: 'Boot info',
  search: ['boot', 'env', 'port', 'home', 'paths', 'version', 'system'],
  render: () => <SystemBootInfoTab />,
})

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; info: BootInfo }

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${seconds % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function SystemBootInfoTab() {
  const transport = useTransport()
  const [state, setState] = useState<State>({ kind: 'loading' })

  async function reload(): Promise<void> {
    setState({ kind: 'loading' })
    try {
      const api = await createSystemApi(transport)
      const info = await api.bootInfo()
      setState({ kind: 'ready', info })
    } catch (error) {
      if (error instanceof CapabilityUnavailableError) {
        setState({ kind: 'unavailable' })
        return
      }
      const friendly = explainChatStreamError(error)
      setState({ kind: 'error', message: friendly.description ?? friendly.title })
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  if (state.kind === 'loading') {
    return <p className="text-xs text-muted-foreground">불러오는 중…</p>
  }

  if (state.kind === 'unavailable') {
    return <UnimplementedBanner what="System Boot Info" />
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">{state.message}</p>
        <Button size="sm" variant="outline" onClick={() => void reload()}>
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          다시 시도
        </Button>
      </div>
    )
  }

  const { info } = state

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          이 값들은 daemon 부트 시점 설정이라 GUI에서는 변경할 수 없다. 바꾸려면
          daemon 재시작이 필요하다 — env 변수 또는{' '}
          <code className="rounded bg-muted px-1 font-mono text-[11px]">
            ~/.sepilotd/config.yaml
          </code>{' '}
          를 직접 편집한 뒤 다시 실행할 것.
        </p>
        <Button size="sm" variant="ghost" onClick={() => void reload()} aria-label="새로고침">
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <section className="rounded-md border border-border p-3">
        <header className="mb-2 flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Daemon
          </h4>
        </header>
        <dl className="grid grid-cols-1 gap-y-1.5 text-xs sm:grid-cols-2">
          <Row label="version" value={info.daemon.version} />
          <Row label="node" value={info.daemon.nodeVersion} />
          <Row label="platform" value={info.daemon.platform} />
          <Row label="pid" value={String(info.daemon.pid)} />
          <Row label="started" value={info.daemon.startedAt} />
          <Row label="uptime" value={formatUptime(info.daemon.uptimeSeconds)} />
        </dl>
      </section>

      <section className="rounded-md border border-border p-3">
        <header className="mb-2 flex items-center gap-2">
          <Folder className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Paths
          </h4>
        </header>
        <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
          <Row label="home" value={info.paths.home} mono />
          {info.paths.entries.map((entry) => (
            <Row key={entry.label} label={entry.label} value={entry.path} mono />
          ))}
        </dl>
      </section>

      <section className="rounded-md border border-border p-3">
        <header className="mb-2 flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Environment knobs
          </h4>
        </header>
        <ul className="flex flex-col divide-y divide-border/60">
          {info.env.map((knob) => (
            <li key={knob.name} className="flex items-center gap-2 py-2">
              <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-[11px] font-medium">
                    {knob.name}
                  </code>
                  <span
                    className={
                      'rounded-full px-1.5 py-0.5 text-[10px] ' +
                      (knob.fromEnv
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {knob.fromEnv ? 'env' : 'default'}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {knob.purpose}
                </div>
              </div>
              <code className="shrink-0 max-w-[40%] truncate text-right font-mono text-[11px]">
                {knob.effective ?? '—'}
              </code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-20 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          'min-w-0 flex-1 truncate ' + (mono ? 'font-mono text-[11px]' : '')
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
