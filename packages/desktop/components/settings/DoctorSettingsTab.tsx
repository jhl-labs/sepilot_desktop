'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DaemonDoctorCheck,
  DaemonDoctorCheckStatus,
  DaemonDoctorReport,
} from '@sepilotd/api-client'
import type { TFunction } from 'i18next'
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { CapabilityUnavailableError, createDoctorApi } from '@/lib/api/doctor'
import { cn } from '@/lib/utils/cn'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'doctor',
  section: 'system',
  label: 'Doctor',
  search: ['doctor', 'security', 'audit', 'policy', 'plugin', 'webhook'],
  render: () => <DoctorSettingsTab />,
})

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: DaemonDoctorReport }

function statusClass(status: DaemonDoctorCheckStatus): string {
  if (status === 'PASS') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
  if (status === 'WARN') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
  return 'border-destructive/30 bg-destructive/10 text-destructive'
}

function statusIcon(status: DaemonDoctorCheckStatus) {
  if (status === 'PASS') return CheckCircle2
  if (status === 'WARN') return AlertTriangle
  return ShieldAlert
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const PERMISSION_CHECKS: Record<string, { label: string; expected: string }> = {
  data_dir_permissions: { label: '~/.sepilotd/', expected: '700' },
  security_dir_permissions: { label: 'security/', expected: '700' },
  daemon_token_permissions: { label: 'daemon.token', expected: '600' },
  gateway_token_permissions: { label: 'gateway.token', expected: '600' },
  device_key_permissions: { label: 'device.key', expected: '600' },
  data_key_permissions: { label: 'data.key', expected: '600' },
  config_permissions: { label: 'config.yaml', expected: '600' },
  env_permissions: { label: '.env', expected: '600' },
}

const EXISTS_CHECK_LABELS: Record<string, string> = {
  policies_file: 'policies.yaml',
  audit_log_file: 'audit.log',
}

function translatedGrade(t: TFunction, grade: DaemonDoctorReport['summary']['grade']): string {
  return t(`doctor.grade.${grade}`, { defaultValue: grade })
}

function translatedStatus(t: TFunction, status: DaemonDoctorCheckStatus): string {
  return t(`doctor.status.${status}`, { defaultValue: status })
}

function translatedCategory(t: TFunction, category: string): string {
  return t(`doctor.category.${category}`, { defaultValue: category })
}

function permissionMode(message: string): string {
  return message.match(/\(([0-7]+)\)$/)?.[1] ?? ''
}

function tooOpenPermission(message: string): { mode: string; expected: string } | null {
  const match = message.match(/too open: ([0-7]+) \(expected ([0-7]+)\)/)
  return match ? { mode: match[1], expected: match[2] } : null
}

function bindHost(message: string): string {
  return message.match(/host ([^\s]+)$/)?.[1] ?? ''
}

function nonLoopbackHost(message: string): string {
  return message.match(/non-loopback host ([^\s]+)$/)?.[1] ?? ''
}

function pluginFailure(message: string): { count: number; names: string } | null {
  const match = message.match(/^(\d+) plugin\(s\) failed to load: (.+)$/)
  return match ? { count: Number.parseInt(match[1], 10), names: match[2] } : null
}

function webhookMissing(message: string): { missing: string; total: string } | null {
  const match = message.match(/^(\d+)\/(\d+) webhook endpoint\(s\) lack verification material$/)
  return match ? { missing: match[1], total: match[2] } : null
}

function webhookReady(message: string): number | null {
  const count = message.match(/^All (\d+) webhook endpoint\(s\) have verification material$/)?.[1]
  return count ? Number.parseInt(count, 10) : null
}

function translatedCheckMessage(t: TFunction, check: DaemonDoctorCheck): string {
  const permission = PERMISSION_CHECKS[check.name]
  if (permission) {
    if (check.status === 'PASS' && check.message.startsWith('Windows ACLs')) {
      return t('doctor.check.permissions.windowsAcl', { label: permission.label })
    }
    if (check.status === 'PASS') {
      return t('doctor.check.permissions.pass', {
        label: permission.label,
        mode: permissionMode(check.message),
      })
    }
    if (check.status === 'FAIL') {
      const parsed = tooOpenPermission(check.message)
      return t('doctor.check.permissions.fail', {
        label: permission.label,
        mode: parsed?.mode ?? '',
        expected: parsed?.expected ?? permission.expected,
      })
    }
    return t('doctor.check.common.notFound', { label: permission.label })
  }

  const existsLabel = EXISTS_CHECK_LABELS[check.name]
  if (existsLabel) {
    return check.status === 'PASS'
      ? t('doctor.check.common.exists', { label: existsLabel })
      : t('doctor.check.common.notFound', { label: existsLabel })
  }

  switch (check.name) {
    case 'plaintext_secrets':
      if (check.status === 'PASS') return t('doctor.check.plaintextSecrets.pass')
      if (check.status === 'FAIL') return t('doctor.check.plaintextSecrets.fail')
      return t('doctor.check.plaintextSecrets.missingConfig')
    case 'docker':
      return check.status === 'PASS' ? t('doctor.check.docker.pass') : t('doctor.check.docker.warn')
    case 'runtime_auth_token':
      return check.status === 'PASS'
        ? t('doctor.check.runtimeAuth.pass')
        : t('doctor.check.runtimeAuth.fail')
    case 'daemon_bind':
      if (check.status === 'PASS') {
        return t('doctor.check.daemonBind.loopback', { host: bindHost(check.message) })
      }
      if (check.message.includes('not configured')) return t('doctor.check.daemonBind.missing')
      return t('doctor.check.daemonBind.nonLoopback', { host: nonLoopbackHost(check.message) })
    case 'audit_log_config':
      return check.status === 'PASS'
        ? t('doctor.check.auditLog.pass')
        : t('doctor.check.auditLog.fail')
    case 'tool_policy_default': {
      const policy = check.message.match(/defaults to (.+)$/)?.[1] ?? 'unknown'
      return check.status === 'PASS'
        ? t('doctor.check.toolPolicy.pass')
        : t('doctor.check.toolPolicy.warn', { policy })
    }
    case 'plugin_load': {
      if (check.status === 'PASS') return t('doctor.check.pluginLoad.pass')
      const failed = pluginFailure(check.message)
      return failed
        ? t('doctor.check.pluginLoad.warn', failed)
        : t('doctor.check.pluginLoad.unavailable')
    }
    case 'webhook_verification': {
      if (check.message.includes('No inbound webhook endpoints')) {
        return t('doctor.check.webhookVerification.none')
      }
      const ready = webhookReady(check.message)
      if (ready) return t('doctor.check.webhookVerification.ready', { count: ready })
      const missing = webhookMissing(check.message)
      if (missing) return t('doctor.check.webhookVerification.missing', missing)
      if (check.message.includes('could not be evaluated')) {
        return t('doctor.check.webhookVerification.error', {
          detail: check.message.split(': ').slice(1).join(': '),
        })
      }
      return check.message
    }
    default:
      return check.message
  }
}

function translatedRecommendation(t: TFunction, check: DaemonDoctorCheck): string | undefined {
  if (!check.recommendation) return undefined

  const permission = PERMISSION_CHECKS[check.name]
  if (permission) {
    return check.status === 'FAIL'
      ? t('doctor.recommendation.restrictPermissions', {
          label: permission.label,
          expected: permission.expected,
        })
      : t('doctor.recommendation.initRuntime')
  }

  if (EXISTS_CHECK_LABELS[check.name]) {
    return t('doctor.recommendation.createCapabilityFile', {
      label: EXISTS_CHECK_LABELS[check.name],
    })
  }

  switch (check.name) {
    case 'plaintext_secrets':
      return check.status === 'FAIL'
        ? t('doctor.recommendation.plaintextSecrets')
        : t('doctor.recommendation.createConfig')
    case 'docker':
      return t('doctor.recommendation.installDocker')
    case 'runtime_auth_token':
      return t('doctor.recommendation.runtimeAuth')
    case 'daemon_bind':
      return t('doctor.recommendation.daemonBind')
    case 'audit_log_config':
      return t('doctor.recommendation.auditLog')
    case 'tool_policy_default':
      return t('doctor.recommendation.toolPolicy')
    case 'plugin_load':
      return t('doctor.recommendation.pluginLoad')
    case 'webhook_verification':
      return t('doctor.recommendation.webhookVerification')
    default:
      return check.recommendation
  }
}

export function DoctorSettingsTab() {
  const { t } = useTranslation()
  const transport = useTransport()
  const [state, setState] = useState<State>({ kind: 'loading' })

  const reload = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' })
    try {
      const api = await createDoctorApi(transport)
      const report = await api.report()
      setState({ kind: 'ready', report })
    } catch (error) {
      if (error instanceof CapabilityUnavailableError) {
        setState({ kind: 'unavailable' })
        return
      }
      const friendly = explainChatStreamError(error)
      setState({ kind: 'error', message: friendly.description ?? friendly.title })
    }
  }, [transport])

  useEffect(() => {
    void reload()
  }, [reload])

  if (state.kind === 'loading') {
    return <p className="text-xs text-muted-foreground">{t('doctor.loading')}</p>
  }

  if (state.kind === 'unavailable') {
    return <UnimplementedBanner what={t('doctor.title')} />
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-destructive">{state.message}</p>
        <Button size="sm" variant="outline" onClick={() => void reload()}>
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          {t('doctor.retry')}
        </Button>
      </div>
    )
  }

  return <DoctorReportView report={state.report} onReload={reload} />
}

function DoctorReportView({
  report,
  onReload,
}: {
  report: DaemonDoctorReport
  onReload: () => Promise<void>
}) {
  const { t } = useTranslation()
  const problemChecks = useMemo(
    () => report.data.filter((check) => check.status !== 'PASS'),
    [report.data],
  )
  const passCount = report.data.length - problemChecks.length
  const posture =
    report.summary.errors > 0 ? 'attention' : report.summary.warnings > 0 ? 'review' : 'healthy'

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              posture === 'healthy'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : posture === 'review'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {posture === 'healthy' ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{t('doctor.title')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('doctor.lastRun', { time: formatGeneratedAt(report.summary.generatedAt) })}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onReload()}
          aria-label={t('doctor.reload')}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Metric
          label={t('doctor.metric.score')}
          value={`${report.summary.score.toFixed(1)} / 10`}
        />
        <Metric label={t('doctor.metric.grade')} value={translatedGrade(t, report.summary.grade)} />
        <Metric
          label={t('doctor.metric.errors')}
          value={String(report.summary.errors)}
          tone="fail"
        />
        <Metric
          label={t('doctor.metric.warnings')}
          value={String(report.summary.warnings)}
          tone="warn"
        />
      </div>

      {problemChecks.length === 0 ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {t('doctor.allPassed', { count: passCount })}
        </div>
      ) : (
        <section className="rounded-md border border-border">
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('doctor.attention')}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {problemChecks.length} / {report.data.length}
            </span>
          </header>
          <div className="divide-y divide-border/60">
            {problemChecks.map((check) => (
              <DoctorCheckRow key={check.name} check={check} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warn' | 'fail'
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-1 truncate text-sm font-semibold',
          tone === 'warn' && 'text-amber-700 dark:text-amber-300',
          tone === 'fail' && 'text-destructive',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function DoctorCheckRow({ check }: { check: DaemonDoctorCheck }) {
  const { t } = useTranslation()
  const Icon = statusIcon(check.status)
  const recommendation = translatedRecommendation(t, check)
  return (
    <article className="flex gap-3 px-3 py-3">
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
          statusClass(check.status),
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{check.name}</code>
          <span
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
              statusClass(check.status),
            )}
          >
            {translatedStatus(t, check.status)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {translatedCategory(t, check.category)}
          </span>
        </div>
        <p className="mt-1 text-xs">{translatedCheckMessage(t, check)}</p>
        {recommendation ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{recommendation}</p>
        ) : null}
      </div>
    </article>
  )
}
