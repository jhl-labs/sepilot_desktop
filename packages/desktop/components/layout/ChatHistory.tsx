'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Calendar,
  Check,
  Download,
  GitBranch,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { createSessionsApi } from '@/lib/api/sessions'
import { useSessionStore, type SessionSummary } from '@/lib/store/session-store'
import { useChatStore } from '@/lib/store/chat-store'
import { confirm } from '@/lib/utils/confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { usePersonaStore } from '@/lib/store/persona-store'
import {
  mergePersonaCatalog,
  resolveSessionPersonas,
} from '@/lib/chat/session-personas'
import {
  PersonaAvatarStack,
} from '@/components/persona/SessionPersonaRoster'
import { SessionPersonaDialog } from '@/components/persona/SessionPersonaDialog'
import {
  explainRuntimeFailure,
  isBrowserPreviewTransport,
  type RuntimeFeedback,
} from '@/lib/utils/runtime-feedback'

const SECTION_PAGE_SIZE = 40
const CONTEXT_MENU_GUTTER = 8
const CONTEXT_MENU_GAP = 4
const CONTEXT_MENU_ITEM_CLASS =
  'flex min-h-8 w-full items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1 text-left text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:shrink-0'

interface ConversationMenuState {
  sessionId: string
  trigger: HTMLButtonElement
  anchor: {
    top: number
    left: number
    right: number
    bottom: number
  }
}

interface ConversationMenuPosition {
  top: number
  left: number
  ready: boolean
}

function formatDate(timestamp: number): string {
  const now = new Date()
  const target = new Date(timestamp)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000

  if (timestamp >= startOfToday) {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(target)
  }
  if (timestamp >= startOfYesterday) {
    return '어제'
  }
  if (timestamp >= startOfWeek) {
    const days = Math.max(
      1,
      Math.round((startOfToday - timestamp) / (24 * 60 * 60 * 1000)),
    )
    return `${days}일 전`
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(target)
}

function groupSessions(sessions: SessionSummary[]) {
  const now = new Date()
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const yesterday = today - 24 * 60 * 60 * 1000
  const lastWeek = today - 7 * 24 * 60 * 60 * 1000

  const groups = {
    pinned: [] as SessionSummary[],
    today: [] as SessionSummary[],
    yesterday: [] as SessionSummary[],
    lastWeek: [] as SessionSummary[],
    older: [] as SessionSummary[],
  }

  for (const session of sessions) {
    if (session.isPinned) {
      groups.pinned.push(session)
      continue
    }
    if (session.updatedAt >= today) {
      groups.today.push(session)
    } else if (session.updatedAt >= yesterday) {
      groups.yesterday.push(session)
    } else if (session.updatedAt >= lastWeek) {
      groups.lastWeek.push(session)
    } else {
      groups.older.push(session)
    }
  }

  return groups
}

function isMicroAppSession(session: SessionSummary): boolean {
  const tags = session.tags ?? []
  if (tags.some((tag) => tag === 'micro-app' || tag === 'surface:micro-apps')) {
    return true
  }
  return (
    session.title.startsWith('You are the embedded chat agent for one sepilotd Desktop micro app.')
    || session.title.startsWith('You are the sepilotd Apps Code Agent.')
  )
}

export function ChatHistory({
  onPick,
  onOpenSettings,
  statusNotice,
  showMicroAppChats = false,
}: {
  onPick: (id: string) => void
  onOpenSettings?: () => void
  statusNotice?: RuntimeFeedback | null
  showMicroAppChats?: boolean
}) {
  const transport = useTransport()
  const sessions = useSessionStore((state) => state.sessions)
  const activeId = useSessionStore((state) => state.activeId)
  const pending = useChatStore((state) => state.pending)
  const setActive = useSessionStore((state) => state.setActive)
  const removeSession = useSessionStore((state) => state.removeSession)
  const renameSession = useSessionStore((state) => state.renameSession)
  const togglePinned = useSessionStore((state) => state.togglePinned)
  const [query, setQuery] = useState('')
  const [remoteSearch, setRemoteSearch] = useState<{
    query: string
    sessions: SessionSummary[]
  } | null>(null)
  const [searching, setSearching] = useState(false)
  const [revealCounts, setRevealCounts] = useState<Record<string, number>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [menuState, setMenuState] = useState<ConversationMenuState | null>(null)
  const [menuPosition, setMenuPosition] = useState<ConversationMenuPosition | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [branchingId, setBranchingId] = useState<string | null>(null)
  const [personaSessionId, setPersonaSessionId] = useState<string | null>(null)
  const upsertSession = useSessionStore((state) => state.upsertSession)
  const daemonPersonas = usePersonaStore((state) => state.items)
  const personaCatalog = useMemo(
    () => mergePersonaCatalog(daemonPersonas),
    [daemonPersonas],
  )
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuId = menuState?.sessionId ?? null

  useEffect(() => {
    if (!editingId) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingId])

  useEffect(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void createSessionsApi(transport)
        .then((api) => api.list(normalized))
        .then((nextSessions) => {
          if (!cancelled) {
            setRemoteSearch({ query: normalized, sessions: nextSessions })
          }
        })
        .catch(() => {
          if (!cancelled) setRemoteSearch(null)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, transport])

  useEffect(() => {
    if (!menuState) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !menuState.trigger.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setMenuState(null)
        setMenuPosition(null)
      }
    }
    const onViewportChange = () => {
      setMenuState(null)
      setMenuPosition(null)
    }
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onViewportChange()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        menuState.trigger.focus()
        onViewportChange()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuState])

  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) return
    const menuRect = menuRef.current.getBoundingClientRect()
    const maxLeft = Math.max(
      CONTEXT_MENU_GUTTER,
      window.innerWidth - menuRect.width - CONTEXT_MENU_GUTTER,
    )
    const rightSideLeft = menuState.anchor.right + CONTEXT_MENU_GAP
    const leftSideLeft = menuState.anchor.left - menuRect.width - CONTEXT_MENU_GAP
    const preferredLeft = rightSideLeft + menuRect.width <= window.innerWidth - CONTEXT_MENU_GUTTER
      ? rightSideLeft
      : leftSideLeft
    const left = Math.min(Math.max(CONTEXT_MENU_GUTTER, preferredLeft), maxLeft)
    const below = menuState.anchor.bottom + CONTEXT_MENU_GAP
    const top = below + menuRect.height <= window.innerHeight - CONTEXT_MENU_GUTTER
      ? below
      : Math.max(
          CONTEXT_MENU_GUTTER,
          menuState.anchor.top - menuRect.height - CONTEXT_MENU_GAP,
        )
    setMenuPosition({ top, left, ready: true })
    menuRef.current
      .querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
      ?.focus()
  }, [menuState])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const remoteMatches = remoteSearch?.query === normalized
      ? remoteSearch.sessions
      : null
    const source = remoteMatches ?? sessions
    const seen = new Set<string>()
    const unique: SessionSummary[] = []
    for (const session of source) {
      if (seen.has(session.id)) continue
      seen.add(session.id)
      unique.push(session)
    }
    const visible = showMicroAppChats
      ? unique
      : unique.filter((session) => !isMicroAppSession(session))
    if (!normalized) return visible
    if (remoteMatches) return visible
    return visible.filter((session) =>
      session.title.toLowerCase().includes(normalized),
    )
  }, [query, remoteSearch, sessions, showMicroAppChats])

  const grouped = useMemo(() => groupSessions(filtered), [filtered])

  function selectSession(session: SessionSummary): void {
    setActive(session.id)
    onPick(session.id)
  }

  function closeConversationMenu() {
    setMenuState(null)
    setMenuPosition(null)
  }

  function handleStartEdit(session: SessionSummary) {
    setEditingId(session.id)
    setDraftTitle(session.title)
    closeConversationMenu()
  }

  function handleSaveEdit() {
    if (editingId && draftTitle.trim()) {
      renameSession(editingId, draftTitle.trim())
    }
    setEditingId(null)
    setDraftTitle('')
  }

  async function handleExport(
    session: SessionSummary,
    format: 'markdown' | 'json',
  ) {
    closeConversationMenu()
    if (session.isDraft) {
      toast.error('빈 대화는 내보낼 수 없습니다.')
      return
    }
    setExportingId(session.id)
    try {
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createSessionsApi(transport)
      const body =
        format === 'markdown'
          ? await api.exportMarkdown(session.id)
          : await api.exportJson(session.id)
      const safeTitle =
        (session.title || 'session').replace(/[\\/:*?"<>|]/g, '-').trim() ||
        'session'
      const ext = format === 'markdown' ? 'md' : 'json'
      const mime =
        format === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : 'application/json;charset=utf-8'
      const blob = new Blob([body], { type: mime })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeTitle}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(
        `${format === 'markdown' ? 'Markdown' : 'JSON'} 으로 내보냈습니다.`,
      )
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '대화를 내보낼 수 없습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      setExportingId(null)
    }
  }

  async function handleBranch(session: SessionSummary) {
    closeConversationMenu()
    if (session.isDraft) {
      toast.error('빈 대화는 분기할 수 없습니다.')
      return
    }
    setBranchingId(session.id)
    try {
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createSessionsApi(transport)
      const result = await api.branch(session.id)
      const now = Date.now()
      const branched: SessionSummary = {
        id: result.branchId,
        title: `[Branch] ${session.title}`,
        createdAt: now,
        updatedAt: now,
        provider: session.provider,
        model: session.model,
        device: session.device,
        tags: [...(session.tags ?? []), `branch:${session.id}`],
        personaIds: session.personaIds,
        isPinned: false,
        isDraft: false,
      }
      upsertSession(branched)
      setActive(result.branchId)
      toast.success('대화를 분기했습니다.', {
        description:
          result.copiedEvents > 0
            ? `${result.copiedEvents}개 이벤트가 복사되었습니다.`
            : '빈 분기로 시작합니다.',
      })
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '대화를 분기할 수 없습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      setBranchingId(null)
    }
  }

  async function handleDelete(session: SessionSummary) {
    closeConversationMenu()
    const confirmed = await confirm(
      session.isRunning
        ? '이 대화의 작업을 중단하고 기록을 삭제합니다. 계속할까요?'
        : '이 대화를 삭제합니다. 이 작업은 되돌릴 수 없습니다.',
      {
        title: session.isRunning ? '작업 중인 대화 삭제' : '대화 삭제',
        confirmLabel: '삭제',
        destructive: true,
      },
    )
    if (!confirmed) return
    setDeletingId(session.id)
    try {
      if (session.isDraft) {
        removeSession(session.id)
        if (activeId === session.id) setActive(null)
        return
      }
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createSessionsApi(transport)
      await api.remove(session.id)
      removeSession(session.id)
      if (activeId === session.id) setActive(null)
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '대화를 삭제할 수 없습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      setDeletingId(null)
    }
  }

  function renderConversationItem(session: SessionSummary) {
    const isActive = session.id === activeId
    const isRunning = session.isRunning || (isActive && pending)
    const isDeleting = deletingId === session.id
    const subtitle = formatDate(session.updatedAt)
    const personas = resolveSessionPersonas(session.personaIds, personaCatalog)

    return (
      <div
        key={session.id}
        className={cn(
          'group relative flex items-center gap-0.5 rounded-md transition-colors hover:bg-accent',
          isDeleting && 'pointer-events-none opacity-60',
          isActive && 'bg-accent text-accent-foreground',
        )}
      >
        {editingId === session.id ? (
          <div className="flex flex-1 items-center gap-1 px-2 py-1">
            <Input
              ref={inputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSaveEdit()
                if (event.key === 'Escape') {
                  setEditingId(null)
                  setDraftTitle('')
                }
              }}
              onBlur={handleSaveEdit}
              className="h-7 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSaveEdit}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setEditingId(null)
                setDraftTitle('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start px-2 py-1.5 text-left"
              onClick={() => void selectSession(session)}
              disabled={isDeleting}
            >
              <div className="flex w-full items-center gap-1.5">
                {isRunning ? (
                  <span
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary"
                    title="이 대화에서 작업을 진행하고 있습니다"
                    aria-label="작업 중"
                  >
                    <LoaderCircle className="h-2.5 w-2.5 motion-safe:animate-spin" aria-hidden />
                    작업 중
                  </span>
                ) : null}
                <span className="line-clamp-1 text-[13px] font-medium leading-4">
                  {session.title}
                </span>
                {session.isPinned ? (
                  <Pin className="h-3 w-3 flex-shrink-0 fill-current text-primary" />
                ) : null}
              </div>
              <span
                className={cn(
                  'mt-px flex min-w-0 items-center gap-1.5 text-[11px] leading-4',
                  isActive
                    ? 'text-accent-foreground/75'
                    : 'text-muted-foreground',
                )}
              >
                <span className="shrink-0">{subtitle}</span>
                {personas.length > 0 ? (
                  <>
                    <span aria-hidden className="opacity-40">·</span>
                    <PersonaAvatarStack personas={personas} compact />
                    <span className="truncate text-[10px]">
                      {personas.length === 1
                        ? personas[0]!.name
                        : `${personas.length}명 관점`}
                    </span>
                  </>
                ) : null}
              </span>
            </button>

            <div className="relative pr-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 transition-opacity group-focus-within:opacity-100 focus-visible:opacity-100',
                  menuId === session.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(event) => {
                  if (menuId === session.id) {
                    closeConversationMenu()
                    return
                  }
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenuPosition({
                    top: rect.bottom + CONTEXT_MENU_GAP,
                    left: rect.right + CONTEXT_MENU_GAP,
                    ready: false,
                  })
                  setMenuState({
                    sessionId: session.id,
                    trigger: event.currentTarget,
                    anchor: {
                      top: rect.top,
                      left: rect.left,
                      right: rect.right,
                      bottom: rect.bottom,
                    },
                  })
                }}
                aria-label="대화 옵션"
                aria-haspopup="menu"
                aria-expanded={menuId === session.id}
                disabled={isDeleting}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  const sections: Array<{ label: string; items: SessionSummary[] }> = [
    { label: '고정됨', items: grouped.pinned },
    { label: '오늘', items: grouped.today },
    { label: '어제', items: grouped.yesterday },
    { label: '최근 7일', items: grouped.lastWeek },
    { label: '이전', items: grouped.older },
  ]

  const personaSession = personaSessionId
    ? sessions.find((session) => session.id === personaSessionId) ?? null
    : null
  const menuSession = menuId
    ? sessions.find((session) => session.id === menuId) ?? null
    : null

  return (
    <>
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-2 py-1.5">
        <div className="relative">
          {searching ? (
            <LoaderCircle className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            type="text"
            placeholder="대화 검색..."
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value
              setQuery(nextQuery)
              if (!nextQuery.trim()) {
                setRemoteSearch(null)
                setSearching(false)
              }
            }}
            className="h-8 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQuery('')
                setRemoteSearch(null)
                setSearching(false)
              }}
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              aria-label="검색 초기화"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {filtered.length === 0 ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center py-8 text-center text-muted-foreground',
              statusNotice &&
                !query &&
                'mx-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-5',
            )}
          >
            {statusNotice && !query ? (
              <>
                <AlertTriangle className="mb-2 h-7 w-7 text-amber-500/80" />
                <p className="text-sm font-semibold text-foreground">
                  {statusNotice.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {statusNotice.description}
                </p>
                {onOpenSettings ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={onOpenSettings}
                  >
                    Settings 열기
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <MessageSquare className="mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm font-medium">
                  {query ? '검색 결과 없음' : '대화가 없습니다'}
                </p>
                <p className="mt-1 text-xs">
                  {query
                    ? `"${query}"에 맞는 대화가 없습니다.`
                    : '새 대화를 시작하세요'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="py-1">
            {sections.map((section) => {
              if (section.items.length === 0) return null
              const revealCount = revealCounts[section.label] ?? SECTION_PAGE_SIZE
              const visible = section.items.slice(0, revealCount)
              const remaining = section.items.length - visible.length
              return (
                <div key={section.label} className="mb-2.5">
                  <h3 className="mb-0.5 flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {section.label}
                  </h3>
                  <div className="space-y-0.5">{visible.map(renderConversationItem)}</div>
                  {remaining > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealCounts((current) => ({
                          ...current,
                          [section.label]: revealCount + SECTION_PAGE_SIZE,
                        }))
                      }
                      className="mt-0.5 w-full rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      더 보기 ({remaining}개 남음)
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    {menuSession && menuState && menuPosition && typeof document !== 'undefined'
      ? createPortal((
          <div
            ref={menuRef}
            role="menu"
            aria-label={`${menuSession.title} 대화 메뉴`}
            className="fixed z-[70] w-60 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              visibility: menuPosition.ready ? 'visible' : 'hidden',
            }}
          >
            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => handleStartEdit(menuSession)}
            >
              <Pencil className="h-4 w-4" />
              이름 바꾸기
            </button>
            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => {
                setPersonaSessionId(menuSession.id)
                closeConversationMenu()
              }}
            >
              <Users className="h-4 w-4" />
              페르소나 설정
            </button>
            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => {
                togglePinned(menuSession.id)
                closeConversationMenu()
              }}
            >
              {menuSession.isPinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
              {menuSession.isPinned ? '고정 해제' : '고정'}
            </button>

            <div role="separator" className="my-1 border-t border-border/70" />

            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => void handleExport(menuSession, 'markdown')}
              disabled={exportingId === menuSession.id || menuSession.isDraft}
            >
              {exportingId === menuSession.id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exportingId === menuSession.id
                ? '내보내는 중…'
                : 'Markdown 으로 내보내기'}
            </button>
            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => void handleExport(menuSession, 'json')}
              disabled={exportingId === menuSession.id || menuSession.isDraft}
            >
              {exportingId === menuSession.id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exportingId === menuSession.id
                ? '내보내는 중…'
                : 'JSON 으로 내보내기'}
            </button>
            <button
              type="button"
              role="menuitem"
              className={CONTEXT_MENU_ITEM_CLASS}
              onClick={() => void handleBranch(menuSession)}
              disabled={branchingId === menuSession.id || menuSession.isDraft}
            >
              {branchingId === menuSession.id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <GitBranch className="h-4 w-4" />
              )}
              {branchingId === menuSession.id ? '분기 중…' : '분기'}
            </button>

            <div role="separator" className="my-1 border-t border-border/70" />

            <button
              type="button"
              role="menuitem"
              className={cn(CONTEXT_MENU_ITEM_CLASS, 'text-destructive hover:bg-destructive/10')}
              onClick={() => void handleDelete(menuSession)}
              disabled={deletingId === menuSession.id}
            >
              {deletingId === menuSession.id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deletingId === menuSession.id ? '삭제 중…' : '삭제'}
            </button>
          </div>
        ), document.body)
      : null}
    <SessionPersonaDialog
      open={Boolean(personaSession)}
      session={personaSession}
      onOpenChange={(open) => {
        if (!open) setPersonaSessionId(null)
      }}
    />
    </>
  )
}
