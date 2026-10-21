'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Inbox } from 'lucide-react'
import type { SessionInboxItem } from '@sepilotd/api-client'
import { Button } from '@/components/ui/button'
import type { BackgroundWorkApi } from '@/lib/api/background-work'

const MAX_TEXT_CHARS = 400

function plainPreview(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TEXT_CHARS ? `${flat.slice(0, MAX_TEXT_CHARS - 1)}…` : flat
}

export function SessionInboxStrip({
  api,
  sessionId,
  pollMs = 5000,
  onOpenSession,
}: {
  api: Pick<BackgroundWorkApi, 'listInbox' | 'acknowledgeInbox'> & Partial<Pick<BackgroundWorkApi, 'openInboxResult'>> | null
  sessionId: string | null
  pollMs?: number
  onOpenSession?: (sessionId: string) => void
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<SessionInboxItem[]>([])
  const [hiddenThroughSeq, setHiddenThroughSeq] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeSessionRef = useRef(sessionId)
  activeSessionRef.current = sessionId

  const load = useCallback(async () => {
    if (!api || !sessionId) return
    try {
      const next = await api.listInbox(sessionId)
      if (activeSessionRef.current === sessionId) setItems(next)
    } catch {
      if (activeSessionRef.current === sessionId) setItems([])
    }
  }, [api, sessionId])

  useEffect(() => {
    setItems([])
    setHiddenThroughSeq(0)
    setError(null)
    if (!api || !sessionId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') await load()
      if (!stopped) timer = setTimeout(() => void tick(), pollMs)
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      clearTimeout(timer)
      void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api, load, pollMs, sessionId])

  const acknowledge = async (targets: SessionInboxItem[]) => {
    if (!api || !sessionId) return
    setBusy(true)
    setError(null)
    try {
      for (const item of targets) await api.acknowledgeInbox(sessionId, item.seq)
      const done = new Set(targets.map((item) => item.seq))
      setItems((current) => current.filter((item) => !done.has(item.seq)))
    } catch (caught) {
      setError(
        t('backgroundWork.inbox.failed', {
          message: caught instanceof Error ? caught.message : String(caught),
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const openResult = async (item: SessionInboxItem) => {
    if (!api?.openInboxResult || !sessionId || !onOpenSession) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.openInboxResult(sessionId, item.seq)
      onOpenSession(result.sessionId)
    } catch (caught) {
      setError(t('backgroundWork.inbox.failed', { message: caught instanceof Error ? caught.message : String(caught) }))
    } finally { setBusy(false) }
  }

  const visible = items.filter((item) => item.seq > hiddenThroughSeq)
  if (!api || !sessionId || visible.length === 0) return null

  return (
    <section
      className="rounded-md border border-sky-500/30 bg-sky-500/[0.05] px-2.5 py-2 text-[11px]"
      aria-label={t('backgroundWork.inbox.title', { count: visible.length })}
      data-testid="session-inbox-strip"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Inbox className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
        <strong className="font-medium">{t('backgroundWork.inbox.title', { count: visible.length })}</strong>
        <span className="text-[10px] text-muted-foreground">{t('backgroundWork.inbox.untrusted')}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy} onClick={() => void acknowledge(visible)}>
            {t('backgroundWork.inbox.acknowledgeAll')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={() => setHiddenThroughSeq(Math.max(...visible.map((item) => item.seq)))}
          >
            {t('backgroundWork.inbox.hide')}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="mt-1 text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-1.5 grid max-h-40 gap-1 overflow-auto">
        {visible.map((item) => (
          <li key={item.seq} className="flex min-w-0 items-start gap-2" data-seq={item.seq}>
            <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
              {t(`backgroundWork.inbox.source.${item.source}`, { defaultValue: item.source })}
            </span>
            <span className="grid min-w-0 flex-1 break-words">
              <span className="text-foreground">{plainPreview(item.title)}</span>
              {item.body ? <span className="text-muted-foreground">{plainPreview(item.body)}</span> : null}
            </span>
            {onOpenSession && api.openInboxResult ? (
              <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" disabled={busy} onClick={() => void openResult(item)}>
                {t('backgroundWork.inbox.openResult')}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 px-2 text-[10px]"
              disabled={busy}
              onClick={() => void acknowledge([item])}
            >
              {t('backgroundWork.inbox.acknowledge')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
