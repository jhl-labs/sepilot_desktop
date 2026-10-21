'use client'
import { Button } from '@/components/ui/button'
import type { ChatMessage } from '@/lib/store/chat-store'

type BrowserPrerequisiteCode = NonNullable<ChatMessage['userActionRequiredCode']>

export const BROWSER_CONNECTION_SETTINGS_TAB = 'connection'

const NOTICE_TEXT: Record<BrowserPrerequisiteCode, string> = {
  browser_connection_required: '브라우저 연결이 필요합니다 — 설정에서 Chrome 탭을 연결하세요',
  browser_control_required: '브라우저 제어권이 필요합니다 — 설정에서 에이전트에게 제어를 넘기세요',
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

export function openBrowserConnectionSettings(): void {
  window.dispatchEvent(
    new CustomEvent('sepilot:open-settings-tab', { detail: BROWSER_CONNECTION_SETTINGS_TAB }),
  )
}

export function BrowserPrerequisiteNotice({ messages }: { messages: readonly ChatMessage[] }) {
  const code = currentBrowserPrerequisite(messages)
  if (!code) return null
  return (
    <div
      role="status"
      data-testid="browser-prerequisite-notice"
      className="my-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs"
    >
      <span className="min-w-0 flex-1">{NOTICE_TEXT[code]}</span>
      <Button size="sm" variant="outline" onClick={openBrowserConnectionSettings}>
        연결 설정 열기
      </Button>
    </div>
  )
}
