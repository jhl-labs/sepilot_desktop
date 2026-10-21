'use client'
import { useEffect, useRef, useState } from 'react'
import { FrameViewer } from '@sepilotd/presentation'
import type { LiveViewRecord } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { createLiveViewApi } from '@/lib/api/live-view'

interface LiveViewCardProps {
  view: LiveViewRecord
  live: boolean
  sessionId: string
  connectionId?: string
  controller?: 'agent' | 'human'
}

const KIND_LABEL: Record<LiveViewRecord['kind'], string> = {
  browser_tab: '브라우저 탭',
  embedded_browser: '내장 브라우저',
  screen: '화면',
  app_window: '앱 창',
}

export function LiveViewCard({ view, live, sessionId, connectionId, controller }: LiveViewCardProps) {
  const transport = useTransport()
  const [frame, setFrame] = useState<string | undefined>(view.still.image || undefined)
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'agent' | 'human'>(controller ?? 'agent')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMode(controller ?? 'agent') }, [controller])
  useEffect(() => { if (view.still.image) setFrame(view.still.image) }, [view.still.image])
  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!live || !(visible || open)) return
    let stop = () => {}
    let cancelled = false
    void createLiveViewApi(transport)
      .then((api) => {
        if (cancelled) return
        stop = api.frames(view.id, (next) => setFrame(next.image))
      })
      .catch(() => {
      })
    return () => { cancelled = true; stop() }
  }, [live, visible, open, transport, view.id])

  const toggleControl = async () => {
    if (!connectionId) return
    const next = mode === 'agent' ? 'human' : 'agent'
    try {
      await (await createLiveViewApi(transport)).control(connectionId, sessionId, next)
      setMode(next)
    } catch {
    }
  }

  return (
    <div ref={rootRef} className="my-2 inline-block w-60 overflow-hidden rounded-md border border-border bg-muted/30" data-testid="live-view-card">
      <button type="button" aria-label={`${view.title} 확대`} onClick={() => setOpen(true)} className="block w-full text-left">
        {frame ? <img src={frame} alt={view.title} className="h-36 w-full object-cover object-top" /> : <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">프레임 대기 중</div>}
        <div className="flex items-center gap-1 px-2 py-1 text-[11px]">
          <span className={live ? 'rounded bg-red-500/80 px-1 text-white' : 'rounded bg-muted px-1'}>{live ? 'LIVE' : '정지'}</span>
          <span className="truncate font-medium">{view.title}</span>
          <span className="ml-auto text-muted-foreground">{KIND_LABEL[view.kind]}{live ? ` · ${mode === 'agent' ? '에이전트' : '사용자'}` : ''}</span>
        </div>
      </button>
      <FrameViewer
        open={open}
        title={view.title}
        subtitle={view.subtitle}
        src={frame}
        live={live}
        onClose={() => setOpen(false)}
        labels={{ close: '닫기', waiting: '프레임 대기 중' }}
        classNames={{ root: 'fixed inset-0 z-50 flex flex-col bg-black/90', header: 'flex h-10 items-center gap-3 px-3 text-xs text-white/80', body: 'min-h-0 flex-1 overflow-auto p-2', image: 'mx-auto max-h-[calc(100dvh-5.5rem)] max-w-full object-contain', closeButton: 'ml-auto rounded px-2 text-white/70 hover:bg-white/10' }}
        actions={connectionId ? <button type="button" onClick={toggleControl} className="rounded border border-white/30 px-2 py-0.5">{mode === 'agent' ? '내가 제어' : '에이전트에게 돌려주기'}</button> : null}
      />
    </div>
  )
}
