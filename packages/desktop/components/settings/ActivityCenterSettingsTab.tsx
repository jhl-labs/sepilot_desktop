'use client'
import { useEffect, useState } from 'react'
import { RefreshCcw, Trash2 } from 'lucide-react'
import { daemonNotifyRelayEvidence } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import {
  CapabilityUnavailableError,
  createNotificationsApi,
  type NotificationItem,
} from '@/lib/api/notifications'
import { useShellStore } from '@/lib/store/shell-store'
import { cn } from '@/lib/utils/cn'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'activity-center',
  section: 'notifications',
  label: 'Activity Center',
  search: ['activity', 'events', 'timeline', 'notifications', 'shell'],
  render: () => <ActivityCenterSettingsTab />,
})

function formatWhen(value: number): string {
  return new Date(value).toLocaleString()
}

function severityClass(severity: 'info' | 'success' | 'warning' | 'error'): string {
  if (severity === 'success') return 'text-emerald-600'
  if (severity === 'warning') return 'text-amber-600'
  if (severity === 'error') return 'text-destructive'
  return 'text-muted-foreground'
}

export function ActivityCenterSettingsTab() {
  const transport = useTransport()
  const activity = useShellStore((state) => state.activity)
  const commandHistory = useShellStore((state) => state.commandHistory)
  const clearActivity = useShellStore((state) => state.clearActivity)
  const clearCommandHistory = useShellStore((state) => state.clearCommandHistory)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(true)
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null)

  async function refreshNotifications() {
    setLoadingNotifications(true)
    setNotificationStatus(null)
    try {
      const api = await createNotificationsApi(transport)
      setNotifications(await api.list())
    } catch (error) {
      setNotifications([])
      setNotificationStatus(
        error instanceof CapabilityUnavailableError
          ? 'Notifications capability is unavailable.'
          : error instanceof Error
            ? error.message
            : String(error),
      )
    } finally {
      setLoadingNotifications(false)
    }
  }

  useEffect(() => {
    void refreshNotifications()
  }, [transport])

  return (
    <div className="grid gap-4 text-sm xl:grid-cols-2">
      <section className="rounded-md border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Shell Timeline</h3>
            <p className="text-xs text-muted-foreground">
              연결, 종료, 재접속, 진단, Chat handoff 이벤트를 시간순으로 추적합니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={clearActivity}
            disabled={activity.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        <div className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">기록된 Shell activity가 없습니다.</p>
          ) : (
            activity.slice(0, 40).map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn('truncate text-xs font-medium', severityClass(item.severity))}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatWhen(item.at)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{item.message}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Command History</h3>
            <p className="text-xs text-muted-foreground">
              스니펫, 붙여넣기, startup command로 전송한 명령 기록입니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={clearCommandHistory}
            disabled={commandHistory.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        <div className="space-y-2">
          {commandHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">기록된 command가 없습니다.</p>
          ) : (
            commandHistory.slice(0, 40).map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <div className="font-mono text-xs">{item.command}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {item.title ?? 'terminal'} · {formatWhen(item.at)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border p-4 xl:col-span-2">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Notifications</h3>
            <p className="text-xs text-muted-foreground">
              daemon notification capability의 최근 항목을 activity와 같이 확인합니다.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void refreshNotifications()}>
            <RefreshCcw className={cn('h-3.5 w-3.5', loadingNotifications && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        {notificationStatus ? (
          <p className="text-xs text-muted-foreground">{notificationStatus}</p>
        ) : notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {loadingNotifications ? 'Loading notifications...' : '최근 notification이 없습니다.'}
          </p>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 20).map((item) => {
              const relayEvidence = daemonNotifyRelayEvidence(item)
              return (
                <div key={item.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">{item.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatWhen(item.createdAt)}
                    </span>
                  </div>
                  {item.body ? (
                    <div className="mt-1 text-xs text-muted-foreground">{item.body}</div>
                  ) : null}
                  {relayEvidence ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                      <span>{relayEvidence.label}</span>
                      {item.relayDelivery?.messageId ? (
                        <code title={item.relayDelivery.messageId}>
                          message {item.relayDelivery.messageId.slice(0, 24)}
                        </code>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
