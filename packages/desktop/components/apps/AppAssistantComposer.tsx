'use client'

import { ArrowUpRight, ChevronDown, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildAppAssistantRequest, type AssistantRequest } from '@/lib/apps/assistant'

export function AppAssistantComposer({ app, value, onChange, onStart, onEdit, onClose, history }: {
  app: { id: string; title: string }
  value: string
  onChange: (value: string) => void
  onStart: (request: AssistantRequest) => void
  onEdit: () => void
  onClose: () => void
  history: readonly { role: string; content: string }[]
}) {
  function submit() {
    if (value.trim()) onStart(buildAppAssistantRequest(value, app, history))
  }
  return (
    <section aria-label="앱에서 비서에게 부탁하기" className="pointer-events-auto w-[min(390px,calc(100vw-3rem))] rounded-xl border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /><span className="truncate">{app.title} · 비서 대화</span></div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="close app chat"><ChevronDown className="h-4 w-4" /></Button>
      </div>
      <form className="space-y-3 p-3" onSubmit={event => { event.preventDefault(); submit() }}>
        <p className="text-xs leading-5 text-muted-foreground">현재 앱을 참고해 다른 앱·Memory·Tasks까지 함께 활용합니다. 기존 비서 대화에서 이어서 확인하고 전송하세요.</p>
        <label htmlFor="app-assistant-request" className="sr-only">비서에게 부탁할 내용</label>
        <textarea id="app-assistant-request" className="min-h-24 w-full resize-y rounded-lg border bg-muted/10 p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} onChange={event => onChange(event.target.value)} placeholder="이 할 일을 내일로 옮기고 연결된 알림도 맞춰줘" onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() }
        }} />
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>앱 편집 대화</Button>
          <Button type="submit" size="sm" disabled={!value.trim()}>비서 대화로 이어가기 <ArrowUpRight className="ml-1 h-4 w-4" /></Button>
        </div>
      </form>
    </section>
  )
}
