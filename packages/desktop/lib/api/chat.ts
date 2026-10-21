import type {
  DaemonChatStreamPayload,
  DaemonChatWarningEvent,
  DaemonSessionDetail,
  DebateRoundSummary,
  EditCheckpointSummary,
  PlannerWorkingMemory,
  SessionAttachmentRef,
} from '@sepilotd/api-client/daemon/types'
import { createIncompleteDaemonChatStreamError } from '@sepilotd/api-client/daemon/chat-transport'
import { parseDaemonHarnessNote, streamDaemonChatEvents } from '@sepilotd/api-client/daemon/stream'
import type { ChatStreamOptions } from '@sepilotd/api-client/daemon/http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type {
  ChatMessage,
  PendingApproval,
  ReasoningEntry,
  ToolImagePreview,
  ToolMessageState,
} from '@/lib/store/chat-store'
import { getDesktopApi } from '@/lib/electron/bridge'
import { makeDaemonRequestContext } from './_daemon'
import { buildInterruptedToolTransitions } from '@/lib/chat/tool-run-lifecycle'
import { presentRunStop } from '@/lib/chat/run-stop-presentation'
import type { LiveViewRecord } from '@sepilotd/api-client'

type ChatApprovalRequestPayload = PendingApproval
type ExecutionPolicy = Extract<DaemonChatStreamPayload, { type: 'execution_policy' }>['policy']
type ContextUsage = Extract<DaemonChatStreamPayload, { type: 'context_usage' }>['context']
type QualityGateVerdict = Extract<DaemonChatStreamPayload, { type: 'quality_gate_verdict' }>
type SteeringEvent = Extract<
  DaemonChatStreamPayload,
  { type: 'steering_ack' | 'steering_consumed' }
>
type QuestionRequest = Extract<DaemonChatStreamPayload, { type: 'question_request' }>
type RunStopReason = Extract<DaemonChatStreamPayload, { type: 'done' }>['stopReason']

function buildRunStopMessage(id: string, createdAt: number, reason: RunStopReason): ChatMessage | null {
  if (!reason || reason.kind === 'completed') return null
  return { id: `run-stop:${id}`, role: 'system', content: presentRunStop(reason), createdAt }
}

interface ChatStreamHandlers {
  onRouting?: (decision: { persona?: string; mode?: string; fallback?: boolean }) => void
  onSession?: (sessionId: string) => void
  onUpsertMessage: (m: ChatMessage) => void
  onPlannerWorkingMemoryUpdated?: (memory: PlannerWorkingMemory) => void
  onEditCheckpointResolved?: (checkpoint: EditCheckpointSummary) => void
  onDebateRound?: (round: DebateRoundSummary) => void
  onCoworkDiscussRequest?: (
    payload: Extract<DaemonChatStreamPayload, { type: 'cowork_discuss_request' }>,
  ) => void
  onExecutionPolicy?: (policy: ExecutionPolicy) => void
  onContextUsage?: (context: ContextUsage) => void
  onQualityGateVerdict?: (verdict: QualityGateVerdict) => void
  onSteeringEvent?: (event: SteeringEvent) => void
  onQuestionRequest?: (question: QuestionRequest) => void
  onWarning?: (payload: DaemonChatWarningEvent) => void
  onApprovalRequest?: (payload: ChatApprovalRequestPayload) => void
  onDone: () => void
  onError: (err: Error) => void
}

export interface ChatHistoryResult {
  events?: readonly unknown[]
  messages: ChatMessage[]
  pendingApprovals?: PendingApproval[]
  editRollbacks: EditCheckpointSummary[]
  debateRounds: DebateRoundSummary[]
  plannerWorkingMemory: PlannerWorkingMemory | null
}

export interface ChatApi {
  history: (sessionId: string) => Promise<ChatHistoryResult>
  stream: (
    sessionId: string | undefined,
    content: string,
    handlers: ChatStreamHandlers,
    options?: { signal?: AbortSignal; chat?: ChatStreamOptions },
  ) => Promise<void>
  resumeApproval?: (
    requestId: string,
    approved: boolean,
    sessionId: string | undefined,
    handlers: ChatStreamHandlers,
    options?: {
      signal?: AbortSignal
      toolCall?: { id: string; name: string; arguments: unknown }
      workspaceRoot?: string
    },
  ) => Promise<void>
}

const MAX_TOOL_IMAGE_BASE64_CHARS = 8 * 1024 * 1024
const TOOL_IMAGE_MEDIA_TYPES = new Set<ToolImagePreview['mediaType']>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function normalizeToolImages(contentParts: unknown): ToolImagePreview[] | undefined {
  if (!Array.isArray(contentParts)) return undefined
  for (const part of contentParts) {
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    if (record.type !== 'image' || !record.source || typeof record.source !== 'object') continue
    const source = record.source as Record<string, unknown>
    const mediaType = typeof source.mediaType === 'string'
      ? source.mediaType.toLowerCase()
      : ''
    const data = typeof source.data === 'string' ? source.data : ''
    if (
      source.type === 'base64'
      && TOOL_IMAGE_MEDIA_TYPES.has(mediaType as ToolImagePreview['mediaType'])
      && data.length > 0
      && data.length <= MAX_TOOL_IMAGE_BASE64_CHARS
    ) {
      return [{ mediaType: mediaType as ToolImagePreview['mediaType'], data }]
    }
  }
  return undefined
}

function toTimestamp(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const numeric = Number.parseInt(value, 10)
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
      return numeric
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return fallback
}

function normalizeSessionAttachmentRefs(value: unknown): SessionAttachmentRef[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs: SessionAttachmentRef[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const fileId = typeof record.fileId === 'string' ? record.fileId.trim() : ''
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : ''
    const filename = typeof record.filename === 'string' ? record.filename.trim() : ''
    const size = record.size
    if (
      !fileId ||
      fileId.length > 200 ||
      fileId.includes('..') ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(fileId) ||
      !mimeType ||
      mimeType.length > 255 ||
      !filename ||
      filename.length > 512 ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      seen.has(fileId)
    ) {
      continue
    }
    seen.add(fileId)
    refs.push({ fileId, mimeType, filename, size })
  }
  return refs.length > 0 ? refs : undefined
}

const TOOL_DISPLAY_CHAR_LIMIT = 32_000
const TOOL_DISPLAY_HEAD_CHARS = 24_000
const TOOL_DISPLAY_TAIL_CHARS = TOOL_DISPLAY_CHAR_LIMIT - TOOL_DISPLAY_HEAD_CHARS
const STRUCTURED_STRING_CHAR_LIMIT = 8_000
const STRUCTURED_ARRAY_ITEM_LIMIT = 100
const STRUCTURED_OBJECT_KEY_LIMIT = 100
const STRUCTURED_DEPTH_LIMIT = 8
const STRUCTURED_NODE_LIMIT = 2_000
const TOOL_TRUNCATION_MARKER = '\n\n… [긴 도구 출력이 화면 보호를 위해 생략됨] …\n\n'
const REASONING_DISPLAY_CHAR_LIMIT = 8_000
const REASONING_DISPLAY_HEAD_CHARS = 6_000
const REASONING_DISPLAY_TAIL_CHARS = REASONING_DISPLAY_CHAR_LIMIT - REASONING_DISPLAY_HEAD_CHARS
const REASONING_TRUNCATION_MARKER = '\n\n… [긴 응답 준비 기록 생략] …\n\n'
const STREAM_ERROR_CHAR_LIMIT = 1_600

interface FormattedToolContent {
  text: string
  truncated: boolean
  originalChars?: number
}

function boundToolDisplayText(text: string): FormattedToolContent {
  if (text.length <= TOOL_DISPLAY_CHAR_LIMIT) {
    return { text, truncated: false, originalChars: text.length }
  }

  return {
    text: `${text.slice(0, TOOL_DISPLAY_HEAD_CHARS)}${TOOL_TRUNCATION_MARKER}${text.slice(
      -TOOL_DISPLAY_TAIL_CHARS,
    )}`,
    truncated: true,
    originalChars: text.length,
  }
}

function normalizeStructuredDisplayValue(value: unknown): { value: unknown; truncated: boolean } {
  const seen = new WeakSet<object>()
  let visitedNodes = 0
  let truncated = false

  const visit = (current: unknown, depth: number): unknown => {
    visitedNodes += 1
    if (visitedNodes > STRUCTURED_NODE_LIMIT) {
      truncated = true
      return '[추가 데이터 생략됨]'
    }
    if (typeof current === 'string') {
      if (current.length <= STRUCTURED_STRING_CHAR_LIMIT) return current
      truncated = true
      return `${current.slice(0, STRUCTURED_STRING_CHAR_LIMIT)}… [${
        current.length - STRUCTURED_STRING_CHAR_LIMIT
      }자 생략]`
    }
    if (current == null || typeof current !== 'object') return current
    if (depth >= STRUCTURED_DEPTH_LIMIT) {
      truncated = true
      return '[중첩 데이터 생략됨]'
    }
    if (seen.has(current)) {
      truncated = true
      return '[순환 참조]'
    }
    seen.add(current)

    if (Array.isArray(current)) {
      const limited = current.slice(0, STRUCTURED_ARRAY_ITEM_LIMIT).map((item) => visit(item, depth + 1))
      if (current.length > STRUCTURED_ARRAY_ITEM_LIMIT) {
        truncated = true
        limited.push(`[${current.length - STRUCTURED_ARRAY_ITEM_LIMIT}개 항목 생략]`)
      }
      return limited
    }

    const entries = Object.entries(current as Record<string, unknown>)
    const normalized: Record<string, unknown> = {}
    for (const [key, entry] of entries.slice(0, STRUCTURED_OBJECT_KEY_LIMIT)) {
      normalized[key] = visit(entry, depth + 1)
    }
    if (entries.length > STRUCTURED_OBJECT_KEY_LIMIT) {
      truncated = true
      normalized['…'] = `[${entries.length - STRUCTURED_OBJECT_KEY_LIMIT}개 필드 생략]`
    }
    return normalized
  }

  return { value: visit(value, 0), truncated }
}

function formatStructuredContent(value: unknown): FormattedToolContent {
  if (typeof value === 'string') return boundToolDisplayText(value)
  if (value == null) return { text: '', truncated: false, originalChars: 0 }

  const normalized = normalizeStructuredDisplayValue(value)
  let text: string
  try {
    text = JSON.stringify(normalized.value, null, 2)
  } catch {
    text = String(normalized.value)
  }
  const bounded = boundToolDisplayText(text)
  return {
    ...bounded,
    truncated: normalized.truncated || bounded.truncated,
    originalChars: normalized.truncated ? undefined : bounded.originalChars,
  }
}

function appendBoundedReasoningDetail(entry: ReasoningEntry, delta: string): void {
  const currentDetail = entry.detail ?? ''
  const originalChars = (entry.originalChars ?? currentDetail.length) + delta.length
  if (!entry.truncated && currentDetail.length + delta.length <= REASONING_DISPLAY_CHAR_LIMIT) {
    entry.detail = `${currentDetail}${delta}`
    return
  }

  const markerIndex = currentDetail.indexOf(REASONING_TRUNCATION_MARKER)
  const head = markerIndex >= 0
    ? currentDetail.slice(0, markerIndex)
    : currentDetail.slice(0, REASONING_DISPLAY_HEAD_CHARS)
  const previousTail = markerIndex >= 0
    ? currentDetail.slice(markerIndex + REASONING_TRUNCATION_MARKER.length)
    : currentDetail.slice(REASONING_DISPLAY_HEAD_CHARS)
  const tail = `${previousTail}${delta}`.slice(-REASONING_DISPLAY_TAIL_CHARS)
  entry.detail = `${head}${REASONING_TRUNCATION_MARKER}${tail}`
  entry.truncated = true
  entry.originalChars = originalChars
}

function normalizeReasoningEntry(entry: ReasoningEntry): ReasoningEntry {
  if (!entry.detail) return entry
  const normalized: ReasoningEntry = { ...entry, detail: '' }
  appendBoundedReasoningDetail(normalized, entry.detail)
  return normalized
}

function formatStreamErrorMessage(message: unknown): string {
  const text = typeof message === 'string' ? message : 'chat stream error'
  if (text.length <= STREAM_ERROR_CHAR_LIMIT) return text
  const head = text.slice(0, 1_200)
  const tail = text.slice(-400)
  return `${head}\n\n… [긴 오류 상세 생략] …\n\n${tail}`
}

function buildToolMessage(
  id: string,
  toolName: string,
  content: unknown,
  createdAt: number,
  lifecycle: {
    state: ToolMessageState
    durationMs?: number
    policyReason?: string
    images?: ToolImagePreview[]
    userActionRequiredCode?: ChatMessage['userActionRequiredCode']
  },
): ChatMessage {
  const formatted = formatStructuredContent(content)
  return {
    id,
    role: 'tool',
    toolName,
    content: formatted.text,
    createdAt,
    toolState: lifecycle.state,
    ...(lifecycle.userActionRequiredCode
      ? { userActionRequiredCode: lifecycle.userActionRequiredCode }
      : {}),
    ...(lifecycle.images?.length ? { toolImages: lifecycle.images } : {}),
    ...(lifecycle.durationMs == null ? {} : { toolDurationMs: lifecycle.durationMs }),
    ...(lifecycle.policyReason ? { toolPolicyReason: lifecycle.policyReason } : {}),
    ...(formatted.truncated
      ? {
          toolContentTruncated: true,
          ...(formatted.originalChars == null
            ? {}
            : { toolOriginalChars: formatted.originalChars }),
        }
      : {}),
  }
}

function upsertOrderedMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const next = messages.slice()
  const index = next.findIndex((candidate) => candidate.id === message.id)
  if (index === -1) next.push(message)
  else next[index] = message
  return next
}

const APPROVAL_FAILURE_STATUS_METADATA_KEY = 'approvalFailureStatus'

function hasApprovalDenialMetadata(metadata: unknown): boolean {
  return (
    metadata != null &&
    typeof metadata === 'object' &&
    (metadata as Record<string, unknown>)[APPROVAL_FAILURE_STATUS_METADATA_KEY] === 'denied'
  )
}

function policyBlockReason(metadata: unknown): string | undefined {
  if (metadata == null || typeof metadata !== 'object') return undefined
  const record = metadata as Record<string, unknown>
  return record.source === 'policy' && typeof record.reason === 'string'
    ? record.reason
    : undefined
}

function resolveToolResultLifecycle(
  status: 'success' | 'error' | 'timeout' | 'cancelled',
  metadata: unknown,
  approvalDenied: boolean,
): {
  state: ToolMessageState
  policyReason?: string
  userActionRequiredCode?: ChatMessage['userActionRequiredCode']
} {
  if (status !== 'error') return { state: status }
  if (approvalDenied || hasApprovalDenialMetadata(metadata)) return { state: 'denied' }
  const reason = policyBlockReason(metadata)
  if (!reason) {
    const record =
      metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
    const code = record.userActionRequiredCode
    return {
      state: 'error',
      ...(typeof record.userActionRequired === 'string' &&
      record.userActionRequired.trim() &&
      (code === 'browser_connection_required' || code === 'browser_control_required')
        ? { userActionRequiredCode: code }
        : {}),
    }
  }
  return {
    state: /workspace|working directory|cwd/i.test(reason)
      ? 'workspace_blocked'
      : 'policy_blocked',
    policyReason: reason,
  }
}

function updateToolMessageState(
  messages: ChatMessage[],
  toolCallId: string,
  state: ToolMessageState,
  createdAt: number,
  eventIndex: number,
): ChatMessage[] {
  const id = `tool:${toolCallId}`
  const current = messages.find((message) => message.id === id)
  if (!current) return messages
  return upsertOrderedMessage(messages, {
    ...current,
    toolState: state,
    createdAt,
    eventIndex,
  })
}

function buildPanelOpenMessage(
  id: string,
  personas: Array<{ id: string; name: string; description?: string }>,
  createdAt: number,
): ChatMessage {
  const lines = personas.map((p, i) => `${i + 1}. ${p.name}`)
  return {
    id,
    role: 'system',
    content: `🎙 페르소나 패널 시작 (${personas.length}명)\n${lines.join('\n')}`,
    createdAt,
  }
}

function buildPanelTurnMessage(
  id: string,
  payload: {
    personaId: string
    personaName: string
    text: string
  },
  createdAt: number,
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: payload.text,
    createdAt,
    personaId: payload.personaId,
    personaName: payload.personaName,
  }
}

function buildPanelTurnFailedMessage(
  id: string,
  payload: { personaName: string; error: string },
  createdAt: number,
): ChatMessage {
  return {
    id,
    role: 'system',
    content: `⚠️ ${payload.personaName} 응답 실패: ${formatStreamErrorMessage(payload.error)}`,
    createdAt,
  }
}

function buildPanelSynthesizingMessage(
  id: string,
  panelists: number,
  createdAt: number,
): ChatMessage {
  return {
    id,
    role: 'system',
    content: `🧵 ${panelists}명의 응답을 종합하는 중…`,
    createdAt,
  }
}

function buildCoworkMessage(
  id: string,
  payload: Extract<
    DaemonChatStreamPayload,
    {
      type:
        | 'cowork_plan'
        | 'cowork_task_start'
        | 'cowork_task_complete'
        | 'cowork_task_failed'
        | 'cowork_synthesizing'
        | 'cowork_discuss_request'
        | 'cowork_discuss_response'
    }
  >,
  createdAt: number,
): ChatMessage {
  let content = ''
  switch (payload.type) {
    case 'cowork_plan':
      content = [
        '**협업 계획**',
        ...(payload.plan ?? []).map(
          (item, index) => `${index + 1}. ${item.role}: ${item.instruction}`,
        ),
      ].join('\n')
      break
    case 'cowork_task_start':
      content = `**협업 작업 시작**\n\n${payload.role}: ${payload.instruction}`
      break
    case 'cowork_task_complete':
      content = `**협업 작업 완료**\n\n${payload.role}\n\n${payload.result}`
      break
    case 'cowork_task_failed':
      content = `**협업 작업 실패**\n\n${payload.role}: ${formatStreamErrorMessage(payload.error)}`
      break
    case 'cowork_synthesizing':
      content = `**협업 종합 중**\n\n${payload.summary ?? ''}`.trim()
      break
    case 'cowork_discuss_request':
      content = [
        '**협업 질문**',
        '',
        payload.prompt,
        payload.choices?.length ? `\n선택지: ${payload.choices.join(', ')}` : '',
      ].join('\n')
      break
    case 'cowork_discuss_response':
      content = `**협업 질문 응답**\n\n${payload.response}`
      break
  }

  return {
    id,
    role: 'system',
    content,
    createdAt,
  }
}

function formatOptionalLine(label: string, value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? `${label}: ${trimmed}` : undefined
  }
  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    return values.length > 0 ? `${label}: ${values.join(', ')}` : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${label}: ${formatConfidencePercent(value)}`
  }
  return undefined
}

function formatConfidencePercent(value: number): string {
  const normalized = value <= 1 ? value * 100 : value
  return `${Math.round(normalized)}%`
}

function joinDetailLines(lines: Array<string | undefined>): string | undefined {
  const detail = lines.filter((line): line is string => Boolean(line)).join('\n')
  return detail || undefined
}

function buildRouterDecisionReasoningEntry(decision: {
  mode?: string
  persona?: string
  skillIds?: string[]
  reason?: string
  confidence?: string
  fallback?: boolean
}): ReasoningEntry {
  const mode = decision.mode?.trim() || 'auto'
  const persona = decision.persona?.trim()
  return {
    kind: 'step',
    label: persona && persona !== 'default' ? `라우팅 대상: ${persona}` : `라우터: ${mode}`,
    detail: joinDetailLines([
      `실행 모드: ${mode}`,
      formatOptionalLine('선택 이유', decision.reason),
      formatOptionalLine('페르소나', persona),
      formatOptionalLine('스킬', decision.skillIds),
      formatOptionalLine('신뢰도', decision.confidence),
      decision.fallback ? 'Fallback 경로 사용' : undefined,
    ]),
  }
}

function buildModeRouteReasoningEntry(payload: {
  chosen?: string
  persona?: string
  candidates?: string[]
  reason?: string
  confidence?: number
  fallback?: boolean
}): ReasoningEntry {
  const chosen = payload.chosen?.trim() || 'auto'
  return {
    kind: 'step',
    label: `그래프: ${chosen}`,
    detail: joinDetailLines([
      formatOptionalLine('선택 이유', payload.reason),
      formatOptionalLine('페르소나', payload.persona),
      formatOptionalLine('후보', payload.candidates),
      formatOptionalLine('신뢰도', payload.confidence),
      payload.fallback ? 'Fallback 경로 사용' : undefined,
    ]),
  }
}

function buildExecutionPolicyReasoningEntry(policy: ExecutionPolicy): ReasoningEntry {
  return {
    kind: 'step',
    label: `실행 정책: ${policy.effectiveAutonomy}`,
    detail: joinDetailLines([
      `설정: ${policy.configuredAutonomy}`,
      policy.requestedAutonomy ? `요청: ${policy.requestedAutonomy}` : undefined,
      `작업공간 경계: ${policy.workspaceBoundary}`,
      `에이전트 모드: ${policy.agentMode}`,
      policy.freshApprovalRequired ? '새 승인이 필요한 실행' : undefined,
      policy.clamped ? `정책 제한: ${policy.clampReason ?? 'daemon 정책에 의해 제한됨'}` : undefined,
    ]),
  }
}

function buildQualityGateReasoningEntry(verdict: QualityGateVerdict): ReasoningEntry {
  return {
    kind: 'step',
    label: `품질 게이트: ${verdict.phase} · ${verdict.decision === 'pass' ? '통과' : '재시도'}`,
    detail: joinDetailLines([
      verdict.blockingReason,
      verdict.backtrackCount > 0 ? `되돌림 ${verdict.backtrackCount}회` : undefined,
    ]),
  }
}

function buildRecoveryReasoningEntry(payload: {
  kind: string
  message: string
  scope: string
  action: string
  recoverable: boolean
  details?: Record<string, unknown>
}): ReasoningEntry {
  const diagnosticCode = typeof payload.details?.code === 'string'
    ? payload.details.code
    : undefined
  return {
    kind: 'step',
    label: `${payload.recoverable ? '복구' : '실패 진단'}: ${payload.kind}`,
    detail: joinDetailLines([
      payload.message,
      diagnosticCode ? `진단 코드: ${diagnosticCode}` : undefined,
      `${payload.scope} · ${payload.action}`,
    ]),
  }
}

function summarizeSubagentProgress(
  payload: Extract<DaemonChatStreamPayload, { type: 'subagent_progress' }>,
): ReasoningEntry {
  const inner = payload.inner
  let detail: string = inner.type
  if (inner.type === 'reasoning_step') detail = inner.detail ?? inner.label
  else if (inner.type === 'thinking') detail = inner.content || '분석 중'
  else if (inner.type === 'tool_call') detail = `도구 실행: ${inner.toolCall?.name ?? 'tool'}`
  else if (inner.type === 'tool_result') detail = `${inner.status}: ${inner.output ?? ''}`
  else if (inner.type === 'message') detail = inner.content ?? ''
  return {
    kind: 'step',
    label: payload.label ? `서브에이전트: ${payload.label}` : `서브에이전트: ${payload.subagentId}`,
    detail,
  }
}

export function mapSessionDetailToMessages(detail: DaemonSessionDetail): ChatMessage[] {
  const toolNames = new Map<string, string>()
  const turnToolIds = new Set<string>()
  const approvalToolCallIds = new Map<string, string>()
  const deniedToolCallIds = new Set<string>()
  const approvalStateByToolCallId = new Map(
    (detail.pendingApprovals ?? []).map((approval) => [approval.toolCallId, approval] as const),
  )
  let messages: ChatMessage[] = []
  let pendingReasoningSteps: ReasoningEntry[] = []
  let pendingReasoningId: string | undefined
  let pendingReasoningCreatedAt: number | undefined

  const addPendingReasoningStep = (id: string, createdAt: number, entry: ReasoningEntry) => {
    pendingReasoningSteps.push(normalizeReasoningEntry(entry))
    pendingReasoningId ??= id
    pendingReasoningCreatedAt ??= createdAt
  }

  const takePendingReasoningSteps = (): ReasoningEntry[] | undefined => {
    if (pendingReasoningSteps.length === 0) return undefined
    const steps = pendingReasoningSteps
    pendingReasoningSteps = []
    pendingReasoningId = undefined
    pendingReasoningCreatedAt = undefined
    return steps
  }

  const flushPendingReasoningMessage = (fallbackId: string, fallbackCreatedAt: number) => {
    const id = pendingReasoningId ?? fallbackId
    const createdAt = pendingReasoningCreatedAt ?? fallbackCreatedAt
    const steps = takePendingReasoningSteps()
    if (!steps) return
    messages = upsertOrderedMessage(messages, {
      id: `assistant-routing:${id}`,
      role: 'assistant',
      content: '',
      createdAt,
      reasoningSteps: steps,
      reasoningDurationMs: 0,
    })
  }

  const events = detail.events ?? []
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    const createdAt = toTimestamp(event.timestamp, Date.now())
    switch (event.type) {
      case 'user_message':
        turnToolIds.clear()
        flushPendingReasoningMessage(`before:${event.id}`, createdAt)
        {
          const attachments = normalizeSessionAttachmentRefs(event.attachments)
          messages = upsertOrderedMessage(messages, {
            id: event.id,
            role: 'user',
            content: event.content,
            createdAt,
            eventIndex: index,
            ...(attachments ? { attachments } : {}),
          })
        }
        break
      case 'session_end': {
        flushPendingReasoningMessage(`stop:${event.id}`, createdAt)
        const settled = buildInterruptedToolTransitions(messages, turnToolIds,
          event.stopReason?.kind === 'cancelled' ? 'cancelled' : 'error')
        for (const message of settled) {
          const approval = approvalStateByToolCallId.get(message.id.slice('tool:'.length))
          if (message.toolState === 'error' && (approval?.state === 'live' || approval?.resumeAvailable)) continue
          messages = upsertOrderedMessage(messages, message)
        }
        turnToolIds.clear()
        const notice = buildRunStopMessage(event.id, createdAt, event.stopReason)
        if (notice) messages = upsertOrderedMessage(messages, { ...notice, eventIndex: index })
        break
      }
      case 'assistant_message': {
        const reasoningSteps = takePendingReasoningSteps()
        const message: ChatMessage = {
          id: event.id,
          role: 'assistant',
          content: event.content,
          createdAt,
          eventIndex: index,
          ...(event.origin === 'scheduler' ? { origin: 'scheduler' as const } : {}),
          ...(event.views ? { views: event.views } : {}),
        }
        if (reasoningSteps) {
          message.reasoningSteps = reasoningSteps
          message.reasoningDurationMs = 0
        }
        messages = upsertOrderedMessage(messages, message)
        break
      }
      case 'router_decision':
        addPendingReasoningStep(
          event.id,
          createdAt,
          buildRouterDecisionReasoningEntry(event.decision),
        )
        break
      case 'quality_gate_verdict':
        addPendingReasoningStep(
          event.id,
          createdAt,
          buildQualityGateReasoningEntry(event),
        )
        break
      case 'backtrack':
        addPendingReasoningStep(event.id, createdAt, {
          kind: 'step',
          label: `되돌림: ${event.phase} · ${event.attempt}차`,
          detail: event.reason,
        })
        break
      case 'recovery':
        addPendingReasoningStep(event.id, createdAt, buildRecoveryReasoningEntry(event))
        break
      case 'run_contract':
        addPendingReasoningStep(event.id, createdAt, {
          kind: 'step',
          label: `실행 계약: 완료 조건 ${event.contract.acceptanceCriteria.length}개`,
          detail: event.contract.summary,
        })
        break
      case 'phase_change':
        addPendingReasoningStep(event.id, createdAt, {
          kind: 'step',
          label: `단계: ${event.enteredPhase ?? '마무리'}`,
          detail: event.closedPhase
            ? `${event.closedPhase.phase} 종료 · ${event.closedPhase.usage.inputTokens + event.closedPhase.usage.outputTokens} tokens`
            : undefined,
        })
        break
      case 'steering_ack':
        addPendingReasoningStep(event.id, createdAt, {
          kind: 'step',
          label: '추가 지시 대기',
          detail: event.message,
        })
        break
      case 'steering_consumed':
        addPendingReasoningStep(event.id, createdAt, {
          kind: 'step',
          label: '추가 지시 반영됨',
          detail: '진행 중인 에이전트가 추가 지시를 반영했습니다.',
        })
        break
      case 'mode_route_decision':
        addPendingReasoningStep(event.id, createdAt, buildModeRouteReasoningEntry(event))
        break
      case 'tool_call':
        turnToolIds.add(`tool:${event.id}`)
        toolNames.set(event.id, event.tool)
        messages = upsertOrderedMessage(messages, {
          ...buildToolMessage(`tool:${event.id}`, event.tool, event.input, createdAt, {
            state: event.status,
          }),
          eventIndex: index,
        })
        break
      case 'approval_request': {
        turnToolIds.add(`tool:${event.toolCallId}`)
        toolNames.set(event.toolCallId, event.tool)
        approvalToolCallIds.set(event.id, event.toolCallId)
        const approval = approvalStateByToolCallId.get(event.toolCallId)
        const state: ToolMessageState = approval?.state === 'stale' && !approval.resumeAvailable
          ? 'cancelled'
          : 'approval_required'
        messages = upsertOrderedMessage(messages, {
          ...buildToolMessage(
            `tool:${event.toolCallId}`,
            event.tool,
            {
              state,
              input: event.input,
            },
            createdAt,
            { state },
          ),
          eventIndex: index,
        })
        break
      }
      case 'approval_response': {
        const toolCallId = approvalToolCallIds.get(event.requestId)
        if (!toolCallId) break
        const state: ToolMessageState =
          event.approved && event.decision === 'approved' ? 'approved' : 'denied'
        if (state === 'denied') deniedToolCallIds.add(toolCallId)
        messages = updateToolMessageState(messages, toolCallId, state, createdAt, index)
        break
      }
      case 'auto_approval': {
        toolNames.set(event.toolCallId, event.tool)
        approvalToolCallIds.set(event.requestId, event.toolCallId)
        const state: ToolMessageState = event.decision === 'approved' ? 'approved' : 'denied'
        if (state === 'denied') deniedToolCallIds.add(event.toolCallId)
        messages = updateToolMessageState(messages, event.toolCallId, state, createdAt, index)
        break
      }
      case 'tool_result': {
        const lifecycle = resolveToolResultLifecycle(
          event.status,
          event.metadata,
          deniedToolCallIds.has(event.toolCallId),
        )
        messages = upsertOrderedMessage(messages, {
          ...buildToolMessage(
            `tool:${event.toolCallId}`,
            toolNames.get(event.toolCallId) ?? 'Tool',
            event.output,
            createdAt,
            {
              ...lifecycle,
              durationMs: event.duration_ms,
            },
          ),
          eventIndex: index,
        })
        break
      }
      case 'panel_open':
        messages = upsertOrderedMessage(messages, {
          ...buildPanelOpenMessage(`panel-open:${event.id}`, event.personas ?? [], createdAt),
          eventIndex: index,
        })
        break
      case 'panel_turn_complete':
        messages = upsertOrderedMessage(messages, {
          ...buildPanelTurnMessage(
            `panel:${event.personaId}:${event.id}`,
            {
              personaId: event.personaId,
              personaName: event.personaName,
              text: event.text,
            },
            createdAt,
          ),
          eventIndex: index,
        })
        break
      case 'panel_turn_failed':
        messages = upsertOrderedMessage(messages, {
          ...buildPanelTurnFailedMessage(
            `panel-fail:${event.personaId}:${event.id}`,
            { personaName: event.personaName, error: event.error },
            createdAt,
          ),
          eventIndex: index,
        })
        break
      case 'panel_synthesizing':
        messages = upsertOrderedMessage(messages, {
          ...buildPanelSynthesizingMessage(
            `panel-synth:${event.id}`,
            event.panelists ?? 0,
            createdAt,
          ),
          eventIndex: index,
        })
        break
      case 'cowork_plan':
      case 'cowork_task_start':
      case 'cowork_task_complete':
      case 'cowork_task_failed':
      case 'cowork_synthesizing':
      case 'cowork_discuss_request':
      case 'cowork_discuss_response':
        messages = upsertOrderedMessage(messages, {
          ...buildCoworkMessage(`cowork:${event.type}:${event.id}`, event, createdAt),
          eventIndex: index,
        })
        break
      default:
        break
    }
  }
  flushPendingReasoningMessage('end', Date.now())

  return messages
}

type ChatStreamPayloadResult = 'continue' | 'done' | 'error'

interface ChatStreamEventState {
  createdAt: number
  assistantId: string
  assistantContent: string
  assistantSeen: boolean
  toolNames: Map<string, string>
  toolInputs: Map<string, unknown>
  approvalToolCallIds: Map<string, string>
  deniedToolCallIds: Set<string>
  sessionId?: string
  workspaceRoot?: string
  reasoningSteps: ReasoningEntry[]
  reasoningStartedAt?: number
  reasoningDurationMs?: number
  toolMessageSignatures: Map<string, string>
  emittedApprovalRequestIds: Set<string>
  syntheticToolSequence: number
  eventSequence: number
  views: Map<string, LiveViewRecord>
  liveViewIds: Set<string>
}

function emitToolMessage(
  state: ChatStreamEventState,
  handlers: ChatStreamHandlers,
  message: ChatMessage,
): void {
  const signature = [
    message.toolName ?? '',
    message.toolState ?? '',
    message.content,
    message.toolDurationMs ?? '',
    message.toolPolicyReason ?? '',
    message.toolContentTruncated ? 'truncated' : '',
    message.toolOriginalChars ?? '',
    ...(message.toolImages ?? []).map((image) =>
      `${image.mediaType}:${image.data.length}:${image.data.slice(0, 16)}:${image.data.slice(-16)}`
    ),
  ].join('\u0000')
  if (state.toolMessageSignatures.get(message.id) === signature) return
  state.toolMessageSignatures.set(message.id, signature)
  handlers.onUpsertMessage(message)
}

function nextSyntheticToolId(state: ChatStreamEventState): string {
  state.syntheticToolSequence += 1
  return `missing-${state.syntheticToolSequence}`
}

function createChatStreamEventState(
  sessionId: string | undefined,
  workspaceRoot?: string,
): ChatStreamEventState {
  const createdAt = Date.now()
  return {
    createdAt,
    assistantId: `assistant:${sessionId ?? createdAt}:${createdAt}`,
    assistantContent: '',
    assistantSeen: false,
    toolNames: new Map<string, string>(),
    toolInputs: new Map<string, unknown>(),
    approvalToolCallIds: new Map<string, string>(),
    deniedToolCallIds: new Set<string>(),
    sessionId,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    reasoningSteps: [],
    toolMessageSignatures: new Map<string, string>(),
    emittedApprovalRequestIds: new Set<string>(),
    syntheticToolSequence: 0,
    eventSequence: 0,
    views: new Map<string, LiveViewRecord>(),
    liveViewIds: new Set<string>(),
  }
}

function upsertAssistantMessage(state: ChatStreamEventState, handlers: ChatStreamHandlers) {
  if (
    state.reasoningStartedAt != null &&
    state.reasoningDurationMs == null &&
    state.assistantContent.length > 0
  ) {
    state.reasoningDurationMs = Math.max(0, Date.now() - state.reasoningStartedAt)
  }
  handlers.onUpsertMessage({
    id: state.assistantId,
    role: 'assistant',
    content: state.assistantContent,
    createdAt: state.createdAt,
    reasoningSteps:
      state.reasoningSteps.length > 0
        ? state.reasoningSteps.map((step) => ({ ...step }))
        : undefined,
    reasoningDurationMs: state.reasoningDurationMs,
    reasoningStartedAt: state.reasoningStartedAt,
    ...(state.views.size > 0 ? { views: [...state.views.values()] } : {}),
    liveViewIds: [...state.liveViewIds],
  })
}

function viewRecord(
  view: { id: string; kind: LiveViewRecord['kind']; title: string; subtitle?: string },
  still: LiveViewRecord['still'],
): LiveViewRecord {
  return {
    id: view.id,
    kind: view.kind,
    title: view.title,
    ...(view.subtitle ? { subtitle: view.subtitle } : {}),
    still,
  }
}

function endLiveViews(state: ChatStreamEventState): void {
  state.liveViewIds.clear()
  for (const [id, record] of state.views) {
    if (record.still.image === '') state.views.delete(id)
  }
}

function settleLiveViews(state: ChatStreamEventState, handlers: ChatStreamHandlers): void {
  if (state.liveViewIds.size === 0 && ![...state.views.values()].some((v) => v.still.image === '')) return
  endLiveViews(state)
  if (state.assistantSeen) upsertAssistantMessage(state, handlers)
}

function failRun(state: ChatStreamEventState, handlers: ChatStreamHandlers, error: Error): void {
  settleLiveViews(state, handlers)
  handlers.onError(error)
}

function finalizeAssistantMessage(state: ChatStreamEventState, handlers: ChatStreamHandlers) {
  if (state.reasoningStartedAt != null && state.reasoningDurationMs == null) {
    state.reasoningDurationMs = Math.max(0, Date.now() - state.reasoningStartedAt)
  }
  endLiveViews(state)
  if (state.assistantSeen) upsertAssistantMessage(state, handlers)
}

function appendReasoningStep(
  state: ChatStreamEventState,
  handlers: ChatStreamHandlers,
  entry: ReasoningEntry,
) {
  const now = Date.now()
  if (state.reasoningStartedAt == null) state.reasoningStartedAt = now
  state.reasoningSteps.push(normalizeReasoningEntry({ at: now, ...entry }))
  if (!state.assistantSeen) {
    state.assistantSeen = true
  }
  upsertAssistantMessage(state, handlers)
}

function appendHarnessNote(
  state: ChatStreamEventState,
  handlers: ChatStreamHandlers,
  note: { tag: string; text: string },
) {
  const last = state.reasoningSteps[state.reasoningSteps.length - 1]
  if (note.tag === 'progress' && last && last.kind === 'step' && last.tag === 'progress') {
    last.label = note.text
    last.at = Date.now()
    upsertAssistantMessage(state, handlers)
    return
  }
  appendReasoningStep(state, handlers, { kind: 'step', tag: note.tag, label: note.text })
}

function buildLlmRequestReasoningEntry(digest: {
  model: string
  providerId?: string
  source?: string
  auxiliary?: boolean
  timeoutMs?: number
  maxOutputTokens?: number
}): ReasoningEntry {
  const target = [digest.providerId, digest.model].filter(Boolean).join('/')
  return {
    kind: 'step',
    tag: 'model',
    label: digest.auxiliary
      ? `보조 모델 응답 대기 · ${digest.model}`
      : `모델 응답 대기 · ${digest.model}`,
    detail: joinDetailLines([
      formatOptionalLine('대상', target || digest.model),
      formatOptionalLine('단계', digest.source),
      digest.maxOutputTokens != null ? `출력 상한: ${digest.maxOutputTokens} tokens` : undefined,
      digest.timeoutMs != null ? `첫 토큰 대기 상한: ${Math.ceil(digest.timeoutMs / 1000)}초` : undefined,
    ]),
  }
}

function handleChatStreamPayload(
  payload: DaemonChatStreamPayload,
  state: ChatStreamEventState,
  handlers: ChatStreamHandlers,
): ChatStreamPayloadResult {
  if (!('type' in payload)) {
    const sessionPayload = payload as { sessionId?: unknown }
    if (typeof sessionPayload.sessionId === 'string') {
      state.sessionId = sessionPayload.sessionId
      handlers.onSession?.(sessionPayload.sessionId)
    }
    return 'continue'
  }

  state.eventSequence += 1
  const eventKey = `${state.createdAt}:${state.eventSequence}`

  switch (payload.type) {
    case 'text_delta':
      state.assistantSeen = true
      state.assistantContent += payload.text ?? ''
      upsertAssistantMessage(state, handlers)
      return 'continue'
    case 'message':
      state.assistantSeen = true
      state.assistantContent = payload.content ?? state.assistantContent
      upsertAssistantMessage(state, handlers)
      return 'continue'
    case 'view_attached':
      state.assistantSeen = true
      state.liveViewIds.add(payload.view.id)
      if (!state.views.has(payload.view.id)) {
        state.views.set(
          payload.view.id,
          viewRecord(payload.view, { viewId: payload.view.id, image: '', width: 0, height: 0, capturedAt: 0 }),
        )
      }
      upsertAssistantMessage(state, handlers)
      return 'continue'
    case 'view_still':
      state.assistantSeen = true
      state.liveViewIds.add(payload.view.id)
      state.views.set(payload.view.id, viewRecord(payload.view, payload.still))
      upsertAssistantMessage(state, handlers)
      return 'continue'
    case 'view_detached':
      state.liveViewIds.delete(payload.viewId)
      if (state.views.get(payload.viewId)?.still.image === '') state.views.delete(payload.viewId)
      upsertAssistantMessage(state, handlers)
      return 'continue'
    case 'tool_call': {
      const toolId = payload.toolCall?.id || nextSyntheticToolId(state)
      const toolName = payload.toolCall?.name ?? 'Tool'
      const toolInput = payload.toolCall?.arguments ?? {}
      state.toolNames.set(toolId, toolName)
      state.toolInputs.set(toolId, toolInput)
      emitToolMessage(
        state,
        handlers,
        buildToolMessage(`tool:${toolId}`, toolName, toolInput, state.createdAt, {
          state: 'executing',
        }),
      )
      return 'continue'
    }
    case 'approval_request': {
      const toolId = payload.toolCall?.id || nextSyntheticToolId(state)
      const toolName = payload.toolCall?.name ?? 'Tool'
      const toolInput = payload.toolCall?.arguments ?? {}
      state.toolNames.set(toolId, toolName)
      state.toolInputs.set(toolId, toolInput)
      if (payload.requestId) state.approvalToolCallIds.set(payload.requestId, toolId)
      emitToolMessage(
        state,
        handlers,
        buildToolMessage(
          `tool:${toolId}`,
          toolName,
          {
            state: 'approval_required',
            input: toolInput,
          },
          state.createdAt,
          { state: 'approval_required' },
        ),
      )
      if (payload.requestId && !state.emittedApprovalRequestIds.has(payload.requestId)) {
        state.emittedApprovalRequestIds.add(payload.requestId)
        handlers.onApprovalRequest?.({
          requestId: payload.requestId,
          toolCallId: toolId,
          toolName,
          args: toolInput,
          sessionId:
            typeof payload.sessionId === 'string' ? payload.sessionId : state.sessionId,
          workspaceRoot: state.workspaceRoot,
          context: payload.context,
          previewDiff: payload.previewDiff,
          suggestedRule: payload.suggestedRule,
        })
      }
      return 'continue'
    }
    case 'approval_response': {
      const toolId = state.approvalToolCallIds.get(payload.requestId)
      if (!toolId) return 'continue'
      const toolState: ToolMessageState =
        payload.approved && payload.decision === 'approved' ? 'approved' : 'denied'
      if (toolState === 'denied') state.deniedToolCallIds.add(toolId)
      emitToolMessage(
        state,
        handlers,
        buildToolMessage(
          `tool:${toolId}`,
          state.toolNames.get(toolId) ?? 'Tool',
          state.toolInputs.get(toolId) ?? {},
          state.createdAt,
          { state: toolState },
        ),
      )
      return 'continue'
    }
    case 'auto_approval': {
      const toolId = payload.toolCall?.id || nextSyntheticToolId(state)
      const toolName = payload.toolCall?.name ?? 'Tool'
      const toolInput = payload.toolCall?.arguments ?? {}
      state.toolNames.set(toolId, toolName)
      state.toolInputs.set(toolId, toolInput)
      state.approvalToolCallIds.set(payload.requestId, toolId)
      const toolState: ToolMessageState = payload.decision === 'approved' ? 'approved' : 'denied'
      if (toolState === 'denied') state.deniedToolCallIds.add(toolId)
      emitToolMessage(
        state,
        handlers,
        buildToolMessage(`tool:${toolId}`, toolName, toolInput, state.createdAt, {
          state: toolState,
        }),
      )
      return 'continue'
    }
    case 'tool_result': {
      const toolId = payload.toolCallId || nextSyntheticToolId(state)
      const lifecycle = resolveToolResultLifecycle(
        payload.status,
        payload.metadata,
        state.deniedToolCallIds.has(toolId),
      )
      emitToolMessage(
        state,
        handlers,
        buildToolMessage(
          `tool:${toolId}`,
          state.toolNames.get(toolId) ?? 'Tool',
          payload.output,
          state.createdAt,
          {
            ...lifecycle,
            images: normalizeToolImages(payload.contentParts),
          },
        ),
      )
      return 'continue'
    }
    case 'execution_policy':
      handlers.onExecutionPolicy?.(payload.policy)
      appendReasoningStep(state, handlers, buildExecutionPolicyReasoningEntry(payload.policy))
      return 'continue'
    case 'context_usage':
      handlers.onContextUsage?.(payload.context)
      return 'continue'
    case 'llm_request':
      appendReasoningStep(state, handlers, buildLlmRequestReasoningEntry(payload.requestDigest))
      return 'continue'
    case 'action_progress':
      appendReasoningStep(state, handlers, {
        kind: 'step',
        tag: 'action',
        label: `다음 작업: ${payload.summary}`,
        detail: joinDetailLines([
          payload.nextStep,
          payload.toolNames.length > 0 ? `도구: ${payload.toolNames.join(', ')}` : undefined,
        ]),
      })
      return 'continue'
    case 'quality_gate_verdict':
      handlers.onQualityGateVerdict?.(payload)
      appendReasoningStep(state, handlers, buildQualityGateReasoningEntry(payload))
      return 'continue'
    case 'backtrack':
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: `되돌림: ${payload.phase} · ${payload.attempt}차`,
        detail: payload.reason,
      })
      return 'continue'
    case 'recovery':
      appendReasoningStep(state, handlers, buildRecoveryReasoningEntry(payload))
      return 'continue'
    case 'run_contract':
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: `실행 계약: 완료 조건 ${payload.contract.acceptanceCriteria.length}개`,
        detail: payload.contract.summary,
      })
      return 'continue'
    case 'phase_change':
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: `단계: ${payload.enteredPhase ?? '마무리'}`,
        detail: payload.closedPhase
          ? `${payload.closedPhase.phase} 종료 · ${payload.closedPhase.usage.inputTokens + payload.closedPhase.usage.outputTokens} tokens`
          : undefined,
      })
      return 'continue'
    case 'post_edit_findings': {
      const brokenCallers = payload.diagnostics.filter((diagnostic) =>
        diagnostic.summary.startsWith('[caller]'),
      )
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: brokenCallers.length > 0 ? `편집 영향: 호출자 오류 ${brokenCallers.length}건` : '편집 영향 분석',
        detail: joinDetailLines([
          payload.editedFiles.length > 0 ? `편집: ${payload.editedFiles.join(', ')}` : undefined,
          payload.reverseCallers.length > 0 ? `역방향 호출자: ${payload.reverseCallers.join(', ')}` : undefined,
          brokenCallers.map((diagnostic) => `${diagnostic.file}: ${diagnostic.summary}`).join('\n') || undefined,
        ]),
      })
      return 'continue'
    }
    case 'subagent_progress':
      appendReasoningStep(state, handlers, summarizeSubagentProgress(payload))
      return 'continue'
    case 'steering_ack':
      handlers.onSteeringEvent?.(payload)
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: '추가 지시 대기',
        detail: payload.message,
      })
      return 'continue'
    case 'steering_consumed':
      handlers.onSteeringEvent?.(payload)
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: '추가 지시 반영됨',
        detail: '진행 중인 에이전트가 추가 지시를 반영했습니다.',
      })
      return 'continue'
    case 'question_request':
      handlers.onQuestionRequest?.(payload)
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: '사용자 응답 대기',
        detail: joinDetailLines([
          payload.prompt,
          payload.choices?.length ? `선택지: ${payload.choices.join(' · ')}` : undefined,
        ]),
      })
      return 'continue'
    case 'planner_working_memory_updated':
      handlers.onPlannerWorkingMemoryUpdated?.(payload.workingMemory)
      return 'continue'
    case 'edit_checkpoint_resolved':
      handlers.onEditCheckpointResolved?.(payload.checkpoint)
      return 'continue'
    case 'debate_round':
      handlers.onDebateRound?.(payload.round)
      return 'continue'
    case 'router_decision':
      handlers.onRouting?.(payload.decision)
      appendReasoningStep(state, handlers, buildRouterDecisionReasoningEntry(payload.decision))
      return 'continue'
    case 'mode_route_decision':
      appendReasoningStep(state, handlers, buildModeRouteReasoningEntry(payload))
      return 'continue'
    case 'panel_open':
      handlers.onUpsertMessage(
        buildPanelOpenMessage(
          `panel-open:${eventKey}`,
          payload.personas ?? [],
          state.createdAt,
        ),
      )
      return 'continue'
    case 'panel_turn_complete':
      handlers.onUpsertMessage(
        buildPanelTurnMessage(
          `panel:${payload.personaId}:${eventKey}`,
          payload,
          state.createdAt,
        ),
      )
      return 'continue'
    case 'panel_turn_failed':
      handlers.onUpsertMessage(
        buildPanelTurnFailedMessage(
          `panel-fail:${payload.personaId}:${eventKey}`,
          payload,
          state.createdAt,
        ),
      )
      return 'continue'
    case 'panel_synthesizing':
      handlers.onUpsertMessage(
        buildPanelSynthesizingMessage(
          `panel-synth:${eventKey}`,
          payload.panelists ?? 0,
          state.createdAt,
        ),
      )
      return 'continue'
    case 'cowork_plan':
    case 'cowork_task_start':
    case 'cowork_task_complete':
    case 'cowork_task_failed':
    case 'cowork_synthesizing':
    case 'cowork_discuss_request':
    case 'cowork_discuss_response':
      handlers.onUpsertMessage(
        buildCoworkMessage(`cowork:${payload.type}:${eventKey}`, payload, state.createdAt),
      )
      if (payload.type === 'cowork_discuss_request') {
        handlers.onCoworkDiscussRequest?.(payload)
      }
      return 'continue'
    case 'thinking': {
      const text = payload.content ?? ''
      if (!text) return 'continue'
      const harnessNote = parseDaemonHarnessNote(text)
      if (harnessNote) {
        appendHarnessNote(state, handlers, harnessNote)
        return 'continue'
      }
      const now = Date.now()
      if (state.reasoningStartedAt == null) state.reasoningStartedAt = now
      const last = state.reasoningSteps[state.reasoningSteps.length - 1]
      if (last && last.kind === 'thinking') {
        appendBoundedReasoningDetail(last, text)
        last.at = now
      } else {
        const entry: ReasoningEntry = {
          kind: 'thinking',
          label: '모델 응답 준비',
          detail: '',
          at: now,
        }
        appendBoundedReasoningDetail(entry, text)
        state.reasoningSteps.push(entry)
      }
      if (!state.assistantSeen) {
        state.assistantSeen = true
        upsertAssistantMessage(state, handlers)
      } else {
        upsertAssistantMessage(state, handlers)
      }
      return 'continue'
    }
    case 'reasoning_step': {
      appendReasoningStep(state, handlers, {
        kind: 'step',
        label: payload.label,
        ...(payload.detail ? { detail: payload.detail } : {}),
      })
      return 'continue'
    }
    case 'warning':
      handlers.onWarning?.(payload)
      return 'continue'
    case 'error':
      finalizeAssistantMessage(state, handlers)
      {
        const error = new Error(formatStreamErrorMessage(payload.error?.message)) as Error & {
          code?: string
        }
        if (typeof payload.error?.code === 'string') error.code = payload.error.code
        handlers.onError(error)
      }
      return 'error'
    case 'done':
      finalizeAssistantMessage(state, handlers)
      {
        const notice = buildRunStopMessage(state.assistantId, Date.now(), payload.stopReason)
        if (notice) handlers.onUpsertMessage(notice)
      }
      handlers.onDone()
      return 'done'
    default:
      return 'continue'
  }
}

export async function createChatApi(transport: Transport | null): Promise<ChatApi> {
  const desktopApi = getDesktopApi()
  const daemon = desktopApi || !transport
    ? null
    : await makeDaemonRequestContext(transport, { memoryScope: true })

  return {
    async history(sessionId) {
      function toResult(detail: DaemonSessionDetail): ChatHistoryResult {
        const pendingApprovals = (detail.pendingApprovals ?? [])
          .filter((approval) => approval.state === 'live' || approval.resumeAvailable === true)
          .map((approval): PendingApproval => ({
            requestId: approval.requestId,
            toolCallId: approval.toolCallId,
            toolName: approval.tool,
            args: approval.input,
            sessionId: approval.sessionId,
            workspaceRoot: detail.cwd,
            sessionTitle: detail.title,
            ...(approval.state === 'stale'
              ? { state: 'stale' as const, resumeAvailable: approval.resumeAvailable === true }
              : {}),
          }))
        return {
          messages: mapSessionDetailToMessages(detail),
          events: detail.events,
          ...(pendingApprovals.length > 0 ? { pendingApprovals } : {}),
          editRollbacks: detail.editRollbacks ?? [],
          debateRounds: detail.debateRounds ?? [],
          plannerWorkingMemory: detail.plannerWorkingMemory ?? null,
        }
      }
      if (desktopApi) {
        const detail = await desktopApi.session(sessionId)
        return toResult(detail)
      }
      if (!daemon) throw new Error('browser daemon context is unavailable')
      const r = await fetch(daemon.url(`/sessions/${encodeURIComponent(sessionId)}`), {
        headers: daemon.headers(),
      })
      if (!r.ok) throw new Error(`chat.history failed (${r.status})`)
      const body = (await r.json()) as { data: DaemonSessionDetail }
      return toResult(body.data)
    },
    async resumeApproval(requestId, approved, sessionId, handlers, options) {
      const streamState = createChatStreamEventState(sessionId, options?.workspaceRoot)
      options?.signal?.addEventListener('abort', () => settleLiveViews(streamState, handlers), { once: true })
      if (options?.toolCall) {
        streamState.toolNames.set(options.toolCall.id, options.toolCall.name)
        streamState.toolInputs.set(options.toolCall.id, options.toolCall.arguments)
      }

      if (desktopApi) {
        let finished = false
        const abortRun = () => {
          if (!finished) desktopApi.cancelActiveRun(sessionId)
        }
        options?.signal?.addEventListener('abort', abortRun, { once: true })
        try {
          await desktopApi.streamApprovalResume(requestId, approved, sessionId, (payload) => {
            if (options?.signal?.aborted || finished) return
            if ('type' in payload && (payload.type === 'done' || payload.type === 'error')) {
              finished = true
            }
            if (handleChatStreamPayload(payload, streamState, handlers) !== 'continue') {
              finished = true
            }
          })
          if (!options?.signal?.aborted && !finished) {
            failRun(streamState, handlers, createIncompleteDaemonChatStreamError())
          }
        } catch (error) {
          if (!options?.signal?.aborted && !finished) failRun(streamState, handlers, error as Error)
        } finally {
          options?.signal?.removeEventListener('abort', abortRun)
        }
        return
      }

      if (!daemon) throw new Error('browser daemon context is unavailable')
      const response = await fetch(daemon.url('/approvals/resume'), {
        method: 'POST',
        headers: daemon.headers(),
        body: JSON.stringify({ requestId, approved, sessionId }),
        signal: options?.signal,
      })
      if (!response.ok) throw new Error(`chat.approval-resume failed (${response.status})`)

      try {
        for await (const payload of streamDaemonChatEvents<DaemonChatStreamPayload>(response)) {
          if (options?.signal?.aborted) return
          if (handleChatStreamPayload(payload, streamState, handlers) !== 'continue') return
        }
      } catch (error) {
        if (!options?.signal?.aborted) failRun(streamState, handlers, error as Error)
        return
      }
      if (!options?.signal?.aborted) failRun(streamState, handlers, createIncompleteDaemonChatStreamError())
    },
    async stream(sessionId, content, handlers, options) {
      const chatOptions = options?.chat
      const streamChatOptions: ChatStreamOptions =
        chatOptions?.textDeltaMode === 'buffered' || chatOptions?.mode === 'writing'
          ? chatOptions
          : { ...(chatOptions ?? {}), textDeltaMode: 'live' }
      const streamState = createChatStreamEventState(
        sessionId,
        streamChatOptions.workspaceRoot ?? streamChatOptions.cwd,
      )
      options?.signal?.addEventListener('abort', () => settleLiveViews(streamState, handlers), { once: true })

      if (desktopApi) {
        let finished = false
        const abortRun = () => {
          if (!finished) desktopApi.cancelActiveRun(sessionId)
        }
        options?.signal?.addEventListener('abort', abortRun, { once: true })
        try {
          await desktopApi.streamChat(content, sessionId, streamChatOptions, (payload) => {
            if (options?.signal?.aborted || finished) return

            if ('type' in payload && (payload.type === 'done' || payload.type === 'error')) {
              finished = true
            }
            const result = handleChatStreamPayload(payload, streamState, handlers)
            if (result !== 'continue') {
              finished = true
            }
          })

          if (!options?.signal?.aborted && !finished) {
            failRun(streamState, handlers, createIncompleteDaemonChatStreamError())
          }
          return
        } catch (error) {
          if (!options?.signal?.aborted && !finished) {
            failRun(streamState, handlers, error as Error)
          }
          return
        } finally {
          options?.signal?.removeEventListener('abort', abortRun)
        }
      }

      if (!daemon) throw new Error('browser daemon context is unavailable')
      const response = await fetch(daemon.url('/chat/stream'), {
        method: 'POST',
        headers: daemon.headers(),
        body: JSON.stringify({
          message: content,
          sessionId,
          ...streamChatOptions,
        }),
        signal: options?.signal,
      })

      if (!response.ok) {
        throw new Error(`chat.stream failed (${response.status})`)
      }

      try {
        for await (const payload of streamDaemonChatEvents<DaemonChatStreamPayload>(response)) {
          if (options?.signal?.aborted) {
            break
          }

          const result = handleChatStreamPayload(payload, streamState, handlers)
          if (result !== 'continue') {
            return
          }
        }
      } catch (error) {
        if (options?.signal?.aborted) {
          return
        }
        failRun(streamState, handlers, error as Error)
        return
      }

      if (options?.signal?.aborted) {
        return
      }
      failRun(streamState, handlers, createIncompleteDaemonChatStreamError())
    },
  }
}

export const handleChatStreamEventForTest = handleChatStreamPayload
export const createChatStreamEventStateForTest = createChatStreamEventState
