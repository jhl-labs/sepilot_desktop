'use client'
import { useEffect, useMemo, useState } from 'react'
import { confirm } from '@/lib/utils/confirm'
import {
  CheckCircle2,
  Play,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createOutboundHooksApi,
  type DaemonOutboundWebhookConfig,
  type DaemonOutboundWebhookDeadLetter,
  type DaemonOutboundWebhookDelivery,
  type DaemonOutboundWebhookEvent,
  type DaemonOutboundWebhookSummary,
} from '@/lib/api/outbound-hooks'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { SecretStatusField } from './_shared/SecretStatusField'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'outbound-hooks',
  section: 'notifications',
  label: 'Outbound Hooks',
  search: [
    'hook',
    'hooks',
    'webhook',
    'outbound',
    'delivery',
    'dead letter',
    'replay',
    'ack',
  ],
  render: () => <OutboundHooksSettingsTab />,
})

const OUTBOUND_WEBHOOK_EVENTS: DaemonOutboundWebhookEvent[] = [
  'post:agent:run',
  'post:tool:execute',
  'post:process:start',
  'post:process:exit',
  'post:llm:call',
  'post:channel:msg',
]
const REDACTED_SECRET = '***redacted***'

interface OutboundWebhookDraft {
  localId: string
  webhook: DaemonOutboundWebhookConfig
  headersText: string
  persistedUrl?: string
}

interface OutboundHookState {
  drafts: OutboundWebhookDraft[]
  summaries: DaemonOutboundWebhookSummary[]
  deliveries: DaemonOutboundWebhookDelivery[]
  deadLetters: DaemonOutboundWebhookDeadLetter[]
}

function buildHeadersText(headers?: Record<string, string>): string {
  return Object.entries(headers ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function buildDraft(
  webhook: DaemonOutboundWebhookConfig,
  index: number,
): OutboundWebhookDraft {
  return {
    localId: `outbound-hook-${index}-${webhook.url}`,
    webhook: structuredClone(webhook),
    headersText: buildHeadersText(webhook.headers),
    persistedUrl: webhook.url,
  }
}

function buildEmptyDraft(index: number): OutboundWebhookDraft {
  return {
    localId: `new-outbound-hook-${Date.now()}-${index}`,
    webhook: {
      enabled: true,
      url: '',
      events: ['post:agent:run'],
      secret: '',
      headers: {},
      retry: {
        maxAttempts: 3,
        backoffMs: 250,
      },
    },
    headersText: '',
  }
}

function parseHeadersText(value: string): {
  headers: Record<string, string>
  errors: string[]
} {
  const headers: Record<string, string> = {}
  const errors: string[] = []

  for (const rawEntry of value.split(/\r?\n/g)) {
    const entry = rawEntry.trim()
    if (!entry) continue
    const separator = entry.indexOf('=')
    if (separator <= 0) {
      errors.push(`Invalid header entry: ${entry}. Use KEY=VALUE.`)
      continue
    }
    const key = entry.slice(0, separator).trim()
    const headerValue = entry.slice(separator + 1)
    if (!key) {
      errors.push(`Invalid header entry: ${entry}. Header key is required.`)
      continue
    }
    headers[key] = headerValue
  }

  return { headers, errors }
}

function parseRetryNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function validateDraft(draft: OutboundWebhookDraft): {
  errors: string[]
  normalized?: DaemonOutboundWebhookConfig
} {
  const errors: string[] = []
  const url = draft.webhook.url.trim()

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('URL must use http or https.')
    }
  } catch {
    errors.push('A valid absolute delivery URL is required.')
  }

  const events = [...new Set(draft.webhook.events)]
  if (events.length === 0) {
    errors.push('Select at least one event.')
  }

  const { headers, errors: headerErrors } = parseHeadersText(draft.headersText)
  errors.push(...headerErrors)

  const maxAttempts = parseRetryNumber(draft.webhook.retry?.maxAttempts, 3)
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    errors.push('Retry attempts must be an integer between 1 and 10.')
  }

  const backoffMs = parseRetryNumber(draft.webhook.retry?.backoffMs, 250)
  if (!Number.isInteger(backoffMs) || backoffMs < 0 || backoffMs > 60000) {
    errors.push('Retry backoff must be an integer between 0 and 60000 ms.')
  }

  const normalized: DaemonOutboundWebhookConfig = {
    enabled: draft.webhook.enabled === false ? false : true,
    url,
    events,
    headers,
    retry: {
      maxAttempts,
      backoffMs,
    },
  }
  const secret = draft.webhook.secret?.trim()
  if (secret) {
    normalized.secret = secret
  }

  return {
    errors,
    normalized: errors.length === 0 ? normalized : undefined,
  }
}

function shortId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}...` : value
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed).toLocaleString()
}

function describeSecret(
  webhook: DaemonOutboundWebhookConfig,
  headersText: string,
): string {
  const headerCount = Object.keys(parseHeadersText(headersText).headers).length
  if (webhook.secret === REDACTED_SECRET) {
    return `secret configured · ${headerCount} header${headerCount === 1 ? '' : 's'}`
  }
  if (webhook.secret?.trim()) {
    return `secret will be signed · ${headerCount} header${headerCount === 1 ? '' : 's'}`
  }
  return `no signing secret · ${headerCount} header${headerCount === 1 ? '' : 's'}`
}

export function OutboundHooksSettingsTab() {
  const transport = useTransport()
  const [drafts, setDrafts] = useState<OutboundWebhookDraft[]>([])
  const [summaries, setSummaries] = useState<DaemonOutboundWebhookSummary[]>([])
  const [deliveries, setDeliveries] = useState<DaemonOutboundWebhookDelivery[]>([])
  const [deadLetters, setDeadLetters] = useState<DaemonOutboundWebhookDeadLetter[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  async function fetchState(): Promise<OutboundHookState> {
    const api = await createOutboundHooksApi(transport)
    const [configured, nextSummaries, nextDeliveries, nextDeadLetters] =
      await Promise.all([
        api.listConfig(),
        api.list(),
        api.deliveries({ limit: 50 }),
        api.deadLetters({ state: 'all', limit: 50 }),
      ])
    return {
      drafts: configured.map(buildDraft),
      summaries: nextSummaries,
      deliveries: nextDeliveries,
      deadLetters: nextDeadLetters,
    }
  }

  function applyState(next: OutboundHookState): void {
    setDrafts(next.drafts)
    setSummaries(next.summaries)
    setDeliveries(next.deliveries)
    setDeadLetters(next.deadLetters)
    setSelectedDraftId((current) => {
      if (current && next.drafts.some((draft) => draft.localId === current)) {
        return current
      }
      return next.drafts[0]?.localId ?? null
    })
  }

  async function refresh(showSpinner = false): Promise<void> {
    if (showSpinner) setLoading(true)
    try {
      applyState(await fetchState())
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    async function load(): Promise<void> {
      try {
        const next = await fetchState()
        if (!cancelled) applyState(next)
      } catch (error) {
        if (!cancelled) {
          const friendly = explainChatStreamError(error)
          toast.error(friendly.title, { description: friendly.description })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [transport])

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.localId === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  )

  const selectedValidation = useMemo(
    () => (selectedDraft ? validateDraft(selectedDraft) : null),
    [selectedDraft],
  )

  const selectedSummary = useMemo(() => {
    if (!selectedDraft) return undefined
    return summaries.find((summary) => summary.url === selectedDraft.persistedUrl)
      ?? summaries.find((summary) => summary.url === selectedDraft.webhook.url.trim())
  }, [selectedDraft, summaries])

  const visibleDeliveries = useMemo(() => {
    const id = selectedSummary?.id
    return deliveries.filter((delivery) => !id || delivery.webhookId === id).slice(0, 10)
  }, [deliveries, selectedSummary])

  const visibleDeadLetters = useMemo(() => {
    const id = selectedSummary?.id
    return deadLetters.filter((entry) => !id || entry.webhookId === id).slice(0, 10)
  }, [deadLetters, selectedSummary])

  function updateSelectedDraft(
    updater: (draft: OutboundWebhookDraft) => OutboundWebhookDraft,
  ): void {
    if (!selectedDraft) return
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === selectedDraft.localId ? updater(draft) : draft,
      ),
    )
  }

  function addDraft(): void {
    const next = buildEmptyDraft(drafts.length)
    setDrafts((current) => [...current, next])
    setSelectedDraftId(next.localId)
    setActionMessage(null)
  }

  async function saveSelected(): Promise<void> {
    if (!selectedValidation?.normalized) return
    setBusy(true)
    setActionMessage(null)
    try {
      const api = await createOutboundHooksApi(transport)
      await api.upsert(selectedValidation.normalized)
      await refresh()
      setActionMessage('Outbound hook saved.')
      toast.success('Outbound hook saved.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  async function removeSelected(): Promise<void> {
    if (!selectedDraft) return
    if (!selectedSummary) {
      setDrafts((current) => current.filter((draft) => draft.localId !== selectedDraft.localId))
      setSelectedDraftId(drafts.find((draft) => draft.localId !== selectedDraft.localId)?.localId ?? null)
      return
    }
    const ok = await confirm(`Remove outbound hook '${selectedSummary.url}'?`, {
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    setActionMessage(null)
    try {
      const api = await createOutboundHooksApi(transport)
      await api.remove(selectedSummary.id)
      await refresh()
      setActionMessage('Outbound hook removed.')
      toast.success('Outbound hook removed.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  async function toggleSelected(): Promise<void> {
    if (!selectedSummary) return
    setBusy(true)
    setActionMessage(null)
    try {
      const api = await createOutboundHooksApi(transport)
      const enabled = !selectedSummary.enabled
      await api.setEnabled(selectedSummary.id, enabled)
      await refresh()
      setActionMessage(enabled ? 'Outbound hook enabled.' : 'Outbound hook disabled.')
      toast.success(enabled ? 'Outbound hook enabled.' : 'Outbound hook disabled.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  async function replayDelivery(deliveryId: string, force = false): Promise<void> {
    setBusy(true)
    setActionMessage(null)
    try {
      const api = await createOutboundHooksApi(transport)
      const replay = await api.replay(deliveryId, { force })
      await refresh()
      setActionMessage(`Replay queued: ${shortId(replay.deliveryId)}`)
      toast.success('Replay queued.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  async function ackDeadLetter(rootDeliveryId: string): Promise<void> {
    setBusy(true)
    setActionMessage(null)
    try {
      const api = await createOutboundHooksApi(transport)
      await api.ack(rootDeliveryId)
      await refresh()
      setActionMessage(`Dead letter acknowledged: ${shortId(rootDeliveryId)}`)
      toast.success('Dead letter acknowledged.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusy(false)
    }
  }

  function toggleEvent(event: DaemonOutboundWebhookEvent, checked: boolean): void {
    updateSelectedDraft((draft) => {
      const current = new Set(draft.webhook.events)
      if (checked) current.add(event)
      else current.delete(event)
      return {
        ...draft,
        webhook: {
          ...draft.webhook,
          events: [...current],
        },
      }
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  }

  const canSave = Boolean(selectedValidation?.normalized && !busy)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Outbound Hooks</h3>
          <p className="text-xs text-muted-foreground">
            daemon hook event delivery, replay, dead-letter acknowledgement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh(true)}
            disabled={busy}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
          <Button size="sm" onClick={addDraft} disabled={busy}>
            <Plus className="mr-1 h-4 w-4" />
            추가
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-2 rounded-md border border-border p-2">
          {drafts.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              등록된 outbound hook이 없습니다.
            </p>
          ) : (
            drafts.map((draft) => {
              const summary = summaries.find((entry) => entry.url === draft.persistedUrl)
                ?? summaries.find((entry) => entry.url === draft.webhook.url.trim())
              const validation = validateDraft(draft)
              return (
                <button
                  key={draft.localId}
                  type="button"
                  onClick={() => setSelectedDraftId(draft.localId)}
                  className={
                    draft.localId === selectedDraftId
                      ? 'rounded-md bg-accent p-2 text-left'
                      : 'rounded-md p-2 text-left hover:bg-accent/60'
                  }
                >
                  <span className="block truncate text-xs font-medium">
                    {draft.webhook.url.trim() || 'New outbound hook'}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {summary ? summary.id : 'draft'}
                    {' · '}
                    {summary ? (summary.enabled ? 'enabled' : 'disabled') : 'unsaved'}
                    {validation.errors.length > 0 ? ` · ${validation.errors.length} issue` : ''}
                  </span>
                </button>
              )
            })
          )}
        </aside>

        <section className="min-w-0 rounded-md border border-border p-3">
          {selectedDraft && selectedValidation ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold">
                    {selectedDraft.webhook.url.trim() || 'New outbound hook'}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {describeSecret(selectedDraft.webhook, selectedDraft.headersText)}
                  </p>
                </div>
                <span
                  className={
                    selectedSummary?.enabled
                      ? 'rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-600 dark:text-emerald-400'
                      : 'rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground'
                  }
                >
                  {selectedSummary
                    ? selectedSummary.enabled
                      ? 'enabled'
                      : 'disabled'
                    : 'draft'}
                </span>
              </div>

              {selectedSummary ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Hook ID
                    </div>
                    <div className="truncate text-xs font-medium">
                      {selectedSummary.id}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Events
                    </div>
                    <div className="truncate text-xs font-medium">
                      {selectedSummary.events.join(', ')}
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Retry
                    </div>
                    <div className="truncate text-xs font-medium">
                      {selectedSummary.retry.maxAttempts} attempts · {selectedSummary.retry.backoffMs} ms
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Security
                    </div>
                    <div className="truncate text-xs font-medium">
                      {selectedSummary.hasSecret ? 'secret' : 'no secret'}
                      {' · '}
                      {selectedSummary.headerKeys.length} headers
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs md:col-span-2">
                  Delivery URL
                  <Input
                    value={selectedDraft.webhook.url}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        webhook: {
                          ...draft.webhook,
                          url: event.target.value,
                        },
                      }))
                    }
                    placeholder="https://example.com/hooks/sepilot"
                    aria-label="Outbound hook delivery url"
                    disabled={busy}
                  />
                </label>

                <div className="flex flex-col gap-1 text-xs">
                  <SecretStatusField
                    label="Signing Secret"
                    isSet={
                      selectedSummary
                        ? selectedSummary.hasSecret
                        : Boolean(
                            selectedDraft.webhook.secret &&
                              selectedDraft.webhook.secret !== REDACTED_SECRET,
                          )
                    }
                    hint="HMAC 서명에 사용할 secret. 비우면 서명 없이 전송."
                    busy={busy}
                    submitLabel="확인"
                    busyLabel="확인 중…"
                    placeholder="shared-secret"
                    disabled={busy}
                    onRotate={(next) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        webhook: {
                          ...draft.webhook,
                          secret: next,
                        },
                      }))
                    }
                    onClear={
                      selectedSummary?.hasSecret
                        ? () =>
                            updateSelectedDraft((draft) => ({
                              ...draft,
                              webhook: {
                                ...draft.webhook,
                                secret: '',
                              },
                            }))
                        : undefined
                    }
                  />
                </div>

                <label className="flex flex-col gap-1 text-xs">
                  Enabled
                  <select
                    value={selectedDraft.webhook.enabled === false ? 'false' : 'true'}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        webhook: {
                          ...draft.webhook,
                          enabled: event.target.value === 'true',
                        },
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-xs"
                    aria-label="Outbound hook enabled"
                    disabled={busy}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Retry Attempts
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={selectedDraft.webhook.retry?.maxAttempts ?? 3}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        webhook: {
                          ...draft.webhook,
                          retry: {
                            ...draft.webhook.retry,
                            maxAttempts: Number.parseInt(event.target.value, 10),
                          },
                        },
                      }))
                    }
                    aria-label="Outbound hook retry attempts"
                    disabled={busy}
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Backoff Ms
                  <Input
                    type="number"
                    min={0}
                    max={60000}
                    value={selectedDraft.webhook.retry?.backoffMs ?? 250}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        webhook: {
                          ...draft.webhook,
                          retry: {
                            ...draft.webhook.retry,
                            backoffMs: Number.parseInt(event.target.value, 10),
                          },
                        },
                      }))
                    }
                    aria-label="Outbound hook retry backoff"
                    disabled={busy}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="text-xs font-medium">Events</div>
                  {OUTBOUND_WEBHOOK_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedDraft.webhook.events.includes(event)}
                        onChange={(inputEvent) =>
                          toggleEvent(event, inputEvent.target.checked)
                        }
                        disabled={busy}
                      />
                      {event}
                    </label>
                  ))}
                </div>

                <label className="flex flex-col gap-1 text-xs">
                  Custom Headers
                  <textarea
                    rows={7}
                    value={selectedDraft.headersText}
                    onChange={(event) =>
                      updateSelectedDraft((draft) => ({
                        ...draft,
                        headersText: event.target.value,
                      }))
                    }
                    placeholder={'X-Webhook-Source=sepilot\nX-Environment=prod'}
                    spellCheck={false}
                    className="rounded-md border border-input bg-transparent p-2 font-mono text-[11px]"
                    aria-label="Outbound hook headers"
                    disabled={busy}
                  />
                </label>
              </div>

              {selectedValidation.errors.length > 0 ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
                  {selectedValidation.errors.map((error) => (
                    <p key={error} className="text-xs text-destructive">
                      {error}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleSelected()}
                  disabled={!selectedSummary || busy}
                >
                  {selectedSummary?.enabled ? (
                    <PowerOff className="mr-1 h-4 w-4" />
                  ) : (
                    <Power className="mr-1 h-4 w-4" />
                  )}
                  {selectedSummary?.enabled ? '비활성' : '활성'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void removeSelected()}
                  disabled={busy}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  삭제
                </Button>
                <Button
                  size="sm"
                  onClick={() => void saveSelected()}
                  disabled={!canSave}
                >
                  <Save className="mr-1 h-4 w-4" />
                  {busy ? '저장 중...' : '저장'}
                </Button>
              </div>

              {actionMessage ? (
                <p className="text-xs text-muted-foreground">{actionMessage}</p>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <div>
                    <h4 className="text-xs font-semibold">Recent Deliveries</h4>
                    <p className="text-[11px] text-muted-foreground">
                      selected hook 기준 최근 delivery records.
                    </p>
                  </div>
                  {visibleDeliveries.length === 0 ? (
                    <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                      delivery 기록이 없습니다.
                    </p>
                  ) : (
                    visibleDeliveries.map((delivery) => (
                      <article
                        key={delivery.deliveryId}
                        className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {delivery.hookEvent}
                            </span>
                            <span
                              className={
                                delivery.deliveryStatus === 'success'
                                  ? 'text-[10px] text-emerald-600 dark:text-emerald-400'
                                  : 'text-[10px] text-destructive'
                              }
                            >
                              {delivery.deliveryStatus}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {shortId(delivery.deliveryId)} · {formatTimestamp(delivery.timestamp)} · {delivery.attemptCount} attempts
                          </p>
                          {delivery.error ? (
                            <p className="truncate text-[11px] text-destructive">
                              {delivery.error}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void replayDelivery(
                              delivery.deliveryId,
                              delivery.deliveryStatus === 'success',
                            )
                          }
                          disabled={busy}
                          aria-label={`Replay delivery ${delivery.deliveryId}`}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" />
                          Replay
                        </Button>
                      </article>
                    ))
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <h4 className="text-xs font-semibold">Dead Letters</h4>
                    <p className="text-[11px] text-muted-foreground">
                      실패 chain을 replay하거나 운영자 확인으로 ack 처리합니다.
                    </p>
                  </div>
                  {visibleDeadLetters.length === 0 ? (
                    <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                      dead letter가 없습니다.
                    </p>
                  ) : (
                    visibleDeadLetters.map((deadLetter) => (
                      <article
                        key={deadLetter.rootDeliveryId}
                        className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {deadLetter.hookEvent}
                            </span>
                            <span
                              className={
                                deadLetter.state === 'open'
                                  ? 'text-[10px] text-destructive'
                                  : 'text-[10px] text-muted-foreground'
                              }
                            >
                              {deadLetter.state}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            root {shortId(deadLetter.rootDeliveryId)} · latest {shortId(deadLetter.latestDeliveryId)} · {formatTimestamp(deadLetter.lastAttemptAt)}
                          </p>
                          {deadLetter.error ? (
                            <p className="truncate text-[11px] text-destructive">
                              {deadLetter.error}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void replayDelivery(deadLetter.latestDeliveryId)}
                            disabled={busy}
                            aria-label={`Replay dead letter ${deadLetter.rootDeliveryId}`}
                          >
                            <Play className="mr-1 h-3.5 w-3.5" />
                            Replay
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void ackDeadLetter(deadLetter.rootDeliveryId)}
                            disabled={busy || deadLetter.state !== 'open'}
                            aria-label={`Acknowledge dead letter ${deadLetter.rootDeliveryId}`}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                            Ack
                          </Button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm font-medium">No outbound hook selected.</p>
              <Button size="sm" onClick={addDraft}>
                <Plus className="mr-1 h-4 w-4" />
                추가
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
