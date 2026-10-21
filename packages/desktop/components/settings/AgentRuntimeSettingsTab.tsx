'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createConfigApi } from '@/lib/api/config'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { registerSettingsTab } from './registry'

type Autonomy = 'readonly' | 'accept-edits' | 'workspace-write' | 'supervised' | 'autonomous'
type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'max'

interface AgentRuntimeForm {
  autonomy: Autonomy
  thinkingLevel: ThinkingLevel
  mode: string
  hostSystemInfo: boolean
  intentRouterEnabled: boolean
  intentRouterProvider: string
  intentRouterModel: string
  intentRouterTimeoutMs: number
  intentRouterMaxPreviousMessages: number
  intentRouterPerMessageCharLimit: number
  intentRouterReasonMaxChars: number
  graphNodeModelOverridesText: string
}

const DEFAULT_FORM: AgentRuntimeForm = {
  autonomy: 'supervised',
  thinkingLevel: 'medium',
  mode: 'auto',
  hostSystemInfo: true,
  intentRouterEnabled: true,
  intentRouterProvider: '',
  intentRouterModel: '',
  intentRouterTimeoutMs: 12_000,
  intentRouterMaxPreviousMessages: 4,
  intentRouterPerMessageCharLimit: 200,
  intentRouterReasonMaxChars: 500,
  graphNodeModelOverridesText: '{}',
}

registerSettingsTab({
  key: 'agent-runtime',
  section: 'agent',
  label: 'Runtime',
  search: ['agent', 'autonomy', 'privilege', 'thinking', 'intent router', 'graph node'],
  render: () => <AgentRuntimeSettingsTab />,
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pickForm(effectiveAgent: unknown): AgentRuntimeForm {
  const agent = asRecord(effectiveAgent)
  const intentRouter = asRecord(agent.intentRouter)
  const capabilities = asRecord(agent.capabilities)
  const overrides = asRecord(agent.graphNodeModelOverrides)
  return {
    autonomy: (pickString(agent.autonomy, DEFAULT_FORM.autonomy) as Autonomy),
    thinkingLevel: (pickString(agent.thinkingLevel, DEFAULT_FORM.thinkingLevel) as ThinkingLevel),
    mode: pickString(agent.mode, DEFAULT_FORM.mode),
    hostSystemInfo:
      typeof capabilities.hostSystemInfo === 'boolean'
        ? capabilities.hostSystemInfo
        : DEFAULT_FORM.hostSystemInfo,
    intentRouterEnabled:
      typeof intentRouter.enabled === 'boolean'
        ? intentRouter.enabled
        : DEFAULT_FORM.intentRouterEnabled,
    intentRouterProvider: pickString(intentRouter.provider),
    intentRouterModel: pickString(intentRouter.model),
    intentRouterTimeoutMs: pickNumber(intentRouter.timeoutMs, DEFAULT_FORM.intentRouterTimeoutMs),
    intentRouterMaxPreviousMessages: pickNumber(
      intentRouter.maxPreviousMessages,
      DEFAULT_FORM.intentRouterMaxPreviousMessages,
    ),
    intentRouterPerMessageCharLimit: pickNumber(
      intentRouter.perMessageCharLimit,
      DEFAULT_FORM.intentRouterPerMessageCharLimit,
    ),
    intentRouterReasonMaxChars: pickNumber(
      intentRouter.reasonMaxChars,
      DEFAULT_FORM.intentRouterReasonMaxChars,
    ),
    graphNodeModelOverridesText: JSON.stringify(overrides, null, 2),
  }
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text.trim() || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}은 JSON 객체여야 합니다.`)
  }
  return parsed as Record<string, unknown>
}

export function AgentRuntimeSettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<AgentRuntimeForm>(DEFAULT_FORM)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const [configApi, settingsApi] = await Promise.all([
          createConfigApi(transport),
          createSettingsJsonApi(transport),
        ])
        const [config, rawDoc] = await Promise.all([configApi.get(), settingsApi.get()])
        if (cancelled) return
        setDoc(rawDoc)
        setForm(pickForm(config.agent))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'agent runtime settings load failed')
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
      const graphNodeModelOverrides = parseJsonObject(
        form.graphNodeModelOverridesText,
        'Graph node model overrides',
      )
      const currentAgent = asRecord(doc.agent)
      const currentCapabilities = asRecord(currentAgent.capabilities)
      const currentIntentRouter = asRecord(currentAgent.intentRouter)
      const nextDoc = {
        ...doc,
        agent: {
          ...currentAgent,
          autonomy: form.autonomy,
          thinkingLevel: form.thinkingLevel,
          mode: form.mode.trim() || 'auto',
          capabilities: {
            ...currentCapabilities,
            hostSystemInfo: form.hostSystemInfo,
          },
          graphNodeModelOverrides,
          intentRouter: {
            ...currentIntentRouter,
            enabled: form.intentRouterEnabled,
            provider: form.intentRouterProvider.trim() || undefined,
            model: form.intentRouterModel.trim() || undefined,
            timeoutMs: form.intentRouterTimeoutMs,
            maxPreviousMessages: form.intentRouterMaxPreviousMessages,
            perMessageCharLimit: form.intentRouterPerMessageCharLimit,
            reasonMaxChars: form.intentRouterReasonMaxChars,
          },
        },
      }
      const settingsApi = await createSettingsJsonApi(transport)
      const saved = await settingsApi.set(nextDoc)
      setDoc(saved)
      setForm(pickForm(asRecord(saved.agent)))
      toast.success('Agent runtime 설정을 저장했습니다.')
    } catch (err) {
      toast.error('Agent runtime 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setStatus('ready')
    }
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Agent Runtime</h4>
          <p className="text-xs text-muted-foreground">
            기본 권한(privilege), 사고 강도, intent router, graph 노드별 모델 선택을 설정합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">Privilege</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.autonomy}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, autonomy: event.target.value as Autonomy }))
              }
              disabled={status === 'saving'}
            >
              <option value="readonly">readonly</option>
              <option value="accept-edits">accept-edits</option>
              <option value="workspace-write">workspace-write</option>
              <option value="supervised">supervised</option>
              <option value="autonomous">autonomous</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Thinking level</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.thinkingLevel}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  thinkingLevel: event.target.value as ThinkingLevel,
                }))
              }
              disabled={status === 'saving'}
            >
              <option value="off">off</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="max">max</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Mode</span>
            <Input
              value={form.mode}
              onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value }))}
              placeholder="auto"
              disabled={status === 'saving'}
            />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span>Host system info capability</span>
            <input
              type="checkbox"
              checked={form.hostSystemInfo}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, hostSystemInfo: event.target.checked }))
              }
              disabled={status === 'saving'}
            />
          </label>
        </div>
      </div>

      <div className="rounded-md border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Intent Router</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span>Enabled</span>
            <input
              type="checkbox"
              checked={form.intentRouterEnabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, intentRouterEnabled: event.target.checked }))
              }
              disabled={status === 'saving'}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Provider</span>
            <Input
              value={form.intentRouterProvider}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, intentRouterProvider: event.target.value }))
              }
              disabled={status === 'saving'}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Model</span>
            <Input
              value={form.intentRouterModel}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, intentRouterModel: event.target.value }))
              }
              disabled={status === 'saving'}
            />
          </label>
          <NumberInput
            label="Timeout (ms)"
            value={form.intentRouterTimeoutMs}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, intentRouterTimeoutMs: value }))}
          />
          <NumberInput
            label="Previous messages"
            value={form.intentRouterMaxPreviousMessages}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, intentRouterMaxPreviousMessages: value }))
            }
          />
          <NumberInput
            label="Message char limit"
            value={form.intentRouterPerMessageCharLimit}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, intentRouterPerMessageCharLimit: value }))
            }
          />
          <NumberInput
            label="Reason max chars"
            value={form.intentRouterReasonMaxChars}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, intentRouterReasonMaxChars: value }))
            }
          />
        </div>
      </div>

      <div className="rounded-md border border-border p-4">
        <label className="flex flex-col gap-2 text-xs">
          <span className="font-medium">Graph node model overrides JSON</span>
          <textarea
            rows={8}
            className="rounded-md border border-border bg-transparent p-2 font-mono text-[11px]"
            value={form.graphNodeModelOverridesText}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, graphNodeModelOverridesText: event.target.value }))
            }
            disabled={status === 'saving'}
            spellCheck={false}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}

function NumberInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(Number.parseInt(event.target.value || '0', 10))}
        disabled={disabled}
      />
    </label>
  )
}
