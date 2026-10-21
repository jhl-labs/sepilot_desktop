'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CapabilityUnavailableError,
  createMessageSubscriptionApi,
  type MessageSubscriptionApi,
  type MessageSubscriptionConfig,
  type MessageSubscriptionItem,
  type MessageSubscriptionOverview,
} from '@/lib/api/message-subscription'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'message-subscription',
  section: 'automation',
  label: 'Message Subscription',
  search: ['subscription', 'polling', 'queue', 'nats', 'messages'],
  render: () => <MessageSubscriptionSettingsTab />,
})

const DEFAULT_FORM: MessageSubscriptionConfig = {
  enabled: false,
  connectionType: 'polling',
  pollingUrl: '',
  websocketUrl: '',
  pollingInterval: 60_000,
  authToken: '',
  customHeaders: {},
  natsUrl: '',
  natsConsumerId: '',
  natsConsumerSecret: '',
  natsStreamName: 'WEBHOOKS',
  natsSubject: 'webhooks.>',
  natsBatchSize: 10,
  natsFetchTimeout: 5000,
  maxQueueSize: 1000,
  retentionDays: 7,
  autoProcess: true,
  retryAttempts: 3,
  retryDelay: 5000,
  useAIProcessing: false,
  aiPromptTemplate: '',
  thinkingMode: 'instant',
  showNotification: true,
}

function formatWhen(value: number | null): string {
  return value ? new Date(value).toLocaleString() : '없음'
}

function filterQueueItems(
  items: MessageSubscriptionItem[],
  filter: 'all' | MessageSubscriptionItem['status'],
): MessageSubscriptionItem[] {
  return filter === 'all'
    ? items
    : items.filter((item) => item.status === filter)
}

export function MessageSubscriptionSettingsTab() {
  const transport = useTransport()
  const [overview, setOverview] = useState<MessageSubscriptionOverview | null>(null)
  const [form, setForm] = useState<MessageSubscriptionConfig>(DEFAULT_FORM)
  const [queueItems, setQueueItems] = useState<MessageSubscriptionItem[]>([])
  const [queueFilter, setQueueFilter] = useState<
    'all' | MessageSubscriptionItem['status']
  >('all')
  const [headersText, setHeadersText] = useState('{}')
  const [activeSection, setActiveSection] = useState<
    'connection' | 'queue' | 'ai' | 'notification'
  >('connection')
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const queueFilterRef = useRef(queueFilter)
  const hasPendingConfigChangesRef = useRef(false)

  function applyOverview(
    next: MessageSubscriptionOverview,
    options?: { syncForm?: boolean },
  ): void {
    setOverview(next)
    if (options?.syncForm === false) return
    setForm(next.config)
    setHeadersText(JSON.stringify(next.config.customHeaders ?? {}, null, 2))
  }

  async function refreshQueue(
    filter: 'all' | MessageSubscriptionItem['status'] = queueFilter,
  ): Promise<void> {
    const api = await createMessageSubscriptionApi(transport)
    const next = await api.listMessages(
      filter === 'all' ? undefined : filter,
      30,
    )
    setQueueItems(next)
  }

  async function refreshOverview(
    options?: { syncForm?: boolean },
  ): Promise<void> {
    const api = await createMessageSubscriptionApi(transport)
    const [next, nextQueue] = await Promise.all([
      api.getOverview(),
      api.listMessages(queueFilter === 'all' ? undefined : queueFilter, 30),
    ])
    applyOverview(next, options)
    setQueueItems(nextQueue)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createMessageSubscriptionApi(transport)
        const next = await api.getOverview()
        if (cancelled) return
        applyOverview(next)
        setQueueItems(await api.listMessages(undefined, 30))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        setStatus('error')
        setError(
          err instanceof Error ? err.message : 'message subscription load failed',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    queueFilterRef.current = queueFilter
  }, [queueFilter])

  useEffect(() => {
    if (status !== 'ready') return
    void refreshQueue(queueFilter)
  }, [queueFilter])

  const hasPendingConfigChanges =
    !!overview
    && (
      JSON.stringify(form) !== JSON.stringify(overview.config)
      || headersText
        !== JSON.stringify(overview.config.customHeaders ?? {}, null, 2)
    )

  useEffect(() => {
    hasPendingConfigChangesRef.current = hasPendingConfigChanges
  }, [hasPendingConfigChanges])

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    let watcher: ReturnType<MessageSubscriptionApi['watch']> | null = null

    void (async () => {
      try {
        const api = await createMessageSubscriptionApi(transport)
        if (cancelled) return
        watcher = api.watch((event) => {
          if (event.type === 'heartbeat') return
          applyOverview(event.overview, {
            syncForm: !hasPendingConfigChangesRef.current,
          })
          setQueueItems(filterQueueItems(event.messages, queueFilterRef.current))
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
      const parsedHeaders = JSON.parse(headersText || '{}') as Record<string, string>
      const api = await createMessageSubscriptionApi(transport)
      const next = await api.saveConfig({
        ...form,
        customHeaders: parsedHeaders,
      })
      applyOverview(next)
      await refreshQueue()
      if (next.config.enabled && next.status.lastError) {
        toast.error('메시지 구독 설정은 저장했지만 연결에 실패했습니다.', {
          description: next.status.lastError,
        })
        return
      }
      toast.success('메시지 구독 설정을 저장했습니다.')
    } catch (err) {
      toast.error('메시지 구독 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function start(): Promise<void> {
    setBusyKey('start')
    try {
      const api = await createMessageSubscriptionApi(transport)
      const next = await api.start()
      applyOverview(next)
      await refreshQueue()
      if (next.status.lastError) {
        toast.error('메시지 구독 시작에 실패했습니다.', {
          description: next.status.lastError,
        })
        return
      }
      toast.success('메시지 구독을 시작 상태로 전환했습니다.')
    } catch (err) {
      toast.error('메시지 구독 시작에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'start failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function stop(): Promise<void> {
    setBusyKey('stop')
    try {
      const api = await createMessageSubscriptionApi(transport)
      const next = await api.stop()
      applyOverview(next)
      await refreshQueue()
      toast.success('메시지 구독을 중지했습니다.')
    } catch (err) {
      toast.error('메시지 구독 중지에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'stop failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function refreshNow(): Promise<void> {
    setBusyKey('refresh')
    try {
      const api = await createMessageSubscriptionApi(transport)
      const result = await api.refresh()
      applyOverview(result.overview, { syncForm: false })
      await refreshQueue()
      if (result.success) {
        if (form.connectionType === 'websocket') {
          toast.success('WebSocket 연결 재시도를 요청했습니다.', {
            description:
              result.overview.status.isConnected
                ? 'daemon이 websocket 소스에 다시 연결되었습니다.'
                : '현재 연결 상태를 다시 확인했습니다.',
          })
        } else {
          toast.success('외부 메시지를 새로 가져왔습니다.', {
            description: `${result.count}건 추가 · ${result.processed ?? 0}건 처리`,
          })
        }
      } else {
        toast.error('메시지 새로고침에 실패했습니다.', {
          description: result.error ?? 'refresh failed',
        })
      }
    } catch (err) {
      toast.error('메시지 새로고침에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'refresh failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function reprocess(hash: string): Promise<void> {
    setBusyKey(`reprocess:${hash}`)
    try {
      const api = await createMessageSubscriptionApi(transport)
      await api.reprocess(hash)
      await refreshOverview({ syncForm: false })
      toast.success('메시지를 다시 처리 대기열에 반영했습니다.')
    } catch (err) {
      toast.error('메시지 재처리에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'reprocess failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function processPending(): Promise<void> {
    setBusyKey('process')
    try {
      const api = await createMessageSubscriptionApi(transport)
      const result = await api.processPending()
      applyOverview(result.overview, { syncForm: false })
      await refreshQueue()
      toast.success('대기 중 메시지를 즉시 처리했습니다.', {
        description: `${result.processed}건 처리`,
      })
    } catch (err) {
      toast.error('대기 메시지 처리에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'process failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function remove(hash: string): Promise<void> {
    setBusyKey(`remove:${hash}`)
    try {
      const api = await createMessageSubscriptionApi(transport)
      await api.remove(hash)
      await refreshOverview({ syncForm: false })
      toast.success('큐 항목을 삭제했습니다.')
    } catch (err) {
      toast.error('큐 항목 삭제에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'remove failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Message Subscription" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>
  if (!overview) return null

  const queueFilters: Array<{
    key: 'all' | MessageSubscriptionItem['status']
    label: string
    count: number
  }> = [
    {
      key: 'all',
      label: 'All',
      count:
        overview.queueStatus.pending
        + overview.queueStatus.processing
        + overview.queueStatus.completed
        + overview.queueStatus.failed,
    },
    {
      key: 'pending',
      label: 'Pending',
      count: overview.queueStatus.pending,
    },
    {
      key: 'processing',
      label: 'Processing',
      count: overview.queueStatus.processing,
    },
    {
      key: 'failed',
      label: 'Failed',
      count: overview.queueStatus.failed,
    },
    {
      key: 'completed',
      label: 'Completed',
      count: overview.queueStatus.completed,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Message Subscription</h4>
            <p className="text-xs text-muted-foreground">
              daemon이 polling, websocket, NATS 소스를 직접 구독하고 큐 상태를 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                form.enabled
                  ? 'bg-emerald-500/15 text-emerald-600'
                  : 'bg-zinc-500/15 text-zinc-500'
              }`}
            >
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                overview.status.isConnected
                  ? 'bg-sky-500/15 text-sky-600'
                  : 'bg-zinc-500/15 text-zinc-500'
              }`}
            >
              {overview.status.isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshNow()}
              disabled={busyKey === 'refresh'}
            >
              새로고침
            </Button>
            {form.enabled ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void stop()}
                disabled={busyKey === 'stop'}
              >
                중지
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void start()}
                disabled={busyKey === 'start'}
              >
                시작
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={busyKey === 'save'}
            >
              저장
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <MetricCard label="Pending" value={overview.queueStatus.pending} tone="default" />
          <MetricCard label="Processing" value={overview.queueStatus.processing} tone="info" />
          <MetricCard label="Completed" value={overview.queueStatus.completed} tone="success" />
          <MetricCard label="Failed" value={overview.queueStatus.failed} tone="danger" />
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <div>마지막 polling: {formatWhen(overview.status.lastPolled)}</div>
          <div>마지막 처리: {formatWhen(overview.queueStatus.lastProcessed)}</div>
          <div>최근 오류: {overview.status.lastError ?? '없음'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['connection', 'Connection'],
            ['queue', 'Queue'],
            ['ai', 'AI'],
            ['notification', 'Notification'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={activeSection === key ? 'default' : 'outline'}
            onClick={() => setActiveSection(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {activeSection === 'connection' ? (
        <div className="rounded-xl border border-border p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Type</label>
              <select
                value={form.connectionType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    connectionType: event.target.value as MessageSubscriptionConfig['connectionType'],
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="polling">Polling</option>
                <option value="websocket">WebSocket</option>
                <option value="nats">NATS</option>
              </select>
            </div>
            {form.connectionType === 'polling' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Polling URL</label>
                  <Input
                    value={form.pollingUrl}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        pollingUrl: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/api/messages"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Polling Interval (ms)</label>
                  <Input
                    type="number"
                    value={form.pollingInterval}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        pollingInterval: Number.parseInt(event.target.value || '60000', 10),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Auth Token</label>
                  <Input
                    type="password"
                    value={form.authToken}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        authToken: event.target.value,
                      }))
                    }
                    placeholder="Bearer token"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Custom Headers (JSON)</label>
                  <textarea
                    value={headersText}
                    onChange={(event) => setHeadersText(event.target.value)}
                    className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </>
            ) : form.connectionType === 'websocket' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">WebSocket URL</label>
                  <Input
                    value={form.websocketUrl}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        websocketUrl: event.target.value,
                      }))
                    }
                    placeholder="wss://example.com/messages"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reconnect Delay (ms)</label>
                  <Input
                    type="number"
                    value={form.retryDelay}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        retryDelay: Number.parseInt(event.target.value || '5000', 10),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Auth Token</label>
                  <Input
                    type="password"
                    value={form.authToken}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        authToken: event.target.value,
                      }))
                    }
                    placeholder="Bearer token"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Custom Headers (JSON)</label>
                  <textarea
                    value={headersText}
                    onChange={(event) => setHeadersText(event.target.value)}
                    className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="md:col-span-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  WebSocket 모드에서는 daemon이 연결을 유지하고 수신 프레임을 즉시
                  큐에 넣습니다. 상단 새로고침 버튼은 polling 대신 연결 재시도를
                  수행합니다.
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">NATS URL</label>
                  <Input
                    value={form.natsUrl}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, natsUrl: event.target.value }))
                    }
                    placeholder="nats://broker.example.com:4222"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Consumer ID</label>
                  <Input
                    value={form.natsConsumerId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        natsConsumerId: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Consumer Secret</label>
                  <Input
                    type="password"
                    value={form.natsConsumerSecret}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        natsConsumerSecret: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stream</label>
                  <Input
                    value={form.natsStreamName}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        natsStreamName: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={form.natsSubject}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        natsSubject: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Batch Size</label>
                  <Input
                    type="number"
                    value={form.natsBatchSize}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        natsBatchSize: Number.parseInt(event.target.value || '10', 10),
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  NATS 모드에서는 daemon이 JetStream consumer 연결을 유지하고
                  지정한 주기로 fetch를 수행합니다. 상단 새로고침 버튼은 즉시 fetch를
                  다시 실행합니다.
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {activeSection === 'queue' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Queue Controls</h4>
                <p className="text-xs text-muted-foreground">
                  자동 처리 외에도 브라우저에서 대기 메시지를 즉시 처리할 수 있습니다.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void processPending()}
                disabled={busyKey === 'process' || overview.queueStatus.pending === 0}
              >
                {busyKey === 'process' ? '처리 중…' : '대기 메시지 처리'}
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Queue Size</label>
                <Input
                  type="number"
                  value={form.maxQueueSize}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      maxQueueSize: Number.parseInt(event.target.value || '1000', 10),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Retention Days</label>
                <Input
                  type="number"
                  value={form.retentionDays}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      retentionDays: Number.parseInt(event.target.value || '7', 10),
                    }))
                  }
                />
              </div>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>Auto Process</span>
                <input
                  type="checkbox"
                  checked={form.autoProcess}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      autoProcess: event.target.checked,
                    }))
                  }
                />
              </label>
              <div className="space-y-2">
                <label className="text-sm font-medium">Retry Attempts</label>
                <Input
                  type="number"
                  value={form.retryAttempts}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      retryAttempts: Number.parseInt(event.target.value || '3', 10),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Retry Delay (ms)</label>
                <Input
                  type="number"
                  value={form.retryDelay}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      retryDelay: Number.parseInt(event.target.value || '5000', 10),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Queue Items</h4>
                <p className="text-xs text-muted-foreground">
                  상태별로 필터링해서 pending/failed/completed 흐름을 바로 확인합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {queueFilters.map((filter) => (
                  <Button
                    key={filter.key}
                    size="sm"
                    variant={queueFilter === filter.key ? 'default' : 'outline'}
                    onClick={() => setQueueFilter(filter.key)}
                  >
                    {filter.label} {filter.count}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {queueItems.map((item) => (
                <div key={item.hash} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                          {item.status}
                        </span>
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                          {item.source}
                        </span>
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                          retry {item.retryCount}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.body || item.content.slice(0, 180)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        queued {formatWhen(item.queuedAt)} · processed{' '}
                        {formatWhen(item.processedAt)}
                      </div>
                      {item.error ? (
                        <div className="text-[11px] text-red-600">{item.error}</div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      {item.status === 'failed' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void reprocess(item.hash)}
                          disabled={busyKey === `reprocess:${item.hash}`}
                        >
                          재처리
                        </Button>
                      ) : null}
                      {item.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void processPending()}
                          disabled={busyKey === 'process'}
                        >
                          지금 처리
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(item.hash)}
                        disabled={busyKey === `remove:${item.hash}`}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {queueItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  현재 필터에 해당하는 큐 항목이 없습니다.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'ai' ? (
        <div className="rounded-xl border border-border p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Use AI Processing</span>
              <input
                type="checkbox"
                checked={form.useAIProcessing}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    useAIProcessing: event.target.checked,
                  }))
                }
              />
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium">Thinking Mode</label>
              <select
                value={form.thinkingMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    thinkingMode: event.target.value as MessageSubscriptionConfig['thinkingMode'],
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="instant">Instant</option>
                <option value="sequential">Sequential</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Prompt Template</label>
              <textarea
                value={form.aiPromptTemplate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    aiPromptTemplate: event.target.value,
                  }))
                }
                className="min-h-[180px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="수신 메시지를 요약하고 triage하세요..."
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'notification' ? (
        <div className="rounded-xl border border-border p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Show Notification</span>
              <input
                type="checkbox"
                checked={form.showNotification}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    showNotification: event.target.checked,
                  }))
                }
              />
            </label>
            <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
              실제 알림 채널 on/off는 전역 Notifications 탭에서 관리하고,
              여기서는 메시지 구독이 알림을 발행할지 여부만 결정합니다.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'info' | 'success' | 'danger'
}) {
  const className =
    tone === 'info'
      ? 'text-sky-600'
      : tone === 'success'
        ? 'text-emerald-600'
        : tone === 'danger'
          ? 'text-red-600'
          : 'text-foreground'

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${className}`}>{value}</div>
    </div>
  )
}
