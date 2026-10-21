'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { daemonNotifyRelayEvidence } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CapabilityUnavailableError,
  createNotificationsApi,
  type NotificationsApi,
  type NotificationItem,
  type NotificationSettings,
} from '@/lib/api/notifications'
import {
  getDesktopNotificationDiagnostics,
  publishDesktopNotification,
  type DesktopNotificationDiagnostics,
} from '@/lib/electron/bridge'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'notifications',
  section: 'notifications',
  label: 'Notifications',
  search: ['notify', 'channel', 'alert'],
  render: () => <NotificationSettingsTab />,
})

const DEFAULT_TEST_NOTIFICATION = {
  title: 'SEPilot 테스트 알림',
  body: 'daemon capability 경로가 정상적으로 연결되었는지 확인하는 테스트입니다.',
  url: '',
}

function serializeSettings(value: NotificationSettings): string {
  return JSON.stringify(
    value.channels.map((channel) => ({
      id: channel.id,
      enabled: channel.enabled,
    })),
  )
}

function formatWhen(value: number | null): string {
  return value ? new Date(value).toLocaleString() : '없음'
}

function NotificationRelayEvidence({ item }: { item: NotificationItem }) {
  const evidence = daemonNotifyRelayEvidence(item)
  if (!evidence) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>{evidence.label}</span>
      {item.relayDelivery?.messageId ? (
        <code>message {item.relayDelivery.messageId}</code>
      ) : null}
    </div>
  )
}

export function NotificationSettingsTab() {
  const transport = useTransport()
  const [settings, setSettings] = useState<NotificationSettings>({
    channels: [],
  })
  const [savedSignature, setSavedSignature] = useState(
    serializeSettings({ channels: [] }),
  )
  const [items, setItems] = useState<NotificationItem[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [testDraft, setTestDraft] = useState(DEFAULT_TEST_NOTIFICATION)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] =
    useState<DesktopNotificationDiagnostics | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const info = await getDesktopNotificationDiagnostics()
      if (!cancelled) setDiagnostics(info)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const unreadCount = items.filter((item) => !item.readAt).length
  const enabledChannels = settings.channels.filter((channel) => channel.enabled).length
  const hasSettingsChanges = serializeSettings(settings) !== savedSignature
  const visibleItems =
    filter === 'unread'
      ? items.filter((item) => !item.readAt)
      : items

  async function loadSettingsAndItems(): Promise<void> {
    const api = await createNotificationsApi(transport)
    const [nextSettings, nextItems] = await Promise.all([
      api.getSettings(),
      api.list(),
    ])
    setSettings(nextSettings)
    setSavedSignature(serializeSettings(nextSettings))
    setItems(nextItems)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createNotificationsApi(transport)
        const [nextSettings, nextItems] = await Promise.all([
          api.getSettings(),
          api.list(),
        ])
        if (cancelled) return
        setSettings(nextSettings)
        setSavedSignature(serializeSettings(nextSettings))
        setItems(nextItems)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        setStatus('error')
        setError(
          err instanceof Error ? err.message : 'notifications load failed',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    let watcher: ReturnType<NotificationsApi['watch']> | null = null

    void (async () => {
      try {
        const api = await createNotificationsApi(transport)
        if (cancelled) return
        watcher = api.watch((event) => {
          if (event.type === 'heartbeat') return
          if (event.type === 'snapshot') {
            setItems(event.items)
            return
          }
          setItems((prev) => [
            event.item,
            ...prev.filter((item) => item.id !== event.item.id),
          ])
        })
        watcher.done.catch(() => {})
      } catch {
      }
    })()

    return () => {
      cancelled = true
      watcher?.close()
    }
  }, [status, transport])

  async function save(): Promise<void> {
    setBusyKey('save')
    try {
      const api = await createNotificationsApi(transport)
      const saved = await api.setSettings(settings)
      setSettings(saved)
      setSavedSignature(serializeSettings(saved))
      toast.success('알림 채널 설정을 저장했습니다.')
    } catch (err) {
      toast.error('알림 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function refreshAll(): Promise<void> {
    setBusyKey('refresh')
    try {
      await loadSettingsAndItems()
      toast.success('알림 상태를 새로고침했습니다.')
    } catch (err) {
      toast.error('알림 상태를 불러오지 못했습니다.', {
        description: err instanceof Error ? err.message : 'refresh failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function markRead(id: string): Promise<void> {
    setBusyKey(`read:${id}`)
    try {
      const api = await createNotificationsApi(transport)
      await api.markRead(id)
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? Date.now() } : item,
        ),
      )
    } catch (err) {
      toast.error('알림 상태를 업데이트하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'markRead failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function sendTestNotification(): Promise<void> {
    if (!testDraft.title.trim()) {
      toast.error('테스트 알림 제목을 입력하세요.')
      return
    }

    setBusyKey('publish')
    try {
      const api = await createNotificationsApi(transport)
      const created = await api.publish({
        title: testDraft.title.trim(),
        body: testDraft.body.trim(),
        url: testDraft.url.trim() ? testDraft.url.trim() : null,
      })
      await publishDesktopNotification(created).catch(() => false)
      setItems((prev) => [created, ...prev.filter((item) => item.id !== created.id)])
      toast.success('테스트 알림을 발행했습니다.')
    } catch (err) {
      toast.error('테스트 알림 발행에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'publish failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Notifications" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4">
      {diagnostics ? (
        <DiagnosticsPanel diagnostics={diagnostics} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Total
          </div>
          <div className="mt-2 text-2xl font-semibold">{items.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            daemon이 저장한 최근 알림 수
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Unread
          </div>
          <div className="mt-2 text-2xl font-semibold">{unreadCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            읽지 않은 알림
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Channels
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {enabledChannels} / {settings.channels.length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            활성화된 채널 수
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Channels</h4>
                <p className="text-xs text-muted-foreground">
                  daemon이 발행한 알림 채널별 수신 여부입니다.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshAll()}
                disabled={busyKey === 'refresh'}
              >
                {busyKey === 'refresh' ? '새로고침 중…' : '새로고침'}
              </Button>
            </div>
            <div className="space-y-2">
              {settings.channels.map((channel) => (
                <label
                  key={channel.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{channel.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {channel.enabled ? '수신 중' : '차단됨'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        channels: prev.channels.map((candidate) =>
                          candidate.id === channel.id
                            ? { ...candidate, enabled: event.target.checked }
                            : candidate,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
              {settings.channels.length === 0 && (
                <p className="text-xs text-muted-foreground">채널 없음</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {hasSettingsChanges
                  ? '저장되지 않은 채널 변경 사항이 있습니다.'
                  : '채널 설정이 저장된 상태입니다.'}
              </div>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={!hasSettingsChanges || busyKey === 'save'}
              >
                {busyKey === 'save' ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-4">
              <h4 className="text-sm font-semibold">Test Notification</h4>
              <p className="text-xs text-muted-foreground">
                브라우저에서도 daemon capability를 통해 테스트 알림을 바로 발행합니다.
              </p>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="notification-test-title" className="text-sm font-medium">
                  제목
                </label>
                <Input
                  id="notification-test-title"
                  value={testDraft.title}
                  onChange={(event) =>
                    setTestDraft((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="notification-test-body" className="text-sm font-medium">
                  본문
                </label>
                <textarea
                  id="notification-test-body"
                  value={testDraft.body}
                  onChange={(event) =>
                    setTestDraft((prev) => ({
                      ...prev,
                      body: event.target.value,
                    }))
                  }
                  className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="notification-test-url" className="text-sm font-medium">
                  링크
                </label>
                <Input
                  id="notification-test-url"
                  value={testDraft.url}
                  onChange={(event) =>
                    setTestDraft((prev) => ({
                      ...prev,
                      url: event.target.value,
                    }))
                  }
                  placeholder="https://example.com"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void sendTestNotification()}
                  disabled={busyKey === 'publish'}
                >
                  {busyKey === 'publish' ? '발행 중…' : '테스트 알림 보내기'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTestDraft(DEFAULT_TEST_NOTIFICATION)}
                >
                  초기화
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Recent Notifications</h4>
              <p className="text-xs text-muted-foreground">
                daemon에서 최근 발행된 알림 로그입니다.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
              >
                전체
              </Button>
              <Button
                size="sm"
                variant={filter === 'unread' ? 'default' : 'outline'}
                onClick={() => setFilter('unread')}
              >
                읽지 않음
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className={[
                  'rounded-lg border px-4 py-3',
                  item.readAt ? 'border-border bg-background' : 'border-primary/30 bg-primary/5',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium">{item.title}</div>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {item.readAt ? '읽음' : '새 알림'}
                      </span>
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      {item.body || '본문 없음'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      생성: {formatWhen(item.createdAt)}
                      {item.readAt ? ` · 읽음: ${formatWhen(item.readAt)}` : ''}
                    </div>
                    {item.url ? (
                      <div className="text-[11px] text-muted-foreground">{item.url}</div>
                    ) : null}
                    <NotificationRelayEvidence item={item} />
                  </div>
                  {!item.readAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void markRead(item.id)}
                      disabled={busyKey === `read:${item.id}`}
                    >
                      {busyKey === `read:${item.id}` ? '처리 중…' : '읽음 처리'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {visibleItems.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                {filter === 'unread'
                  ? '읽지 않은 알림이 없습니다.'
                  : '최근 알림이 없습니다.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: DesktopNotificationDiagnostics
}) {
  const platformLabel =
    diagnostics.platform === 'win32'
      ? 'Windows'
      : diagnostics.platform === 'darwin'
        ? 'macOS'
        : diagnostics.platform === 'linux'
          ? 'Linux'
          : diagnostics.platform
  const nativeStatus = diagnostics.nativeDisabledByEnv
    ? 'env로 비활성화됨'
    : diagnostics.nativeSupported
      ? '사용 가능'
      : 'OS에서 지원하지 않음'
  const nativeBadgeClass = diagnostics.nativeDisabledByEnv
    ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
    : diagnostics.nativeSupported
      ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
      : 'border-red-500/40 text-red-600 dark:text-red-400'

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold">OS 알림 진단</h4>
        <p className="text-xs text-muted-foreground">
          데스크톱 앱이 OS 알림(토스트)을 띄울 수 있는 상태인지 보여줍니다.
          Windows에서는 AppUserModelID가 비어 있으면 토스트가 보이지 않을 수
          있습니다.
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">플랫폼</dt>
          <dd className="font-medium">{platformLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Native 알림</dt>
          <dd>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${nativeBadgeClass}`}
            >
              {nativeStatus}
            </span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">AppUserModelID</dt>
          <dd className="font-mono text-[11px]">
            {diagnostics.appUserModelId ?? '해당 없음 (non-Windows)'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">알림 아이콘</dt>
          <dd>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                diagnostics.iconResolved
                  ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                  : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
              }`}
            >
              {diagnostics.iconResolved ? '로드됨' : '미해결'}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
