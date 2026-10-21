'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Grip, PawPrint, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { DEFAULT_PET, normalizePet, petMood, PET_KEY, type PetConfig } from '@/lib/pet/model'
import { PetAvatar } from './PetAvatar'
import { PetStudio } from './PetStudio'
import { useNativePetWindow } from './useNativePetWindow'
import { invokeDesktop, onDesktopChannel } from '@/lib/electron/bridge'
import styles from './PetCompanion.module.css'
import type { PetAssistantActions, PetRequestMode } from '@/lib/pet/assistant'
import {
  currentPetAssistantReply,
  PET_STREAM_UPDATE_INTERVAL_MS,
} from '@/lib/pet/response-stream'

const BUBBLE_GAP_PX = 8

export function PetCompanion({ actions }: { actions?: PetAssistantActions } = {}) {
  const [config, setConfig] = useState<PetConfig>(DEFAULT_PET)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<'design' | 'chat'>('design')
  const [chatDraft, setChatDraft] = useState('')
  const [draftMode, setDraftMode] = useState<PetRequestMode>('continue')
  const [draftSessionId, setDraftSessionId] = useState<string | undefined>()
  const [announcement, setAnnouncement] = useState('')
  const [bubble, setBubble] = useState(false)
  const [bubblePoint, setBubblePoint] = useState({ x: 8, bottom: 56 })
  const [reacting, setReacting] = useState(false)
  const [resting, setResting] = useState(false)
  const [error, setError] = useState('')
  const [position, setPosition] = useState<PetConfig['position'] | null>(null)
  const pending = useChatStore((state) => state.pending)
  const assistantReply = useChatStore((state) => currentPetAssistantReply(state.messages))
  const approvals = useChatStore((state) => state.pendingApprovals.length + (state.pendingQuestion ? 1 : 0))
  const session = useSessionStore((state) => state.activeId)
  const previous = useRef({ pending, session, approvals })
  const responseStreamId = useRef('')
  const nativeStreamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuedNativeSpeech = useRef<Record<string, unknown> | null>(null)
  const launcher = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const nativeSource = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const livePosition = useRef(config.position)
  const mood = petMood(pending, approvals, resting, reacting)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PET_KEY)
      if (saved) setConfig(normalizePet(JSON.parse(saved)))
    } catch {
      setError('저장된 펫 설정을 읽을 수 없어 기본 설정을 사용합니다.')
    }
    setReady(true)
    const sync = (event: StorageEvent) => {
      if (event.key !== PET_KEY) return
      try {
        setConfig(event.newValue ? normalizePet(JSON.parse(event.newValue)) : DEFAULT_PET)
      } catch {
        setError('다른 창의 펫 설정을 읽을 수 없습니다.')
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const save = useCallback((value: PetConfig) => {
    try {
      const next = normalizePet(value)
      localStorage.setItem(PET_KEY, JSON.stringify(next))
      setConfig(next)
      setError('')
      return true
    } catch {
      setError(
        '설정을 저장할 공간이 부족하거나 저장소를 사용할 수 없습니다. 이미지 수를 줄이거나 설정을 내보내 주세요.',
      )
      return false
    }
  }, [])
  useEffect(() => {
    if (!reacting) return
    const timer = setTimeout(() => setReacting(false), 4000)
    return () => clearTimeout(timer)
  }, [reacting])
  useEffect(() => {
    setResting(false)
    if (!config.enabled || pending || open || reacting) return
    const timer = setTimeout(() => setResting(true), 60_000)
    return () => clearTimeout(timer)
  }, [config.enabled, pending, open, reacting])
  useEffect(() => {
    if (!bubble) return
    const timer = setTimeout(() => setBubble(false), 5000)
    return () => clearTimeout(timer)
  }, [bubble, announcement])
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        launcher.current?.focus()
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])
  const native = useNativePetWindow(config, mood, ready, nativeSource, setError)
  useEffect(() => () => {
    if (nativeStreamTimer.current) clearTimeout(nativeStreamTimer.current)
  }, [])
  useEffect(() => {
    const before = previous.current
    previous.current = { pending, session, approvals }
    if (before.session !== session) {
      setAnnouncement('')
      setBubble(false)
      if (native && responseStreamId.current) {
        void invokeDesktop('sepilot:pet/say', {
          id: responseStreamId.current,
          text: '다른 대화로 이동했어요. 이전 작업의 진행 상황은 해당 대화에서 확인해 주세요.',
          sessionId: before.session,
          streaming: false,
        }).catch(() => {})
      }
      responseStreamId.current = ''
      queuedNativeSpeech.current = null
      if (nativeStreamTimer.current) clearTimeout(nativeStreamTimer.current)
      nativeStreamTimer.current = null
      return
    }
    if (!ready || !config.enabled) return
    const approvalStarted = approvals > before.approvals
    if (pending && approvals === 0 && !responseStreamId.current) responseStreamId.current = `chat:${crypto.randomUUID()}`
    const completed = before.pending && !pending
    const text = approvalStarted
      ? config.phrases.waiting
      : pending && approvals === 0
        ? '응답을 준비하고 있어요…'
        : completed
          ? assistantReply.slice(0, 100_000) || config.phrases.happy
          : ''
    if (!text) {
      if (pending) {
        queuedNativeSpeech.current = null
        if (nativeStreamTimer.current) clearTimeout(nativeStreamTimer.current)
        nativeStreamTimer.current = null
      }
      return
    }
    setReacting(true)
    if (native) {
      const speech = {
        id: responseStreamId.current || `approval:${crypto.randomUUID()}`,
        text,
        sessionId: session,
        streaming: pending && !approvalStarted,
      }
      const deliver = (payload: Record<string, unknown>) => {
        void invokeDesktop('sepilot:pet/say', payload).catch(() =>
          setError('펫 알림을 표시하지 못했습니다. 앱을 재시작해 주세요.'),
        )
      }
      if (speech.streaming) {
        queuedNativeSpeech.current = speech
        if (!nativeStreamTimer.current) {
          nativeStreamTimer.current = setTimeout(() => {
            nativeStreamTimer.current = null
            const queued = queuedNativeSpeech.current
            queuedNativeSpeech.current = null
            if (queued) deliver(queued)
          }, PET_STREAM_UPDATE_INTERVAL_MS)
        }
      } else {
        if (nativeStreamTimer.current) clearTimeout(nativeStreamTimer.current)
        nativeStreamTimer.current = null
        queuedNativeSpeech.current = null
        deliver(speech)
      }
    } else {
      setAnnouncement(text)
      const petTop = Math.max(
        44,
        Math.min(window.innerHeight - config.size - 54, config.position.y * window.innerHeight),
      )
      setBubblePoint({
        x: Math.max(
          8,
          Math.min(window.innerWidth - 188, config.position.x * window.innerWidth - 40),
        ),
        bottom: Math.max(8, window.innerHeight - petTop + BUBBLE_GAP_PX),
      })
      setBubble(true)
    }
    if (completed || approvalStarted) responseStreamId.current = ''
  }, [pending, session, approvals, assistantReply, ready, config, native])
  useEffect(() => {
    if (!native) return
    const report = (text: string) => {
      setError(text)
      void invokeDesktop('sepilot:pet/say', { id: `error:${crypto.randomUUID()}`, text: text.slice(0, 100_000) }).catch(() => {})
    }
    return onDesktopChannel<string>('sepilot:pet/action', (action) => {
      if (action === 'status') {
        const state = useChatStore.getState()
        const waiting = state.pendingApprovals.length > 0 || state.pendingQuestion !== null
        const reply = currentPetAssistantReply(state.messages)
        const status = waiting ? '확인이 필요한 요청이 있어요.' : state.pending ? '현재 작업을 진행 중이에요.' : '현재 실행 중인 대화는 없어요.'
        void invokeDesktop('sepilot:pet/say', {
          id: `status:${crypto.randomUUID()}`,
          text: `${status}${reply ? '\n\n최근 응답\n' + reply : ''}`.slice(0, 100_000),
          sessionId: useSessionStore.getState().activeId,
        }).catch(() => setError('진행 상황을 표시하지 못했습니다.'))
      }
      if (action === 'studio' || action === 'chat') {
        setInitialTab(action === 'chat' ? 'chat' : 'design')
        setOpen(true)
      }
      if (action.startsWith('message:')) {
        try {
          const request = JSON.parse(action.slice(8))
          if (request.mode !== undefined && request.mode !== 'continue' && request.mode !== 'web-search') return
          if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 2000) return
          if (request.sessionId != null && (typeof request.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(request.sessionId))) return
          if (chatDraft.trim()) {
            report(`작성 중인 펫 요청이 있어요. 우클릭 메뉴에서 설정을 열어 확인해 주세요. 새로 받은 요청: ${request.text}`)
            setInitialTab('chat')
            setOpen(true)
            return
          }
          setDraftMode(request.mode ?? 'continue')
          setChatDraft(request.text)
          setDraftSessionId(request.sessionId ?? undefined)
          if (!actions) throw new Error('비서 대화를 사용할 수 없습니다.')
          void actions.send(request.text, config, request.sessionId ?? undefined, request.mode).then(() => {
            setChatDraft('')
            setDraftMode('continue')
            setDraftSessionId(undefined)
            setOpen(false)
          }).catch(error => {
            report(error instanceof Error ? error.message : '비서 요청을 전달하지 못했습니다.')
            setInitialTab('chat')
            setOpen(true)
          })
        } catch (error) {
          report(error instanceof Error ? error.message : '펫 요청을 읽지 못했습니다.')
        }
      }
      if (action === 'hide') save({ ...config, enabled: false })
    })
  }, [native, config, save, actions, chatDraft])
  if (!ready) return null
  const point = position ?? config.position
  const phrase = mood === 'sleeping' ? '잠깐 쉬고 있어요…' : config.phrases[mood]
  return (
    <>
      <div ref={nativeSource} hidden aria-hidden="true">
        <PetAvatar config={{ ...config, images: {} }} mood={mood} />
      </div>
      {config.enabled && !native && (
        <div
          className={styles.pet}
          style={{
            width: config.size,
            left: `clamp(8px, ${point.x * 100}vw, calc(100vw - ${config.size + 8}px))`,
            top: `clamp(44px, ${point.y * 100}vh, calc(100vh - ${config.size + 54}px))`,
          }}
        >
          {bubble && (
            <div
              className={styles.bubble}
              role="status"
              data-streaming={pending && Boolean(announcement)}
              style={{ left: bubblePoint.x, bottom: bubblePoint.bottom }}
            >
              {announcement || phrase}
            </div>
          )}
          <button
            type="button"
            className={styles.avatar}
            aria-label={`${config.name}, 클릭해서 인사하기`}
            data-mood={mood}
            data-motion={config.motion && !open}
            style={{ height: config.size }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setBubblePoint({
                x: Math.max(8, Math.min(window.innerWidth - 188, rect.left - 40)),
                bottom: Math.max(8, window.innerHeight - rect.top + BUBBLE_GAP_PX),
              })
              setAnnouncement('')
              setResting(false)
              setReacting(true)
              setBubble(true)
            }}
            onDoubleClick={() => { setInitialTab('chat'); setOpen(true) }}
          >
            <PetAvatar config={config} mood={mood} />
          </button>
          <button
            type="button"
            className={styles.handle}
            aria-label="펫 위치 이동: 드래그 또는 방향키"
            title="드래그 또는 방향키로 이동"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              setBubble(false)
              event.currentTarget.setPointerCapture(event.pointerId)
              const rect = event.currentTarget.parentElement!.getBoundingClientRect()
              drag.current = { x: event.clientX, y: event.clientY, px: rect.left, py: rect.top }
              livePosition.current = config.position
            }}
            onPointerMove={(event) => {
              if (!drag.current) return
              const x = Math.max(
                8,
                Math.min(
                  window.innerWidth - config.size - 8,
                  drag.current.px + event.clientX - drag.current.x,
                ),
              )
              const y = Math.max(
                44,
                Math.min(
                  window.innerHeight - config.size - 54,
                  drag.current.py + event.clientY - drag.current.y,
                ),
              )
              livePosition.current = { x: x / window.innerWidth, y: y / window.innerHeight }
              setPosition(livePosition.current)
            }}
            onPointerUp={() => {
              if (!drag.current) return
              drag.current = null
              save({ ...config, position: livePosition.current })
              setPosition(null)
            }}
            onPointerCancel={() => {
              drag.current = null
              setPosition(null)
            }}
            onKeyDown={(event) => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }
              const delta = directions[event.key]
              if (!delta) return
              event.preventDefault()
              save({
                ...config,
                position: {
                  x: config.position.x + delta[0] * 0.02,
                  y: config.position.y + delta[1] * 0.02,
                },
              })
            }}
          >
            <Grip size={12} />
          </button>
        </div>
      )}
      <Button
        ref={launcher}
        className={styles.launcher}
        size="icon"
        variant="outline"
        title="펫 스튜디오"
        aria-label="펫 스튜디오"
        aria-expanded={open}
        aria-controls="pet-studio"
        onClick={() => { setInitialTab('design'); setOpen((value) => !value) }}
      >
        <PawPrint size={18} />
      </Button>
      {open && (
        <section ref={panel} id="pet-studio" aria-label="펫 스튜디오" className={styles.studio}>
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">펫 스튜디오</h2>
              <p className="text-xs text-muted-foreground">외형도, 성격도 나답게</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="펫 스튜디오 닫기"
              onClick={() => {
                setOpen(false)
                launcher.current?.focus()
              }}
            >
              <X size={16} />
            </Button>
          </header>
          {error && (
            <p role="alert" className="mb-3 text-xs text-destructive">
              {error}
            </p>
          )}
          <PetStudio config={config} save={save} initialTab={initialTab} chatDraft={chatDraft} onChatDraftChange={setChatDraft} replyTitle={draftSessionId ? useSessionStore.getState().sessions.find(item => item.id === draftSessionId)?.title ?? draftSessionId : undefined} onNewRequest={() => { setDraftSessionId(undefined); setDraftMode('continue') }} actions={actions ? {
            send: async (text, config) => { await actions.send(text, config, draftSessionId, draftMode); setDraftSessionId(undefined); setOpen(false) },
            resume: async config => { await actions.resume(config); setOpen(false) },
            openResource: view => { actions.openResource(view); setOpen(false) },
          } : undefined} />
        </section>
      )}
    </>
  )
}
