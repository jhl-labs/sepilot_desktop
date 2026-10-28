'use client'
import { supportsChatAttachments, backendChatOptions, chatBackend } from '@/lib/chat/chat-backends'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Bot, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotificationBar } from '@/components/ui/notification-bar'
import { ASSISTANT_SCENARIOS, buildAssistantRequest, type AssistantDestination, type AssistantRequest } from '@/lib/apps/assistant'
import { assistantModeSupport } from '@/lib/chat/assistant-mode-support'
import { assistantResultLinks } from '@/lib/chat/assistant-results'
import { toast } from 'sonner'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { RemoteBrowserPanel } from './RemoteBrowserPanel'
import type { BrowserConnection } from '@/lib/api/browser-remote'
import { useTransport } from '@/components/providers/transport-provider'
import { createChatApi, mapSessionDetailToMessages } from '@/lib/api/chat'
import { createSessionsApi } from '@/lib/api/sessions'
import { createImageGenApi, type ImageGenHardwareDevice } from '@/lib/api/image-gen'
import { createPersonaApi } from '@/lib/api/persona'
import { createSettingsApi } from '@/lib/api/settings'
import { createFilesApi } from '@/lib/api/files'
import { createVoiceApi } from '@/lib/api/voice'
import { createSessionQuestionsApi } from '@/lib/api/session-questions'
import { createSessionSteeringApi } from '@/lib/api/session-steering'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useChatAttachmentsStore } from '@/lib/store/chat-attachments-store'
import { useWritingDocStore } from '@/lib/store/writing-mode-store'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { loadImageGenDefaults, resolveImageGenSizePreset } from '@/lib/utils/image-gen-defaults'
import { getDesktopApi } from '@/lib/electron/bridge'
import { useSessionWorkspaceBinding } from '@/lib/hooks/use-session-workspace-binding'
import { useBackgroundChat } from '@/lib/hooks/use-background-chat'
import { SessionInboxStrip } from './SessionInboxStrip'
import { BrowserPrerequisiteNotice } from './BrowserPrerequisiteNotice'
import { ChatMessage } from './unified/ChatMessage'
import { ToolCard } from './unified/ToolCard'
import { ToolEventGroup } from './unified/ToolEventGroup'
import { ChatItemErrorBoundary } from './unified/ChatItemErrorBoundary'
import { ChatComposer } from './unified/ChatComposer'
import {
  SessionPersonaBar,
  useResolvedSessionPersonas,
} from '@/components/persona/SessionPersonaRoster'
import { PlannerProgressPanel } from './panels/PlannerProgressPanel'
import { EditRollbackPanel } from './panels/EditRollbackPanel'
import { CheckpointReviewPanel } from './panels/CheckpointReviewPanel'
import { DebatePanel } from './panels/DebatePanel'
import { LLMStatusBar } from './LLMStatusBar'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { normalizeChatMode, toDaemonMode, type ChatModeId } from '@/lib/chat/chat-modes'
import type { SlashDispatchResult } from '@/lib/chat/slash-commands'
import { buildChatTranscriptItems, currentTurnAssistantId, currentTurnToolGroupId, needsTurnWaitingIndicator } from '@/lib/chat/transcript-items'
import { useTranscriptScroll } from '@/lib/chat/use-transcript-scroll'
import {
  beginSessionRun,
  finishSessionRun,
  getSessionRun,
  isSessionRunLive,
  markSessionRunMessageFailed,
  recordSessionRunMessage,
  settleSessionRunTools,
  takeSessionRunReplay,
} from '@/lib/chat/session-run-registry'
import {
  buildInterruptedToolTransitions,
  toolTerminalStateForStreamFailure,
  type InterruptedToolTerminalState,
} from '@/lib/chat/tool-run-lifecycle'
import { normalizeSessionPersonaIds } from '@/lib/chat/session-personas'
import { useSkillsStore } from '@/lib/store/skills-store'
import { useRunTelemetryStore } from '@/lib/store/run-telemetry-store'
import { RunTelemetryBar } from './RunTelemetryBar'
import { useTranslation } from 'react-i18next'

const WRITING_MODE_TOOL_NAMES = [
  'doc.get',
  'doc.outline',
  'doc.replace_section',
  'doc.replace_range',
  'doc.insert_after_section',
  'doc.append',
  'doc.rewrite',
  'doc.diff_preview',
] as const

function isWindowsBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Win/i.test(`${navigator.platform} ${navigator.userAgent}`)
}

function preferredAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime))
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

function applyImageGenDeviceParams(
  params: Record<string, unknown>,
  devices: ImageGenHardwareDevice[],
  deviceId: string,
): void {
  if (deviceId === 'auto') {
    params.device = 'auto'
    return
  }
  const device = devices.find((item) => item.id === deviceId)
  if (!device) return
  params.device = device.kind
  if (device.kind === 'cuda' && device.index != null) params.gpuIndex = device.index
  if (device.kind === 'cpu') params.allowCpu = true
}

function TranscriptSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-2.5 rounded-lg px-3 py-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-full max-w-md rounded bg-muted" />
            {i % 2 === 0 ? <div className="h-3 w-3/4 max-w-sm rounded bg-muted" /> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function sessionTimestamp(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number.parseInt(value, 10)
    if (Number.isFinite(numeric)) return numeric
  }
  return fallback
}

export type ExternalChatMessageDelivery = {
  deliveryId: string
  sessionId: string
  text: string
  mode?: 'send' | 'draft'
}

function BuiltinChatContainer({
  onSlashCommand,
  onOpenSettings,
  onOpenSnippets,
  onOpenSkills,
  externalMessage,
  onExternalMessageConsumed,
  onStartAssistant,
  onOpenResource,
}: {
  onSlashCommand?: (input: string) => SlashDispatchResult
  onOpenSettings?: () => void
  onOpenSnippets?: () => void
  onOpenSkills?: () => void
  externalMessage?: ExternalChatMessageDelivery | null
  onExternalMessageConsumed?: (deliveryId: string) => void
  onStartAssistant?: (request: AssistantRequest) => void
  onOpenResource?: (destination: AssistantDestination) => void
} = {}) {
  const { t } = useTranslation()
  const transport = useTransport()
  const activeId = useSessionStore((s) => s.activeId)
  const sessions = useSessionStore((s) => s.sessions)
  const upsertSession = useSessionStore((s) => s.upsertSession)
  const setActive = useSessionStore((s) => s.setActive)
  const messages = useChatStore((s) => s.messages)
  const append = useChatStore((s) => s.appendMessage)
  const upsert = useChatStore((s) => s.upsertMessage)
  const setPending = useChatStore((s) => s.setPending)
  const clear = useChatStore((s) => s.clear)
  const resetForSessionSwitch = useChatStore((s) => s.resetForSessionSwitch)
  const pending = useChatStore((s) => s.pending)
  const setPlannerWorkingMemory = useChatStore((s) => s.setPlannerWorkingMemory)
  const appendEditRollback = useChatStore((s) => s.appendEditRollback)
  const appendDebateRound = useChatStore((s) => s.appendDebateRound)
  const enqueueApproval = useChatStore((s) => s.enqueueApproval)
  const pendingApprovalCount = useChatStore((s) => s.pendingApprovals.length)
  const setMessageFailed = useChatStore((s) => s.setMessageFailed)
  const removeMessagesFromId = useChatStore((s) => s.removeMessagesFromId)
  const setComposer = useChatStore((s) => s.setComposer)
  const plannerWorkingMemory = useChatStore((s) => s.plannerWorkingMemory)
  const editRollbacks = useChatStore((s) => s.editRollbacks)
  const debateRounds = useChatStore((s) => s.debateRounds)
  const beginRunTelemetry = useRunTelemetryStore((s) => s.beginRun)
  const clearRunTelemetry = useRunTelemetryStore((s) => s.clear)
  const setExecutionPolicy = useRunTelemetryStore((s) => s.setExecutionPolicy)
  const setContextUsage = useRunTelemetryStore((s) => s.setContextUsage)
  const setQualityGate = useRunTelemetryStore((s) => s.setQualityGate)
  const recordSteeringAck = useRunTelemetryStore((s) => s.recordSteeringAck)
  const markSteeringConsumed = useRunTelemetryStore((s) => s.markSteeringConsumed)
  const markSteeringCancelled = useRunTelemetryStore((s) => s.markSteeringCancelled)
  const llm = useSettingsStore((s) => s.llm)
  const setLlm = useSettingsStore((s) => s.setLlm)
  const backendId = useChatModeStore((s) => s.backend)
  const backend = chatBackend(backendId)
  const backendModel = useChatModeStore((s) => s.backendModels[backendId])
  const chatMode = useChatModeStore((s) => s.mode)
  const selectedBot = useChatModeStore((s) => s.bot)
  const modeExplicit = useChatModeStore((s) => s.modeExplicit)
  const chatModes = useChatModeStore((s) => s.catalog)
  const thinkingLevel = useChatModeStore((s) => s.thinkingLevel)
  const disableMemory = useChatModeStore((s) => s.disableMemory)
  const enableRAG = useChatModeStore((s) => s.enableRAG) && backend.daemonFeatures
  const enableImageGen = useChatModeStore((s) => s.enableImageGen) && backend.daemonFeatures
  const inputTrustLevel = useChatModeStore((s) => s.inputTrustLevel)
  const selectedSkillIds = useSkillsStore((s) => s.selectedIds)
  const skillItems = useSkillsStore((s) => s.items)
  const attachments = useChatAttachmentsStore((s) => s.attachments)
  const addAttachments = useChatAttachmentsStore((s) => s.add)
  const clearAttachments = useChatAttachmentsStore((s) => s.clear)
  const writingDocId = useWritingDocStore((s) => s.docId)
  const transcriptScroll = useTranscriptScroll(activeId, messages)
  const consumedExternalMessageIdsRef = useRef(new Set<string>())
  const [historyReadySessionId, setHistoryReadySessionId] = useState<string | null>(null)
  const activeRunAbortRef = useRef<AbortController | null>(null)
  const activeRunToolMessageIdsRef = useRef<Set<string> | null>(null)
  const optimisticImageUrlsRef = useRef(new Set<string>())
  const pendingQuestion = useChatStore((s) => s.pendingQuestion)
  const setPendingQuestion = useChatStore((s) => s.setPendingQuestion)
  const [historyLoading, setHistoryLoading] = useState(false)
  const { workspacePath: workingDir, bindWorkspace } = useSessionWorkspaceBinding(transport)

  const activeSession = sessions.find((session) => session.id === activeId) ?? null
  const assistantMode = chatModes.find((mode) => mode.id === (
    (activeSession?.personaIds?.length ?? 0) > 1 ? 'persona-panel' : chatMode
  ))
  const assistantSupport = !backend.daemonFeatures
    ? { access: 'handoff', description: t('chatBackend.limits') }
    : assistantMode
    ? assistantModeSupport(assistantMode, (key) => t(key))
    : undefined
  const sessionPersonaIds = useMemo(
    () => normalizeSessionPersonaIds(activeSession?.personaIds),
    [activeSession?.personaIds],
  )
  const activeSessionPersonas = useResolvedSessionPersonas(activeSession)
  const assistantPersona = sessionPersonaIds.length === 1 ? activeSessionPersonas[0] : undefined
  const currentModeMeta = chatModes.find((mode) => mode.id === chatMode)

  useEffect(() => {
    return () => {
      for (const url of optimisticImageUrlsRef.current) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
      optimisticImageUrlsRef.current.clear()
    }
  }, [activeId])

  const ensureWorkingDir = useCallback(
    async (required = false): Promise<string | null> => {
      if (!required && !currentModeMeta?.needsWorkingDir) return workingDir ?? null
      if (workingDir) return workingDir

      const selected = await getDesktopApi()?.selectDirectory(undefined)
      if (typeof selected !== 'string' || selected.trim().length === 0) {
        toast.error('작업 디렉토리가 필요합니다.', {
          description: `${currentModeMeta?.label ?? '이 작업'}의 실행 기준 폴더를 먼저 선택해야 합니다.`,
        })
        return null
      }

      if (!(await bindWorkspace(selected))) return null
      return selected.trim()
    },
    [bindWorkspace, currentModeMeta, workingDir],
  )

  const restoreComposerDraft = useCallback(
    (text: string) => {
      setComposer(text)
      if (attachments.length > 0) addAttachments(attachments)
    },
    [addAttachments, attachments, setComposer],
  )

  const terminalizeRunTools = useCallback(
    (toolMessageIds: Iterable<string>, terminalState: InterruptedToolTerminalState) => {
      const transitions = buildInterruptedToolTransitions(
        useChatStore.getState().messages,
        toolMessageIds,
        terminalState,
      )
      transitions.forEach(upsert)
    },
    [upsert],
  )

  useEffect(() => {
    let cancelled = false
    setHistoryReadySessionId(null)
    const run = activeId && isSessionRunLive(activeId) ? getSessionRun(activeId) : undefined
    activeRunAbortRef.current = run?.controller ?? null
    activeRunToolMessageIdsRef.current = run?.toolIds ?? null
    resetForSessionSwitch()
    setPending(Boolean(run))
    if (run && activeId) beginRunTelemetry(activeId)
    else clearRunTelemetry()
    setPendingQuestion(null)
    if (!activeId) {
      setHistoryLoading(false)
      return
    }
    setHistoryLoading(true)
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const api = await createChatApi(transport)
        const history = await api.history(activeId)
        if (cancelled) return
        useRunTelemetryStore.getState().restoreRouting(activeId, history.events ?? [])
        history.messages.forEach(upsert)
        for (const approval of history.pendingApprovals ?? []) {
          enqueueApproval(approval)
        }
        if (history.plannerWorkingMemory) setPlannerWorkingMemory(history.plannerWorkingMemory)
        history.editRollbacks.forEach(appendEditRollback)
        history.debateRounds.forEach(appendDebateRound)
      } catch {
      } finally {
        if (!cancelled) {
          const replay = takeSessionRunReplay(activeId)
          replay.messages.forEach(upsert)
          if (!replay.live) setPending(false)
          setHistoryReadySessionId(activeId)
          setHistoryLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      activeRunAbortRef.current = null
      activeRunToolMessageIdsRef.current = null
    }
  }, [
    activeId,
    transport,
    upsert,
    setPending,
    resetForSessionSwitch,
    setPlannerWorkingMemory,
    appendEditRollback,
    appendDebateRound,
    enqueueApproval,
    beginRunTelemetry,
    clearRunTelemetry,
    setPendingQuestion,
  ])

  const activeSessionUpdatedAt = activeSession?.updatedAt
  const activeSessionUpdatedAtRef = useRef<number | string | undefined>(undefined)
  activeSessionUpdatedAtRef.current = activeSessionUpdatedAt
  const hydratedUpdatedAtRef = useRef<number | string | undefined>(undefined)
  useEffect(() => {
    hydratedUpdatedAtRef.current = activeSessionUpdatedAtRef.current
  }, [activeId])
  useEffect(() => {
    if (!activeId || historyLoading) return
    if (activeSessionUpdatedAt === hydratedUpdatedAtRef.current) return
    if (pending || activeRunAbortRef.current) return
    hydratedUpdatedAtRef.current = activeSessionUpdatedAt
    let cancelled = false
    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      try {
        const api = await createChatApi(transport)
        const history = await api.history(activeId)
        if (cancelled) return
        history.messages.forEach(upsert)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeId, activeSessionUpdatedAt, historyLoading, pending, transport, upsert])

  useEffect(() => {
    if (!activeId || pending) return
    let cancelled = false
    let dispose: (() => void) | undefined

    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      const desktopApi = getDesktopApi()
      if (!desktopApi?.watchSession) return
      const nextDispose = await desktopApi.watchSession(activeId, (event) => {
        if (cancelled || event.type === 'heartbeat') return
        if (event.type === 'deleted') {
          clear()
          setActive(null)
          return
        }
        if (event.type !== 'snapshot') return
        const detail = event.session
        useRunTelemetryStore.getState().restoreRouting(detail.id, detail.events)
        for (const message of mapSessionDetailToMessages(detail)) {
          upsert(message)
        }
        const now = Date.now()
        upsertSession({
          id: detail.id,
          title: detail.title,
          createdAt: sessionTimestamp(detail.createdAt, now),
          updatedAt: sessionTimestamp(detail.updatedAt, now),
          cwd: detail.cwd ?? undefined,
          workspaceIsolation: detail.workspaceIsolation,
          provider: detail.provider,
          model: detail.model,
          device: detail.device,
          isRunning: detail.isRunning,
          tags: detail.tags ?? [],
          ...(detail.personaIds !== undefined ? { personaIds: detail.personaIds } : {}),
          isDraft: false,
        })
      })
      if (cancelled) {
        nextDispose()
        return
      }
      dispose = nextDispose
    })().catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [activeId, clear, pending, setActive, transport, upsert, upsertSession])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      try {
        const current = await (await createSettingsApi(transport)).getLlm()
        if (cancelled) return
        const local = useSettingsStore.getState().llm
        if (!local.providerId || !local.modelId) {
          setLlm(current)
        }
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, setLlm])

  const replacePersonaItemsIfUnchanged = usePersonaStore((s) => s.replaceItemsIfUnchanged)
  useEffect(() => {
    let cancelled = false
    const startedAtRevision = usePersonaStore.getState().revision
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const list = await (await createPersonaApi(transport)).list()
        if (!cancelled) replacePersonaItemsIfUnchanged(list, startedAtRevision)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, replacePersonaItemsIfUnchanged])

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    let unsub: (() => void) | null = null
    const revoked: string[] = []
    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      const api = await createImageGenApi(transport)
      unsub = api.events({
        onJob: (job) => {
          if (cancelled) return
          if (job.status !== 'succeeded' || job.outputs.length === 0) return
          void (async () => {
            const blobs = await Promise.all(
              job.outputs.map((o) => api.fileFetch(o.id).catch(() => null)),
            )
            if (cancelled) return
            const urls = blobs.flatMap((b) => (b ? [URL.createObjectURL(b)] : []))
            revoked.push(...urls)
            const sysId = `sys-img-${job.id}`
            const target = useChatStore.getState().messages.find((m) => m.id === sysId)
            if (target) {
              upsert({ ...target, imageUrls: urls })
            }
          })()
        },
        onError: () => {},
      })
    })()
    return () => {
      cancelled = true
      unsub?.()
      revoked.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [activeId, transport, upsert])

  const [observedBrowserConnection, setBrowserConnection] = useState<BrowserConnection>()
  const [browserPanelOpenRequest, setBrowserPanelOpenRequest] = useState({ sessionId: '', version: 0 })
  const browserConnection = backend.daemonFeatures && observedBrowserConnection?.sessionId === activeId
    ? observedBrowserConnection : undefined
  const transcriptItems = useMemo(() => buildChatTranscriptItems(messages), [messages])
  const liveToolGroupId = useMemo(() => currentTurnToolGroupId(transcriptItems), [transcriptItems])
  const streamingAssistantId = useMemo(() => currentTurnAssistantId(messages), [messages])
  const lastAssistantMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') return messages[index].id
    }
    return null
  }, [messages])

  const [chatMaxWidth, setChatMaxWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 1024
    const raw = window.localStorage.getItem('sepilot_chat_message_width')
    const parsed = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(parsed) && parsed >= 640 && parsed <= 1536 ? parsed : 1024
  })
  const [voiceCaptureMode, setVoiceCaptureMode] = useState<'conversation' | 'meeting_notes' | null>(
    null,
  )
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceModeRef = useRef<'conversation' | 'meeting_notes' | null>(null)
  const meetingQueueRef = useRef(Promise.resolve())
  const voiceAudioUrlRef = useRef<string | null>(null)
  useEffect(() => {
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<number>).detail
      if (typeof detail === 'number' && detail >= 640 && detail <= 1536) {
        setChatMaxWidth(detail)
      }
    }
    window.addEventListener('sepilot:chat-width-changed', onChanged as EventListener)
    return () =>
      window.removeEventListener('sepilot:chat-width-changed', onChanged as EventListener)
  }, [])

  function summarizeTitle(text: string): string {
    const normalized = text.trim().replace(/\s+/g, ' ')
    if (!normalized) return '새 대화'
    return normalized.length > 48 ? `${normalized.slice(0, 45).trimEnd()}...` : normalized
  }

  const playVoiceAudio = useCallback(
    async (fileId: string) => {
      const api = await createVoiceApi(transport)
      const blob = await api.audioBlob(fileId)
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current)
      const url = URL.createObjectURL(blob)
      voiceAudioUrlRef.current = url
      const audio = new Audio(url)
      await audio.play()
    },
    [transport],
  )

  const submitVoiceBlob = useCallback(
    async (blob: Blob, purpose: 'conversation' | 'meeting_notes') => {
      if (!activeId || blob.size === 0) return
      if (await isBrowserPreviewTransport(transport)) {
        toast.error('브라우저 미리보기에서는 음성 처리가 제한됩니다.')
        return
      }
      setVoiceProcessing(true)
      try {
        const mimeType = blob.type || 'audio/webm'
        const file = new File([blob], `desktop-voice-${Date.now()}.${audioExtension(mimeType)}`, {
          type: mimeType,
        })
        const filesApi = await createFilesApi(transport)
        const [uploaded] = await filesApi.upload([file])
        if (!uploaded) throw new Error('음성 파일 업로드 결과가 비어 있습니다.')

        const voiceApi = await createVoiceApi(transport)
        const result = await voiceApi.voiceTurn({
          fileId: uploaded.id,
          sessionId: activeId,
          provider: llm.providerId ?? activeSession?.provider,
          model: llm.modelId ?? activeSession?.model,
          thinkingLevel: thinkingLevel ?? undefined,
          purpose,
          tts: purpose === 'conversation' ? autoSpeak : false,
        })
        const now = Date.now()
        append({
          id: `voice-u-${now}`,
          role: 'user',
          content:
            purpose === 'meeting_notes'
              ? `[연속 음성 기록]\n${result.transcript}`
              : result.transcript,
          createdAt: now,
        })
        upsert({
          id: result.messageId,
          role: 'assistant',
          content: result.content,
          createdAt: Date.now(),
        })
        upsertSession({
          id: result.sessionId,
          title:
            activeSession?.title && activeSession.title !== '새 대화'
              ? activeSession.title
              : summarizeTitle(result.transcript),
          createdAt: activeSession?.createdAt ?? now,
          updatedAt: Date.now(),
          provider: llm.providerId ?? activeSession?.provider,
          model: llm.modelId ?? activeSession?.model,
          device: activeSession?.device,
          tags: activeSession?.tags ?? [],
          personaIds: activeSession?.personaIds,
          isPinned: activeSession?.isPinned,
          titleDirty: activeSession?.titleDirty,
          isDraft: false,
        })
        if (result.speech.error) {
          toast.error('TTS 생성에 실패했습니다.', {
            description: result.speech.error.message,
          })
        }
        if (result.audio?.fileId) {
          await playVoiceAudio(result.audio.fileId).catch((error) => {
            toast.error('음성 재생에 실패했습니다.', {
              description: error instanceof Error ? error.message : String(error),
            })
          })
        }
      } catch (error) {
        const friendly = explainChatStreamError(error)
        toast.error(friendly.title, { description: friendly.description })
      } finally {
        setVoiceProcessing(false)
      }
    },
    [
      activeId,
      activeSession,
      append,
      autoSpeak,
      llm.modelId,
      llm.providerId,
      playVoiceAudio,
      thinkingLevel,
      transport,
      upsert,
      upsertSession,
    ],
  )

  const enqueueMeetingBlob = useCallback(
    (blob: Blob) => {
      meetingQueueRef.current = meetingQueueRef.current
        .then(() => submitVoiceBlob(blob, 'meeting_notes'))
        .catch(() => {})
    },
    [submitVoiceBlob],
  )

  const stopVoiceCapture = useCallback(() => {
    const recorder = voiceRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    voiceStreamRef.current = null
    setVoiceCaptureMode(null)
  }, [])

  const startVoiceCapture = useCallback(
    async (mode: 'conversation' | 'meeting_notes') => {
      if (!activeId) return
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') return
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        toast.error('이 환경에서는 마이크 녹음을 사용할 수 없습니다.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mimeType = preferredAudioMimeType()
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        voiceChunksRef.current = []
        voiceModeRef.current = mode
        voiceStreamRef.current = stream
        voiceRecorderRef.current = recorder
        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size === 0) return
          if (voiceModeRef.current === 'meeting_notes') {
            enqueueMeetingBlob(event.data)
          } else {
            voiceChunksRef.current.push(event.data)
          }
        }
        recorder.onstop = () => {
          const stoppedMode = voiceModeRef.current
          const chunks = voiceChunksRef.current
          const type = recorder.mimeType || mimeType || 'audio/webm'
          voiceRecorderRef.current = null
          voiceModeRef.current = null
          voiceChunksRef.current = []
          stream.getTracks().forEach((track) => track.stop())
          if (stoppedMode === 'conversation' && chunks.length > 0) {
            void submitVoiceBlob(new Blob(chunks, { type }), 'conversation')
          }
        }
        recorder.onerror = () => {
          toast.error('마이크 녹음 중 오류가 발생했습니다.')
          stopVoiceCapture()
        }
        setVoiceCaptureMode(mode)
        recorder.start(mode === 'meeting_notes' ? 60_000 : undefined)
        toast.info(
          mode === 'meeting_notes'
            ? '연속 입력을 시작했습니다. 60초마다 구간을 정리합니다.'
            : '음성 입력을 시작했습니다. 마이크 버튼을 다시 누르면 전송합니다.',
        )
      } catch (error) {
        toast.error('마이크 권한이 필요합니다.', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [activeId, enqueueMeetingBlob, stopVoiceCapture, submitVoiceBlob],
  )

  useEffect(() => {
    return () => {
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current)
      voiceRecorderRef.current?.stop()
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const onSend = useCallback(
    async (text: string) => {
      if (!activeId) return
      if (await isBrowserPreviewTransport(transport)) {
        toast.error('브라우저 미리보기에서는 daemon 스트리밍이 제한됩니다.', {
          description: '실제 채팅 실행은 Electron 창에서 확인하세요.',
        })
        return
      }

      if (pending) {
        if (!backend.daemonFeatures) return
        const messageId = `u-steer-${Date.now()}`
        append({
          id: messageId,
          role: 'user',
          content: text,
          createdAt: Date.now(),
        })
        try {
          const steering = await createSessionSteeringApi(transport)
          const result = await steering.steer(activeId, text, 'instruction')
          recordSteeringAck({ noteId: result.noteId, kind: 'instruction', message: text })
          toast.success('진행 중인 작업에 지시를 추가했습니다.')
        } catch (error) {
          setMessageFailed(messageId, true)
          const friendly = explainChatStreamError(error)
          toast.error('추가 지시를 보내지 못했습니다.', { description: friendly.description })
        }
        return
      }

      if (pendingQuestion) {
        const question = pendingQuestion
        setPendingQuestion(null)
        setPending(true)
        append({
          id: `u-question-${Date.now()}`,
          role: 'user',
          content: text,
          createdAt: Date.now(),
        })
        try {
          const desktopApi = getDesktopApi()
          if (desktopApi?.answerSessionQuestion) {
            await desktopApi.answerSessionQuestion(question.sessionId, question.id, text)
          } else {
            const questionsApi = await createSessionQuestionsApi(transport)
            await questionsApi.answer(question.sessionId, question.id, text)
          }
        } catch (error) {
          setPendingQuestion(question)
          setPending(false)
          toast.error('협업 질문 응답을 보내지 못했습니다.', {
            description: error instanceof Error ? error.message : String(error),
          })
        }
        return
      }

      if (!supportsChatAttachments(backendId, attachments.map((file) => file.mimeType))) {
        toast.error(t('chatBackend.imagesOnly'))
        return
      }
      const sessionPerspectivesActive = backend.daemonFeatures && sessionPersonaIds.length > 1
      const effectiveChatMode: ChatModeId = !backend.daemonFeatures ? 'instant' : sessionPerspectivesActive
        ? 'persona-panel'
        : chatMode === 'persona-panel'
          ? 'instant'
          : normalizeChatMode(chatMode, chatModes)
      const requiresWorkingDir = (!backend.daemonFeatures || Boolean(currentModeMeta?.needsWorkingDir))
      const effectiveWorkingDir = await ensureWorkingDir(requiresWorkingDir)
      if (requiresWorkingDir && !effectiveWorkingDir) return

      if (effectiveChatMode === 'writing' && !writingDocId) {
        toast.error('글쓰기 문서가 아직 준비되지 않았습니다.', {
          description: '오른쪽 문서 패널이 열린 뒤 다시 전송하세요.',
        })
        return
      }

      if (enableImageGen && effectiveChatMode !== 'instant') {
        toast.error('이미지 생성은 즉시 응답 모드에서만 전송할 수 있습니다.', {
          description:
            '선택한 chat 모드가 조용히 무시되지 않도록 이미지 토글을 끄거나 즉시 응답으로 전환하세요.',
        })
        return
      }

      if (enableImageGen && attachments.length > 0) {
        toast.error('이미지 생성 요청에는 첨부를 사용할 수 없습니다.', {
          description: '현재 이미지 생성 경로는 입력 텍스트만 prompt로 사용합니다.',
        })
        return
      }

      if (enableImageGen) {
        try {
          const imageApi = await createImageGenApi(transport)
          const providers = await imageApi.providers()
          const defaults = loadImageGenDefaults()
          const preferred =
            defaults.providerId && defaults.providerId !== 'dummy'
              ? providers.find((p) => p.id === defaults.providerId && p.enabled)
              : null
          const provider =
            preferred ??
            (llm.providerId === 'codex'
              ? providers.find((p) => p.id === 'codex' && p.enabled)
              : null) ??
            providers.find((p) => p.enabled && p.id !== 'dummy') ??
            providers.find((p) => p.enabled) ??
            providers[0]
          if (!provider) {
            toast.error('이미지 생성 프로바이더가 설정되지 않았습니다.', {
              description: '설정 → Image 탭에서 프로바이더를 활성화하세요.',
            })
            return
          }
          const size = resolveImageGenSizePreset(defaults.sizePreset)
          const selectedRecommendation = provider.recommendedModels?.find(
            (model) => model.id === defaults.model.trim(),
          )
          const params: Record<string, unknown> = {
            operation: 'text-to-image',
            translatePrompt: 'always',
            width: size.width,
            height: size.height,
            steps: defaults.steps,
            guidanceScale: defaults.cfgScale,
            cfgScale: defaults.cfgScale,
            count: defaults.batchSize,
            batchSize: defaults.batchSize,
          }
          const selectedModelId = selectedRecommendation?.modelId ?? defaults.model.trim()
          if (selectedModelId) params.model = selectedModelId
          if (provider.id === 'local-python' && isWindowsBrowser()) {
            params.python = 'python'
          }
          if (provider.hardware?.supportsDeviceSelection) {
            const hardware = await imageApi.hardware().catch(() => null)
            applyImageGenDeviceParams(
              params,
              hardware?.devices.filter((device) => device.available) ?? [],
              defaults.deviceId,
            )
          }
          if (defaults.seed >= 0) params.seed = defaults.seed
          if (defaults.negativePrompt.trim()) {
            params.negativePrompt = defaults.negativePrompt.trim()
          }
          const now = Date.now()
          append({
            id: `u-${now}`,
            role: 'user',
            content: text,
            createdAt: now,
          })
          const job = await imageApi.enqueue({
            providerId: provider.id,
            prompt: text,
            params,
          })
          const assistantContent = `이미지 생성 큐에 등록되었습니다 (${provider.label}). Canvas에서 결과를 확인하세요.`
          try {
            const sessionsApi = await createSessionsApi(transport)
            const persisted = await sessionsApi.transcriptTurn(activeId, {
              userContent: text,
              assistantContent,
              title: summarizeTitle(text),
              provider: provider.id,
              model: selectedModelId || undefined,
              cwd: effectiveWorkingDir ?? undefined,
              tags: ['image-gen'],
            })
            upsertSession(persisted)
          } catch (error) {
            toast.error('이미지 요청 대화 기록 저장에 실패했습니다.', {
              description: error instanceof Error ? error.message : String(error),
            })
          }
          append({
            id: `sys-img-${job.id}`,
            role: 'system',
            content: assistantContent,
            createdAt: Date.now(),
          })
          toast.success('이미지 생성 큐에 등록되었습니다.')
        } catch (error) {
          const friendly = explainChatStreamError(error)
          toast.error(friendly.title, { description: friendly.description })
        }
        return
      }

      const api = await createChatApi(transport)
      const { run, previous: previousRun } = beginSessionRun(activeId)
      const controller = run.controller
      const runToolMessageIds = run.toolIds
      const isVisibleRun = () => useSessionStore.getState().activeId === activeId
        && getSessionRun(activeId) === run
        && !controller.signal.aborted
      if (previousRun && previousRun.status === 'live') {
        if (useSessionStore.getState().activeId === activeId) {
          terminalizeRunTools(previousRun.toolIds, 'cancelled')
        }
        previousRun.controller.abort()
      }
      const deliver = (message: Parameters<typeof upsert>[0]) => {
        recordSessionRunMessage(run, message)
        if (isVisibleRun()) upsert(message)
      }
      if (isVisibleRun()) {
        activeRunAbortRef.current = controller
        activeRunToolMessageIdsRef.current = runToolMessageIds
        beginRunTelemetry(activeId)
        setPending(true)
      }

      const now = Date.now()
      const userImageUrls = attachments
        .map((a) => a.previewUrl)
        .filter((url): url is string => Boolean(url))
      userImageUrls.forEach((url) => optimisticImageUrlsRef.current.add(url))
      const userMessageId = `u-${Date.now()}`
      deliver({
        id: userMessageId,
        role: 'user',
        content: text,
        createdAt: now,
        imageUrls: userImageUrls.length > 0 ? userImageUrls : undefined,
      })

      let effectiveProviderId = llm.providerId ?? activeSession?.provider
      let effectiveModelId = llm.modelId ?? activeSession?.model
      if (!effectiveProviderId || !effectiveModelId) {
        try {
          const current = await (await createSettingsApi(transport)).getLlm()
          setLlm(current)
          effectiveProviderId = effectiveProviderId ?? current.providerId ?? undefined
          effectiveModelId = effectiveModelId ?? current.modelId ?? undefined
        } catch {
        }
      }

      upsertSession({
        id: activeId,
        title:
          activeSession?.title && activeSession.title !== '새 대화'
            ? activeSession.title
            : summarizeTitle(text),
        createdAt: activeSession?.createdAt ?? now,
        updatedAt: now,
        provider: effectiveProviderId,
        model: effectiveModelId,
        cwd: effectiveWorkingDir ?? undefined,
        device: activeSession?.device,
        tags: activeSession?.tags ?? [],
        personaIds: activeSession?.personaIds,
        isPinned: activeSession?.isPinned,
        titleDirty: activeSession?.titleDirty,
        isDraft: activeSession?.isDraft,
      })

      try {
        await api.stream(
          activeId,
          text,
          {
            onSession: (sessionId) => {
              if (!isVisibleRun()) return
              upsertSession({
                id: sessionId,
                title:
                  activeSession?.title && activeSession.title !== '새 대화'
                    ? activeSession.title
                    : summarizeTitle(text),
                createdAt: activeSession?.createdAt ?? now,
                updatedAt: Date.now(),
                provider: effectiveProviderId,
                model: effectiveModelId,
                cwd: effectiveWorkingDir ?? undefined,
                device: activeSession?.device,
                tags: activeSession?.tags ?? [],
                personaIds: activeSession?.personaIds,
                isPinned: activeSession?.isPinned,
                titleDirty: activeSession?.titleDirty,
                isDraft: false,
              })
            },
            onUpsertMessage: (message) => {
              if (message.role === 'tool') runToolMessageIds.add(message.id)
              deliver(message)
            },
            onPlannerWorkingMemoryUpdated: (memory) => {
              if (!isVisibleRun()) return
              setPlannerWorkingMemory(memory)
            },
            onEditCheckpointResolved: (checkpoint) => {
              if (!isVisibleRun()) return
              appendEditRollback(checkpoint)
            },
            onDebateRound: (round) => {
              if (!isVisibleRun()) return
              appendDebateRound(round)
            },
            onCoworkDiscussRequest: (payload) => {
              if (!isVisibleRun()) return
              setPending(false)
              void (async () => {
                try {
                  const questionsApi = await createSessionQuestionsApi(transport)
                  const questions = await questionsApi.list(activeId)
                  const match =
                    questions.find((question) => question.prompt === payload.prompt) ?? questions[0]
                  if (match && isVisibleRun()) {
                    setPendingQuestion(match)
                  }
                } catch (error) {
                  toast.error('협업 질문을 불러오지 못했습니다.', {
                    description: error instanceof Error ? error.message : String(error),
                  })
                }
              })()
            },
            onRouting: (decision) => {
              if (isVisibleRun()) useRunTelemetryStore.getState().setRouting(decision)
            },
            onExecutionPolicy: (policy) => {
              if (!isVisibleRun()) return
              setExecutionPolicy(policy)
            },
            onContextUsage: (context) => {
              if (!isVisibleRun()) return
              setContextUsage(context)
            },
            onQualityGateVerdict: (verdict) => {
              if (!isVisibleRun()) return
              setQualityGate(verdict)
            },
            onSteeringEvent: (event) => {
              if (!isVisibleRun()) return
              if (event.type === 'steering_ack') {
                recordSteeringAck({
                  noteId: event.noteId,
                  kind: event.kind,
                  message: event.message,
                })
              } else {
                markSteeringConsumed(event.noteId)
              }
            },
            onQuestionRequest: (question) => {
              if (!isVisibleRun()) return
              setPending(false)
              setPendingQuestion({
                id: question.questionId,
                sessionId: question.sessionId ?? activeId,
                prompt: question.prompt,
                choices: question.choices,
              })
            },
            onApprovalRequest: (payload) => {
              if (controller.signal.aborted) return
              enqueueApproval({
                ...payload,
                sessionId: payload.sessionId ?? activeId,
                workspaceRoot: payload.workspaceRoot ?? (activeSession?.workspaceIsolation === 'policy' ? undefined : effectiveWorkingDir ?? undefined),
                sessionTitle:
                  activeSession?.title && activeSession.title !== '새 대화'
                    ? activeSession.title
                    : summarizeTitle(text),
              })
            },
            onWarning: (warning) => {
              if (!isVisibleRun()) return
              toast.warning(
                warning.code === 'ATTACHMENT_SKIPPED'
                  ? '일부 첨부 파일을 읽지 못했습니다.'
                  : '작업 경고',
                { description: warning.message },
              )
            },
            onDone: () => {
              settleSessionRunTools(run, 'error')
              if (!isVisibleRun()) return
              terminalizeRunTools(runToolMessageIds, 'error')
              setPending(false)
            },
            onError: (error) => {
              settleSessionRunTools(run, toolTerminalStateForStreamFailure(error))
              markSessionRunMessageFailed(run, userMessageId)
              if (!isVisibleRun()) return
              terminalizeRunTools(runToolMessageIds, toolTerminalStateForStreamFailure(error))
              setPending(false)
              setMessageFailed(userMessageId, true)
              const friendly = explainChatStreamError(error)
              toast.error(friendly.title, {
                description: friendly.description,
              })
            },
          },
          {
            signal: controller.signal,
            chat: backendChatOptions(backendId, {
              tags: activeSession?.tags,
              provider: effectiveProviderId ?? undefined,
              model: effectiveModelId ?? undefined,
              maxTokens: llm.maxTokens ?? undefined,
              temperature: llm.temperature ?? undefined,
              cwd: effectiveWorkingDir ?? undefined,
              ...(effectiveWorkingDir && activeSession?.workspaceIsolation !== 'policy'
                ? { workspaceRoot: effectiveWorkingDir } : {}),
              mode: toDaemonMode(effectiveChatMode, chatModes),
              bot: sessionPersonaIds.length === 0 ? selectedBot ?? undefined : undefined,
              autonomy: 'supervised' as const,
              ...(effectiveChatMode !== 'instant'
                ? {
                    requireToolApproval: true,
                  }
                : {}),
              ...(effectiveChatMode === 'auto' && sessionPersonaIds.length === 0
                ? {}
                : { intentRouting: { enabled: false } }),
              thinkingLevel: thinkingLevel ?? undefined,
              memoryPolicy: disableMemory ? { read: false, write: false } : undefined,
              ragEnabled: enableRAG || (selectedBot && sessionPersonaIds.length === 0 ? undefined : false),
              imageGenEnabled: enableImageGen || undefined,
              skillRefs:
                selectedSkillIds.length > 0
                  ? selectedSkillIds.map((name) => ({ name }))
                  : undefined,
              inputTrustLevel: inputTrustLevel === 'untrusted' ? 'untrusted' : undefined,
              fileIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
              toolNames: effectiveChatMode === 'writing' ? [...WRITING_MODE_TOOL_NAMES] : undefined,
              writingDocId:
                effectiveChatMode === 'writing' && writingDocId ? writingDocId : undefined,
              persona: sessionPersonaIds.length === 1 ? sessionPersonaIds[0] : undefined,
              personaIds: sessionPersonaIds.length > 0 ? sessionPersonaIds : undefined,
              panelStrategy: sessionPerspectivesActive ? 'sequential' : undefined,
            }, backendModel),
          },
        )
        if (isVisibleRun() && attachments.length > 0) clearAttachments()
      } catch (error) {
        if (controller.signal.aborted) {
          settleSessionRunTools(run, 'cancelled')
          if (isVisibleRun()) terminalizeRunTools(runToolMessageIds, 'cancelled')
          return
        }
        settleSessionRunTools(run, toolTerminalStateForStreamFailure(error))
        markSessionRunMessageFailed(run, userMessageId)
        if (!isVisibleRun()) return
        terminalizeRunTools(runToolMessageIds, toolTerminalStateForStreamFailure(error))
        setPending(false)
        setMessageFailed(userMessageId, true)
        const friendly = explainChatStreamError(error)
        toast.error(friendly.title, {
          description: friendly.description,
        })
      } finally {
        const visible = useSessionStore.getState().activeId === activeId
        const status = controller.signal.aborted
          ? 'cancelled'
          : run.messages.get(userMessageId)?.failed ? 'error' : 'done'
        finishSessionRun(run, status, visible)
        if (visible && getSessionRun(activeId) === undefined) setPending(false)
        if (activeRunAbortRef.current === controller) {
          activeRunAbortRef.current = null
        }
        if (activeRunToolMessageIdsRef.current === runToolMessageIds) {
          activeRunToolMessageIdsRef.current = null
        }
      }
    },
    [
      activeId,
      activeSession,
      append,
      pending,
      llm.modelId,
      llm.providerId,
      llm.maxTokens,
      llm.temperature,
      setLlm,
      setPending,
      transport,
      upsert,
      upsertSession,
      currentModeMeta,
      ensureWorkingDir,
      bindWorkspace,
      setPlannerWorkingMemory,
      appendEditRollback,
      appendDebateRound,
      enqueueApproval,
      setMessageFailed,
      terminalizeRunTools,
      chatMode,
      backend,
      backendId,
      backendModel,
      t,
      modeExplicit,
      selectedBot,
      thinkingLevel,
      disableMemory,
      enableRAG,
      enableImageGen,
      inputTrustLevel,
      pendingQuestion,
      setPendingQuestion,
      beginRunTelemetry,
      setExecutionPolicy,
      setContextUsage,
      setQualityGate,
      recordSteeringAck,
      markSteeringConsumed,
      selectedSkillIds,
      skillItems,
      sessionPersonaIds,
      attachments,
      restoreComposerDraft,
      clearAttachments,
      writingDocId,
      workingDir,
    ],
  )

  const backgroundChat = useBackgroundChat({
    transport,
    onFinished: (job) => {
      if (useSessionStore.getState().activeId === job.sessionId) {
        void (async () => {
          try {
            const history = await (await createChatApi(transport)).history(job.sessionId)
            if (useSessionStore.getState().activeId !== job.sessionId) return
            history.messages.forEach(upsert)
          } catch {
          }
        })()
      }
      const notify = job.status === 'completed' ? toast.success : toast.error
      notify(
        job.status === 'completed'
          ? t('backgroundWork.composer.finished')
          : t('backgroundWork.composer.ended', { status: job.status }),
        {
          description: job.error?.message,
          action: {
            label: t('backgroundWork.openSession'),
            onClick: () => setActive(job.sessionId),
          },
        },
      )
    },
  })

  const onSendBackground = useCallback(
    async (text: string) => {
      if (!activeId || !backend.daemonFeatures) return
      if (pending) {
        toast.error(t('backgroundWork.composer.failed'), {
          description: t('backgroundWork.composer.busy'),
        })
        restoreComposerDraft(text)
        return
      }
      const sessionPerspectivesActive = sessionPersonaIds.length > 1
      const effectiveChatMode: ChatModeId = sessionPerspectivesActive
        ? 'persona-panel'
        : chatMode === 'persona-panel'
          ? 'instant'
          : normalizeChatMode(chatMode, chatModes)
      if (effectiveChatMode === 'writing' || enableImageGen) {
        toast.error(t('backgroundWork.composer.failed'), {
          description: t('backgroundWork.composer.unsupported'),
        })
        restoreComposerDraft(text)
        return
      }
      const requiresWorkingDir = Boolean(currentModeMeta?.needsWorkingDir)
      const effectiveWorkingDir = await ensureWorkingDir(requiresWorkingDir)
      if (requiresWorkingDir && !effectiveWorkingDir) {
        restoreComposerDraft(text)
        return
      }
      try {
        await backgroundChat.start(text, activeId, {
          tags: activeSession?.tags,
          provider: llm.providerId ?? activeSession?.provider ?? undefined,
          model: llm.modelId ?? activeSession?.model ?? undefined,
          maxTokens: llm.maxTokens ?? undefined,
          temperature: llm.temperature ?? undefined,
          cwd: effectiveWorkingDir ?? undefined,
          ...(effectiveWorkingDir && activeSession?.workspaceIsolation !== 'policy'
            ? { workspaceRoot: effectiveWorkingDir }
            : {}),
          mode: toDaemonMode(effectiveChatMode, chatModes),
          bot: sessionPersonaIds.length === 0 ? selectedBot ?? undefined : undefined,
          autonomy: 'supervised',
          ...(effectiveChatMode !== 'instant' ? { requireToolApproval: true } : {}),
          thinkingLevel: thinkingLevel ?? undefined,
          ragEnabled: enableRAG || (selectedBot && sessionPersonaIds.length === 0 ? undefined : false),
          skillRefs:
            selectedSkillIds.length > 0 ? selectedSkillIds.map((name) => ({ name })) : undefined,
          inputTrustLevel: inputTrustLevel === 'untrusted' ? 'untrusted' : undefined,
          fileIds: attachments.length > 0 ? attachments.map((a) => a.id) : undefined,
          persona: sessionPersonaIds.length === 1 ? sessionPersonaIds[0] : undefined,
          personaIds: sessionPersonaIds.length > 0 ? sessionPersonaIds : undefined,
          panelStrategy: sessionPerspectivesActive ? 'sequential' : undefined,
        })
        toast.success(t('backgroundWork.composer.started'), {
          description: t('backgroundWork.composer.startedDescription'),
          ...(onOpenResource
            ? {
                action: {
                  label: t('backgroundWork.composer.view'),
                  onClick: () => onOpenResource({ view: 'tasks' }),
                },
              }
            : {}),
        })
      } catch (error) {
        restoreComposerDraft(text)
        toast.error(t('backgroundWork.composer.failed'), {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [
      activeId,
      activeSession,
      attachments,
      backend.daemonFeatures,
      backgroundChat,
      selectedBot,
      chatMode,
      chatModes,
      currentModeMeta,
      enableImageGen,
      enableRAG,
      ensureWorkingDir,
      inputTrustLevel,
      llm.maxTokens,
      llm.modelId,
      llm.providerId,
      llm.temperature,
      onOpenResource,
      pending,
      restoreComposerDraft,
      selectedSkillIds,
      sessionPersonaIds,
      t,
      thinkingLevel,
    ],
  )

  useEffect(() => {
    if (!externalMessage || externalMessage.sessionId !== activeId) return
    if (historyReadySessionId !== activeId) return
    if (externalMessage.mode !== 'draft' && (
      pending || pendingQuestion || pendingApprovalCount
    )) return
    if (consumedExternalMessageIdsRef.current.has(externalMessage.deliveryId)) return

    consumedExternalMessageIdsRef.current.add(externalMessage.deliveryId)
    onExternalMessageConsumed?.(externalMessage.deliveryId)
    if (externalMessage.mode === 'draft') setComposer(externalMessage.text)
    else void onSend(externalMessage.text)
  }, [activeId, externalMessage, historyReadySessionId, pending, pendingQuestion, pendingApprovalCount, onExternalMessageConsumed, onSend, setComposer])

  const onStop = useCallback(() => {
    const controller = activeRunAbortRef.current
    if (activeRunToolMessageIdsRef.current) {
      terminalizeRunTools(activeRunToolMessageIdsRef.current, 'cancelled')
    }
    if (!controller || controller.signal.aborted) {
      if (pending) getDesktopApi()?.cancelActiveRun(activeId ?? undefined)
      setPending(false)
      if (pending) toast.info('응답 생성을 중단했습니다.')
      return
    }
    controller.abort()
    setPending(false)
    toast.info('응답 생성을 중단했습니다.')
  }, [activeId, pending, setPending, terminalizeRunTools])

  const cancelQueuedSteering = useCallback(async () => {
    if (!activeId) return
    try {
      const steering = await createSessionSteeringApi(transport)
      const result = await steering.cancel(activeId, { selector: 'latest' })
      markSteeringCancelled(result.cancelledNoteIds)
      toast.success('최근 추가 지시를 취소했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error('추가 지시를 취소하지 못했습니다.', { description: friendly.description })
    }
  }, [activeId, markSteeringCancelled, transport])

  const handleBranchAt = useCallback(
    async (eventIndex: number) => {
      if (!activeId) return
      try {
        if (await isBrowserPreviewTransport(transport)) {
          toast.error('브라우저 미리보기에서는 분기할 수 없습니다.')
          return
        }
        const sessionsApi = await createSessionsApi(transport)
        const result = await sessionsApi.branch(activeId, eventIndex)
        const source = activeSession
        const now = Date.now()
        upsertSession({
          id: result.branchId,
          title: source?.title ? `[Branch] ${source.title}` : '[Branch]',
          createdAt: now,
          updatedAt: now,
          provider: source?.provider,
          model: source?.model,
          device: source?.device,
          cwd: source?.cwd,
          tags: [...(source?.tags ?? []), `branch:${activeId}`],
          personaIds: source?.personaIds,
          isDraft: false,
        })
        setActive(result.branchId)
        toast.success('이 시점에서 분기했습니다.', {
          description:
            result.copiedEvents > 0
              ? `${result.copiedEvents}개 이벤트가 복사되었습니다.`
              : '빈 분기로 시작합니다.',
        })
      } catch (error) {
        const friendly = explainChatStreamError(error)
        toast.error(friendly.title, { description: friendly.description })
      }
    },
    [activeId, activeSession, setActive, transport, upsertSession],
  )

  const handleRetry = useCallback(
    (id: string) => {
      if (pending) return
      const target = messages.find((m) => m.id === id)
      if (!target) return
      removeMessagesFromId(id)
      void onSend(target.content)
    },
    [messages, pending, removeMessagesFromId, onSend],
  )

  const handleRegenerate = useCallback(
    (assistantId: string) => {
      if (pending) return
      const idx = messages.findIndex((m) => m.id === assistantId)
      if (idx < 0) return
      let userIdx = -1
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userIdx = i
          break
        }
      }
      if (userIdx < 0) return
      const userText = messages[userIdx].content
      removeMessagesFromId(messages[userIdx].id)
      void onSend(userText)
    },
    [messages, pending, removeMessagesFromId, onSend],
  )

  const handleBranchAtMessage = useCallback(
    (eventIndex: number) => {
      void handleBranchAt(eventIndex)
    },
    [handleBranchAt],
  )

  useEffect(() => {
    if (!pending) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      event.preventDefault()
      onStop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, onStop])

  if (!activeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-muted-foreground">
        <div className="w-full max-w-md space-y-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Bot className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">SEPilot에 오신 것을 환영합니다</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            새 대화를 시작하거나 기존 대화를 선택하세요
          </p>
          <p className="pt-2 text-xs italic text-muted-foreground/70">
            사이드바에서 대화를 선택하거나 새 대화를 시작해보세요.
          </p>
          {onStartAssistant && onOpenResource ? <div className="space-y-3 pt-3">
            <Button onClick={() => onOpenResource({ view: 'office' })}><Sparkles className="mr-2 h-4 w-4" />나의 비서 열기</Button>
            <div className="grid grid-cols-2 gap-2">{ASSISTANT_SCENARIOS.slice(0, 4).map((scenario) => <Button key={scenario.id} variant="outline" onClick={() => onStartAssistant(buildAssistantRequest(scenario))}>{scenario.title}</Button>)}</div>
          </div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {onOpenResource && assistantSupport && (assistantSupport.access === 'handoff' || assistantSupport.access === 'read') ? (
        <NotificationBar
          action={(activeSession?.personaIds?.length ?? 0) <= 1 ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { useChatModeStore.getState().setBackend('sepilot'); useChatModeStore.getState().setMode('auto') }}>Auto로 비서 기능 사용</Button>
          ) : null}
        >
          {assistantSupport.description}
        </NotificationBar>
      ) : null}
      {backend.daemonFeatures && activeSession ? <SessionPersonaBar session={activeSession} maxWidth={chatMaxWidth} /> : null}
      {backend.daemonFeatures ? (
        <RemoteBrowserPanel
          key={activeId}
          sessionId={activeId}
          openRequest={browserPanelOpenRequest.sessionId === activeId ? browserPanelOpenRequest.version : 0}
          onConnectionChange={setBrowserConnection}
        />
      ) : null}
      <div ref={transcriptScroll.viewportRef} onScroll={transcriptScroll.onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 max-sm:px-2">
        <div ref={transcriptScroll.contentRef} className="mx-auto flex flex-col gap-1" style={{ maxWidth: `${chatMaxWidth}px` }}>
          {historyLoading && transcriptItems.length === 0 ? (
            <TranscriptSkeleton />
          ) : (
            transcriptItems.map((item) => (
              <ChatItemErrorBoundary key={item.id} resetKey={item.id}>
                {item.kind === 'tool-event-group' ? (
                  <ToolEventGroup messages={item.messages} sessionPending={pending && item.id === liveToolGroupId} />
                ) : item.message.role === 'tool' ? (
                  <ToolCard message={item.message} />
                ) : (
                  <ChatMessage
                    message={item.message}
                    sessionId={activeId}
                    browserConnection={browserConnection}
                    assistantPersona={assistantPersona}
                    isLastAssistantMessage={
                      item.message.role === 'assistant' &&
                      item.message.id === lastAssistantMessageId
                    }
                    streaming={
                      pending &&
                      item.message.role === 'assistant' &&
                      item.message.id === streamingAssistantId
                    }
                    onBranchAt={handleBranchAtMessage}
                    onRegenerate={
                      item.message.role === 'assistant' &&
                      item.message.id === lastAssistantMessageId
                        ? handleRegenerate
                        : undefined
                    }
                    onRetry={
                      item.message.role === 'user' && item.message.failed ? handleRetry : undefined
                    }
                  />
                )}
              </ChatItemErrorBoundary>
            ))
          )}
          {backend.daemonFeatures ? (
            <BrowserPrerequisiteNotice
              messages={messages}
              connection={browserConnection}
              onOpenConnection={() => setBrowserPanelOpenRequest((value) => ({ sessionId: activeId, version: value.version + 1 }))}
            />
          ) : null}
          {pending && !historyLoading && needsTurnWaitingIndicator(transcriptItems) ? (
            <div role="status" className="my-3 flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
              <span aria-hidden className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-primary" />
              <div><p className="font-medium">응답 대기 중</p><p className="mt-1 text-xs text-muted-foreground">첫 진행 상황을 기다리고 있습니다. 다른 대화를 열어도 작업은 계속됩니다.</p></div>
            </div>
          ) : null}
          {onStartAssistant && !historyLoading && transcriptItems.length === 0 ? <section aria-label="비서 대화 시작" className="grid gap-2 py-6 sm:grid-cols-2">
            {ASSISTANT_SCENARIOS.map((scenario) => <button type="button" key={scenario.id} className="rounded-xl border p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onStartAssistant(buildAssistantRequest(scenario))}><span className="text-sm font-medium">{scenario.title}</span><span className="mt-1 block text-xs text-muted-foreground">{scenario.description}</span></button>)}
          </section> : null}
          {onOpenResource && assistantResultLinks(messages).length ? <section aria-label="이번 요청의 확인 결과" className="my-3 rounded-xl border bg-primary/[0.03] p-3">
            <p className="mb-2 text-xs font-medium">이번 요청에서 확인한 항목</p>
            <div className="flex flex-wrap gap-2">{assistantResultLinks(messages).map((link) => <Button key={link.key} size="sm" variant="outline" className="max-w-full" onClick={() => onOpenResource(link.destination)}><span className="truncate">{link.label}</span><ArrowUpRight className="ml-1 h-3 w-3 shrink-0" /></Button>)}</div>
          </section> : null}
        </div>
      </div>

      <div className="workspace-composer-panel shrink-0 border-t py-1.5">
        {transcriptScroll.showLatest ? <div className="flex justify-center pb-1"><Button size="sm" variant="outline" onClick={transcriptScroll.jumpToLatest}>최신 메시지로 이동 ↓</Button></div> : null}
        <div
          className="mx-auto flex w-[95%] min-w-0 flex-col gap-1"
        >
          {plannerWorkingMemory ? (
            <PlannerProgressPanel workingMemory={plannerWorkingMemory} />
          ) : null}
          {editRollbacks.length > 0 ? <EditRollbackPanel checkpoints={editRollbacks} /> : null}
          {activeId && backend.daemonFeatures ? <CheckpointReviewPanel key={activeId} sessionId={activeId} pending={pending} /> : null}
          {debateRounds.length > 0 ? <DebatePanel rounds={debateRounds} /> : null}
          {activeId && backend.daemonFeatures ? (
            <SessionInboxStrip api={backgroundChat.api} sessionId={activeId} onOpenSession={setActive} />
          ) : null}
          <RunTelemetryBar onCancelSteering={cancelQueuedSteering} />
          {pendingQuestion ? (
            <div
              className="rounded-md border border-sky-500/30 bg-sky-500/[0.06] px-2.5 py-2 text-[11px]"
              role="status"
              aria-label="에이전트 질문"
              data-testid="pending-agent-question"
            >
              <p className="font-medium text-foreground">답변이 필요한 질문</p>
              <p className="mt-0.5 text-muted-foreground">{pendingQuestion.prompt}</p>
              {pendingQuestion.choices?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {pendingQuestion.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className="rounded-md border border-sky-500/30 bg-background px-2 py-1 text-[10px] text-foreground hover:bg-sky-500/10"
                      onClick={() => void onSend(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  아래 입력창에 답변을 입력하세요.
                </p>
              )}
            </div>
          ) : null}
          <ChatComposer
            onSend={onSend}
            onSteer={(text) => void onSend(text)}
            onStop={onStop}
            onSlashCommand={onSlashCommand}
            onOpenSnippets={onOpenSnippets}
            onOpenSkills={onOpenSkills}
            voiceCaptureMode={voiceCaptureMode}
            voiceProcessing={voiceProcessing}
            autoSpeak={autoSpeak}
            onStartVoiceCapture={(mode) => void startVoiceCapture(mode)}
            onStopVoiceCapture={stopVoiceCapture}
            onAutoSpeakChange={setAutoSpeak}
            onSendBackground={
              backend.daemonFeatures && backgroundChat.api
                ? (text) => void onSendBackground(text)
                : undefined
            }
          />
          <LLMStatusBar onOpenSettings={onOpenSettings} />
        </div>
      </div>
    </div>
  )
}

export function ChatContainer(props: Parameters<typeof BuiltinChatContainer>[0] = {}) {
  return <BuiltinChatContainer {...props} />
}
