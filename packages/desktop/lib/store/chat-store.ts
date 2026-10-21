import type {
  DebateRoundSummary,
  EditCheckpointSummary,
  PlannerWorkingMemory,
  SessionAttachmentRef,
} from '@sepilotd/api-client/daemon/types'
import type { LiveViewRecord } from '@sepilotd/api-client'
import { createResettableStore } from './create-store'
import type { PendingSessionQuestion } from '@/lib/api/session-questions'

type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ReasoningEntry {
  kind: 'thinking' | 'step'
  label: string
  detail?: string
  tag?: string
  at?: number
  truncated?: boolean
  originalChars?: number
}

export type ToolMessageState =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'executing'
  | 'approval_required'
  | 'success'
  | 'error'
  | 'policy_blocked'
  | 'workspace_blocked'
  | 'timeout'
  | 'cancelled'

type ApprovalResolution = Extract<ToolMessageState, 'approved' | 'denied' | 'cancelled'>

export interface ToolImagePreview {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  data: string
}

export interface ChatMessage {
  id: string
  clientTurnId?: string
  role: ChatRole
  content: string
  createdAt: number
  toolName?: string
  toolState?: ToolMessageState
  toolDurationMs?: number
  userActionRequiredCode?: 'browser_connection_required' | 'browser_control_required'
  toolPolicyReason?: string
  toolContentTruncated?: boolean
  toolOriginalChars?: number
  toolImages?: ToolImagePreview[]
  reasoningSteps?: ReasoningEntry[]
  reasoningDurationMs?: number
  reasoningStartedAt?: number
  views?: LiveViewRecord[]
  liveViewIds?: string[]
  eventIndex?: number
  imageUrls?: string[]
  attachments?: SessionAttachmentRef[]
  personaId?: string
  personaName?: string
  personaAvatar?: string
  failed?: boolean
  origin?: 'scheduler'
}

const PANEL_HISTORY_LIMIT = 8

export interface PendingApproval {
  requestId: string
  toolCallId: string
  toolName: string
  args: unknown
  sessionId?: string
  workspaceRoot?: string
  sessionTitle?: string
  state?: 'live' | 'stale'
  resumeAvailable?: boolean
  context?: string
  previewDiff?: string
  suggestedRule?: {
    tool: string
    pattern: string
  }
}

interface ChatState {
  messages: ChatMessage[]
  composer: string
  pending: boolean
  pendingQuestion: PendingSessionQuestion | null
  setPendingQuestion: (question: PendingSessionQuestion | null) => void
  plannerWorkingMemory: PlannerWorkingMemory | null
  editRollbacks: EditCheckpointSummary[]
  debateRounds: DebateRoundSummary[]
  pendingApprovals: PendingApproval[]
  appendMessage: (m: ChatMessage) => void
  upsertMessage: (m: ChatMessage) => void
  appendDelta: (id: string, delta: string) => void
  setComposer: (text: string) => void
  setPending: (v: boolean) => void
  setPlannerWorkingMemory: (memory: PlannerWorkingMemory | null) => void
  appendEditRollback: (checkpoint: EditCheckpointSummary) => void
  appendDebateRound: (round: DebateRoundSummary) => void
  enqueueApproval: (approval: PendingApproval) => void
  settleApproval: (requestId: string, resolution: ApprovalResolution) => void
  resolveApproval: (requestId: string) => void
  recordToolApprovalDecision: (toolCallId: string, decision: 'approved' | 'denied') => void
  setMessageFailed: (id: string, failed: boolean) => void
  removeMessagesFromId: (id: string) => void
  clear: () => void
}

const defaults = {
  messages: [] as ChatMessage[],
  composer: '',
  pending: false,
  pendingQuestion: null as PendingSessionQuestion | null,
  plannerWorkingMemory: null as PlannerWorkingMemory | null,
  editRollbacks: [] as EditCheckpointSummary[],
  debateRounds: [] as DebateRoundSummary[],
  pendingApprovals: [] as PendingApproval[],
}

function sameOptimisticTurn(left: ChatMessage, right: ChatMessage): boolean {
  return (
    left.eventIndex == null &&
    right.eventIndex != null &&
    left.role === right.role &&
    left.content === right.content &&
    !left.toolName &&
    !right.toolName
  )
}

function mergeCanonicalMessage(local: ChatMessage, canonical: ChatMessage): ChatMessage {
  return {
    ...canonical,
    clientTurnId: canonical.clientTurnId ?? local.clientTurnId,
    imageUrls: canonical.imageUrls ?? local.imageUrls,
    toolImages: canonical.toolImages ?? local.toolImages,
    reasoningSteps: canonical.reasoningSteps ?? local.reasoningSteps,
    reasoningDurationMs: canonical.reasoningDurationMs ?? local.reasoningDurationMs,
    views: canonical.views ?? local.views,
    liveViewIds: canonical.liveViewIds ?? local.liveViewIds,
  }
}

function mergeOptimisticMessage(local: ChatMessage, canonical: ChatMessage): ChatMessage {
  const merged = mergeCanonicalMessage(local, canonical)
  if (local.role !== 'user') return merged
  return {
    ...merged,
    clientTurnId: canonical.clientTurnId ?? local.clientTurnId ?? local.id,
  }
}

function isTerminalToolState(state: ToolMessageState | undefined): boolean {
  return (
    state === 'success' ||
    state === 'error' ||
    state === 'policy_blocked' ||
    state === 'workspace_blocked' ||
    state === 'timeout' ||
    state === 'denied' ||
    state === 'cancelled'
  )
}

function settleToolApproval(
  messages: ChatMessage[],
  toolCallId: string,
  resolution: ApprovalResolution,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== `tool:${toolCallId}` || isTerminalToolState(message.toolState)) {
      return message
    }
    return { ...message, toolState: resolution }
  })
}

const { store, reset } = createResettableStore<ChatState>(
  (set, get) => ({
    ...defaults,
    appendMessage: (m: ChatMessage) => set({ messages: [...get().messages, m] }),
    upsertMessage: (m: ChatMessage) => {
      const messages = get().messages
      if (messages.some((message) => message.id === m.id)) {
        set({
          messages: messages.map((message) =>
            message.id === m.id ? mergeCanonicalMessage(message, m) : message,
          ),
        })
        return
      }

      const optimisticIndex = messages.findIndex((message) => sameOptimisticTurn(message, m))
      if (optimisticIndex >= 0) {
        set({
          messages: messages.map((message, index) =>
            index === optimisticIndex ? mergeOptimisticMessage(message, m) : message,
          ),
        })
        return
      }

      set({ messages: [...messages, m] })
    },
    appendDelta: (id: string, delta: string) =>
      set({
        messages: get().messages.some((message) => message.id === id)
          ? get().messages.map((message) =>
              message.id === id ? { ...message, content: message.content + delta } : message,
            )
          : [
              ...get().messages,
              {
                id,
                role: 'assistant',
                content: delta,
                createdAt: Date.now(),
              },
            ],
      }),
    setComposer: (text: string) => set({ composer: text }),
    setPending: (v: boolean) => set({ pending: v }),
    setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
    setPlannerWorkingMemory: (memory) => set({ plannerWorkingMemory: memory }),
    appendEditRollback: (checkpoint) => {
      const next = [...get().editRollbacks, checkpoint]
      set({
        editRollbacks: next.slice(Math.max(0, next.length - PANEL_HISTORY_LIMIT)),
      })
    },
    appendDebateRound: (round) => {
      const next = [...get().debateRounds, round]
      set({
        debateRounds: next.slice(Math.max(0, next.length - PANEL_HISTORY_LIMIT)),
      })
    },
    enqueueApproval: (approval) => {
      const existing = get().pendingApprovals
      if (existing.some((a) => a.requestId === approval.requestId)) {
        set({
          pendingApprovals: existing.map((item) =>
            item.requestId === approval.requestId
              ? {
                  ...item,
                  ...approval,
                  sessionId: approval.sessionId ?? item.sessionId,
                  workspaceRoot: approval.workspaceRoot ?? item.workspaceRoot,
                  sessionTitle: approval.sessionTitle ?? item.sessionTitle,
                  context: approval.context ?? item.context,
                  previewDiff: approval.previewDiff ?? item.previewDiff,
                  suggestedRule: approval.suggestedRule ?? item.suggestedRule,
                }
              : item,
          ),
        })
        return
      }
      set({ pendingApprovals: [...existing, approval] })
    },
    settleApproval: (requestId, resolution) => {
      const state = get()
      const approval = state.pendingApprovals.find((item) => item.requestId === requestId)
      set({
        pendingApprovals: state.pendingApprovals.filter((item) => item.requestId !== requestId),
        messages: approval
          ? settleToolApproval(state.messages, approval.toolCallId, resolution)
          : state.messages,
      })
    },
    resolveApproval: (requestId) => get().settleApproval(requestId, 'cancelled'),
    recordToolApprovalDecision: (toolCallId, decision) =>
      set({
        messages: settleToolApproval(get().messages, toolCallId, decision),
      }),
    setMessageFailed: (id, failed) =>
      set({
        messages: get().messages.map((message) =>
          message.id === id ? { ...message, failed } : message,
        ),
      }),
    removeMessagesFromId: (id) => {
      const state = get()
      const idx = state.messages.findIndex((message) => message.id === id)
      if (idx < 0) return
      const removedMessageIds = new Set(
        state.messages.slice(idx).map((message) => message.id),
      )
      set({
        messages: state.messages.slice(0, idx),
        pendingApprovals: state.pendingApprovals.filter(
          (approval) => !removedMessageIds.has(`tool:${approval.toolCallId}`),
        ),
      })
    },
    clear: () => set({ ...defaults }),
  }),
  {
    ...defaults,
    appendMessage: () => {},
    upsertMessage: () => {},
    appendDelta: () => {},
    setComposer: () => {},
    setPending: () => {},
    setPendingQuestion: () => {},
    setPlannerWorkingMemory: () => {},
    appendEditRollback: () => {},
    appendDebateRound: () => {},
    enqueueApproval: () => {},
    settleApproval: () => {},
    resolveApproval: () => {},
    recordToolApprovalDecision: () => {},
    setMessageFailed: () => {},
    removeMessagesFromId: () => {},
    clear: () => {},
  },
)

export const useChatStore = store
export const resetChatStore = reset
