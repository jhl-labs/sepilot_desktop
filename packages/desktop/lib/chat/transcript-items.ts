import { presentAssistantContent } from '@/lib/chat/presentation-content'
import type { ChatMessage, ReasoningEntry } from '@/lib/store/chat-store'

export type ChatTranscriptItem =
  | { kind: 'message'; id: string; message: ChatMessage }
  | { kind: 'tool-event-group'; id: string; messages: ChatMessage[] }

export function currentTurnToolGroupId(items: ChatTranscriptItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!
    if (item.kind === 'tool-event-group') return item.id
    if (item.message.role === 'user') return null
  }
  return null
}

export function currentTurnAssistantId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    if (message.role === 'user') return null
    if (message.role === 'assistant' && message.origin !== 'scheduler' && !message.personaName) {
      return message.id
    }
  }
  return null
}

export function needsTurnWaitingIndicator(items: ChatTranscriptItem[]): boolean {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!
    if (item.kind === 'tool-event-group') return false
    const message = item.message
    if (message.role === 'user') return true
    if (message.origin === 'scheduler') continue
    if (message.role === 'tool' || message.content.trim() || message.reasoningSteps?.length ||
        message.attachments?.length || message.imageUrls?.length) return false
  }
  return false
}

function isInternalRoutingStep(step: ReasoningEntry): boolean {
  return (
    step.kind === 'step' &&
    (step.label.startsWith('라우터:') || step.label.startsWith('그래프:'))
  )
}

function hasWorkLogReasoning(message: ChatMessage): boolean {
  return Boolean(message.reasoningSteps?.some((step) => !isInternalRoutingStep(step)))
}

function buildFinalAssistantAuditMessage(message: ChatMessage): ChatMessage | null {
  const presented = presentAssistantContent(message.content)
  const diagnosticSteps: ReasoningEntry[] = presented.diagnostics.map((block) => ({
    kind: 'step',
    label:
      block.kind === 'phase-usage'
        ? '단계별 사용량'
        : block.kind === 'interim-output'
          ? '중간 응답 원문'
          : block.kind === 'execution-report'
            ? '실행 보고 원문'
            : '완료 조건 판정',
    detail: block.content,
  }))
  const reasoningSteps = [...(message.reasoningSteps ?? []), ...diagnosticSteps]
  if (!hasWorkLogReasoning(message) && diagnosticSteps.length === 0) return null
  return {
    ...message,
    content: '',
    reasoningSteps,
    reasoningDurationMs:
      message.reasoningDurationMs ??
      (diagnosticSteps.length > 0 || presented.content.length > 0 ? 0 : undefined),
  }
}

function stripWorkLogDataFromFinalAnswer(message: ChatMessage): ChatMessage {
  const presented = presentAssistantContent(message.content)
  return {
    ...message,
    content: presented.content,
    reasoningSteps: undefined,
    reasoningDurationMs: undefined,
  }
}

export function buildChatTranscriptItems(messages: ChatMessage[]): ChatTranscriptItem[] {
  const items: ChatTranscriptItem[] = []
  let sliceStart = 0
  let activeTurnId: string | undefined

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    const preceding = messages.slice(sliceStart, index)
    items.push(
      ...buildTurnItems(
        preceding,
        activeTurnId ?? `orphan:${preceding[0]?.id ?? 'start'}`,
      ),
    )
    items.push({ kind: 'message', id: message.id, message })
    activeTurnId = message.clientTurnId ?? message.id
    sliceStart = index + 1
  }

  const trailing = messages.slice(sliceStart)
  items.push(
    ...buildTurnItems(
      trailing,
      activeTurnId ?? `orphan:${trailing[0]?.id ?? 'start'}`,
    ),
  )
  return items
}

function buildTurnItems(messages: ChatMessage[], turnId: string): ChatTranscriptItem[] {
  if (messages.length === 0) return []

  const isBackgroundReport = (message: ChatMessage | undefined): boolean =>
    message?.origin === 'scheduler'

  let finalAssistantIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && !message.personaName && !isBackgroundReport(message)) {
      finalAssistantIndex = index
      break
    }
  }

  const executionMessages: ChatMessage[] = []
  const groupedIndices = new Set<number>()
  let finalAuditMessage: ChatMessage | null = null

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message) continue

    if (message.role === 'tool') {
      executionMessages.push(message)
      groupedIndices.add(index)
      continue
    }

    if (message.role === 'system' && message.id.startsWith('cowork:')) {
      executionMessages.push(message)
      groupedIndices.add(index)
      continue
    }

    if (
      message.role === 'assistant'
      && !message.personaName
      && !isBackgroundReport(message)
      && index !== finalAssistantIndex
    ) {
      executionMessages.push(message)
      groupedIndices.add(index)
      continue
    }

    if (index === finalAssistantIndex) {
      finalAuditMessage = buildFinalAssistantAuditMessage(message)
    }
  }

  if (finalAuditMessage) executionMessages.push(finalAuditMessage)

  if (executionMessages.length === 0) {
    return messages.map((message) => ({ kind: 'message', id: message.id, message }))
  }

  const firstGroupedIndex = Math.min(...groupedIndices)
  const insertionIndex =
    finalAssistantIndex >= 0
      ? Math.min(firstGroupedIndex, finalAssistantIndex)
      : firstGroupedIndex
  const output: ChatTranscriptItem[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!
    if (index === insertionIndex) {
      output.push({
        kind: 'tool-event-group',
        id: `execution:${turnId}`,
        messages: executionMessages,
      })
    }
    if (groupedIndices.has(index)) continue

    if (index === finalAssistantIndex) {
      const presentedContent = presentAssistantContent(message.content).content
      const hasVisualAttachment = Boolean(message.imageUrls?.length || message.attachments?.length)
      if (presentedContent || hasVisualAttachment) {
        output.push({
          kind: 'message',
          id: message.id,
          message: finalAuditMessage ? stripWorkLogDataFromFinalAnswer(message) : message,
        })
      }
      continue
    }
    output.push({ kind: 'message', id: message.id, message })
  }

  return output
}
