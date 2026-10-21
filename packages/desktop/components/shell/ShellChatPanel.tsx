'use client'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Bot, Eye, FolderLock, LoaderCircle, Play, Send, ShieldAlert, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/components/providers/transport-provider'
import { createChatApi } from '@/lib/api/chat'
import { createSettingsApi, type ProviderInfo } from '@/lib/api/settings'
import {
  isShellPathInsideWorkspace,
  normalizeShellWorkspacePath,
  shellWorkspaceLabel,
  type ShellCommandContext,
  type ShellCommandContextValidation,
  validateShellCommandContext,
} from '@/lib/shell/command-dispatch-guard'
import { looksDestructiveCommand } from '@/lib/shell/destructive'
import { useChatStore } from '@/lib/store/chat-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { cn } from '@/lib/utils/cn'
import { confirm } from '@/lib/utils/confirm'

const AUTORUN_STORAGE_KEY = 'sepilotd.shell-chat.autorun'
const OBSERVE_STORAGE_KEY = 'sepilotd.shell-chat.observe'
const OBSERVE_QUIET_MS = 1200
const MAX_AGENT_STEPS = 8
const NO_ACTIVE_TAB_KEY = '__shell-no-active-tab__'

interface ShellChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  suppressCommand?: string
  commandContext?: ShellCommandContext
}

interface ShellChatBinding {
  sessionId: string
  workspaceRoot?: string
}

interface ArchivedShellConversation {
  sessionId: string
  workspaceRoot?: string
  messages: ShellChatMessage[]
}

interface BlockedShellCommand {
  context: ShellCommandContext
  reason: string
  currentCwd?: string
}

interface ShellCommandBlock {
  lang: string | null
  command: string
}

interface DirectShellCommand {
  command: string
  reason: string
}

export interface ShellTerminalSnapshot {
  tabId: string
  title: string
  target: string
  status: string
  cwd?: string
  command?: string
  selection?: string
  visibleText: string
  recentOutput: string
  updatedAt: number
}

function createShellChatSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `shell-chat-${Date.now()}-${Math.random()}`
}

function setTabValue<T>(
  setter: Dispatch<SetStateAction<Record<string, T>>>,
  tabId: string,
  value: SetStateAction<NoInfer<T>>,
): void {
  setter((previous) => {
    const current = previous[tabId]
    const next = typeof value === 'function' ? (value as (state: T) => T)(current) : value
    return { ...previous, [tabId]: next }
  })
}

function captureShellCommandContext(
  proposalId: string,
  tabId: string,
  binding: ShellChatBinding,
  terminalSnapshot: ShellTerminalSnapshot | null | undefined,
): ShellCommandContext {
  const matchingSnapshot = terminalSnapshot?.tabId === tabId ? terminalSnapshot : undefined
  return {
    proposalId: `${tabId}:${proposalId}`,
    sessionId: binding.sessionId,
    tabId,
    tabTitle: matchingSnapshot?.title?.trim() || tabId,
    workspaceRoot: normalizeShellWorkspacePath(binding.workspaceRoot),
    cwd: normalizeShellWorkspacePath(matchingSnapshot?.cwd),
  }
}

const SHELL_LANG_HINTS = new Set([
  'bash',
  'sh',
  'zsh',
  'fish',
  'pwsh',
  'powershell',
  'ps',
  'ps1',
  'cmd',
  'bat',
  'batch',
  'shell',
  'console',
  'terminal',
])

function extractCommandBlocks(content: string): ShellCommandBlock[] {
  const regex = /```([\w+.-]*)\n([\s\S]*?)```/g
  const out: ShellCommandBlock[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const rawLang = match[1]?.toLowerCase() || null
    const command = match[2].replace(/\r/g, '').trim()
    if (!command) continue
    if (rawLang && !SHELL_LANG_HINTS.has(rawLang)) {
      continue
    }
    if (!rawLang) {
      const isSingleLine = !command.includes('\n')
      const looksLikeCommand = isSingleLine && /^(\$ |> |#\s|[a-zA-Z0-9_.\-/]+(\s|$))/.test(command)
      if (!looksLikeCommand) continue
    }
    const cleaned = command
      .split('\n')
      .map((line) => line.replace(/^[$>#]\s?/, ''))
      .join('\n')
    out.push({ lang: rawLang, command: cleaned })
  }
  return out
}

function normalizeCommandForComparison(command: string | undefined): string {
  return (command ?? '').replace(/\r/g, '').trim()
}

function parseRequestedCount(text: string, fallback: number): number {
  const match = text.match(/(\d{1,3})\s*(?:개|건|commits?|항목)?/i)
  if (!match) return fallback
  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, 1), 50)
}

function getDirectShellCommand(text: string): DirectShellCommand | null {
  const normalized = text.toLowerCase()
  const stripped = text.trim().replace(/[.。]$/, '')
  const asksForGitLog =
    /\bgit\s+log\b/.test(normalized) ||
    ((/\bgit\b/.test(normalized) || /커밋|commit/.test(text)) &&
      /최근|last|latest|recent|조회|보여|show|list|출력|확인/.test(text) &&
      /커밋|commit|commits?|log|로그/.test(normalized))

  if (asksForGitLog) {
    const count = parseRequestedCount(text, 5)
    return {
      command: `git --no-pager log -${count} --oneline`,
      reason: `최근 git commit ${count}개를 실제 터미널에서 조회`,
    }
  }

  if (/^(?:run\s+|execute\s+)?docker\s+(?:images?|image\s+ls)$/i.test(stripped)) {
    return {
      command: 'docker images',
      reason: 'Docker 이미지 목록을 실제 터미널에서 조회',
    }
  }

  if (
    /(?:docker|도커)/i.test(text) &&
    /이미지|image/i.test(text) &&
    /목록|조회|보여|show|list|출력|확인/i.test(text)
  ) {
    return {
      command: 'docker images',
      reason: 'Docker 이미지 목록을 실제 터미널에서 조회',
    }
  }

  if (/^(?:run\s+|execute\s+)?docker\s+ps(?:\s+-a)?$/i.test(stripped)) {
    const includeAll = /\s-a$/i.test(stripped)
    return {
      command: includeAll ? 'docker ps -a' : 'docker ps',
      reason: includeAll
        ? 'Docker 컨테이너 전체 목록을 실제 터미널에서 조회'
        : '실행 중인 Docker 컨테이너 목록을 실제 터미널에서 조회',
    }
  }

  if (
    /(?:docker|도커)/i.test(text) &&
    /컨테이너|container/i.test(text) &&
    /목록|조회|보여|show|list|출력|확인/i.test(text)
  ) {
    const includeAll = /전체|all|stopped|중지/i.test(text)
    return {
      command: includeAll ? 'docker ps -a' : 'docker ps',
      reason: includeAll
        ? 'Docker 컨테이너 전체 목록을 실제 터미널에서 조회'
        : '실행 중인 Docker 컨테이너 목록을 실제 터미널에서 조회',
    }
  }

  return null
}

interface ShellChatPanelProps {
  activeTabId: string | null
  terminalSnapshot?: ShellTerminalSnapshot | null
  initialMessage?: string
  initialMessageSeq?: number
  onClose: () => void
  onRunCommand: (command: string, context: ShellCommandContext) => boolean
}

export function ShellChatPanel({
  activeTabId,
  terminalSnapshot,
  initialMessage,
  initialMessageSeq,
  onClose,
  onRunCommand,
}: ShellChatPanelProps) {
  const transport = useTransport()
  const enqueueApproval = useChatStore((state) => state.enqueueApproval)
  const llm = useSettingsStore((state) => state.llm)
  const setLlm = useSettingsStore((state) => state.setLlm)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [modelCatalogStatus, setModelCatalogStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [messagesByTab, setMessagesByTab] = useState<Record<string, ShellChatMessage[]>>({})
  const [inputByTab, setInputByTab] = useState<Record<string, string>>({})
  const [pendingByTab, setPendingByTab] = useState<Record<string, boolean>>({})
  const [agentStatusByTab, setAgentStatusByTab] = useState<Record<string, string | null>>({})
  const [archivesByTab, setArchivesByTab] = useState<Record<string, ArchivedShellConversation[]>>(
    {},
  )
  const [blockedCommandByTab, setBlockedCommandByTab] = useState<
    Record<string, BlockedShellCommand | undefined>
  >({})
  const messages = activeTabId ? (messagesByTab[activeTabId] ?? []) : []
  const input = inputByTab[activeTabId ?? NO_ACTIVE_TAB_KEY] ?? ''
  const pending = activeTabId ? (pendingByTab[activeTabId] ?? false) : false
  const agentStatus = activeTabId ? (agentStatusByTab[activeTabId] ?? null) : null
  const archivedConversations = activeTabId ? (archivesByTab[activeTabId] ?? []) : []
  const blockedCommand = activeTabId ? blockedCommandByTab[activeTabId] : undefined
  const setInput = useCallback(
    (value: SetStateAction<string>) => {
      setTabValue(setInputByTab, activeTabId ?? NO_ACTIVE_TAB_KEY, value)
    },
    [activeTabId],
  )
  const [observeTerminal, setObserveTerminal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(OBSERVE_STORAGE_KEY) === '1'
  })
  const [autoRun, setAutoRun] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(AUTORUN_STORAGE_KEY) === '1'
  })
  const bindingsRef = useRef<Record<string, ShellChatBinding>>({})
  const activeTabIdRef = useRef(activeTabId)
  const terminalSnapshotRef = useRef(terminalSnapshot)
  const invalidatedProposalIdsRef = useRef<Set<string>>(new Set())
  const abortByTabRef = useRef<Record<string, AbortController | undefined>>({})
  const transcriptRef = useRef<HTMLDivElement>(null)
  const observeTimerByTabRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({})
  const lastRunByTabRef = useRef<
    Record<
      string,
      | {
          command: string
          at: number
          recentOutput: string
          visibleText: string
          forceObserve?: boolean
        }
      | undefined
    >
  >({})
  const currentUserDisplayByTabRef = useRef<Record<string, string>>({})
  const agentStepByTabRef = useRef<Record<string, number>>({})
  const assistantContentRef = useRef<Record<string, string>>({})
  const autoRunFiredRef = useRef<Set<string>>(new Set())

  activeTabIdRef.current = activeTabId
  terminalSnapshotRef.current = terminalSnapshot

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(OBSERVE_STORAGE_KEY, observeTerminal ? '1' : '0')
  }, [observeTerminal])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(AUTORUN_STORAGE_KEY, autoRun ? '1' : '0')
  }, [autoRun])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setModelCatalogStatus('loading')
      try {
        const api = await createSettingsApi(transport)
        const [list, current] = await Promise.all([
          api.listProviders(),
          api.getLlm().catch(() => ({ providerId: null, modelId: null })),
        ])
        if (cancelled) return
        setProviders(list)
        setLlm(current)
        setModelCatalogStatus('ready')
      } catch {
        if (cancelled) return
        setProviders([])
        setModelCatalogStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, setLlm])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === llm.providerId) ?? null,
    [llm.providerId, providers],
  )

  const selectedModel = useMemo(
    () => selectedProvider?.models.find((model) => model.id === llm.modelId) ?? null,
    [llm.modelId, selectedProvider],
  )

  const modelStatusLabel =
    selectedProvider && selectedModel
      ? `${selectedProvider.label} / ${selectedModel.label}`
      : modelCatalogStatus === 'loading'
        ? '모델 불러오는 중'
        : 'daemon 기본 모델'

  const activeBinding = activeTabId ? bindingsRef.current[activeTabId] : undefined
  const workspaceTransitionRequired = Boolean(
    activeBinding &&
    !isShellPathInsideWorkspace(terminalSnapshot?.cwd, activeBinding.workspaceRoot),
  )

  const startNewWorkspaceConversation = useCallback(async () => {
    if (!activeTabId) return
    const previousBinding = bindingsRef.current[activeTabId]
    if (!previousBinding) return
    const nextWorkspaceRoot = normalizeShellWorkspacePath(terminalSnapshot?.cwd)
    const wasPending = pendingByTab[activeTabId] ?? false
    const approved = await confirm(
      [
        `현재 대화는 ${shellWorkspaceLabel(previousBinding.workspaceRoot)}에 고정되어 있습니다.`,
        `새 위치: ${shellWorkspaceLabel(nextWorkspaceRoot)}`,
        '',
        wasPending
          ? '진행 중인 응답을 중단하고 새 workspace 대화를 시작할까요?'
          : '기존 대화를 보관하고 새 workspace 대화를 시작할까요?',
      ].join('\n'),
      {
        title: 'workspace 대화 전환',
        confirmLabel: wasPending ? '중단하고 새 대화' : '새 대화 시작',
        cancelLabel: '기존 대화 유지',
      },
    )
    if (!approved) return

    abortByTabRef.current[activeTabId]?.abort()
    abortByTabRef.current[activeTabId] = undefined
    const previousMessages = messagesByTab[activeTabId] ?? []
    if (previousMessages.length > 0) {
      setArchivesByTab((previous) => ({
        ...previous,
        [activeTabId]: [
          ...(previous[activeTabId] ?? []),
          {
            sessionId: previousBinding.sessionId,
            workspaceRoot: previousBinding.workspaceRoot,
            messages: previousMessages,
          },
        ],
      }))
    }
    bindingsRef.current[activeTabId] = {
      sessionId: createShellChatSessionId(),
      workspaceRoot: nextWorkspaceRoot,
    }
    lastRunByTabRef.current[activeTabId] = undefined
    agentStepByTabRef.current[activeTabId] = 0
    currentUserDisplayByTabRef.current[activeTabId] = ''
    for (const proposalId of invalidatedProposalIdsRef.current) {
      if (proposalId.startsWith(`${activeTabId}:`)) {
        invalidatedProposalIdsRef.current.delete(proposalId)
      }
    }
    setBlockedCommandByTab((previous) => ({ ...previous, [activeTabId]: undefined }))
    setTabValue(setMessagesByTab, activeTabId, [])
    setTabValue(setPendingByTab, activeTabId, false)
    setTabValue(setAgentStatusByTab, activeTabId, '새 workspace 대화 준비됨')
  }, [activeTabId, messagesByTab, pendingByTab, terminalSnapshot?.cwd])

  const persistShellModel = useCallback(
    async (next: { providerId: string | null; modelId: string | null }) => {
      setLlm(next)
      try {
        const api = await createSettingsApi(transport)
        await api.setLlm(next)
      } catch (error) {
        toast.error('Shell AI 모델 선택을 저장하지 못했습니다.', {
          description: error instanceof Error ? error.message : String(error),
        })
        try {
          const api = await createSettingsApi(transport)
          setLlm(await api.getLlm())
        } catch {
        }
      }
    },
    [setLlm, transport],
  )

  const buildPromptWithTerminalContext = useCallback(
    (text: string, source: 'user' | 'observe'): string => {
      if (!terminalSnapshot) return text
      const visible = terminalSnapshot.visibleText.trim() || '(visible screen is empty)'
      const recent = terminalSnapshot.recentOutput.trim()
      const selection = terminalSnapshot.selection?.trim()
      return [
        source === 'observe'
          ? '터미널 명령 실행 후 출력이 갱신됐다. 새 화면을 보고 다음 단계를 판단해줘.'
          : '사용자가 Shell AI에게 요청했다. 아래 활성 터미널 화면을 함께 보고 답해줘.',
        '',
        `사용자 요청: ${text}`,
        '',
        '활성 터미널:',
        `- 탭: ${terminalSnapshot.title}`,
        `- 대상: ${terminalSnapshot.target}`,
        `- 상태: ${terminalSnapshot.status}`,
        terminalSnapshot.cwd ? `- cwd: ${terminalSnapshot.cwd}` : null,
        terminalSnapshot.command ? `- launch: ${terminalSnapshot.command}` : null,
        '',
        '현재 보이는 화면:',
        '```text',
        visible.slice(-8000),
        '```',
        selection ? ['선택 영역:', '```text', selection.slice(-4000), '```'].join('\n') : null,
        recent ? ['최근 출력 tail:', '```text', recent.slice(-8000), '```'].join('\n') : null,
        '',
        source === 'observe'
          ? '답변은 위 터미널 출력에 근거해야 한다. 요청한 정보가 출력에 없으면 없다고 말하고 추정하지 마라. 방금 실행한 명령을 다시 제안하지 마라. daemon tool, autonomous mode, approval policy를 언급하지 마라. 출력이 충분하면 명령 없이 결과만 요약하고, 추가 조치가 꼭 필요할 때만 새 명령을 제안해라.'
          : 'git log, docker images, 파일 목록, 프로세스, 환경 정보처럼 실제 터미널 상태 조회가 필요한 요청은 출력이 없으면 값을 만들지 말고 먼저 실행할 셸 코드블록 하나만 제안해라. daemon tool, autonomous mode, approval policy를 언급하지 마라. 이미 충분하면 명령 없이 결과를 요약해라.',
      ]
        .filter(Boolean)
        .join('\n')
    },
    [terminalSnapshot],
  )

  const validateCurrentCommandContext = useCallback(
    (context: ShellCommandContext): ShellCommandContextValidation => {
      if (invalidatedProposalIdsRef.current.has(context.proposalId)) {
        return {
          ok: false,
          code: 'proposal-invalidated',
          reason: '터미널 컨텍스트가 바뀌어 이 명령 제안은 이미 무효화되었습니다.',
        }
      }
      const currentBinding = bindingsRef.current[context.tabId]
      return validateShellCommandContext(context, {
        activeTabId: activeTabIdRef.current,
        sessionId: currentBinding?.sessionId,
        workspaceRoot: currentBinding?.workspaceRoot,
        terminalSnapshot: terminalSnapshotRef.current,
      })
    },
    [],
  )

  const blockCommandDispatch = useCallback(
    (
      context: ShellCommandContext,
      validation: Exclude<ShellCommandContextValidation, { ok: true }>,
    ) => {
      invalidatedProposalIdsRef.current.add(context.proposalId)
      const currentCwd = terminalSnapshotRef.current?.cwd
      setBlockedCommandByTab((previous) => ({
        ...previous,
        [context.tabId]: { context, reason: validation.reason, currentCwd },
      }))
      setTabValue(
        setAgentStatusByTab,
        context.tabId,
        '명령 실행 차단됨 · 새 workspace 대화가 필요합니다.',
      )
      toast.error('명령 실행을 차단했습니다.', {
        description: `${validation.reason} 새 workspace 대화를 시작한 뒤 다시 요청하세요.`,
      })
    },
    [],
  )

  const dispatchConfirmedCommand = useCallback(
    (
      command: string,
      context: ShellCommandContext,
      options?: { forceObserve?: boolean; status?: string },
    ): boolean => {
      const validation = validateCurrentCommandContext(context)
      if (!validation.ok) {
        blockCommandDispatch(context, validation)
        return false
      }

      const dispatched = onRunCommand(command, context)
      if (!dispatched) {
        blockCommandDispatch(context, {
          ok: false,
          code: 'terminal-unavailable',
          reason: '터미널이 확인 직후 변경되어 최종 dispatch가 거부되었습니다.',
        })
        return false
      }

      const latestSnapshot = terminalSnapshotRef.current
      if (observeTerminal || options?.forceObserve) {
        lastRunByTabRef.current[context.tabId] = {
          command,
          at: Date.now(),
          recentOutput: latestSnapshot?.recentOutput ?? '',
          visibleText: latestSnapshot?.visibleText ?? '',
          forceObserve: options?.forceObserve,
        }
        agentStepByTabRef.current[context.tabId] =
          (agentStepByTabRef.current[context.tabId] ?? 0) + 1
        setTabValue(setAgentStatusByTab, context.tabId, options?.status ?? '터미널 출력 관찰 중')
      }
      return true
    },
    [blockCommandDispatch, observeTerminal, onRunCommand, validateCurrentCommandContext],
  )

  const confirmAndDispatchCommand = useCallback(
    async (
      command: string,
      context: ShellCommandContext,
      options?: { forceObserve?: boolean; status?: string },
    ): Promise<boolean> => {
      const beforeConfirmation = validateCurrentCommandContext(context)
      if (!beforeConfirmation.ok) {
        blockCommandDispatch(context, beforeConfirmation)
        return false
      }

      const risk = looksDestructiveCommand(command)
      const approved = await confirm(
        [
          risk ? `위험할 수 있는 명령입니다 (${risk}).` : 'Shell AI가 명령 실행을 제안했습니다.',
          '',
          command,
          '',
          `대상 탭: ${context.tabTitle} (${context.tabId})`,
          `workspace: ${shellWorkspaceLabel(context.workspaceRoot)}`,
          `작업 폴더: ${shellWorkspaceLabel(context.cwd)}`,
          '',
          '이 컨텍스트에서 실행할까요?',
        ].join('\n'),
        {
          title: '터미널 명령 실행 확인',
          confirmLabel: '명령 실행',
          cancelLabel: '취소',
          destructive: Boolean(risk),
        },
      )
      if (!approved) return false

      const afterConfirmation = validateCurrentCommandContext(context)
      if (!afterConfirmation.ok) {
        blockCommandDispatch(context, afterConfirmation)
        return false
      }
      return dispatchConfirmedCommand(command, context, options)
    },
    [blockCommandDispatch, dispatchConfirmedCommand, validateCurrentCommandContext],
  )

  const send = useCallback(
    async function send(text: string, source: 'user' | 'observe' = 'user') {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!activeTabId) return
      if (pending) return
      const tabId = activeTabId
      let binding = bindingsRef.current[tabId]
      if (binding && !isShellPathInsideWorkspace(terminalSnapshot?.cwd, binding.workspaceRoot)) {
        setTabValue(
          setAgentStatusByTab,
          tabId,
          'workspace가 바뀌었습니다. 새 대화를 시작한 뒤 요청하세요.',
        )
        return
      }
      if (!binding) {
        binding = {
          sessionId: createShellChatSessionId(),
          workspaceRoot: normalizeShellWorkspacePath(terminalSnapshot?.cwd),
        }
        bindingsRef.current[tabId] = binding
      }
      if (source === 'user') {
        agentStepByTabRef.current[tabId] = 0
        setTabValue(setAgentStatusByTab, tabId, null)
        currentUserDisplayByTabRef.current[tabId] = trimmed
      }
      const now = Date.now()
      const userMsg: ShellChatMessage = {
        id: `u-${now}`,
        role: 'user',
        content:
          source === 'observe'
            ? currentUserDisplayByTabRef.current[tabId] || `터미널 출력 관찰\n${trimmed}`
            : trimmed,
      }
      const assistantId = `a-${now + 1}`
      const commandContext = captureShellCommandContext(
        assistantId,
        tabId,
        binding,
        terminalSnapshot,
      )
      const directCommand = source === 'user' ? getDirectShellCommand(trimmed) : null
      if (directCommand) {
        setTabValue(setMessagesByTab, tabId, [
          userMsg,
          {
            id: assistantId,
            role: 'assistant',
            content: `${directCommand.reason}합니다. 출력이 들어오면 그 결과만 근거로 정리합니다.\n\n실행 명령: ${directCommand.command}`,
            commandContext,
          },
        ])
        setTabValue(setInputByTab, tabId, '')
        const dispatched = await confirmAndDispatchCommand(directCommand.command, commandContext, {
          forceObserve: true,
          status: '터미널 명령 실행 중',
        })
        if (!dispatched) {
          setTabValue(setAgentStatusByTab, tabId, null)
          setTabValue(setMessagesByTab, tabId, [
            userMsg,
            {
              id: assistantId,
              role: 'assistant',
              content: '활성 터미널에 명령을 보낼 수 없어 실제 조회를 수행하지 못했습니다.',
            },
          ])
        }
        return
      }
      const prompt = buildPromptWithTerminalContext(trimmed, source)
      assistantContentRef.current[assistantId] = ''
      const suppressCommand =
        source === 'observe' ? lastRunByTabRef.current[tabId]?.command : undefined
      setTabValue(setMessagesByTab, tabId, [
        userMsg,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          suppressCommand,
          commandContext,
        },
      ])
      setTabValue(setInputByTab, tabId, '')
      setTabValue(setPendingByTab, tabId, true)
      const controller = new AbortController()
      abortByTabRef.current[tabId]?.abort()
      abortByTabRef.current[tabId] = controller
      const isCurrentSession = () =>
        bindingsRef.current[tabId]?.sessionId === binding.sessionId && !controller.signal.aborted
      try {
        const api = await createChatApi(transport)
        await api.stream(
          binding.sessionId,
          prompt,
          {
            onUpsertMessage: (message) => {
              if (!isCurrentSession()) return
              if (message.role !== 'assistant') return
              assistantContentRef.current[assistantId] = message.content
              setTabValue(setMessagesByTab, tabId, (prev) =>
                prev.map((entry) =>
                  entry.id === assistantId ? { ...entry, content: message.content } : entry,
                ),
              )
            },
            onApprovalRequest: (payload) => {
              if (!isCurrentSession()) return
              enqueueApproval({
                ...payload,
                sessionId: payload.sessionId ?? binding.sessionId,
                workspaceRoot: payload.workspaceRoot ?? binding.workspaceRoot,
                sessionTitle: terminalSnapshot?.title
                  ? `터미널 · ${terminalSnapshot.title}`
                  : '터미널 에이전트',
              })
              setTabValue(setAgentStatusByTab, tabId, `${payload.toolName} 승인 대기 중`)
              setTabValue(setMessagesByTab, tabId, (prev) =>
                prev.map((entry) =>
                  entry.id === assistantId && !entry.content
                    ? {
                        ...entry,
                        content: `${payload.toolName} 실행 승인이 필요합니다. 화면의 승인 요청 창에서 허용하거나 거부하세요.`,
                      }
                    : entry,
                ),
              )
            },
            onDone: () => {
              if (!isCurrentSession()) return
              setTabValue(setPendingByTab, tabId, false)
              if (!autoRun) {
                setTabValue(setAgentStatusByTab, tabId, null)
                return
              }
              if (autoRunFiredRef.current.has(assistantId)) return
              const final = assistantContentRef.current[assistantId] ?? ''
              const blocks = extractCommandBlocks(final)
              if (blocks.length === 0) {
                setTabValue(setAgentStatusByTab, tabId, null)
                return
              }
              if ((agentStepByTabRef.current[tabId] ?? 0) >= MAX_AGENT_STEPS) {
                setTabValue(setAgentStatusByTab, tabId, `자동 진행 제한 도달 (${MAX_AGENT_STEPS})`)
                return
              }
              autoRunFiredRef.current.add(assistantId)
              const command = blocks[0].command
              void confirmAndDispatchCommand(command, commandContext)
            },
            onError: (err) => {
              if (!isCurrentSession()) return
              setTabValue(setPendingByTab, tabId, false)
              setTabValue(setAgentStatusByTab, tabId, null)
              const friendly = explainChatStreamError(err)
              toast.error(friendly.title, { description: friendly.description })
            },
          },
          {
            signal: controller.signal,
            chat: {
              mode: 'shell',
              provider: llm.providerId ?? undefined,
              model: llm.modelId ?? undefined,
              maxTokens: llm.maxTokens ?? undefined,
              temperature: llm.temperature ?? undefined,
              cwd: terminalSnapshot?.cwd ?? undefined,
              workspaceRoot: binding.workspaceRoot,
              autonomy: 'supervised',
              requireToolApproval: true,
            },
          },
        )
      } catch (err) {
        if (controller.signal.aborted) return
        if (!isCurrentSession()) return
        setTabValue(setPendingByTab, tabId, false)
        setTabValue(setAgentStatusByTab, tabId, null)
        const friendly = explainChatStreamError(err)
        toast.error(friendly.title, { description: friendly.description })
      }
    },
    [
      activeTabId,
      autoRun,
      buildPromptWithTerminalContext,
      confirmAndDispatchCommand,
      enqueueApproval,
      llm.maxTokens,
      llm.modelId,
      llm.providerId,
      llm.temperature,
      pending,
      terminalSnapshot,
      transport,
    ],
  )

  useEffect(() => {
    const draft = initialMessage?.trim()
    if (!draft) return
    setInput(draft)
  }, [initialMessage, initialMessageSeq])

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!activeTabId) return undefined
    const run = lastRunByTabRef.current[activeTabId]
    if ((!observeTerminal && !run?.forceObserve) || pending || !terminalSnapshot) return undefined
    if (!run || terminalSnapshot.updatedAt <= run.at) return undefined
    if (
      terminalSnapshot.recentOutput === run.recentOutput &&
      terminalSnapshot.visibleText === run.visibleText
    ) {
      return undefined
    }
    if ((agentStepByTabRef.current[activeTabId] ?? 0) >= MAX_AGENT_STEPS) {
      lastRunByTabRef.current[activeTabId] = undefined
      setTabValue(setAgentStatusByTab, activeTabId, `자동 진행 제한 도달 (${MAX_AGENT_STEPS})`)
      return undefined
    }
    const existingTimer = observeTimerByTabRef.current[activeTabId]
    if (existingTimer) clearTimeout(existingTimer)
    observeTimerByTabRef.current[activeTabId] = setTimeout(() => {
      const current = lastRunByTabRef.current[activeTabId]
      if (!current) return
      const observedCommand = current.command
      setTabValue(setAgentStatusByTab, activeTabId, '새 출력 분석 중')
      void send(`실행한 명령:\n${observedCommand}`, 'observe').finally(() => {
        if (lastRunByTabRef.current[activeTabId]?.command === observedCommand) {
          lastRunByTabRef.current[activeTabId] = undefined
        }
      })
    }, OBSERVE_QUIET_MS)
    return () => {
      const timer = observeTimerByTabRef.current[activeTabId]
      if (timer) clearTimeout(timer)
      observeTimerByTabRef.current[activeTabId] = undefined
    }
  }, [activeTabId, observeTerminal, pending, send, terminalSnapshot])

  useEffect(
    () => () => {
      Object.values(abortByTabRef.current).forEach((controller) => controller?.abort())
      Object.values(observeTimerByTabRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer)
      })
    },
    [],
  )

  return (
    <section
      aria-label="Shell AI chat"
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-[#0b0f14] text-slate-100"
    >
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            Shell AI
          </span>
          {pending ? (
            <span className="text-[11px] text-slate-400">{agentStatus ?? '응답 중…'}</span>
          ) : agentStatus ? (
            <span className="text-[11px] text-slate-400">{agentStatus}</span>
          ) : null}
          {activeBinding ? (
            <span
              className="hidden min-w-0 items-center gap-1 rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline-flex"
              title={`대화 workspace: ${shellWorkspaceLabel(activeBinding.workspaceRoot)}`}
            >
              <FolderLock className="h-3 w-3 shrink-0 text-sky-500" />
              <span className="max-w-48 truncate">
                {shellWorkspaceLabel(activeBinding.workspaceRoot)}
              </span>
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="flex min-w-0 items-center gap-1 rounded-md border border-slate-800 bg-slate-950/70 px-1.5 py-1">
            <Bot className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="sr-only">Shell AI model</span>
            <select
              className="h-6 max-w-[180px] min-w-24 rounded border border-slate-800 bg-slate-950 px-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500"
              value={llm.providerId ?? ''}
              onChange={(event) => {
                const providerId = event.target.value || null
                const provider = providers.find((candidate) => candidate.id === providerId)
                void persistShellModel({
                  providerId,
                  modelId: provider?.models[0]?.id ?? null,
                })
              }}
              disabled={providers.length === 0 || pending}
              title={`현재 모델: ${modelStatusLabel}`}
              aria-label="shell ai provider"
            >
              <option value="">
                {modelCatalogStatus === 'loading' ? 'Provider...' : '자동 Provider'}
              </option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <select
              className="h-6 max-w-[220px] min-w-28 rounded border border-slate-800 bg-slate-950 px-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500"
              value={llm.modelId ?? ''}
              onChange={(event) =>
                void persistShellModel({
                  providerId: llm.providerId,
                  modelId: event.target.value || null,
                })
              }
              disabled={!selectedProvider || pending}
              title={`현재 모델: ${modelStatusLabel}`}
              aria-label="shell ai model"
            >
              <option value="">{selectedProvider ? '모델 선택' : '자동 모델'}</option>
              {selectedProvider?.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setObserveTerminal((value) => !value)}
            title={
              observeTerminal
                ? '관찰 ON — 명령 실행 후 터미널 출력이 조용해지면 AI가 다시 판단합니다.'
                : '관찰 OFF — 터미널 화면은 질문 시점에만 포함됩니다.'
            }
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
              observeTerminal
                ? 'border border-sky-500/40 bg-sky-500/10 text-sky-300'
                : 'border border-slate-700 text-slate-400 hover:bg-slate-800',
            )}
            aria-pressed={observeTerminal}
          >
            <Eye className="h-3 w-3" />
            {observeTerminal ? '관찰 ON' : '관찰 OFF'}
          </button>
          <button
            type="button"
            onClick={() => setAutoRun((value) => !value)}
            title={
              autoRun
                ? '자동 제안 ON — 응답이 끝나면 첫 명령의 실행 확인을 엽니다.'
                : '자동 제안 OFF — Run 버튼을 직접 눌러야 실행합니다.'
            }
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
              autoRun
                ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border border-slate-700 text-slate-400 hover:bg-slate-800',
            )}
            aria-pressed={autoRun}
          >
            <Wand2 className="h-3 w-3" />
            {autoRun ? '제안 ON' : '제안 OFF'}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-300 hover:bg-slate-800"
            onClick={onClose}
            aria-label="close shell ai"
            title="Close (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {workspaceTransitionRequired ? (
        <div
          role="alert"
          data-testid="shell-workspace-transition"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/30 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-amber-200">workspace 밖으로 이동했습니다.</p>
            <p className="truncate font-mono text-[10px] text-amber-200/70">
              {shellWorkspaceLabel(activeBinding?.workspaceRoot)} →{' '}
              {shellWorkspaceLabel(terminalSnapshot?.cwd)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-amber-500/40 bg-amber-950/50 text-[11px] text-amber-100 hover:bg-amber-900/60"
            onClick={() => void startNewWorkspaceConversation()}
          >
            {pending ? '응답 중단 후 새 대화' : '새 workspace 대화'}
          </Button>
        </div>
      ) : null}

      {blockedCommand ? (
        <div
          role="alert"
          data-testid="shell-command-context-blocked"
          className="flex shrink-0 items-start justify-between gap-3 border-b border-rose-500/30 bg-rose-950/30 px-3 py-2"
        >
          <div className="flex min-w-0 items-start gap-2">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-rose-100">
                제안 당시 터미널 컨텍스트가 달라 실행하지 않았습니다.
              </p>
              <p className="mt-0.5 text-[10px] text-rose-200/75">{blockedCommand.reason}</p>
              <p className="mt-1 truncate font-mono text-[10px] text-rose-200/60">
                {blockedCommand.context.tabTitle} ·{' '}
                {shellWorkspaceLabel(blockedCommand.context.workspaceRoot)} ·{' '}
                {shellWorkspaceLabel(blockedCommand.context.cwd)} →{' '}
                {shellWorkspaceLabel(blockedCommand.currentCwd)}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-rose-500/40 bg-rose-950/50 text-[11px] text-rose-100 hover:bg-rose-900/60"
            onClick={() => void startNewWorkspaceConversation()}
          >
            새 workspace 대화
          </Button>
        </div>
      ) : null}

      <div ref={transcriptRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {archivedConversations.length > 0 ? (
          <details className="rounded-md border border-slate-800 bg-slate-950/50 text-[11px] text-slate-400">
            <summary className="cursor-pointer px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-sky-500">
              이전 workspace 대화 {archivedConversations.length}개
            </summary>
            <div className="max-h-48 space-y-2 overflow-y-auto border-t border-slate-800 px-3 py-2">
              {archivedConversations.map((conversation) => (
                <div key={conversation.sessionId} className="space-y-1.5">
                  <p className="font-mono text-[10px] text-slate-500">
                    {shellWorkspaceLabel(conversation.workspaceRoot)}
                  </p>
                  {conversation.messages.map((message) => (
                    <ShellMessageBubble
                      key={message.id}
                      message={message}
                      activeTabId={null}
                      onRunCommand={() => false}
                    />
                  ))}
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-800 px-3 py-2 text-[11px] text-slate-500">
            활성 터미널 화면을 보고 있습니다. 코드 블록은 ▶ 버튼으로 해당 터미널에 실행할 수 있고,
            관찰 ON 상태에서는 실행 후 새 출력까지 다시 분석합니다.
          </div>
        ) : (
          messages.map((message) => (
            <ShellMessageBubble
              key={message.id}
              message={message}
              activeTabId={activeTabId}
              onRunCommand={confirmAndDispatchCommand}
            />
          ))
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-slate-800 px-2 py-2">
        <textarea
          className="h-9 max-h-24 min-w-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(input)
            }
            if (event.key === 'Escape') {
              onClose()
            }
          }}
          placeholder={
            workspaceTransitionRequired
              ? '새 workspace 대화를 시작해야 합니다.'
              : pending
                ? '응답 받는 중…'
                : '명령 / 질문 입력 후 Enter — Shift+Enter 줄바꿈'
          }
          disabled={pending || workspaceTransitionRequired || !activeTabId}
          aria-label="shell ai prompt"
          rows={1}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => void send(input)}
          disabled={pending || workspaceTransitionRequired || !activeTabId || !input.trim()}
          aria-label="send shell ai message"
          title="Send (Enter)"
        >
          {pending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </section>
  )
}

function ShellMessageBubble({
  message,
  activeTabId,
  onRunCommand,
}: {
  message: ShellChatMessage
  activeTabId: string | null
  onRunCommand: (command: string, context: ShellCommandContext) => boolean | Promise<boolean>
}) {
  const blocks = useMemo(
    () =>
      message.role === 'assistant' && message.content
        ? extractCommandBlocks(message.content).filter(
            (block) =>
              normalizeCommandForComparison(block.command) !==
              normalizeCommandForComparison(message.suppressCommand),
          )
        : [],
    [message.content, message.role, message.suppressCommand],
  )

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs leading-relaxed',
        message.role === 'user'
          ? 'border-sky-900/40 bg-sky-950/30 text-sky-100'
          : 'border-slate-800 bg-slate-900/60 text-slate-200',
      )}
    >
      <div className="whitespace-pre-wrap break-words">
        {message.content || (message.role === 'assistant' ? '…' : '')}
      </div>
      {blocks.length > 0 ? (
        <div className="mt-2 space-y-1.5 border-t border-slate-800 pt-2">
          {blocks.map((block, index) => (
            <div
              key={`${block.lang ?? 'shell'}-${index}`}
              className="flex items-start gap-2 rounded bg-slate-950/70 p-2"
            >
              <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] text-emerald-300">
                {block.command}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 border-slate-700 text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  if (message.commandContext) {
                    void onRunCommand(block.command, message.commandContext)
                  }
                }}
                disabled={!activeTabId || !message.commandContext}
                title={
                  activeTabId && message.commandContext
                    ? `${message.commandContext.tabTitle} · ${shellWorkspaceLabel(message.commandContext.cwd)}에서 실행 확인`
                    : '실행 컨텍스트 없음'
                }
              >
                <Play className="h-3 w-3" />
                Run
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
