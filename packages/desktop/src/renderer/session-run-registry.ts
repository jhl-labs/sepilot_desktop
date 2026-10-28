import type {
  ActivityItem,
  AgentState,
  DaemonChatRunController,
  Message,
  RunStopReason,
} from '@sepilotd/api-client'
import { createDaemonChatRunController } from '@sepilotd/api-client'

export type DesktopSessionRunStatus = 'live' | 'finished'

export interface DesktopSessionRunSnapshot {
  messages: Message[]
  activities: ActivityItem[]
  agentState: AgentState
  statusText: string | null
  error: string | null
  stopReason: RunStopReason | null
  loading: boolean
}

export interface DesktopSessionRun extends DesktopSessionRunSnapshot {
  sessionId: string | undefined
  readonly controller: DaemonChatRunController
  status: DesktopSessionRunStatus
}

export const DRAFT_SESSION_KEY = ''

const runs = new Map<string, DesktopSessionRun>()
type RunListener = (run: DesktopSessionRun) => void
const listeners = new Map<string, Set<RunListener>>()

function keyOf(sessionId: string | undefined): string {
  return sessionId ?? DRAFT_SESSION_KEY
}

export function getDesktopSessionRun(sessionId: string | undefined): DesktopSessionRun | undefined {
  return runs.get(keyOf(sessionId))
}

export function isDesktopSessionRunLive(sessionId: string | undefined): boolean {
  const run = runs.get(keyOf(sessionId))
  return Boolean(run && run.status === 'live' && !run.controller.signal.aborted)
}

export function beginDesktopSessionRun(
  sessionId: string | undefined,
  seed: Pick<DesktopSessionRunSnapshot, 'messages' | 'activities'>,
): DesktopSessionRun {
  const key = keyOf(sessionId)
  const previous = runs.get(key)
  if (previous && previous.status === 'live') {
    previous.controller.cancel()
    previous.controller.dispose()
  }
  const run: DesktopSessionRun = {
    sessionId,
    controller: createDaemonChatRunController(),
    status: 'live',
    messages: [...seed.messages],
    activities: [...seed.activities],
    agentState: 'idle',
    statusText: null,
    error: null,
    stopReason: null,
    loading: false,
  }
  runs.set(key, run)
  return run
}

export function rebindDesktopSessionRun(run: DesktopSessionRun, sessionId: string): void {
  if (run.sessionId === sessionId) return
  if (runs.get(keyOf(run.sessionId)) === run) runs.delete(keyOf(run.sessionId))
  const displaced = runs.get(sessionId)
  if (displaced && displaced !== run && displaced.status === 'live') {
    displaced.controller.cancel()
    displaced.controller.dispose()
  }
  run.sessionId = sessionId
  runs.set(sessionId, run)
  notifyDesktopSessionRun(run)
}

export function finishDesktopSessionRun(run: DesktopSessionRun, visible: boolean): void {
  run.controller.dispose()
  if (runs.get(keyOf(run.sessionId)) !== run) return
  run.status = 'finished'
  run.loading = false
  if (visible) runs.delete(keyOf(run.sessionId))
  notifyDesktopSessionRun(run)
}

export function takeDesktopSessionRunReplay(
  sessionId: string | undefined,
): { snapshot: DesktopSessionRunSnapshot | null; live: boolean } {
  const run = runs.get(keyOf(sessionId))
  if (!run) return { snapshot: null, live: false }
  const live = run.status === 'live' && !run.controller.signal.aborted
  if (!live) runs.delete(keyOf(sessionId))
  const { messages, activities, agentState, statusText, error, stopReason, loading } = run
  return {
    snapshot: { messages, activities, agentState, statusText, error, stopReason, loading: live && loading },
    live,
  }
}

export function notifyDesktopSessionRun(run: DesktopSessionRun): void {
  const set = listeners.get(keyOf(run.sessionId))
  if (!set) return
  for (const listener of [...set]) listener(run)
}

export function subscribeDesktopSessionRun(sessionId: string | undefined, listener: RunListener): () => void {
  const key = keyOf(sessionId)
  const set = listeners.get(key) ?? new Set<RunListener>()
  set.add(listener)
  listeners.set(key, set)
  return () => {
    set.delete(listener)
    if (set.size === 0 && listeners.get(key) === set) listeners.delete(key)
  }
}

export function resetDesktopSessionRunRegistry(): void {
  for (const run of runs.values()) {
    run.controller.cancel()
    run.controller.dispose()
  }
  runs.clear()
  listeners.clear()
}
