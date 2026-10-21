'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasDesktopBridge, requireDesktopBridge } from '@/lib/electron/bridge'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'smart-home',
  section: 'integrations',
  label: 'Smart Home',
  search: [
    'smart home',
    'smarthome',
    'smartthings',
    'google home',
    'matter',
    'iot',
    'integration',
  ],
  buildFeature: 'smart-home',
  render: () => <SmartHomeIntegrationSettingsTab />,
})

interface SmartHomeIntegrationSettings {
  smartThingsAccessToken: string | null
  smartThingsLocationId: string | null
  googleHomeOAuthClientId: string | null
  googleHomeOAuthClientSecret: string | null
  googleHomeProjectId: string | null
}

function emptySettings(): SmartHomeIntegrationSettings {
  return {
    smartThingsAccessToken: '',
    smartThingsLocationId: '',
    googleHomeOAuthClientId: '',
    googleHomeOAuthClientSecret: '',
    googleHomeProjectId: '',
  }
}

function getInvoke():
  | (<T = unknown>(channel: string, ...args: unknown[]) => Promise<T>)
  | null {
  if (!hasDesktopBridge()) return null
  const bridge = requireDesktopBridge()
  return bridge.invoke ?? null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

function statusBadge(configured: boolean, available = true): string {
  if (!available) return configured ? '설정 저장됨' : '대기'
  return configured ? '연동 준비됨' : '설정 필요'
}

export function SmartHomeIntegrationSettingsTab() {
  const [saved, setSaved] = useState<SmartHomeIntegrationSettings>(emptySettings)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const invoke = getInvoke()
    if (!invoke) {
      setStatus('unavailable')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await invoke<{ saved: Partial<SmartHomeIntegrationSettings> }>(
          'sepilot:get-desktop-settings',
        )
        if (cancelled) return
        setSaved({
          smartThingsAccessToken: result.saved.smartThingsAccessToken ?? '',
          smartThingsLocationId: result.saved.smartThingsLocationId ?? '',
          googleHomeOAuthClientId: result.saved.googleHomeOAuthClientId ?? '',
          googleHomeOAuthClientSecret: result.saved.googleHomeOAuthClientSecret ?? '',
          googleHomeProjectId: result.saved.googleHomeProjectId ?? '',
        })
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
      const next = await invoke<SmartHomeIntegrationSettings>(
        'sepilot:save-desktop-settings',
        {
          smartThingsAccessToken: clean(saved.smartThingsAccessToken),
          smartThingsLocationId: clean(saved.smartThingsLocationId),
          googleHomeOAuthClientId: clean(saved.googleHomeOAuthClientId),
          googleHomeOAuthClientSecret: clean(saved.googleHomeOAuthClientSecret),
          googleHomeProjectId: clean(saved.googleHomeProjectId),
        },
      )
      setSaved({
        smartThingsAccessToken: next.smartThingsAccessToken ?? '',
        smartThingsLocationId: next.smartThingsLocationId ?? '',
        googleHomeOAuthClientId: next.googleHomeOAuthClientId ?? '',
        googleHomeOAuthClientSecret: next.googleHomeOAuthClientSecret ?? '',
        googleHomeProjectId: next.googleHomeProjectId ?? '',
      })
      toast.success('Smart Home 연동 설정을 저장했습니다.')
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <p className="p-4 text-sm">Loading...</p>
  if (status === 'unavailable') {
    return <UnimplementedBanner what="Smart Home integration settings (desktop bridge only)" />
  }
  if (status === 'error') {
    return <p className="p-4 text-sm text-destructive">{error}</p>
  }

  const smartThingsReady = Boolean(saved.smartThingsAccessToken?.trim())
  const googleHomeConfigured = Boolean(
    saved.googleHomeProjectId?.trim() ||
      (saved.googleHomeOAuthClientId?.trim() && saved.googleHomeOAuthClientSecret?.trim()),
  )

  return (
    <div className="space-y-6 p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Smart Home</h2>
        <p className="text-sm text-muted-foreground">
          SmartThings는 기기 목록/상태/명령 실행에 사용하고, Google Home은 Home API
          프로젝트 정보를 보관해 Smart Home 앱에서 연동 상태를 함께 보여줍니다.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">SmartThings</h3>
              <p className="text-xs text-muted-foreground">Devices API 동기화 및 제어</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs">
              {statusBadge(smartThingsReady)}
            </span>
          </div>
          <label className="block space-y-1">
            <span className="text-sm">Personal Access Token</span>
            <Input
              type="password"
              value={saved.smartThingsAccessToken ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, smartThingsAccessToken: e.target.value }))
              }
              placeholder="SmartThings PAT"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Location ID</span>
            <Input
              value={saved.smartThingsLocationId ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, smartThingsLocationId: e.target.value }))
              }
              placeholder="비워두면 접근 가능한 전체 기기"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            토큰은 로컬 설정에만 저장되며 가능한 경우 OS keychain으로 암호화됩니다.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Google Home</h3>
              <p className="text-xs text-muted-foreground">Home API 프로젝트 설정</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs">
              {statusBadge(googleHomeConfigured, false)}
            </span>
          </div>
          <label className="block space-y-1">
            <span className="text-sm">Project ID</span>
            <Input
              value={saved.googleHomeProjectId ?? ''}
              onChange={(e) => setSaved((s) => ({ ...s, googleHomeProjectId: e.target.value }))}
              placeholder="Google Home Developer Console project"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">OAuth Client ID</span>
            <Input
              value={saved.googleHomeOAuthClientId ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, googleHomeOAuthClientId: e.target.value }))
              }
              placeholder="....apps.googleusercontent.com"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">OAuth Client Secret</span>
            <Input
              type="password"
              value={saved.googleHomeOAuthClientSecret ?? ''}
              onChange={(e) =>
                setSaved((s) => ({ ...s, googleHomeOAuthClientSecret: e.target.value }))
              }
              placeholder="Google Home OAuth client secret"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            현재 Google Home Home APIs의 사용자 홈 제어는 Android/iOS SDK 중심이라
            데스크톱 직접 명령은 제한됩니다.
          </p>
        </div>
      </section>

      <Button onClick={handleSave} disabled={busy}>
        {busy ? '저장 중...' : '저장'}
      </Button>
    </div>
  )
}
