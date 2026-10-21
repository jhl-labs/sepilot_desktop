'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasDesktopBridge, requireDesktopBridge } from '@/lib/electron/bridge'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'google',
  section: 'integrations',
  label: 'Google',
  search: ['google', 'oauth', 'integration', 'calendar', 'gmail', 'drive'],
  buildFeature: 'google',
  render: () => <GoogleIntegrationSettingsTab />,
})

interface GoogleOAuthSettings {
  googleOAuthClientId: string | null
  googleOAuthClientSecret: string | null
}

function getInvoke():
  | (<T = unknown>(channel: string, ...args: unknown[]) => Promise<T>)
  | null {
  if (!hasDesktopBridge()) return null
  const bridge = requireDesktopBridge()
  return bridge.invoke ?? null
}

export function GoogleIntegrationSettingsTab() {
  const [saved, setSaved] = useState<GoogleOAuthSettings>({
    googleOAuthClientId: '',
    googleOAuthClientSecret: '',
  })
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>(
    'loading',
  )
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
        const result = await invoke<{ saved: GoogleOAuthSettings }>(
          'sepilot:get-desktop-settings',
        )
        if (cancelled) return
        setSaved({
          googleOAuthClientId: result.saved.googleOAuthClientId ?? '',
          googleOAuthClientSecret: result.saved.googleOAuthClientSecret ?? '',
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
      const next = {
        googleOAuthClientId: saved.googleOAuthClientId?.trim() || null,
        googleOAuthClientSecret: saved.googleOAuthClientSecret?.trim() || null,
      }
      await invoke('sepilot:calendar/configure-google', {
        clientId: next.googleOAuthClientId,
        clientSecret: next.googleOAuthClientSecret,
      })
      setSaved({
        googleOAuthClientId: next.googleOAuthClientId ?? '',
        googleOAuthClientSecret: next.googleOAuthClientSecret ?? '',
      })
      toast.success('Google OAuth 설정을 저장했습니다.')
    } catch (err) {
      toast.error(
        `저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <p className="p-4 text-sm">Loading...</p>
  if (status === 'unavailable') {
    return <UnimplementedBanner what="Google integration settings (desktop bridge only)" />
  }
  if (status === 'error') {
    return <p className="p-4 text-sm text-destructive">{error}</p>
  }

  return (
    <div className="space-y-6 p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Google</h2>
        <p className="text-sm text-muted-foreground">
          Google Calendar, Gmail, Drive 같은 Google 연동에서 함께 사용할 OAuth
          Desktop client 설정입니다. Client ID와 Secret을 모두 저장한 뒤 각
          앱에서 Google 연결을 진행하세요.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm">OAuth Client ID</span>
          <Input
            value={saved.googleOAuthClientId ?? ''}
            onChange={(e) =>
              setSaved((s) => ({ ...s, googleOAuthClientId: e.target.value }))
            }
            placeholder="1234567890-....apps.googleusercontent.com"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">OAuth Client Secret</span>
          <Input
            type="password"
            value={saved.googleOAuthClientSecret ?? ''}
            onChange={(e) =>
              setSaved((s) => ({ ...s, googleOAuthClientSecret: e.target.value }))
            }
            placeholder="Google Cloud Desktop client secret"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Client Secret은 로컬 설정에만 저장되며 가능한 경우 OS keychain으로
          암호화됩니다.
        </p>
      </section>

      <Button onClick={handleSave} disabled={busy}>
        {busy ? '저장 중...' : '저장'}
      </Button>
    </div>
  )
}
