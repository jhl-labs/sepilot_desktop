'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { registerSettingsTab } from './registry'

type DirectApiToolset = 'lean' | 'full' | 'none'

interface MemoryLifecycleForm {
  encryption: boolean
  directApiToolset: DirectApiToolset
  dreamingEnabled: boolean
  dreamingSchedule: string
  maintenanceEnabled: boolean
  maintenanceSchedule: string
  maintenanceMaxAgeDays: number
  maintenanceMaxImportance: number
  maintenanceDryRun: boolean
  userProfileEnabled: boolean
  userProfileSchedule: string
  userProfileSection: string
  digestEnabled: boolean
  digestSchedule: string
  digestChannelType: string
  digestChannelTarget: string
}

const DEFAULT_FORM: MemoryLifecycleForm = {
  encryption: true,
  directApiToolset: 'lean',
  dreamingEnabled: false,
  dreamingSchedule: '6h',
  maintenanceEnabled: false,
  maintenanceSchedule: '1d',
  maintenanceMaxAgeDays: 90,
  maintenanceMaxImportance: 0.1,
  maintenanceDryRun: false,
  userProfileEnabled: false,
  userProfileSchedule: '1d',
  userProfileSection: 'User Profile',
  digestEnabled: false,
  digestSchedule: '0 9 * * *',
  digestChannelType: '',
  digestChannelTarget: '',
}

registerSettingsTab({
  key: 'memory-lifecycle',
  section: 'memory',
  label: 'Lifecycle',
  search: ['memory', 'maintenance', 'profile', 'digest', 'encryption', 'toolset'],
  render: () => <MemoryLifecycleSettingsTab />,
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function pickForm(doc: Record<string, unknown>): MemoryLifecycleForm {
  const memory = asRecord(doc.memory)
  const dreaming = asRecord(memory.dreaming)
  const maintenance = asRecord(memory.maintenance)
  const userProfile = asRecord(memory.userProfile)
  const proactivity = asRecord(doc.proactivity)
  const digest = asRecord(proactivity.digest)
  return {
    encryption:
      typeof memory.encryption === 'boolean' ? memory.encryption : DEFAULT_FORM.encryption,
    directApiToolset: (stringValue(
      memory.directApiToolset,
      DEFAULT_FORM.directApiToolset,
    ) as DirectApiToolset),
    dreamingEnabled:
      typeof dreaming.enabled === 'boolean'
        ? dreaming.enabled
        : DEFAULT_FORM.dreamingEnabled,
    dreamingSchedule: stringValue(
      dreaming.schedule,
      DEFAULT_FORM.dreamingSchedule,
    ),
    maintenanceEnabled:
      typeof maintenance.enabled === 'boolean'
        ? maintenance.enabled
        : DEFAULT_FORM.maintenanceEnabled,
    maintenanceSchedule: stringValue(
      maintenance.schedule,
      DEFAULT_FORM.maintenanceSchedule,
    ),
    maintenanceMaxAgeDays: numberValue(
      maintenance.maxAgeDays,
      DEFAULT_FORM.maintenanceMaxAgeDays,
    ),
    maintenanceMaxImportance: numberValue(
      maintenance.maxImportance,
      DEFAULT_FORM.maintenanceMaxImportance,
    ),
    maintenanceDryRun:
      typeof maintenance.dryRun === 'boolean'
        ? maintenance.dryRun
        : DEFAULT_FORM.maintenanceDryRun,
    userProfileEnabled:
      typeof userProfile.enabled === 'boolean'
        ? userProfile.enabled
        : DEFAULT_FORM.userProfileEnabled,
    userProfileSchedule: stringValue(
      userProfile.schedule,
      DEFAULT_FORM.userProfileSchedule,
    ),
    userProfileSection: stringValue(
      userProfile.section,
      DEFAULT_FORM.userProfileSection,
    ),
    digestEnabled:
      typeof digest.enabled === 'boolean' ? digest.enabled : DEFAULT_FORM.digestEnabled,
    digestSchedule: stringValue(digest.schedule, DEFAULT_FORM.digestSchedule),
    digestChannelType: stringValue(digest.channelType),
    digestChannelTarget: stringValue(digest.channelTarget),
  }
}

export function MemoryLifecycleSettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<MemoryLifecycleForm>(DEFAULT_FORM)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const api = await createSettingsJsonApi(transport)
      const next = await api.get()
      setDoc(next)
      setForm(pickForm(next))
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'memory lifecycle settings load failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  async function save(): Promise<void> {
    if (!doc) return
    setStatus('saving')
    try {
      const memory = asRecord(doc.memory)
      const proactivity = asRecord(doc.proactivity)
      const nextDoc = {
        ...doc,
        memory: {
          ...memory,
          encryption: form.encryption,
          directApiToolset: form.directApiToolset,
          dreaming: {
            enabled: form.dreamingEnabled,
            schedule: form.dreamingSchedule.trim() || '6h',
          },
          maintenance: {
            enabled: form.maintenanceEnabled,
            schedule: form.maintenanceSchedule.trim() || '1d',
            maxAgeDays: form.maintenanceMaxAgeDays,
            maxImportance: form.maintenanceMaxImportance,
            dryRun: form.maintenanceDryRun,
          },
          userProfile: {
            enabled: form.userProfileEnabled,
            schedule: form.userProfileSchedule.trim() || '1d',
            section: form.userProfileSection.trim() || 'User Profile',
          },
        },
        proactivity: {
          ...proactivity,
          digest: {
            enabled: form.digestEnabled,
            schedule: form.digestSchedule.trim() || '0 9 * * *',
            channelType: form.digestChannelType.trim() || undefined,
            channelTarget: form.digestChannelTarget.trim() || undefined,
          },
        },
      }
      const api = await createSettingsJsonApi(transport)
      const saved = await api.set(nextDoc)
      setDoc(saved)
      setForm(pickForm(saved))
      toast.success('Memory lifecycle 설정을 저장했습니다.')
    } catch (err) {
      toast.error('Memory lifecycle 설정을 저장하지 못했습니다.', {
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
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-md border border-border p-3">
          <span>
            <span className="block font-medium">Memory encryption</span>
            <span className="block text-xs text-muted-foreground">새 memory 저장 시 암호화 기본값</span>
          </span>
          <input
            type="checkbox"
            checked={form.encryption}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, encryption: event.target.checked }))
            }
            disabled={status === 'saving'}
          />
        </label>
        <label className="space-y-1 rounded-md border border-border p-3">
          <span className="text-xs font-medium">Direct API toolset</span>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={form.directApiToolset}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                directApiToolset: event.target.value as DirectApiToolset,
              }))
            }
            disabled={status === 'saving'}
          >
            <option value="lean">lean</option>
            <option value="full">full</option>
            <option value="none">none</option>
          </select>
        </label>
      </div>

      <section className="rounded-md border border-border p-4">
        <h4 className="mb-1 text-sm font-semibold">Dreaming consolidation</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          LLM으로 장기 메모리를 병합·요약합니다. 기본값은 꺼짐입니다.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Enabled"
            checked={form.dreamingEnabled}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => ({ ...prev, dreamingEnabled: checked }))}
          />
          <TextInput
            label="Schedule"
            value={form.dreamingSchedule}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, dreamingSchedule: value }))}
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Maintenance</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Enabled"
            checked={form.maintenanceEnabled}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => ({ ...prev, maintenanceEnabled: checked }))}
          />
          <TextInput
            label="Schedule"
            value={form.maintenanceSchedule}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, maintenanceSchedule: value }))}
          />
          <NumberInput
            label="Max age days"
            value={form.maintenanceMaxAgeDays}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, maintenanceMaxAgeDays: value }))}
          />
          <NumberInput
            label="Max importance"
            value={form.maintenanceMaxImportance}
            step="0.01"
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, maintenanceMaxImportance: value }))
            }
          />
          <Toggle
            label="Dry run"
            checked={form.maintenanceDryRun}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => ({ ...prev, maintenanceDryRun: checked }))}
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">User Profile Loop</h4>
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle
            label="Enabled"
            checked={form.userProfileEnabled}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => ({ ...prev, userProfileEnabled: checked }))}
          />
          <TextInput
            label="Schedule"
            value={form.userProfileSchedule}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, userProfileSchedule: value }))}
          />
          <TextInput
            label="Memory section"
            value={form.userProfileSection}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, userProfileSection: value }))}
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Proactive Digest</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Enabled"
            checked={form.digestEnabled}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => ({ ...prev, digestEnabled: checked }))}
          />
          <TextInput
            label="Schedule"
            value={form.digestSchedule}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, digestSchedule: value }))}
          />
          <TextInput
            label="Channel type"
            value={form.digestChannelType}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, digestChannelType: value }))}
          />
          <TextInput
            label="Channel target"
            value={form.digestChannelTarget}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => ({ ...prev, digestChannelTarget: value }))}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function TextInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>
  )
}

function NumberInput({
  label,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  step?: string
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value || '0'))}
        disabled={disabled}
      />
    </label>
  )
}
