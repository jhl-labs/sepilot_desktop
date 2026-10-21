'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isAppReferencePosition } from '@sepilotd/api-client'
import { Button } from '@/components/ui/button'
import { DollarPalette } from '@/components/chat/DollarPalette'
import { useDollarApps } from '@/lib/hooks/use-dollar-apps'
import { dollarChoices, type DollarChoice } from '@/lib/chat/dollar-choices'
import { detectSigilTokenAtCaret } from '@/lib/chat/sigil-token'
import { useChatStore } from '@/lib/store/chat-store'
import { desktopFeatures } from '@/lib/feature-profile'
import type { PetConfig } from '@/lib/pet/model'
import type { PetAssistantActions } from '@/lib/pet/assistant'
import { useImeEnterSubmit } from '@/lib/hooks/use-ime-enter-submit'

export function PetChat({ config, actions, input, onInputChange, replyTitle, onNewRequest }: {
  config: PetConfig
  actions?: PetAssistantActions
  input: string
  onInputChange: (value: string) => void
  replyTitle?: string
  onNewRequest?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const anchor = useRef<HTMLFormElement>(null)
  const [token, setToken] = useState<ReturnType<typeof detectSigilTokenAtCaret>>(null)
  const [index, setIndex] = useState(0)
  const apps = useDollarApps(token !== null && desktopFeatures.microApps)
  const choices = useMemo(() => dollarChoices(token?.query ?? '', [], apps.items).filter(item => item.kind === 'app'), [token?.query, apps.items])
  const pending = useChatStore(state => state.pending)
  const waiting = useChatStore(state => state.pendingApprovals.length > 0 || state.pendingQuestion !== null)
  const imeEnter = useImeEnterSubmit((value) => { void send(value) })
  useEffect(() => setIndex(0), [token?.query])
  useEffect(() => setIndex(value => Math.min(value, Math.max(0, choices.length - 1))), [choices.length])

  function refresh(value: string, caret: number) {
    const next = detectSigilTokenAtCaret(value, caret, '$')
    setToken(next && isAppReferencePosition(value, next.start) ? next : null)
  }
  function select(item: DollarChoice) {
    if (!token || !item.appReference) return
    const insert = `${item.appReference} `
    onInputChange(input.slice(0, token.start) + insert + input.slice(token.end))
    const caret = token.start + insert.length
    setToken(null)
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(caret, caret)
    })
  }
  async function send(value = input) {
    const entered = value.trim()
    if (!entered || sending.current || !actions || pending || waiting) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      await actions.send(entered, config)
      onInputChange('')
      setToken(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비서 대화를 시작하지 못했습니다. 다시 보내 주세요.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  async function resume() {
    if (!actions || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try { await actions.resume(config) }
    catch (error) { setError(error instanceof Error ? error.message : '대화를 열지 못했습니다.') }
    finally { sending.current = false; setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">
        {config.name}의 전용 대화와 기억으로 Apps·Memory·Tasks를 활용합니다. 부탁하면 대화창에서 바로 실행하고 승인과 결과를 보여줘요. SEPilot Auto와 설정된 모델을 사용합니다.
      </p>
      <Button type="button" variant="outline" className="w-full" disabled={!actions || busy} onClick={() => void resume()}>
        {waiting ? '확인이 필요한 대화로 돌아가기' : pending ? '진행 중인 대화로 돌아가기' : '비서 대화 이어보기'}
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {replyTitle && <div className="rounded-md border p-2 text-xs"><p>알림의 원래 대화에 답장: {replyTitle}</p><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onNewRequest}>새 펫 요청으로 전환</Button></div>}
      <form ref={anchor} onSubmit={event => { event.preventDefault(); void send() }} className="space-y-2">
        <textarea
          ref={field}
          aria-label="펫에게 보낼 메시지"
          value={input}
          maxLength={2000}
          rows={3}
          disabled={busy}
          onCompositionStart={imeEnter.handleCompositionStart}
          onCompositionEnd={imeEnter.handleCompositionEnd}
          onChange={event => { onInputChange(event.target.value); refresh(event.target.value, event.target.selectionStart) }}
          onSelect={event => refresh(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={event => {
            if (imeEnter.handleKeyDown(event)) return
            if (token) {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setToken(null); return }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex(value => choices.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length : 0)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                if (choices[index]) select(choices[index])
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() }
          }}
          className="w-full resize-y rounded-md border bg-background px-2 py-2 text-sm"
          placeholder="오늘 일정과 할 일을 보고 계획을 세워줘"
        />
        {token && desktopFeatures.microApps && <DollarPalette scope="apps" anchorRef={anchor} items={choices} activeIndex={index} selectedIds={[]} loading={apps.loading} error={apps.error} onSelect={select} onActiveIndexChange={setIndex} />}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">자연스럽게 요청하거나 $todo · $calendar</p>
          <Button type="submit" disabled={!input.trim() || !actions || busy || pending || waiting}>{busy ? '연결 중…' : '부탁하기'}</Button>
        </div>
      </form>
      <nav aria-label="펫 비서 도구" className="flex flex-wrap gap-1 border-t pt-2">
        {([
          ...(desktopFeatures.microApps ? [['office', 'Apps']] as const : []),
          ['memory', '일반 Memory'], ['tasks', 'Tasks'], ['wiki', '문서'],
        ] as const).map(([view, label]) => <Button key={view} type="button" size="sm" variant="ghost" disabled={!actions || busy || pending || waiting} onClick={() => actions?.openResource(view)}>{label}</Button>)}
      </nav>
      <p className="text-xs text-muted-foreground">펫의 기억은 대화에서 조회·수정·삭제를 요청할 수 있어요. 일반 Memory 화면과는 별도로 관리합니다.</p>
    </div>
  )
}
