import type { DaemonChatStreamPayload } from '@sepilotd/api-client/daemon/types'
import { createResettableStore } from './create-store'

export type RunExecutionPolicy = Extract<
  DaemonChatStreamPayload,
  { type: 'execution_policy' }
>['policy']
export type RunContextUsage = Extract<
  DaemonChatStreamPayload,
  { type: 'context_usage' }
>['context']
export type RunQualityGate = Extract<
  DaemonChatStreamPayload,
  { type: 'quality_gate_verdict' }
>

export interface RunSteeringNote {
  noteId: string
  kind?: 'instruction' | 'question'
  message?: string
  status: 'queued' | 'consumed' | 'cancelled'
  updatedAt: number
}

interface RunTelemetryState {
  restoreRouting: (sessionId: string, events: readonly unknown[]) => void
  routing: { persona?: string; mode?: string; fallback?: boolean } | null
  setRouting: (routing: { persona?: string; mode?: string; fallback?: boolean }) => void
  sessionId: string | null
  executionPolicy: RunExecutionPolicy | null
  contextUsage: RunContextUsage | null
  qualityGate: RunQualityGate | null
  steeringNotes: RunSteeringNote[]
  beginRun: (sessionId: string) => void
  setExecutionPolicy: (policy: RunExecutionPolicy | null) => void
  setContextUsage: (context: RunContextUsage) => void
  setQualityGate: (verdict: RunQualityGate) => void
  recordSteeringAck: (note: Omit<RunSteeringNote, 'status' | 'updatedAt'>) => void
  markSteeringConsumed: (noteId: string) => void
  markSteeringCancelled: (noteIds: readonly string[]) => void
  clear: () => void
}

const initialData = {
  routing: null as { persona?: string; mode?: string; fallback?: boolean } | null,
  sessionId: null as string | null,
  executionPolicy: null as RunExecutionPolicy | null,
  contextUsage: null as RunContextUsage | null,
  qualityGate: null as RunQualityGate | null,
  steeringNotes: [] as RunSteeringNote[],
}

function updateSteeringStatus(
  notes: RunSteeringNote[],
  noteId: string,
  status: RunSteeringNote['status'],
): RunSteeringNote[] {
  const updatedAt = Date.now()
  const existing = notes.find((note) => note.noteId === noteId)
  const next = existing
    ? notes.map((note) => (note.noteId === noteId ? { ...note, status, updatedAt } : note))
    : [...notes, { noteId, status, updatedAt }]
  return next.slice(-8)
}

const { store, reset } = createResettableStore<RunTelemetryState>(
  (set) => ({
    ...initialData,
    beginRun: (sessionId) => set({ ...initialData, sessionId }),
    setRouting: (routing) => set({ routing }),
    restoreRouting: (sessionId, events) => {
      let routing: RunTelemetryState['routing'] = null
      for (const event of events) {
        if (!event || typeof event !== 'object') continue
        const record = event as Record<string, unknown>
        if (record.type === 'user_message') routing = null
        if (record.type === 'router_decision' && record.decision && typeof record.decision === 'object') {
          const decision = record.decision as Record<string, unknown>
          routing = {
            persona: typeof decision.persona === 'string' ? decision.persona : undefined,
            mode: typeof decision.mode === 'string' ? decision.mode : undefined,
            fallback: decision.fallback === true,
          }
        }
      }
      set({ sessionId, routing })
    },
    setExecutionPolicy: (executionPolicy) => set({ executionPolicy }),
    setContextUsage: (contextUsage) => set({ contextUsage }),
    setQualityGate: (qualityGate) => set({ qualityGate }),
    recordSteeringAck: (note) =>
      set((state) => ({
        steeringNotes: updateSteeringStatus(state.steeringNotes, note.noteId, 'queued').map(
          (candidate) => candidate.noteId === note.noteId ? { ...candidate, ...note } : candidate,
        ),
      })),
    markSteeringConsumed: (noteId) =>
      set((state) => ({
        steeringNotes: updateSteeringStatus(state.steeringNotes, noteId, 'consumed'),
      })),
    markSteeringCancelled: (noteIds) =>
      set((state) => ({
        steeringNotes: noteIds.reduce(
          (notes, noteId) => updateSteeringStatus(notes, noteId, 'cancelled'),
          state.steeringNotes,
        ),
      })),
    clear: () => set(initialData),
  }),
  {
    ...initialData,
    beginRun: () => {},
    setRouting: () => {},
    restoreRouting: () => {},
    setExecutionPolicy: () => {},
    setContextUsage: () => {},
    setQualityGate: () => {},
    recordSteeringAck: () => {},
    markSteeringConsumed: () => {},
    markSteeringCancelled: () => {},
    clear: () => {},
  },
)

export const useRunTelemetryStore = store
export const resetRunTelemetryStore = reset
