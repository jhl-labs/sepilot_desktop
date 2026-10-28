import type { ChatMessage } from '@/lib/store/chat-store'
import {
  buildInterruptedToolTransitions,
  type InterruptedToolTerminalState,
} from './tool-run-lifecycle'

export type SessionRunStatus = 'live' | 'done' | 'error' | 'cancelled'

export interface SessionRunRecord {
  readonly sessionId: string
  readonly controller: AbortController
  readonly toolIds: Set<string>
  readonly messages: Map<string, ChatMessage>
  status: SessionRunStatus
}

const runs = new Map<string, SessionRunRecord>()

export function getSessionRun(sessionId: string): SessionRunRecord | undefined {
  return runs.get(sessionId)
}

export function isSessionRunLive(sessionId: string): boolean {
  const run = runs.get(sessionId)
  return Boolean(run && run.status === 'live' && !run.controller.signal.aborted)
}

export function beginSessionRun(sessionId: string): { run: SessionRunRecord; previous?: SessionRunRecord } {
  const previous = runs.get(sessionId)
  const run: SessionRunRecord = {
    sessionId,
    controller: new AbortController(),
    toolIds: new Set(),
    messages: new Map(),
    status: 'live',
  }
  runs.set(sessionId, run)
  return { run, previous }
}

export function recordSessionRunMessage(run: SessionRunRecord, message: ChatMessage): void {
  const existing = run.messages.get(message.id)
  run.messages.set(message.id, existing ? { ...existing, ...message } : message)
}

export function markSessionRunMessageFailed(run: SessionRunRecord, id: string): void {
  const existing = run.messages.get(id)
  if (existing) run.messages.set(id, { ...existing, failed: true })
}

export function settleSessionRunTools(
  run: SessionRunRecord,
  terminalState: InterruptedToolTerminalState,
): ChatMessage[] {
  const transitions = buildInterruptedToolTransitions(
    [...run.messages.values()],
    run.toolIds,
    terminalState,
  )
  for (const message of transitions) run.messages.set(message.id, message)
  return transitions
}

export function finishSessionRun(run: SessionRunRecord, status: Exclude<SessionRunStatus, 'live'>, visible: boolean): void {
  if (runs.get(run.sessionId) !== run) return
  run.status = status
  if (visible || run.messages.size === 0) runs.delete(run.sessionId)
}

export function takeSessionRunReplay(sessionId: string): { messages: ChatMessage[]; live: boolean } {
  const run = runs.get(sessionId)
  if (!run) return { messages: [], live: false }
  const live = run.status === 'live' && !run.controller.signal.aborted
  if (!live) runs.delete(sessionId)
  return { messages: [...run.messages.values()], live }
}

export function resetSessionRunRegistry(): void {
  for (const run of runs.values()) run.controller.abort()
  runs.clear()
}
