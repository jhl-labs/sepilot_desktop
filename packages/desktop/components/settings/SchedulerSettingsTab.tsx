'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createConfigApi } from '@/lib/api/config'
import { registerSettingsTab } from './registry'

interface SchedulerForm {
  timezone: string
  cli: boolean
  desktop: boolean
  mobile: boolean
}

const DEFAULT_FORM: SchedulerForm = {
  timezone: '',
  cli: true,
  desktop: true,
  mobile: true,
}

registerSettingsTab({
  key: 'scheduler',
  section: 'automation',
  label: 'Scheduler',
  search: ['scheduler', 'cron', 'recurring', 'timezone', 'surface'],
  render: () => <SchedulerSettingsTab />,
})

export function SchedulerSettingsTab() {
  const transport = useTransport()
  const [form, setForm] = useState<SchedulerForm>(DEFAULT_FORM)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const api = await createConfigApi(transport)
      const config = await api.get()
      const surfaces = config.scheduler?.surfaces
      setForm({
        timezone: config.scheduler?.timezone ?? '',
        cli: surfaces?.cli ?? true,
        desktop: surfaces?.desktop ?? true,
        mobile: surfaces?.mobile ?? true,
      })
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'scheduler settings load failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  async function save(): Promise<void> {
    setStatus('saving')
    try {
      const api = await createConfigApi(transport)
      await api.update({
        'scheduler.timezone': form.timezone.trim() || null,
        'scheduler.surfaces.cli': form.cli,
        'scheduler.surfaces.desktop': form.desktop,
        'scheduler.surfaces.mobile': form.mobile,
      })
      toast.success('Scheduler 설정을 저장했습니다.')
      await reload()
    } catch (err) {
      setStatus('ready')
      toast.error('Scheduler 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    }
  }

  function openTasks(): void {
    window.dispatchEvent(new CustomEvent('sepilot:open-view', { detail: 'tasks' }))
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Scheduler Defaults</h4>
            <p className="text-xs text-muted-foreground">
              반복 작업의 기본 timezone과 CLI/Desktop/Mobile scheduler surface 권한을 제어합니다.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openTasks}>
            <CalendarClock className="mr-1 h-3.5 w-3.5" />
            Tasks 열기
          </Button>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          Default timezone
          <Input
            value={form.timezone}
            onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
            placeholder="비우면 daemon 기본값, 예: Asia/Seoul"
            disabled={status === 'saving'}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SurfaceToggle
          label="CLI"
          description="sepilot scheduler 명령과 CLI 경유 예약"
          checked={form.cli}
          disabled={status === 'saving'}
          onChange={(checked) => setForm((prev) => ({ ...prev, cli: checked }))}
        />
        <SurfaceToggle
          label="Desktop"
          description="Desktop Tasks 화면과 브라우저 scheduler routes"
          checked={form.desktop}
          disabled={status === 'saving'}
          onChange={(checked) => setForm((prev) => ({ ...prev, desktop: checked }))}
        />
        <SurfaceToggle
          label="Mobile"
          description="모바일 surface에서 예약 작업 생성과 실행"
          checked={form.mobile}
          disabled={status === 'saving'}
          onChange={(checked) => setForm((prev) => ({ ...prev, mobile: checked }))}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}

function SurfaceToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-28 flex-col justify-between rounded-md border border-border p-3">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span className="mt-3 flex items-center justify-between text-xs">
        {checked ? 'enabled' : 'disabled'}
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  )
}
