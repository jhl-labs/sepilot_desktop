'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RemoteBrowserPanel } from '@/components/chat/RemoteBrowserPanel'
import { useSessionStore } from '@/lib/store/session-store'
import { saveWebTransportConfig } from '@/lib/transport/web-transport'
import { registerSettingsTab } from './registry'

type Status = 'unknown' | 'ok' | 'fail'

registerSettingsTab({
  key: 'connection',
  section: 'system',
  label: 'Connections',
  search: ['daemon', 'gateway', 'ping'],
  render: () => <ConnectionManager />,
})

export function ConnectionManager() {
  const transport = useTransport()
  const activeSessionId = useSessionStore((s) => s.activeId)
  const [daemon, setDaemon] = useState<Status>('unknown')
  const [gateway, setGateway] = useState<Status>('unknown')
  const [form, setForm] = useState({
    daemonOrigin: '',
    gatewayOrigin: '',
    daemonToken: '',
    gatewayToken: '',
  })
  const [saving, setSaving] = useState(false)

  const probe = useCallback(async (): Promise<void> => {
    const cfg = await transport.getConfig()
    const ping = async (origin: string, token: string | null, set: (s: Status) => void) => {
      try {
        const headers: HeadersInit = token ? { authorization: `Bearer ${token}` } : {}
        const r = await fetch(`${origin}/api/v1/health`, { headers })
        set(r.ok ? 'ok' : 'fail')
      } catch {
        set('fail')
      }
    }
    await Promise.all([
      ping(cfg.daemonOrigin, cfg.daemonToken, setDaemon),
      ping(cfg.gatewayOrigin, cfg.gatewayToken, setGateway),
    ])
  }, [transport])

  useEffect(() => {
    void probe()
  }, [probe])

  useEffect(() => {
    let cancelled = false
    void transport.getConfig().then((cfg) => {
      if (cancelled) return
      setForm({
        daemonOrigin: cfg.daemonOrigin,
        gatewayOrigin: cfg.gatewayOrigin,
        daemonToken: cfg.daemonToken ?? '',
        gatewayToken: cfg.gatewayToken ?? '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [transport])

  async function saveBrowserConfig(): Promise<void> {
    if (transport.kind !== 'web') return
    setSaving(true)
    try {
      const next = saveWebTransportConfig({
        daemonOrigin: form.daemonOrigin,
        gatewayOrigin: form.gatewayOrigin,
        daemonToken: form.daemonToken,
        gatewayToken: form.gatewayToken,
      })
      setForm({
        daemonOrigin: next.daemonOrigin,
        gatewayOrigin: next.gatewayOrigin,
        daemonToken: next.daemonToken ?? '',
        gatewayToken: next.gatewayToken ?? '',
      })
      await probe()
      toast.success('브라우저 transport 연결 정보를 저장했습니다.')
    } catch (error) {
      toast.error('브라우저 transport 설정을 저장하지 못했습니다.', {
        description: error instanceof Error ? error.message : 'save transport failed',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {transport.kind === 'web' ? (
        <div className="rounded-md border border-border p-3">
          <div className="mb-3">
            <div className="font-medium">Browser Transport</div>
            <div className="text-xs text-muted-foreground">
              Electron preload 없이 브라우저로 desktop renderer를 열 때 사용할 daemon/gateway 주소와
              토큰입니다.
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Daemon Origin</label>
              <Input
                value={form.daemonOrigin}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    daemonOrigin: event.target.value,
                  }))
                }
                placeholder="http://127.0.0.1:17600 또는 /api/daemon"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway Origin</label>
              <Input
                value={form.gatewayOrigin}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    gatewayOrigin: event.target.value,
                  }))
                }
                placeholder="http://127.0.0.1:17610 또는 /api/gateway"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Daemon Token</label>
              <Input
                type="password"
                value={form.daemonToken}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    daemonToken: event.target.value,
                  }))
                }
                placeholder="선택 사항"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway Token</label>
              <Input
                type="password"
                value={form.gatewayToken}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    gatewayToken: event.target.value,
                  }))
                }
                placeholder="선택 사항"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => void saveBrowserConfig()} disabled={saving}>
              {saving ? '저장 중…' : '브라우저 연결 저장'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void probe()}>
              다시 테스트
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-md border border-border p-2">
        <span>Daemon</span>
        <span
          className={
            daemon === 'ok'
              ? 'text-green-500'
              : daemon === 'fail'
                ? 'text-red-500'
                : 'text-muted-foreground'
          }
        >
          {daemon}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border p-2">
        <span>Gateway</span>
        <span
          className={
            gateway === 'ok'
              ? 'text-green-500'
              : gateway === 'fail'
                ? 'text-red-500'
                : 'text-muted-foreground'
          }
        >
          {gateway}
        </span>
      </div>
      {transport.kind !== 'web' ? (
        <Button size="sm" variant="outline" onClick={() => void probe()}>
          다시 테스트
        </Button>
      ) : null}
      {activeSessionId ? <RemoteBrowserPanel key={activeSessionId} sessionId={activeSessionId} /> : null}
    </div>
  )
}
