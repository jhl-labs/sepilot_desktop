'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasDesktopBridge, requireDesktopBridge } from '@/lib/electron/bridge'
import {
  isLocalHttpServiceOrigin,
  serviceOriginsEqual,
} from '@/src/shared/service-origin'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import {
  SETTINGS_CONTROL_CLASS,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStack,
} from './_shared/SettingsLayout'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'daemon-connection',
  section: 'system',
  label: 'Daemon Connection',
  search: ['daemon', 'gateway', 'url', 'token', 'remote', 'origin'],
  render: () => <DaemonConnectionTab />,
})

interface SavedSettings {
  daemonUrl: string | null
  daemonToken: string | null
  gatewayUrl: string | null
  gatewayToken: string | null
}

interface EffectiveOrigins {
  daemonOrigin: string
  gatewayOrigin: string
  daemonManagedOrigin: string
  gatewayManagedOrigin: string
  daemonManagedLocally: boolean
  gatewayManagedLocally: boolean
}

interface EffectiveTransportConfig {
  daemonOrigin: string
  gatewayOrigin: string
  daemonToken: string | null
  gatewayToken: string | null
}

function getInvoke():
  | (<T = unknown>(channel: string, ...args: unknown[]) => Promise<T>)
  | null {
  if (!hasDesktopBridge()) return null
  const bridge = requireDesktopBridge()
  return bridge.invoke ?? null
}

export function DaemonConnectionTab() {
  const [saved, setSaved] = useState<SavedSettings>({
    daemonUrl: '',
    daemonToken: '',
    gatewayUrl: '',
    gatewayToken: '',
  })
  const [effective, setEffective] = useState<EffectiveOrigins | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>(
    'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<
    { status: 'idle' | 'running' | 'ok' | 'fail'; detail?: string }
  >({ status: 'idle' })

  useEffect(() => {
    const invoke = getInvoke()
    if (!invoke) {
      setStatus('unavailable')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await invoke<{
          saved: SavedSettings
          effective: EffectiveOrigins
        }>('sepilot:get-desktop-settings')
        if (cancelled) return
        setSaved({
          daemonUrl: result.saved.daemonUrl ?? '',
          daemonToken: result.effective.daemonManagedLocally
            ? ''
            : result.saved.daemonToken ?? '',
          gatewayUrl: result.saved.gatewayUrl ?? '',
          gatewayToken: result.effective.gatewayManagedLocally
            ? ''
            : result.saved.gatewayToken ?? '',
        })
        setEffective(result.effective)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'failed to load settings')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    const invoke = getInvoke()
    if (!invoke) return
    setBusy(true)
    try {
      const next = await invoke<SavedSettings>(
        'sepilot:save-desktop-settings',
        {
          daemonUrl: saved.daemonUrl?.trim() || null,
          daemonToken: localTokenManaged
            ? null
            : saved.daemonToken?.trim() || null,
          gatewayUrl: saved.gatewayUrl?.trim() || null,
          gatewayToken: saved.gatewayToken?.trim() || null,
        },
      )
      setSaved({
        daemonUrl: next.daemonUrl ?? '',
        daemonToken: next.daemonToken ?? '',
        gatewayUrl: next.gatewayUrl ?? '',
        gatewayToken: next.gatewayToken ?? '',
      })
      toast.success('저장됨. 다음 desktop 재시작부터 URL 변경이 적용됩니다.')
    } catch (err) {
      toast.error(
        `저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleProbe() {
    const invoke = getInvoke()
    const url = saved.daemonUrl?.trim()
      || effective?.daemonManagedOrigin.trim()
      || effective?.daemonOrigin.trim()
    if (!url) {
      setProbe({ status: 'fail', detail: 'Daemon URL이 비어 있습니다.' })
      return
    }
    setProbe({ status: 'running' })
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      let token = saved.daemonToken?.trim() || null
      if (
        invoke
        && effective
        && effective.daemonManagedLocally
        && serviceOriginsEqual(url, effective.daemonOrigin)
      ) {
        const config = await invoke<EffectiveTransportConfig>(
          'sepilot:get-transport-config',
        )
        token = config.daemonToken?.trim() || null
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const healthRes = await fetch(`${url.replace(/\/$/, '')}/api/v1/health`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      })
      const sessionsRes = await fetch(
        `${url.replace(/\/$/, '')}/api/v1/sessions`,
        { headers, signal: AbortSignal.timeout(5_000) },
      )
      if (healthRes.ok && sessionsRes.ok) {
        setProbe({ status: 'ok', detail: `health=200 sessions=200` })
      } else {
        setProbe({
          status: 'fail',
          detail:
            `health=${healthRes.status} sessions=${sessionsRes.status}`
            + (sessionsRes.status === 401
              ? ' — Token이 잘못되었거나 비어 있습니다.'
              : ''),
        })
      }
    } catch (err) {
      setProbe({
        status: 'fail',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (status === 'loading') return <p className="text-[13px]">Loading...</p>
  if (status === 'unavailable') {
    return <UnimplementedBanner what="Daemon connection (desktop bridge only)" />
  }
  if (status === 'error') {
    return <p className="text-[13px] text-destructive">{error}</p>
  }

  const daemonTarget = saved.daemonUrl?.trim()
    || effective?.daemonManagedOrigin
    || effective?.daemonOrigin
    || ''
  const localTokenManaged = Boolean(
    effective
    && isLocalHttpServiceOrigin(daemonTarget)
    && serviceOriginsEqual(daemonTarget, effective.daemonManagedOrigin),
  )

  return (
    <SettingsStack>
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[13px] font-semibold">Daemon Connection</h2>
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">
          원격 또는 비표준 포트에 연결할 때 사용합니다. 비워두면 기본값을 사용하며 URL
          변경은 Desktop 재시작 후 반영됩니다.
        </p>
      </header>

      {effective ? (
        <div className="grid gap-1 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground md:grid-cols-2">
          <div className="truncate">
            현재 적용 중인 daemon: <code>{effective.daemonOrigin}</code>
          </div>
          <div className="truncate">
            현재 적용 중인 gateway: <code>{effective.gatewayOrigin}</code>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <SettingsSection className="space-y-2">
          <SettingsSectionHeader
            title="Daemon"
            description="기본 또는 원격 daemon endpoint"
            className="mb-1.5"
          />
          {localTokenManaged ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
              로컬 daemon 인증은 Desktop이 <code>security/daemon.token</code>에서 자동으로
              설정합니다. 토큰을 직접 입력할 필요가 없습니다.
            </p>
          ) : null}
          <label className="block space-y-1 text-xs">
            <span>URL</span>
            <Input
              value={saved.daemonUrl ?? ''}
              onChange={(e) => {
                const daemonUrl = e.target.value
                const nextTarget = daemonUrl.trim()
                  || effective?.daemonManagedOrigin
                  || ''
                const nextManaged = Boolean(
                  effective
                  && isLocalHttpServiceOrigin(nextTarget)
                  && serviceOriginsEqual(nextTarget, effective.daemonManagedOrigin),
                )
                setSaved((current) => ({
                  ...current,
                  daemonUrl,
                  daemonToken: localTokenManaged && !nextManaged
                    ? ''
                    : current.daemonToken,
                }))
              }}
              placeholder="http://127.0.0.1:17600"
              spellCheck={false}
              className={SETTINGS_CONTROL_CLASS}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span>Token (원격 daemon 전용)</span>
            <Input
              type="password"
              value={saved.daemonToken ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, daemonToken: e.target.value }))
              }
              placeholder={
                localTokenManaged
                  ? '로컬 token은 자동 관리됩니다'
                  : '원격 daemon의 plain text 토큰'
              }
              disabled={localTokenManaged}
              spellCheck={false}
              autoComplete="off"
              className={SETTINGS_CONTROL_CLASS}
            />
          </label>
        </SettingsSection>

        <SettingsSection className="space-y-2">
          <SettingsSectionHeader
            title="Gateway"
            description="선택 사항 · 비워두면 기본 gateway 사용"
            className="mb-1.5"
          />
          <label className="block space-y-1 text-xs">
            <span>URL</span>
            <Input
              value={saved.gatewayUrl ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, gatewayUrl: e.target.value }))
              }
              placeholder="http://127.0.0.1:17610"
              spellCheck={false}
              className={SETTINGS_CONTROL_CLASS}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span>Token</span>
            <Input
              type="password"
              value={saved.gatewayToken ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, gatewayToken: e.target.value }))
              }
              placeholder="gateway 토큰"
              spellCheck={false}
              autoComplete="off"
              className={SETTINGS_CONTROL_CLASS}
            />
          </label>
        </SettingsSection>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy ? '저장 중...' : '저장'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleProbe} disabled={busy}>
          연결 테스트
        </Button>
        {probe.status === 'running' ? (
          <span className="text-xs text-muted-foreground">probing...</span>
        ) : null}
        {probe.status === 'ok' ? (
          <span className="text-xs text-emerald-600">
            ✓ 연결 OK ({probe.detail})
          </span>
        ) : null}
        {probe.status === 'fail' ? (
          <span className="text-xs text-destructive">
            ✗ 연결 실패 ({probe.detail})
          </span>
        ) : null}
      </div>
    </SettingsStack>
  )
}
