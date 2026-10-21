'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { registerSettingsTab } from './registry'

type SandboxMode = 'local' | 'docker' | 'bubblewrap'
type SandboxHostFileToolsMode = 'deny' | 'allow'

interface SecurityForm {
  toolPolicy: string
  auditLog: boolean
  sandbox: SandboxMode
  sandboxHostFileTools: SandboxHostFileToolsMode
  sandboxDockerText: string
  sandboxBubblewrapText: string
  enforceUrlAllowlist: boolean
  allowedHostsText: string
  allowedUrlPrefixesText: string
  allowLocalPaths: boolean
  webhookPolicyText: string
  shareEnabled: boolean
  shareSecret: string
  shareTtlSeconds: number
  shareBaseUrl: string
  telemetry: boolean
  otlpEndpoint: string
  channelPipelineHealthText: string
  webhookSecurityHealthText: string
}

const DEFAULT_WEBHOOK_POLICY = {
  signatureMaxSkewSeconds: 300,
  verificationUnavailableStatus: 'service_unavailable',
  byChannelType: {},
}

const DEFAULT_CHANNEL_PIPELINE_HEALTH = {
  minRecentEvents: 5,
  degradeFailureRate: 0.25,
  minAgentSamples: 3,
  degradeAgentAvgLatencyMs: 5000,
  hotChannelTopN: 3,
  byChannelType: {},
}

const DEFAULT_WEBHOOK_SECURITY_HEALTH = {
  degradeWhenUnreadyEndpointsAtLeast: 1,
  detailTopMissingRequirements: 3,
  detailTopUnreadyRoutes: 3,
}

const DEFAULT_SANDBOX_DOCKER = {
  image: 'node:22-slim',
  networkMode: 'none',
  mountMode: 'rw',
  cpuLimit: '1.0',
  memoryLimit: '512m',
  pidsLimit: 100,
  readOnlyRootfs: true,
  noNewPrivileges: true,
  capDrop: ['ALL'],
}

const DEFAULT_SANDBOX_BUBBLEWRAP = {
  networkMode: 'none',
  readOnlyWorkspace: false,
}

registerSettingsTab({
  key: 'security',
  section: 'system',
  label: 'Security',
  search: ['security', 'sandbox', 'audit', 'tool policy', 'webhook', 'share', 'telemetry'],
  render: () => <SecuritySettingsTab />,
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text.trim() || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}은 JSON 객체여야 합니다.`)
  }
  return parsed as Record<string, unknown>
}

function pickForm(doc: Record<string, unknown>): SecurityForm {
  const security = asRecord(doc.security)
  const sandboxDocker = asRecord(security.sandboxDocker)
  const sandboxBubblewrap = asRecord(security.sandboxBubblewrap)
  const skillSources = asRecord(security.skillSources)
  const share = asRecord(doc.share)
  const publicShare = asRecord(share.public)
  const observability = asRecord(doc.observability)
  return {
    toolPolicy: stringValue(security.toolPolicy, 'policies.yaml'),
    auditLog: typeof security.auditLog === 'boolean' ? security.auditLog : true,
    sandbox: (stringValue(security.sandbox, 'local') as SandboxMode),
    sandboxHostFileTools:
      stringValue(security.sandboxHostFileTools, 'deny') === 'allow' ? 'allow' : 'deny',
    sandboxDockerText: JSON.stringify(
      Object.keys(sandboxDocker).length > 0 ? sandboxDocker : DEFAULT_SANDBOX_DOCKER,
      null,
      2,
    ),
    sandboxBubblewrapText: JSON.stringify(
      Object.keys(sandboxBubblewrap).length > 0
        ? sandboxBubblewrap
        : DEFAULT_SANDBOX_BUBBLEWRAP,
      null,
      2,
    ),
    enforceUrlAllowlist:
      typeof skillSources.enforceUrlAllowlist === 'boolean'
        ? skillSources.enforceUrlAllowlist
        : false,
    allowedHostsText: Array.isArray(skillSources.allowedHosts)
      ? skillSources.allowedHosts.filter((item) => typeof item === 'string').join('\n')
      : '',
    allowedUrlPrefixesText: Array.isArray(skillSources.allowedUrlPrefixes)
      ? skillSources.allowedUrlPrefixes.filter((item) => typeof item === 'string').join('\n')
      : '',
    allowLocalPaths:
      typeof skillSources.allowLocalPaths === 'boolean'
        ? skillSources.allowLocalPaths
        : false,
    webhookPolicyText: JSON.stringify(
      Object.keys(asRecord(security.webhooks)).length > 0
        ? asRecord(security.webhooks)
        : DEFAULT_WEBHOOK_POLICY,
      null,
      2,
    ),
    shareEnabled:
      typeof publicShare.enabled === 'boolean' ? publicShare.enabled : false,
    shareSecret: stringValue(publicShare.secret),
    shareTtlSeconds: numberValue(publicShare.ttlSeconds, 600),
    shareBaseUrl: stringValue(publicShare.baseUrl),
    telemetry: typeof observability.telemetry === 'boolean' ? observability.telemetry : false,
    otlpEndpoint: stringValue(observability.otlpEndpoint),
    channelPipelineHealthText: JSON.stringify(
      Object.keys(asRecord(observability.channelPipelineHealth)).length > 0
        ? asRecord(observability.channelPipelineHealth)
        : DEFAULT_CHANNEL_PIPELINE_HEALTH,
      null,
      2,
    ),
    webhookSecurityHealthText: JSON.stringify(
      Object.keys(asRecord(observability.webhookSecurityHealth)).length > 0
        ? asRecord(observability.webhookSecurityHealth)
        : DEFAULT_WEBHOOK_SECURITY_HEALTH,
      null,
      2,
    ),
  }
}

export function SecuritySettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<SecurityForm | null>(null)
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
      setError(err instanceof Error ? err.message : 'security settings load failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  async function save(): Promise<void> {
    if (!doc || !form) return
    setStatus('saving')
    try {
      const security = asRecord(doc.security)
      const share = asRecord(doc.share)
      const observability = asRecord(doc.observability)
      const nextDoc = {
        ...doc,
        security: {
          ...security,
          toolPolicy: form.toolPolicy.trim() || 'policies.yaml',
          auditLog: form.auditLog,
          sandbox: form.sandbox,
          sandboxHostFileTools: form.sandboxHostFileTools,
          sandboxDocker: parseJsonObject(form.sandboxDockerText, 'Sandbox Docker'),
          sandboxBubblewrap: parseJsonObject(
            form.sandboxBubblewrapText,
            'Sandbox Bubblewrap',
          ),
          skillSources: {
            enforceUrlAllowlist: form.enforceUrlAllowlist,
            allowedHosts: lines(form.allowedHostsText),
            allowedUrlPrefixes: lines(form.allowedUrlPrefixesText),
            allowLocalPaths: form.allowLocalPaths,
          },
          webhooks: parseJsonObject(form.webhookPolicyText, 'Webhook security policy'),
        },
        share: {
          ...share,
          public: {
            enabled: form.shareEnabled,
            secret: form.shareSecret,
            ttlSeconds: form.shareTtlSeconds,
            baseUrl: form.shareBaseUrl.trim() || undefined,
          },
        },
        observability: {
          ...observability,
          telemetry: form.telemetry,
          otlpEndpoint: form.otlpEndpoint,
          channelPipelineHealth: parseJsonObject(
            form.channelPipelineHealthText,
            'Channel pipeline health',
          ),
          webhookSecurityHealth: parseJsonObject(
            form.webhookSecurityHealthText,
            'Webhook security health',
          ),
        },
      }
      const api = await createSettingsJsonApi(transport)
      const saved = await api.set(nextDoc)
      setDoc(saved)
      setForm(pickForm(saved))
      toast.success('Security 설정을 저장했습니다.')
    } catch (err) {
      toast.error('Security 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setStatus('ready')
    }
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>
  if (!form) return null

  return (
    <div className="space-y-3 text-[13px]">
      <section className="rounded-md border border-border p-3">
        <h4 className="mb-2 text-[13px] font-semibold">Runtime Security</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Tool policy file"
            value={form.toolPolicy}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, toolPolicy: value })}
          />
          <label className="space-y-1">
            <span className="text-xs font-medium">Sandbox</span>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={form.sandbox}
              onChange={(event) =>
                setForm((prev) => prev && { ...prev, sandbox: event.target.value as SandboxMode })
              }
              disabled={status === 'saving'}
            >
              <option value="local">local</option>
              <option value="docker">docker</option>
              <option value="bubblewrap">bubblewrap</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Built-in host file tools</span>
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={form.sandboxHostFileTools}
              onChange={(event) =>
                setForm((prev) =>
                  prev && {
                    ...prev,
                    sandboxHostFileTools: event.target.value as SandboxHostFileToolsMode,
                  })
              }
              disabled={status === 'saving' || form.sandbox === 'local'}
            >
              <option value="deny">deny (recommended)</option>
              <option value="allow">allow (legacy)</option>
            </select>
          </label>
          <Toggle
            label="Audit log"
            checked={form.auditLog}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => prev && { ...prev, auditLog: checked })}
          />
          {form.sandbox === 'docker' ? (
            <JsonArea
              label="Sandbox Docker JSON"
              value={form.sandboxDockerText}
              disabled={status === 'saving'}
              onChange={(value) =>
                setForm((prev) => prev && { ...prev, sandboxDockerText: value })
              }
            />
          ) : null}
          {form.sandbox === 'bubblewrap' ? (
            <JsonArea
              label="Sandbox Bubblewrap JSON"
              value={form.sandboxBubblewrapText}
              disabled={status === 'saving'}
              onChange={(value) =>
                setForm((prev) => prev && { ...prev, sandboxBubblewrapText: value })
              }
            />
          ) : null}
          {form.sandbox !== 'local' && form.sandboxHostFileTools === 'allow' ? (
            <p className="text-xs text-amber-600 md:col-span-2">
              Legacy host file tools bypass the selected sandbox filesystem boundary.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-border p-3">
        <h4 className="mb-2 text-[13px] font-semibold">Skill Sources</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Enforce URL allowlist"
            checked={form.enforceUrlAllowlist}
            disabled={status === 'saving'}
            onChange={(checked) =>
              setForm((prev) => prev && { ...prev, enforceUrlAllowlist: checked })
            }
          />
          <Toggle
            label="Allow local paths"
            checked={form.allowLocalPaths}
            disabled={status === 'saving'}
            onChange={(checked) =>
              setForm((prev) => prev && { ...prev, allowLocalPaths: checked })
            }
          />
          <TextArea
            label="Allowed hosts"
            value={form.allowedHostsText}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, allowedHostsText: value })}
          />
          <TextArea
            label="Allowed URL prefixes"
            value={form.allowedUrlPrefixesText}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => prev && { ...prev, allowedUrlPrefixesText: value })
            }
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-3">
        <h4 className="mb-2 text-[13px] font-semibold">Webhooks, Share, Observability</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <JsonArea
            label="Webhook security policy JSON"
            value={form.webhookPolicyText}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, webhookPolicyText: value })}
          />
          <JsonArea
            label="Webhook security health JSON"
            value={form.webhookSecurityHealthText}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => prev && { ...prev, webhookSecurityHealthText: value })
            }
          />
          <Toggle
            label="Public share enabled"
            checked={form.shareEnabled}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => prev && { ...prev, shareEnabled: checked })}
          />
          <TextField
            label="Public share secret"
            type="password"
            value={form.shareSecret}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, shareSecret: value })}
          />
          <NumberField
            label="Public share TTL seconds"
            value={form.shareTtlSeconds}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, shareTtlSeconds: value })}
          />
          <TextField
            label="Public share base URL"
            value={form.shareBaseUrl}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, shareBaseUrl: value })}
          />
          <Toggle
            label="Telemetry"
            checked={form.telemetry}
            disabled={status === 'saving'}
            onChange={(checked) => setForm((prev) => prev && { ...prev, telemetry: checked })}
          />
          <TextField
            label="OTLP endpoint"
            value={form.otlpEndpoint}
            disabled={status === 'saving'}
            onChange={(value) => setForm((prev) => prev && { ...prev, otlpEndpoint: value })}
          />
          <JsonArea
            label="Channel pipeline health JSON"
            value={form.channelPipelineHealthText}
            disabled={status === 'saving'}
            onChange={(value) =>
              setForm((prev) => prev && { ...prev, channelPipelineHealthText: value })
            }
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

function TextField({
  label,
  value,
  type = 'text',
  disabled,
  onChange,
}: {
  label: string
  value: string
  type?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NumberField({
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
        disabled={disabled}
        onChange={(event) => onChange(Number.parseInt(event.target.value || '0', 10))}
      />
    </label>
  )
}

function TextArea({
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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <textarea
        rows={4}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border bg-transparent p-2 text-xs"
      />
    </label>
  )
}

function JsonArea({
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
    <label className="flex flex-col gap-1 md:col-span-2">
      <span className="text-xs font-medium">{label}</span>
      <textarea
        rows={6}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="rounded-md border border-border bg-transparent p-2 font-mono text-[11px]"
      />
    </label>
  )
}
