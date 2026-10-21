'use client'
import { useEffect, useState } from 'react'
import type { DaemonRoleBot } from '@sepilotd/api-client'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createAgentsApi } from '@/lib/api/agents'
import { useChatModeStore } from '@/lib/store/chat-mode-store'

export function ChatBotPicker({ disabled = false }: { disabled?: boolean }) {
  const transport = useOptionalTransport()
  const bot = useChatModeStore((s) => s.bot)
  const setBot = useChatModeStore((s) => s.setBot)
  const [bots, setBots] = useState<DaemonRoleBot[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setBots([])
    setError('')
    if (transport) void createAgentsApi(transport).then(api => api.bots()).then(items => {
      if (!cancelled) {
        setBots(items)
        useChatModeStore.getState().setBots(items)
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { cancelled = true }
  }, [transport, attempt])
  const selected = bots.find(item => item.id === bot)
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        aria-label="역할 봇"
        title={disabled ? '대화의 페르소나 선택이 적용 중입니다' : selected?.description ?? '자동으로 요청에 맞는 봇을 선택합니다'}
        className="h-6 max-w-40 rounded-md border border-primary/30 bg-background px-1 text-[10px] text-primary"
        value={disabled ? '' : bot ?? ''}
        disabled={disabled}
        onChange={event => setBot(event.target.value || null)}
      >
        <option value="">{disabled ? '대화 페르소나 사용' : '봇: 자동 선택'}</option>
        {bot && !selected ? <option value={bot}>봇: {bot} (목록 확인 필요)</option> : null}
        {[...new Set(bots.map(item => item.category))].map(category => (
          <optgroup key={category} label={category}>
            {bots.filter(item => item.category === category).map(item => (
              <option key={item.id} value={item.id}>{item.name} — {item.description}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {error ? <button type="button" title={error} onClick={() => setAttempt(value => value + 1)} className="text-xs text-destructive">봇 목록 재시도</button> : null}
    </div>
  )
}
