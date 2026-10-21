import type { ChatMessage, ToolMessageState } from '@/lib/store/chat-store'

export type InterruptedToolTerminalState = Extract<
  ToolMessageState,
  'cancelled' | 'error' | 'timeout'
>

const INTERRUPTIBLE_TOOL_STATES = new Set<ToolMessageState>([
  'pending',
  'approved',
  'executing',
])

export function buildInterruptedToolTransitions(
  messages: readonly ChatMessage[],
  toolMessageIds: Iterable<string>,
  terminalState: InterruptedToolTerminalState,
): ChatMessage[] {
  const trackedIds = new Set(toolMessageIds)
  if (trackedIds.size === 0) return []

  return messages
    .filter(
      (message) =>
        message.role === 'tool' &&
        trackedIds.has(message.id) &&
        message.toolState != null &&
        INTERRUPTIBLE_TOOL_STATES.has(message.toolState),
    )
    .map((message) => ({ ...message, toolState: terminalState }))
}

export function toolTerminalStateForStreamFailure(
  error: unknown,
): Extract<InterruptedToolTerminalState, 'error' | 'timeout'> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : ''

  return /AGENT_INACTIVITY|stream-idle-timeout|timed?\s*out|timeout|operation was aborted/i.test(
    message,
  )
    ? 'timeout'
    : 'error'
}
