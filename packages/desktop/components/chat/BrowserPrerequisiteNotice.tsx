'use client'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@/lib/store/chat-store'
import type { BrowserConnection } from '@/lib/api/browser-remote'

type BrowserPrerequisiteCode = NonNullable<ChatMessage['userActionRequiredCode']>

const NOTICE_TEXT: Record<BrowserPrerequisiteCode, string> = {
  browser_connection_required: '브라우저 연결이 필요합니다 — 대화 상단에서 탭을 연결하세요',
  browser_control_required: '브라우저 제어권이 필요합니다 — 대화 상단에서 에이전트 제어를 허용하세요',
}

export function currentBrowserPrerequisite(
  messages: readonly ChatMessage[],
): BrowserPrerequisiteCode | undefined {
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user')
  return messages
    .slice(latestUserIndex + 1)
    .findLast((message) => message.role === 'tool' && message.userActionRequiredCode)
    ?.userActionRequiredCode
}

export function BrowserPrerequisiteNotice({ messages, connection, onOpenConnection }: {
  messages: readonly ChatMessage[]
  connection?: BrowserConnection
  onOpenConnection: () => void
}) {
  const prerequisite = currentBrowserPrerequisite(messages)
  if (!prerequisite || connection?.mode === 'agent') return null
  const code = connection ? 'browser_control_required' : prerequisite
  return (
    <div
      role="status"
      data-testid="browser-prerequisite-notice"
      className="my-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs"
    >
      <span className="min-w-0 flex-1">{NOTICE_TEXT[code]}</span>
      <Button size="sm" variant="outline" onClick={onOpenConnection}>
        브라우저 연결 열기
      </Button>
    </div>
  )
}
