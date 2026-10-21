'use client'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assertPetAssistantAvailable, findAssistantSession, findPetAssistantSession, PET_ASSISTANT_SESSION_TAG, preparePetPersona, type PetAssistantActions, type PetRequestMode } from '@/lib/pet/assistant'
import type { PetConfig } from '@/lib/pet/model'
import { useChatAttachmentsStore } from '@/lib/store/chat-attachments-store'
import {
  Boxes,
  BriefcaseBusiness,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileText,
  Keyboard,
  Minimize2,
  MessageSquare,
  Moon,
  Palette,
  Plus,
  Settings2,
  SquareTerminal,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ThemePersistenceProvider } from '@/components/providers/theme-persistence-provider'
import { I18nProvider } from '@/components/providers/i18n-provider'
import { TransportProvider, useTransport } from '@/components/providers/transport-provider'
import { ExtensionProvider, useExtensionRegistry } from '@/components/providers/extension-provider'
import { ToolApprovalDialog } from '@/components/dialogs/ToolApprovalDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog'
import { CommandPalette, type CommandPaletteItem } from '@/components/chat/CommandPalette'
import { listSettingsTabs } from '@/components/settings/registry'
import { CompressConversationDialog } from '@/components/dialogs/CompressConversationDialog'
import { ConversationReportDialog } from '@/components/dialogs/ConversationReportDialog'
import { Blocks } from 'lucide-react'
import { useTheme } from '@/components/providers/theme-provider'
import { MainLayout } from '@/components/layout/MainLayout'
import { Sidebar } from '@/components/layout/Sidebar'
import { SidebarChat } from '@/components/layout/SidebarChat'
import { ShellSidebar } from '@/components/shell/ShellSidebar'
import { ShellWorkspace } from '@/components/shell/ShellWorkspace'
import { MemorySidebar } from '@/components/memory/MemorySidebar'
import { MemoryWorkspace, type MemoryWorkspaceSectionId } from '@/components/memory/MemoryWorkspace'
import { TasksSidebar } from '@/components/tasks/TasksSidebar'
import { TasksWorkspace } from '@/components/tasks/TasksWorkspace'
import { BackgroundWorkPanel } from '@/components/tasks/BackgroundWorkPanel'
import { PersonalKnowledgePage } from '@/components/knowledge/PersonalKnowledgePage'
import { WikiTree } from '@/components/layout/WikiTree'
import {
  KnowledgeWorkspace,
  type KnowledgeSection,
} from '@/components/knowledge/KnowledgeWorkspace'
import { PersonalDocsSettings } from '@/components/settings/PersonalDocsSettings'
import { TeamDocsSettingsTab } from '@/components/settings/TeamDocsSettingsTab'
import { ChatContainer, type ExternalChatMessageDelivery } from '@/components/chat/ChatContainer'
import { ASSISTANT_SCENARIOS, ASSISTANT_SESSION_TAG, buildAssistantRequest, type AssistantDestination, type AssistantRequest } from '@/lib/apps/assistant'
import { WritingEditorPane } from '@/components/writing/WritingPane'
import { ResizableSplit } from '@/components/layout/ResizableSplit'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { SetupWizard } from '@/components/setup/SetupWizard'
import { Toaster } from '@/components/ui/toaster'
import { Button } from '@/components/ui/button'
import { DocumentsPage } from '@/components/rag/DocumentsPage'
import { CodeSnippetGallery } from '@/components/snippets/CodeSnippetGallery'
import { SkillManager } from '@/components/skills/SkillManager'
import { GalleryView } from '@/components/gallery/GalleryView'
import { invokeDesktop, onDesktopChannel } from '@/lib/electron/bridge'
import { createSettingsApi } from '@/lib/api/settings'
import { ensureProviderCatalog } from '@/lib/chat/provider-catalog'
import { useSessionStore } from '@/lib/store/session-store'
import { createDraftSession, createSessionsApi } from '@/lib/api/sessions'
import { createAgentsApi } from '@/lib/api/agents'
import { CapabilityUnavailableError, createWikiApi } from '@/lib/api/wiki'
import { useKeymap } from '@/lib/keymap'
import { useAppShellStore } from '@/lib/store/app-shell-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useWikiStore } from '@/lib/store/wiki-store'
import {
  explainRuntimeFailure,
  isBrowserPreviewTransport,
  type RuntimeFeedback,
} from '@/lib/utils/runtime-feedback'
import { dispatchSlashCommand, type SlashCommandContext } from '@/lib/chat/slash-commands'
import { resolveNewChatWorkspace } from '@/lib/chat/new-chat-workspace'
import { useChatStore } from '@/lib/store/chat-store'
import { confirm } from '@/lib/utils/confirm'
import { createAutonomyApi } from '@/lib/api/autonomy'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { useShellStore } from '@/lib/store/shell-store'
import { desktopFeatures, desktopSettingsFeatures } from '@/lib/feature-profile'

const SETUP_KEY = 'sepilotd.setupCompleted'

const LazyAppsSidebar = lazy(async () => {
  const module = await import('@/components/apps/AppsSidebar')
  return { default: module.AppsSidebar }
})
const LazyAppsWorkspace = lazy(async () => {
  const module = await import('@/components/apps/AppsWorkspace')
  return { default: module.AppsWorkspace }
})
const LazyAppsManagerDialog = lazy(async () => {
  const module = await import('@/components/apps/AppsManagerDialog')
  return { default: module.AppsManagerDialog }
})
const LazySettingsDialog = lazy(async () => {
  const module = await import('@/components/settings/SettingsDialog')
  return { default: module.SettingsDialog }
})

const SESSION_REFRESH_MS = 60_000
const SESSION_RETRY_MIN_MS = 15_000
const SESSION_RETRY_MAX_MS = 5 * 60_000

type View = string
type ServiceStartupStatusPayload = {
  service: 'daemon' | 'gateway'
  status: 'starting' | 'ready' | 'failed'
  title: string
  detail: string
  logPath?: string
  timestamp: string
}

const VIEW_TITLE: Record<string, string> = {
  chat: 'Chat',
  memory: 'Memory',
  tasks: 'Tasks',
  shell: 'Shell',
  office: 'Apps',
  rag: '지식',
  knowledge: '지식',
  wiki: '지식',
  'personal-docs': '지식',
  'team-docs': '지식',
  snippets: 'Snippets',
  skills: 'Skills',
  gallery: 'Gallery',
  canvas: 'Canvas',
}

const KNOWLEDGE_SECTION_BY_VIEW: Record<string, KnowledgeSection> = {
  knowledge: 'durable',
  wiki: 'authored',
  rag: 'reference',
  'personal-docs': 'personal',
  'team-docs': 'team',
}

const KNOWLEDGE_VIEW_BY_SECTION: Record<KnowledgeSection, string> = {
  durable: 'knowledge',
  authored: 'wiki',
  reference: 'rag',
  personal: 'personal-docs',
  team: 'team-docs',
}

const PRIMARY_SIDEBAR_VIEWS = new Set(['chat', 'memory', 'tasks', 'shell', 'office'])
const CHAT_SIDEBAR_AUX_VIEWS = new Set([
  'knowledge',
  'canvas',
  'gallery',
  'rag',
  'wiki',
  'personal-docs',
  ...(desktopSettingsFeatures['team-docs'] ? ['team-docs'] : []),
  ...(desktopSettingsFeatures.snippets ? ['snippets'] : []),
  'skills',
])

type ProviderCatalog = Awaited<ReturnType<typeof ensureProviderCatalog>>

function sameCatalogValue(value: string, query: string): boolean {
  return value === query || value.toLowerCase() === query.toLowerCase()
}

function resolveSlashModelTarget(
  providers: ProviderCatalog,
  target: string,
):
  | { ok: true; providerId: string; providerLabel: string; modelId: string; modelLabel: string }
  | { ok: false; title: string; description?: string } {
  const trimmed = target.trim()
  if (!trimmed) {
    return { ok: false, title: '모델을 입력하세요.' }
  }

  const slashIndex = trimmed.indexOf('/')
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const providerQuery = trimmed.slice(0, slashIndex).trim()
    const modelQuery = trimmed.slice(slashIndex + 1).trim()
    const provider = providers.find(
      (candidate) =>
        sameCatalogValue(candidate.id, providerQuery) ||
        sameCatalogValue(candidate.label, providerQuery),
    )
    if (!provider) {
      return {
        ok: false,
        title: '프로바이더를 찾을 수 없습니다.',
        description: providerQuery,
      }
    }
    const model = provider.models.find(
      (candidate) =>
        sameCatalogValue(candidate.id, modelQuery) || sameCatalogValue(candidate.label, modelQuery),
    )
    if (!model) {
      return {
        ok: false,
        title: '모델을 찾을 수 없습니다.',
        description: `${provider.id}/${modelQuery}`,
      }
    }
    return {
      ok: true,
      providerId: provider.id,
      providerLabel: provider.label,
      modelId: model.id,
      modelLabel: model.label,
    }
  }

  const matches = providers.flatMap((provider) =>
    provider.models
      .filter(
        (model) => sameCatalogValue(model.id, trimmed) || sameCatalogValue(model.label, trimmed),
      )
      .map((model) => ({ provider, model })),
  )
  if (matches.length === 0) {
    return {
      ok: false,
      title: '모델을 찾을 수 없습니다.',
      description: '프로바이더까지 지정하려면 /model provider/model 형식으로 입력하세요.',
    }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      title: '모델명이 중복됩니다.',
      description: matches
        .slice(0, 3)
        .map(({ provider, model }) => `${provider.id}/${model.id}`)
        .join(', '),
    }
  }

  const [{ provider, model }] = matches
  return {
    ok: true,
    providerId: provider.id,
    providerLabel: provider.label,
    modelId: model.id,
    modelLabel: model.label,
  }
}

function Shell() {
  const { theme, setTheme } = useTheme()
  const clearChatMessages = useChatStore((s) => s.clear)
  const chatPending = useChatStore((s) => s.pending)
  const [setupDone, setSetupDone] = useState<boolean>(
    () => typeof window !== 'undefined' && window.localStorage.getItem(SETUP_KEY) === '1',
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [appsManagerOpen, setAppsManagerOpen] = useState(false)
  const [settingsInitialTabKey, setSettingsInitialTabKey] = useState<string | null>(null)
  const [compressOpen, setCompressOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [sidebarContext, setSidebarContext] = useState<View>('chat')
  const [memoryFocus, setMemoryFocus] = useState<{
    section: MemoryWorkspaceSectionId
    version: number
  } | null>(null)
  const [taskFocus, setTaskFocus] = useState<{ jobId: string; version: number } | null>(null)
  const [showMicroAppChats, setShowMicroAppChats] = useState(false)
  const [externalChatMessage, setExternalChatMessage] =
    useState<ExternalChatMessageDelivery | null>(null)
  const [appFocus, setAppFocus] = useState<{ appId?: string; version: number } | null>(null)
  const [assistantHomeVisible, setAssistantHomeVisible] = useState(true)
  const chatMode = useChatModeStore((s) => s.mode)
  const chatModes = useChatModeStore((s) => s.catalog)
  const setAgentDescriptors = useChatModeStore((s) => s.setAgentDescriptors)
  const transport = useTransport()
  const setActive = useSessionStore((s) => s.setActive)
  const removeSession = useSessionStore((s) => s.removeSession)
  const upsert = useSessionStore((s) => s.upsertSession)
  const setSessions = useSessionStore((s) => s.setSessions)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const shellTabs = useShellStore((s) => s.tabs)
  const addLocalShellTab = useShellStore((s) => s.addLocalTab)
  const closeAllShellTabs = useShellStore((s) => s.closeAll)
  const setLocale = useAppShellStore((s) => s.setLocale)
  const defaultWorkingDir = useSettingsStore((s) => s.general.workingDir)
  const setGeneralSettings = useSettingsStore((s) => s.setGeneral)
  const setLlmSettings = useSettingsStore((s) => s.setLlm)
  const setWikiNodes = useWikiStore((s) => s.setNodes)
  const wikiSelectedId = useWikiStore((s) => s.selectedId)
  const setWikiSelected = useWikiStore((s) => s.setSelected)
  const [chatStatusNotice, setChatStatusNotice] = useState<RuntimeFeedback | null>(null)
  const [serviceStartupNotice, setServiceStartupNotice] =
    useState<ServiceStartupStatusPayload | null>(null)
  const [newConversationBusy, setNewConversationBusy] = useState(false)
  const [deleteAllBusy, setDeleteAllBusy] = useState(false)
  const { active: activeExtensions } = useExtensionRegistry()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const descriptors = await (await createAgentsApi(transport)).list()
        if (!cancelled) setAgentDescriptors(descriptors)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setAgentDescriptors, transport])

  useEffect(() => {
    if (!setupDone) return
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) {
          return
        }

        const api = await createSettingsApi(transport)
        const [general, llm] = await Promise.all([api.getGeneral(), api.getLlm()])
        if (cancelled) return
        setGeneralSettings(general)
        setLlmSettings(llm)
        setTheme(general.theme)
        setLocale(general.locale)
      } catch {
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setupDone, transport, setGeneralSettings, setLlmSettings, setTheme, setLocale])

  useEffect(() => {
    if (!setupDone || view !== 'chat') return
    let cancelled = false
    let refreshInFlight = false
    let refreshTimer: number | null = null
    let disposeWatch: (() => void) | null = null
    let watchStarting = false
    let retryDelayMs = SESSION_RETRY_MIN_MS
    let sessionsApiPromise: ReturnType<typeof createSessionsApi> | null = null

    const isVisible = () => document.visibilityState === 'visible'

    const clearRefreshTimer = () => {
      if (refreshTimer == null) return
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    const getSessionsApi = () => {
      sessionsApiPromise ??= createSessionsApi(transport)
      return sessionsApiPromise
    }

    const refreshSessionList = async (): Promise<'ok' | 'retry' | 'disabled'> => {
      if (refreshInFlight || !isVisible()) return 'disabled'
      refreshInFlight = true
      try {
        if (await isBrowserPreviewTransport(transport)) {
          if (!cancelled && isVisible()) {
            setSessions([])
            setChatStatusNotice(
              await explainRuntimeFailure(transport, null, {
                defaultTitle: '대화 목록을 불러올 수 없습니다',
                browserTitle: '브라우저 미리보기에서는 대화 목록이 비어 보일 수 있습니다',
              }),
            )
          }
          return 'disabled'
        }

        const api = await getSessionsApi()
        const list = await api.list()
        if (!cancelled && isVisible()) {
          setSessions(list)
          setChatStatusNotice(null)
        }
        retryDelayMs = SESSION_RETRY_MIN_MS
        return 'ok'
      } catch (error) {
        if (!cancelled && isVisible()) {
          setChatStatusNotice(
            await explainRuntimeFailure(transport, error, {
              defaultTitle: '대화 목록을 불러올 수 없습니다',
              browserTitle: '브라우저 미리보기에서는 대화 목록이 비어 보일 수 있습니다',
            }),
          )
        }
        return 'retry'
      } finally {
        refreshInFlight = false
      }
    }

    const scheduleRefresh = (delayMs: number) => {
      clearRefreshTimer()
      if (cancelled || !isVisible()) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void refreshAndSchedule()
      }, delayMs)
    }

    const refreshAndSchedule = async () => {
      const result = await refreshSessionList()
      if (cancelled || result === 'disabled') return
      if (result === 'ok') {
        scheduleRefresh(SESSION_REFRESH_MS)
        return
      }
      scheduleRefresh(retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, SESSION_RETRY_MAX_MS)
    }

    const startVisibleSessionSync = async () => {
      if (cancelled || !isVisible()) return
      await refreshAndSchedule()
      if (cancelled || !isVisible() || disposeWatch || watchStarting) return
      watchStarting = true
      try {
        const api = await getSessionsApi()
        const nextDispose =
          (await api.watch?.((list) => {
            if (!cancelled && isVisible()) {
              setSessions(list)
              setChatStatusNotice(null)
            }
          })) ?? null
        if (cancelled || !isVisible()) {
          nextDispose?.()
          return
        }
        disposeWatch = nextDispose
      } catch {
      } finally {
        watchStarting = false
      }
    }

    const handleVisibilityChange = () => {
      if (!isVisible()) {
        clearRefreshTimer()
        disposeWatch?.()
        disposeWatch = null
        return
      }
      void startVisibleSessionSync()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void startVisibleSessionSync()
    return () => {
      cancelled = true
      clearRefreshTimer()
      disposeWatch?.()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [setupDone, transport, setSessions, view])

  useEffect(() => {
    if (!setupDone || view !== 'wiki') return
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) {
          if (!cancelled) {
            setWikiNodes([])
            setWikiSelected(null)
          }
          return
        }

        const api = await createWikiApi(transport)
        const nodes = await api.tree()
        if (cancelled) return
        setWikiNodes(nodes)
        setWikiSelected(
          nodes.some((node) => node.id === wikiSelectedId)
            ? wikiSelectedId
            : (nodes[0]?.id ?? null),
        )
      } catch (error) {
        if (cancelled) return
        setWikiNodes([])
        setWikiSelected(null)
        if (!(error instanceof CapabilityUnavailableError)) {
          toast.error('위키를 불러오지 못했습니다.', {
            description: error instanceof Error ? error.message : '알 수 없는 오류',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setupDone, view, transport, wikiSelectedId, setWikiNodes, setWikiSelected])

  function focusComposer() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('sepilot:focus-composer'))
    })
  }

  function updateSidebarContextForView(nextView: string): void {
    if (
      PRIMARY_SIDEBAR_VIEWS.has(nextView) ||
      activeExtensions.some((ext) => ext.id === nextView)
    ) {
      setSidebarContext(nextView)
      return
    }
    if (CHAT_SIDEBAR_AUX_VIEWS.has(nextView)) {
      setSidebarContext('chat')
    }
  }

  useEffect(() => {
    const VIEWS = new Set([
      'chat',
      'memory',
      'tasks',
      ...(desktopFeatures.shell ? ['shell'] : []),
      ...(desktopFeatures.microApps ? ['office'] : []),
      ...(desktopFeatures.canvas ? ['canvas'] : []),
      'rag',
      ...(desktopFeatures.canvas ? ['gallery'] : []),
      'wiki',
      'personal-docs',
      ...(desktopSettingsFeatures['team-docs'] ? ['team-docs'] : []),
      ...(desktopSettingsFeatures.snippets ? ['snippets'] : []),
      'skills',
    ])
    function onOpenView(event: Event) {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail !== 'string' || !VIEWS.has(detail)) return
      setView(detail as typeof view)
      updateSidebarContextForView(detail)
      setSettingsOpen(false)
    }
    window.addEventListener('sepilot:open-view', onOpenView as EventListener)
    return () => window.removeEventListener('sepilot:open-view', onOpenView as EventListener)
  }, [])

  useEffect(() => {
    function onOpenSettingsTab(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      const tabKey =
        typeof detail === 'string'
          ? detail
          : detail && typeof detail === 'object' && 'tabKey' in detail
            ? String((detail as { tabKey?: unknown }).tabKey ?? '')
            : ''
      setSettingsInitialTabKey(tabKey || null)
      setSettingsOpen(true)
    }
    window.addEventListener('sepilot:open-settings-tab', onOpenSettingsTab)
    return () => window.removeEventListener('sepilot:open-settings-tab', onOpenSettingsTab)
  }, [])

  useEffect(() => {
    if (!useSessionStore.getState().activeId) useChatModeStore.getState().startNewConversation()
  }, [])

  async function onNewChat(): Promise<void> {
    if (newConversationBusy) return
    setNewConversationBusy(true)
    try {
      const api = await createSessionsApi(transport)
      const sessionState = useSessionStore.getState()
      let workspace = resolveNewChatWorkspace({
        sessions: sessionState.sessions,
        activeId: sessionState.activeId,
        defaultWorkingDir: useSettingsStore.getState().general.workingDir,
      })
      if (!workspace) {
        const persistedSessions = await api.list()
        workspace = resolveNewChatWorkspace({
          sessions: persistedSessions,
          activeId: sessionState.activeId,
          defaultWorkingDir: useSettingsStore.getState().general.workingDir,
        })
      }
      const created = await api.create(undefined, workspace)
      upsert(workspace && !created.cwd?.trim() ? { ...created, cwd: workspace } : created)
      useChatModeStore.getState().startNewConversation()
      setActive(created.id)
      setView('chat')
      setSidebarContext('chat')
      setChatStatusNotice(null)
      focusComposer()
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '새 대화를 시작할 수 없습니다',
      })
      setChatStatusNotice(feedback)
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      setNewConversationBusy(false)
    }
  }

  async function onDeleteAllChats(): Promise<void> {
    if (deleteAllBusy) return
    setDeleteAllBusy(true)
    try {
      const isBrowserPreview = await isBrowserPreviewTransport(transport)
      const localDrafts = sessions.filter((session) => session.isDraft)
      const remoteSessions = sessions.filter((session) => !session.isDraft)

      if (isBrowserPreview && remoteSessions.length > 0) {
        throw null
      }
      const removedIds = localDrafts.map((session) => session.id)
      let failedCount = 0

      if (remoteSessions.length > 0) {
        const api = await createSessionsApi(transport)
        for (let guard = 0; guard < 1000; guard += 1) {
          const remaining = await api.list()
          const batch = remaining.filter((session) => !session.isDraft)
          if (batch.length === 0) break

          const results = await Promise.allSettled(
            batch.map(async (session) => {
              await api.remove(session.id)
              return session.id
            }),
          )
          const succeeded = results.filter(
            (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
          )
          removedIds.push(...succeeded.map((result) => result.value))
          failedCount += results.length - succeeded.length
          if (succeeded.length === 0) break
        }
      }

      if (removedIds.length > 0) {
        removedIds.forEach((id) => removeSession(id))
        if (activeId && removedIds.includes(activeId)) {
          setActive(null)
        }
      }

      if (failedCount === 0) {
        setChatStatusNotice(null)
        setView('chat')
        setSidebarContext('chat')
        toast.success('대화를 삭제했습니다.', {
          description: `${removedIds.length}개 대화를 정리했습니다.`,
        })
        return
      }

      if (removedIds.length === sessions.length) {
        setActive(null)
        setView('chat')
        setSidebarContext('chat')
      }

      const feedback = await explainRuntimeFailure(transport, null, {
        defaultTitle: '일부 대화를 삭제하지 못했습니다',
      })
      setChatStatusNotice(feedback)
      toast.error(feedback.title, {
        description: `${removedIds.length}개 삭제, ${failedCount}개 실패. ${feedback.description}`,
      })
    } finally {
      setDeleteAllBusy(false)
    }
  }

  useKeymap([
    { combo: 'mod+,', handler: () => setSettingsOpen((v) => !v) },
    { combo: 'mod+n', handler: () => void onNewChat() },
    { combo: 'mod+k', handler: () => setCommandPaletteOpen((v) => !v) },
    { combo: 'mod+/', handler: () => setShortcutsOpen((v) => !v) },
    {
      combo: 'mod+shift+t',
      handler: () => {
        if (!desktopFeatures.shell) return
        setView('shell')
        setSidebarContext('shell')
        addLocalShellTab()
      },
    },
    {
      combo: '/',
      handler: () => focusComposer(),
    },
  ])

  const slashContext = useMemo<SlashCommandContext>(
    () => ({
      availableModes: chatModes,
      newChat: () => void onNewChat(),
      clearActiveContext: () => {
        clearChatMessages()
        toast.info('대화 컨텍스트를 비웠습니다.', {
          description: '이전 메시지는 세션에 그대로 보존됩니다.',
        })
      },
      openSettings: () => {
        setSettingsInitialTabKey(null)
        setSettingsOpen(true)
      },
      openSettingsTab: (tabKey) => {
        setSettingsInitialTabKey(tabKey)
        setSettingsOpen(true)
      },
      openView: (nextView) => {
        setView(nextView)
        updateSidebarContextForView(nextView)
        toast.info(`${VIEW_TITLE[nextView] ?? nextView} 화면으로 이동했습니다.`)
      },
      setTheme: (next) => {
        setTheme(next)
        toast.success(`테마: ${next}`)
      },
      toggleTheme: () => {
        const next = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        toast.success(`테마: ${next}`)
      },
      showHelp: () => setShortcutsOpen(true),
      compressConversation: () => setCompressOpen(true),
      openConversationReport: () => setReportOpen(true),
      setAutonomy: (level) => {
        void (async () => {
          try {
            if (await isBrowserPreviewTransport(transport)) {
              toast.error('브라우저 미리보기에서는 daemon 설정을 변경할 수 없습니다.')
              return
            }
            const api = await createAutonomyApi(transport)
            await api.set(level)
            window.dispatchEvent(new CustomEvent('sepilot:autonomy-changed', { detail: level }))
            if (level === 'autonomous') {
              toast.warning('자동 모드 활성화', {
                description:
                  '도구가 승인 없이 실행됩니다. 되돌리려면 /privilege supervised 를 실행하세요.',
              })
            } else {
              toast.success(`privilege: ${level}`)
            }
          } catch (error) {
            const friendly = explainChatStreamError(error)
            toast.error(friendly.title, { description: friendly.description })
          }
        })()
      },
      setMode: (mode) => {
        if (mode === 'persona-panel') {
          window.dispatchEvent(new CustomEvent('sepilot:open-session-personas'))
          toast.info('이 대화의 페르소나 구성을 엽니다.')
          return
        }
        const sessionState = useSessionStore.getState()
        const activeSession = sessionState.sessions.find(
          (session) => session.id === sessionState.activeId,
        )
        if ((activeSession?.personaIds?.length ?? 0) > 1) {
          window.dispatchEvent(new CustomEvent('sepilot:open-session-personas'))
          toast.warning('다중 관점 구성이 현재 실행 모드를 결정합니다.', {
            description: '다른 모드로 전환하려면 이 대화의 페르소나를 1명 이하로 줄이세요.',
          })
          return
        }
        useChatModeStore.getState().setMode(mode)
        const label = chatModes.find((candidate) => candidate.id === mode)?.label ?? mode
        toast.success(`모드: ${label}`)
      },
      showModeStatus: () => {
        const sessionState = useSessionStore.getState()
        const activeSession = sessionState.sessions.find(
          (session) => session.id === sessionState.activeId,
        )
        const mode =
          (activeSession?.personaIds?.length ?? 0) > 1
            ? 'persona-panel'
            : useChatModeStore.getState().mode
        const label = chatModes.find((candidate) => candidate.id === mode)?.label ?? mode
        toast.info(`현재 모드: ${label}`)
      },
      selectModel: (target) => {
        void (async () => {
          try {
            if (await isBrowserPreviewTransport(transport)) {
              toast.error('브라우저 미리보기에서는 모델을 변경할 수 없습니다.')
              return
            }
            const providers = await ensureProviderCatalog(transport)
            if (providers.length === 0) {
              toast.error('사용 가능한 모델 목록이 없습니다.', {
                description: 'LLM provider 설정을 확인하세요.',
              })
              setSettingsInitialTabKey('llm')
              setSettingsOpen(true)
              return
            }
            const resolved = resolveSlashModelTarget(providers, target)
            if (!resolved.ok) {
              toast.error(resolved.title, {
                description: resolved.description,
              })
              return
            }

            const previous = useSettingsStore.getState().llm
            setLlmSettings({
              providerId: resolved.providerId,
              modelId: resolved.modelId,
            })
            try {
              const api = await createSettingsApi(transport)
              await api.setLlm({
                providerId: resolved.providerId,
                modelId: resolved.modelId,
              })
              toast.success('모델을 변경했습니다.', {
                description: `${resolved.providerLabel} / ${resolved.modelLabel}`,
              })
            } catch (error) {
              setLlmSettings({
                providerId: previous.providerId,
                modelId: previous.modelId,
              })
              const friendly = explainChatStreamError(error)
              toast.error(friendly.title, { description: friendly.description })
            }
          } catch (error) {
            const friendly = explainChatStreamError(error)
            toast.error(friendly.title, { description: friendly.description })
          }
        })()
      },
    }),
    [chatModes, clearChatMessages, setLlmSettings, setTheme, theme, transport],
  )

  const handleSlashCommand = useCallback(
    (input: string) => dispatchSlashCommand(input, slashContext),
    [slashContext],
  )

  function openAppsCodeAgent(): void {
    setView('office')
    setSidebarContext('office')
    window.dispatchEvent(new CustomEvent('sepilot:apps:code-agent'))
  }

  function startAssistantChat(request: AssistantRequest): void {
    if (useChatStore.getState().pending) {
      toast.info('진행 중인 대화를 마치거나 중지한 뒤 비서 대화를 시작하세요.')
      return
    }
    const state = useSessionStore.getState()
    const existing = findAssistantSession(state.sessions, state.activeId)
    const created = existing ?? { ...createDraftSession(request.title), tags: [ASSISTANT_SESSION_TAG] }
    upsert(created)
    setActive(created.id)
    useChatModeStore.getState().setMode('auto')
    useChatModeStore.getState().setEnableImageGen(false)
    setView('chat')
    setSidebarContext('chat')
    setExternalChatMessage({ deliveryId: `assistant:${crypto.randomUUID()}`, sessionId: created.id, text: request.prompt, mode: 'draft' })
    focusComposer()
  }

  const petLaunchBusy = useRef(false)
  const externalMessageRef = useRef(externalChatMessage)
  externalMessageRef.current = externalChatMessage
  function showPetConversation() {
    setView('chat')
    setSidebarContext('chat')
    focusComposer()
  }
  async function launchPetAssistant(config: PetConfig, text?: string, sessionId?: string, requestMode: PetRequestMode = 'continue') {
    if (requestMode !== 'continue' && requestMode !== 'web-search') throw new Error('지원하지 않는 펫 요청 모드입니다.')
    if (requestMode === 'web-search') sessionId = undefined
    if (petLaunchBusy.current) throw new Error('펫 요청을 비서 대화에 연결하고 있습니다.')
    if (text !== undefined && (!text.trim() || text.length > 2000)) throw new Error('요청을 2,000자 이내로 입력해 주세요.')
    assertPetAssistantAvailable(externalMessageRef.current !== null)
    petLaunchBusy.current = true
    const sourceId = useSessionStore.getState().activeId
    try {
      if (await isBrowserPreviewTransport(transport)) throw new Error('실제 요청은 연결된 Desktop에서 실행해 주세요.')
      const replyTarget = sessionId ? useSessionStore.getState().sessions.find(session => session.id === sessionId) : undefined
      if (sessionId && !replyTarget) throw new Error('원래 대화를 찾지 못했습니다. 대화 목록에서 확인해 주세요.')
      const persona = !replyTarget || replyTarget.tags?.includes(PET_ASSISTANT_SESSION_TAG)
        ? await preparePetPersona(transport, config) : undefined
      assertPetAssistantAvailable(externalMessageRef.current !== null)
      const state = useSessionStore.getState()
      if (state.activeId !== sourceId) throw new Error('다른 대화로 이동했습니다. 펫 요청을 확인하고 다시 보내 주세요.')
      const existing = sessionId ? state.sessions.find(session => session.id === sessionId)
        : requestMode === 'web-search' ? undefined : findPetAssistantSession(state.sessions, persona!)
      if (sessionId && !existing) throw new Error('원래 대화가 삭제되었습니다. 요청을 다시 확인해 주세요.')
      const target = existing ?? {
        ...createDraftSession(`${config.name} · ${requestMode === 'web-search' ? '웹 검색' : '펫 비서'}`),
        tags: [PET_ASSISTANT_SESSION_TAG], personaIds: [persona!],
      }
      upsert(target)
      setActive(target.id)
      useChatModeStore.getState().setBackend('sepilot')
      useChatModeStore.getState().setMode(requestMode === 'web-search' ? 'deep-web-research' : 'auto')
      useChatModeStore.getState().setEnableImageGen(false)
      showPetConversation()
      if (text !== undefined) {
        const delivery: ExternalChatMessageDelivery = { deliveryId: `pet:${crypto.randomUUID()}`, sessionId: target.id, text: text.trim(), mode: 'send' }
        externalMessageRef.current = delivery
        setExternalChatMessage(delivery)
      }
    } finally {
      petLaunchBusy.current = false
    }
  }
  const petAssistant: PetAssistantActions = {
    send: (text, config, sessionId, mode) => launchPetAssistant(config, text, sessionId, mode),
    async resume(config) {
      const chat = useChatStore.getState()
      if (chat.pending || chat.pendingQuestion || chat.pendingApprovals.length || chat.composer.trim()
        || useChatAttachmentsStore.getState().attachments.length || externalMessageRef.current) {
        showPetConversation()
        return
      }
      await launchPetAssistant(config)
    },
    openResource(view) {
      const chat = useChatStore.getState()
      if (chat.pending || chat.pendingQuestion || chat.pendingApprovals.length || externalMessageRef.current) {
        showPetConversation()
        return
      }
      if (view === 'wiki') { setView('wiki'); setSidebarContext('chat') }
      else openAssistantResource({ view })
    },
  }

  function openAssistantResource(destination: AssistantDestination): void {
    if (useChatStore.getState().pending) {
      toast.info('진행 중인 대화를 마치거나 중지한 뒤 결과를 열어주세요.')
      return
    }
    if (destination.view === 'office') {
      if (!desktopFeatures.microApps) return
      setAppFocus((previous) => ({ appId: destination.appId, version: (previous?.version ?? 0) + 1 }))
      setAssistantHomeVisible(!destination.appId)
      setView('office')
      setSidebarContext('office')
    } else if (destination.view === 'memory') {
      openMemorySection('memory-search')
    } else {
      setTaskFocus((previous) => ({ jobId: destination.jobId ?? '', version: (previous?.version ?? 0) + 1 }))
      setView('tasks')
      setSidebarContext('tasks')
    }
  }

  function openMemorySection(section: MemoryWorkspaceSectionId): void {
    setView('memory')
    setSidebarContext('memory')
    setMemoryFocus((current) => ({
      section,
      version: (current?.version ?? 0) + 1,
    }))
  }

  function openChatResource(nextView: 'snippets' | 'skills'): void {
    setView(nextView)
    setSidebarContext('chat')
  }

  useEffect(() => {
    return onDesktopChannel('sepilot:new-chat', () => void onNewChat())
  }, [onNewChat])

  useEffect(() => {
    return onDesktopChannel<{
      sessionId?: string | null
      view?: string | null
      jobId?: string | null
    }>('sepilot:notification/opened', ({ sessionId, view: target, jobId }) => {
      if (target === 'tasks') {
        if (jobId) setTaskFocus((prev) => ({ jobId, version: (prev?.version ?? 0) + 1 }))
        setView('tasks')
        updateSidebarContextForView('tasks')
        return
      }
      if (sessionId) setActive(sessionId)
      setView('chat')
      setSidebarContext('chat')
    })
  }, [setActive])

  useEffect(() => {
    return onDesktopChannel('sepilot:open-settings', () => {
      setSettingsInitialTabKey(null)
      setSettingsOpen(true)
    })
  }, [])

  useEffect(() => {
    return onDesktopChannel<string>('sepilot:quick-input/forward', (text) => {
      if (typeof text !== 'string') return
      void (async () => {
        try {
          if (await isBrowserPreviewTransport(transport)) {
            throw null
          }
          const api = await createSessionsApi(transport)
          const created = await api.create(undefined, defaultWorkingDir ?? undefined)
          upsert(created)
          useChatModeStore.getState().startNewConversation()
          setActive(created.id)
          setView('chat')
          setSidebarContext('chat')
          setChatStatusNotice(null)
          setExternalChatMessage({
            deliveryId: `quick-input:${created.id}`,
            sessionId: created.id,
            text,
          })
        } catch (error) {
          void (async () => {
            const feedback = await explainRuntimeFailure(transport, error, {
              defaultTitle: '빠른 입력을 전달할 수 없습니다',
            })
            setChatStatusNotice(feedback)
            toast.error(feedback.title, {
              description: feedback.description,
            })
          })()
          return
        }
      })()
    })
  }, [defaultWorkingDir, transport, upsert, setActive])

  useEffect(() => {
    return onDesktopChannel<ServiceStartupStatusPayload>(
      'sepilot:service-startup-status',
      (payload) => {
        if (payload?.service !== 'daemon') return
        if (payload.status === 'failed') {
          setServiceStartupNotice(payload)
          toast.error(payload.title, {
            description: payload.detail,
          })
          return
        }
        if (payload.status === 'ready') {
          setServiceStartupNotice(null)
        }
      },
    )
  }, [])

  useEffect(() => {
    return onDesktopChannel<{
      questionId: string
      questionName: string
      message: string
      clipboardEmpty?: boolean
    }>('sepilot:quick-question/trigger', (payload) => {
      const message = payload?.message
      if (typeof message !== 'string' || !message.trim()) return
      if (payload?.clipboardEmpty) {
        toast.info(`Quick Question: ${payload.questionName ?? ''}`, {
          description:
            '클립보드가 비어있어 프롬프트만 전송했습니다. 텍스트를 복사한 뒤 다시 시도하세요.',
        })
      }
      void (async () => {
        try {
          if (await isBrowserPreviewTransport(transport)) {
            throw null
          }
          const api = await createSessionsApi(transport)
          const created = await api.create(undefined, defaultWorkingDir ?? undefined)
          upsert(created)
          useChatModeStore.getState().startNewConversation()
          setActive(created.id)
          setView('chat')
          setSidebarContext('chat')
          setChatStatusNotice(null)
          setExternalChatMessage({
            deliveryId: `quick-question:${payload.questionId}:${created.id}`,
            sessionId: created.id,
            text: message,
          })
        } catch (error) {
          void (async () => {
            const feedback = await explainRuntimeFailure(transport, error, {
              defaultTitle: 'Quick Question을 시작할 수 없습니다',
            })
            setChatStatusNotice(feedback)
            toast.error(feedback.title, {
              description: feedback.description,
            })
          })()
          return
        }
      })()
    })
  }, [defaultWorkingDir, transport, upsert, setActive])

  useEffect(() => {
    void invokeDesktop('sepilot:main-window/ready-for-actions').catch(() => {})
  }, [])

  if (!setupDone) {
    return (
      <>
        <SetupWizard
          onComplete={() => {
            window.localStorage.setItem(SETUP_KEY, '1')
            setSetupDone(true)
          }}
        />
        <Toaster />
      </>
    )
  }

  const topOptions = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    ...(desktopFeatures.shell ? [{ id: 'shell', label: 'Shell', icon: SquareTerminal }] : []),
    ...(desktopFeatures.canvas ? [{ id: 'canvas', label: 'Canvas', icon: Palette }] : []),
    ...(desktopFeatures.microApps
      ? [{ id: 'office', label: 'Apps', icon: BriefcaseBusiness }]
      : []),
    { id: 'memory', label: 'Memory', icon: Database },
    { id: 'tasks', label: 'Tasks', icon: Clock },
    ...(desktopFeatures.extensions
      ? activeExtensions.map((ext) => ({
          id: ext.id,
          label: ext.id,
          icon: Blocks,
        }))
      : []),
  ]
  const sidebarMode = topOptions.some((option) => option.id === view)
    ? view
    : topOptions.some((option) => option.id === sidebarContext)
      ? sidebarContext
      : 'chat'
  const chatActive = view === 'chat'
  const memorySidebarActive = sidebarMode === 'memory'
  const tasksActive = view === 'tasks'
  const shellActive = view === 'shell'
  const officeActive = view === 'office'
  const appsSidebarActive = sidebarMode === 'office'

  const commandPaletteItems: CommandPaletteItem[] = [
    ...topOptions.map((option) => ({
      id: `view:${option.id}`,
      group: 'view' as const,
      label: option.label,
      icon: option.icon,
      onSelect: () => {
        setView(option.id as View)
        updateSidebarContextForView(option.id)
      },
    })),
    ...sessions
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map((session) => ({
        id: `session:${session.id}`,
        group: 'session' as const,
        label: session.title || '제목 없는 대화',
        icon: MessageSquare,
        onSelect: () => {
          void (async () => {
            if (session.id !== activeId && chatPending) {
              const ok = await confirm(
                '현재 대화의 응답이 생성 중입니다. 다른 대화로 전환하면 응답이 중단됩니다. 계속할까요?',
                { title: '응답 생성 중', confirmLabel: '전환', destructive: true },
              )
              if (!ok) return
            }
            setActive(session.id)
            setView('chat')
            setSidebarContext('chat')
          })()
        },
      })),
    ...listSettingsTabs().map((tab) => ({
      id: `settings:${tab.key}`,
      group: 'settings' as const,
      label: tab.label,
      description: 'Settings',
      keywords: tab.search,
      icon: Settings2,
      onSelect: () => {
        setSettingsInitialTabKey(tab.key)
        setSettingsOpen(true)
      },
    })),
    {
      id: 'action:new-chat',
      group: 'action',
      label: '새 대화',
      icon: Plus,
      onSelect: () => void onNewChat(),
    },
    {
      id: 'action:open-settings',
      group: 'action',
      label: '설정 열기',
      icon: Settings2,
      onSelect: () => {
        setSettingsInitialTabKey(null)
        setSettingsOpen(true)
      },
    },
    {
      id: 'action:toggle-theme',
      group: 'action',
      label: theme === 'dark' ? '라이트 테마로 전환' : '다크 테마로 전환',
      icon: theme === 'dark' ? Sun : Moon,
      onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'action:compress-conversation',
      group: 'action',
      label: '대화 압축',
      icon: Minimize2,
      onSelect: () => setCompressOpen(true),
    },
    {
      id: 'action:conversation-report',
      group: 'action',
      label: '대화 리포트',
      icon: FileText,
      onSelect: () => setReportOpen(true),
    },
    {
      id: 'action:shortcuts',
      group: 'action',
      label: '단축키 보기',
      icon: Keyboard,
      onSelect: () => setShortcutsOpen(true),
    },
  ]

  return (
    <>
      <MainLayout
        petAssistant={petAssistant}
        sidebar={
          <Sidebar
            title={VIEW_TITLE[view] ?? view}
            options={topOptions}
            activeOption={sidebarMode}
            onSelectOption={(next) => {
              setView(next as View)
              updateSidebarContextForView(next)
            }}
            onBackToChat={
              view === 'chat'
                ? undefined
                : () => {
                    setView('chat')
                    setSidebarContext('chat')
                  }
            }
            onNewConversation={
              officeActive
                ? undefined
                : shellActive
                  ? () => addLocalShellTab()
                  : chatActive
                    ? () => void onNewChat()
                    : undefined
            }
            headerActions={
              officeActive && desktopFeatures.microApps ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAppsManagerOpen(true)}
                  title="앱 관리"
                  aria-label="open app manager"
                >
                  <Boxes className="h-5 w-5" />
                </Button>
              ) : chatActive && desktopFeatures.microApps ? (
                <Button
                  variant={showMicroAppChats ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setShowMicroAppChats((value) => !value)}
                  title={
                    showMicroAppChats ? 'MicroWeb 내부 호출 숨기기' : 'MicroWeb 내부 호출 보기'
                  }
                  aria-label={
                    showMicroAppChats
                      ? 'hide microweb internal chats'
                      : 'show microweb internal chats'
                  }
                >
                  {showMicroAppChats ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              ) : null
            }
            onDeleteAll={
              officeActive
                ? undefined
                : shellActive
                  ? () => closeAllShellTabs()
                  : chatActive
                    ? () => void onDeleteAllChats()
                    : undefined
            }
            newConversationBusy={newConversationBusy}
            deleteAllBusy={deleteAllBusy}
            canDeleteAll={
              officeActive
                ? false
                : shellActive
                  ? shellTabs.length > 0
                  : chatActive
                    ? sessions.length > 0
                    : false
            }
            newActionLabel={
              officeActive ? 'Code Agent로 앱 만들기' : shellActive ? '새 로컬 터미널' : '새 대화'
            }
            newActionAriaLabel={
              officeActive
                ? 'create app with code agent'
                : shellActive
                  ? 'new local terminal'
                  : 'new conversation'
            }
            deleteAllActionLabel={
              officeActive
                ? '앱 템플릿 초기화'
                : shellActive
                  ? '모든 터미널 닫기'
                  : '전체 대화 삭제'
            }
            deleteAllActionAriaLabel={
              officeActive
                ? 'reset app pages'
                : shellActive
                  ? 'close all terminals'
                  : 'delete all conversations'
            }
            deleteAllDialogTitle={
              officeActive
                ? '앱 템플릿 초기화'
                : shellActive
                  ? '모든 터미널 닫기'
                  : '전체 대화 삭제'
            }
            deleteAllDialogDescription={
              officeActive
                ? '현재 앱 페이지를 기본 업무 템플릿 세트로 되돌립니다.'
                : shellActive
                  ? '열려 있는 모든 로컬/SSH 터미널 세션을 종료합니다.'
                  : sessions.some((session) => session.isRunning)
                    ? `모든 대화를 삭제하고 진행 중인 작업 ${sessions.filter((session) => session.isRunning).length}개를 중단합니다. 이 작업은 되돌릴 수 없습니다.`
                    : '모든 대화를 삭제합니다. 이 작업은 되돌릴 수 없습니다.'
            }
          >
            {appsSidebarActive ? (
              <Suspense fallback={null}>
                <LazyAppsSidebar
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenApp={(appId) => openAssistantResource({ view: 'office', appId })}
                  onOpenMemory={() => openAssistantResource({ view: 'memory' })}
                  onOpenTasks={() => openAssistantResource({ view: 'tasks' })}
                  onOpenDocuments={() => { setView('rag'); setSidebarContext('office') }}
                  activeView={officeActive && assistantHomeVisible ? 'assistant' : view}
                />
              </Suspense>
            ) : shellActive ? (
              <ShellSidebar onOpenSettings={() => setSettingsOpen(true)} />
            ) : memorySidebarActive ? (
              <MemorySidebar
                onOpenSearch={() => openMemorySection('memory-search')}
                onOpenIndex={() => openMemorySection('memory-index')}
                onOpenDocuments={() => {
                  setView('rag')
                  setSidebarContext('memory')
                }}
                onOpenSettings={() => {
                  setSettingsInitialTabKey('vector-db')
                  setSettingsOpen(true)
                }}
              />
            ) : tasksActive ? (
              <TasksSidebar
                onOpenSettings={() => {
                  setSettingsInitialTabKey('quick-input')
                  setSettingsOpen(true)
                }}
              />
            ) : (
              <SidebarChat
                onPickSession={(id) => {
                  setActive(id)
                  setView('chat')
                  setSidebarContext('chat')
                }}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenDocs={() => {
                  setView('rag')
                  setSidebarContext('chat')
                }}
                onOpenGallery={
                  desktopFeatures.canvas
                    ? () => {
                        setView('gallery')
                        setSidebarContext('chat')
                      }
                    : undefined
                }
                onOpenWiki={() => {
                  setView('wiki')
                  setSidebarContext('chat')
                }}
                activeView={view}
                statusNotice={chatStatusNotice}
                showMicroAppChats={showMicroAppChats}
              />
            )}
          </Sidebar>
        }
      >
        {serviceStartupNotice?.status === 'failed' && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div className="font-semibold">{serviceStartupNotice.title}</div>
            <div className="mt-1 text-xs opacity-90">{serviceStartupNotice.detail}</div>
            {serviceStartupNotice.logPath ? (
              <div className="mt-1 break-all text-[11px] opacity-80">
                Log: {serviceStartupNotice.logPath}
              </div>
            ) : null}
          </div>
        )}
        {view === 'chat' &&
          (chatMode === 'writing' ? (
            <ResizableSplit
              storageKey="sepilotd:writing-split"
              defaultLeftFraction={0.45}
              minFraction={0.22}
              left={
                <ChatContainer
                  onStartAssistant={desktopFeatures.microApps ? startAssistantChat : undefined}
                  onOpenResource={desktopFeatures.microApps ? openAssistantResource : undefined}
                  externalMessage={externalChatMessage}
                  onExternalMessageConsumed={(deliveryId) =>
                    setExternalChatMessage((current) =>
                      current?.deliveryId === deliveryId ? null : current,
                    )
                  }
                  onSlashCommand={handleSlashCommand}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenSnippets={
                    desktopSettingsFeatures.snippets
                      ? () => openChatResource('snippets')
                      : undefined
                  }
                  onOpenSkills={() => openChatResource('skills')}
                />
              }
              right={<WritingEditorPane />}
            />
          ) : (
            <div className="flex h-full flex-col">
              <ChatContainer
                onStartAssistant={desktopFeatures.microApps ? startAssistantChat : undefined}
                onOpenResource={desktopFeatures.microApps ? openAssistantResource : undefined}
                externalMessage={externalChatMessage}
                onExternalMessageConsumed={(deliveryId) =>
                  setExternalChatMessage((current) =>
                    current?.deliveryId === deliveryId ? null : current,
                  )
                }
                onSlashCommand={handleSlashCommand}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenSnippets={
                  desktopSettingsFeatures.snippets ? () => openChatResource('snippets') : undefined
                }
                onOpenSkills={() => openChatResource('skills')}
              />
            </div>
          ))}
        {desktopFeatures.shell ? (
          <div className={view === 'shell' ? 'h-full' : 'hidden'}>
            <ShellWorkspace visible={view === 'shell'} />
          </div>
        ) : null}
        {desktopFeatures.microApps && view === 'office' ? (
          <div className="h-full">
            <Suspense fallback={null}>
              <LazyAppsWorkspace
                onStartAssistant={startAssistantChat}
                onOpenResource={openAssistantResource}
                onOpenSession={(sessionId) => { setActive(sessionId); setView('chat'); setSidebarContext('chat') }}
                focusAppId={appFocus?.appId}
                focusVersion={appFocus?.version}
                onAssistantHomeChange={setAssistantHomeVisible}
              />
            </Suspense>
          </div>
        ) : null}
        {view === 'memory' && (
          <div className="h-full overflow-y-auto p-4">
            {desktopFeatures.microApps ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-primary/[0.03] p-3">
              <p className="text-sm">기억을 실제 일정과 계획에 활용해보세요.</p>
              <Button size="sm" variant="outline" onClick={() => startAssistantChat(buildAssistantRequest(ASSISTANT_SCENARIOS[4]))}>대화로 선호 정리하기</Button>
            </div> : null}
            <MemoryWorkspace
              focusSection={memoryFocus?.section}
              focusVersion={memoryFocus?.version}
            />
          </div>
        )}
        {view === 'tasks' && (
          <div className="h-full overflow-y-auto p-4">
            {desktopFeatures.microApps ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-primary/[0.03] p-3">
              <p className="text-sm">할 일은 Apps에서, 비서가 실행할 예약은 Tasks에서 관리합니다.</p>
              <Button size="sm" variant="outline" onClick={() => startAssistantChat(buildAssistantRequest(ASSISTANT_SCENARIOS[3]))}>대화로 반복 브리핑 만들기</Button>
            </div> : null}
            <BackgroundWorkPanel
              onOpenSession={(sessionId) => {
                setActive(sessionId)
                setView('chat')
                setSidebarContext('chat')
              }}
            />
            <TasksWorkspace
              focusJobId={taskFocus?.jobId}
              focusVersion={taskFocus?.version}
              onOpenSession={(sessionId) => {
                setActive(sessionId)
                setView('chat')
                setSidebarContext('chat')
              }}
            />
          </div>
        )}
        {(view === 'knowledge' ||
          view === 'rag' ||
          view === 'wiki' ||
          view === 'personal-docs' ||
          view === 'team-docs') && (
          <KnowledgeWorkspace
            section={KNOWLEDGE_SECTION_BY_VIEW[view]}
            onSectionChange={(section) => {
              setView(KNOWLEDGE_VIEW_BY_SECTION[section])
              setSidebarContext('chat')
            }}
          >
            {view === 'knowledge' ? (
              <PersonalKnowledgePage />
            ) : view === 'wiki' ? (
              <WikiTree />
            ) : view === 'personal-docs' ? (
              <div className="h-full overflow-y-auto p-4">
                <PersonalDocsSettings />
              </div>
            ) : view === 'team-docs' ? (
              <div className="h-full overflow-y-auto p-4">
                <TeamDocsSettingsTab />
              </div>
            ) : (
              <DocumentsPage />
            )}
          </KnowledgeWorkspace>
        )}
        {desktopSettingsFeatures.snippets && view === 'snippets' && (
          <div className="p-4">
            <CodeSnippetGallery />
          </div>
        )}
        {view === 'skills' && (
          <div className="h-full overflow-y-auto p-4">
            <SkillManager />
          </div>
        )}
        {desktopFeatures.canvas && (view === 'gallery' || view === 'canvas') && (
          <GalleryView mode={view === 'canvas' ? 'canvas' : 'gallery'} />
        )}
        {desktopFeatures.extensions && activeExtensions.some((ext) => ext.id === view) && (
          <div className="flex h-full items-center justify-center text-muted-foreground p-4 text-sm text-center">
            <p>
              Extension &quot;{view}&quot; is active.
              <br />
              <span className="text-xs opacity-70">
                (Extension UI integration is managed externally by the host.)
              </span>
            </p>
          </div>
        )}
      </MainLayout>
      {settingsOpen ? (
        <Suspense fallback={null}>
          <LazySettingsDialog
            open
            onOpenChange={setSettingsOpen}
            initialTabKey={settingsInitialTabKey}
          />
        </Suspense>
      ) : null}
      {appsManagerOpen ? (
        <Suspense fallback={null}>
          <LazyAppsManagerDialog
            open
            onOpenChange={setAppsManagerOpen}
            onOpenCodeAgent={openAppsCodeAgent}
          />
        </Suspense>
      ) : null}
      <CompressConversationDialog open={compressOpen} onOpenChange={setCompressOpen} />
      <ConversationReportDialog open={reportOpen} onOpenChange={setReportOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        items={commandPaletteItems}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <Toaster />
      <ToolApprovalDialog />
      <ConfirmDialog />
    </>
  )
}

export default function Page() {
  return (
    <ThemeProvider>
      <ThemePersistenceProvider>
        <I18nProvider>
          <TransportProvider>
            <ExtensionProvider>
              <Shell />
            </ExtensionProvider>
          </TransportProvider>
        </I18nProvider>
      </ThemePersistenceProvider>
    </ThemeProvider>
  )
}
