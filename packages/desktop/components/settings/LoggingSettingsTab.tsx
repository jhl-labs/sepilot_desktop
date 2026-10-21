'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'logging',
  section: 'system',
  label: 'Logging',
  search: ['log', 'logging', 'rotation', 'rotate', 'trace', 'level', 'verbose', 'json'],
  render: () => <LoggingSettingsTab />,
})

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface RotationForm {
  enabled: boolean
  maxBytes: number
  maxFiles: number
}

interface LoggingForm {
  level: LogLevel
  jsonFormat: boolean
  app: RotationForm
  trace: RotationForm
}

const DEFAULTS: LoggingForm = {
  level: 'info',
  jsonFormat: false,
  app: { enabled: true, maxBytes: 10 * 1024 * 1024, maxFiles: 3 },
  trace: { enabled: true, maxBytes: 50 * 1024 * 1024, maxFiles: 3 },
}

function pickRotation(value: unknown, fallback: RotationForm): RotationForm {
  if (typeof value !== 'object' || value === null) return fallback
  const v = value as Record<string, unknown>
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : fallback.enabled,
    maxBytes:
      typeof v.maxBytes === 'number' && Number.isFinite(v.maxBytes)
        ? v.maxBytes
        : fallback.maxBytes,
    maxFiles:
      typeof v.maxFiles === 'number' && Number.isFinite(v.maxFiles)
        ? v.maxFiles
        : fallback.maxFiles,
  }
}

function pickLogging(doc: Record<string, unknown>): LoggingForm {
  const raw = (doc.logging ?? {}) as Record<string, unknown>
  const level = raw.level
  const safeLevel: LogLevel =
    level === 'debug' || level === 'info' || level === 'warn' || level === 'error'
      ? level
      : DEFAULTS.level
  return {
    level: safeLevel,
    jsonFormat: typeof raw.jsonFormat === 'boolean' ? raw.jsonFormat : DEFAULTS.jsonFormat,
    app: pickRotation(raw.app, DEFAULTS.app),
    trace: pickRotation(raw.trace, DEFAULTS.trace),
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function parseMiB(input: string, fallback: number): number {
  const parsed = Number.parseFloat(input)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.round(parsed * 1024 * 1024)
}

export function LoggingSettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<LoggingForm>(DEFAULTS)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createSettingsJsonApi(transport)
        const next = await api.get()
        if (cancelled) return
        setDoc(next)
        setForm(pickLogging(next))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'settings-json load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  async function save(): Promise<void> {
    if (!doc) return
    setStatus('saving')
    try {
      const api = await createSettingsJsonApi(transport)
      const nextDoc = { ...doc, logging: form }
      const saved = await api.set(nextDoc)
      setDoc(saved)
      setForm(pickLogging(saved))
      setStatus('ready')
      toast.success('로깅 설정을 저장했습니다.')
    } catch (err) {
      setStatus('ready')
      toast.error('로깅 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    }
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-3 text-[13px]">
      <div className="rounded-lg border border-border p-3">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Log Level</h4>
          <p className="text-xs text-muted-foreground">
            daemon이 콘솔과 daemon.log 파일에 기록할 최소 레벨입니다. `SEPILOTD_LOG_LEVEL`
            환경변수가 설정되어 있으면 그쪽이 우선합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium">Level</label>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={form.level}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, level: event.target.value as LogLevel }))
              }
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={form.jsonFormat}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, jsonFormat: event.target.checked }))
                }
              />
              JSON 한 줄 포맷 (log shipping용)
            </label>
            <p className="text-xs text-muted-foreground">
              켜면 한 줄당 JSON으로 기록합니다. 사람 눈에는 덜 친화적이지만 Loki / ELK 같은
              로그 수집기에 바로 넣을 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <RotationCard
        title="Application Log (daemon.log)"
        description="HTTP 요청, 도구 호출, 세션 이벤트 등 일반 운영 로그. ~/.sepilotd/logs/daemon.log 에 기록됩니다."
        value={form.app}
        onChange={(next) => setForm((prev) => ({ ...prev, app: next }))}
      />

      <RotationCard
        title="Agent Trace Log (agent-trace.jsonl)"
        description="LLM 요청·응답 전체 페이로드 (sanitize 후). 디버깅에는 매우 유용하지만 한 턴당 수 KB ~ 수십 KB라 빠르게 자랍니다."
        value={form.trace}
        onChange={(next) => setForm((prev) => ({ ...prev, trace: next }))}
      />

      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          저장 즉시 daemon 재시작 없이 회전 정책과 레벨이 반영됩니다.
        </p>
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}

function RotationCard({
  title,
  description,
  value,
  onChange,
}: {
  title: string
  description: string
  value: RotationForm
  onChange: (next: RotationForm) => void
}) {
  const sizeMiB = (value.maxBytes / (1024 * 1024)).toFixed(value.maxBytes >= 10 * 1024 * 1024 ? 0 : 1)
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          />
          회전 사용
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium">파일당 최대 크기 (MiB)</label>
          <Input
            type="number"
            min="1"
            step="1"
            disabled={!value.enabled}
            value={sizeMiB}
            onChange={(event) =>
              onChange({ ...value, maxBytes: parseMiB(event.target.value, value.maxBytes) })
            }
          />
          <p className="text-[11px] text-muted-foreground">현재: {formatBytes(value.maxBytes)}</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">보관 파일 수</label>
          <Input
            type="number"
            min="1"
            max="50"
            step="1"
            disabled={!value.enabled}
            value={value.maxFiles}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value || '0', 10)
              if (!Number.isFinite(parsed) || parsed < 1) return
              onChange({ ...value, maxFiles: Math.min(parsed, 50) })
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            총 ~{formatBytes(value.maxBytes * value.maxFiles)} 정도까지 디스크를 씁니다.
          </p>
        </div>
      </div>
    </div>
  )
}
