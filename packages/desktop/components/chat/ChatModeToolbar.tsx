'use client'
import { chatBackend } from '@/lib/chat/chat-backends'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookText,
  Brain,
  Check,
  Code,
  FileText,
  Globe,
  ImageIcon,
  MessagesSquare,
  Monitor,
  Network,
  Search,
  SlidersHorizontal,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useProviderCatalog } from '@/lib/hooks/use-provider-catalog'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { assistantModeSupport } from '@/lib/chat/assistant-mode-support'
import {
  CHAT_MODES,
  chatModeCategories,
  localizeChatModeCategories,
  localizeChatModes,
  localizedThinkingLabel,
  THINKING_LEVELS,
  type ChatModeCategoryId,
  type ChatModeIconName,
  type ChatModeMeta,
} from '@/lib/chat/chat-modes'
import { cn } from '@/lib/utils/cn'
import { useSessionStore } from '@/lib/store/session-store'
import { SessionPersonaDialog } from '@/components/persona/SessionPersonaDialog'
import { AutonomyIndicator } from './AutonomyIndicator'
import { ContextUsageIndicator } from './ContextUsageIndicator'
import { ChatBotPicker } from './ChatBotPicker'
import { PreviewLauncher } from './PreviewLauncher'

const ICONS: Record<ChatModeIconName, LucideIcon> = {
  Zap,
  Brain,
  Network,
  Sparkles,
  Globe,
  Code,
  Terminal,
  Monitor,
  Users,
  MessagesSquare,
  FileText,
}

export function ChatModeToolbar() {
  const { t } = useTranslation()
  const providers = useProviderCatalog()
  const llm = useSettingsStore((s) => s.llm)
  const supportsComputerUse = providers.find((p) => p.id === llm.providerId)
    ?.models.find((m) => m.id === llm.modelId)?.vision === true
  const backendId = useChatModeStore((s) => s.backend)
  const mode = useChatModeStore((s) => s.mode)
  const selectedBot = useChatModeStore((s) => s.bot)
  const chatModes = useChatModeStore((s) => s.catalog)
  const setMode = useChatModeStore((s) => s.setMode)
  const thinkingLevel = useChatModeStore((s) => s.thinkingLevel)
  const setThinkingLevel = useChatModeStore((s) => s.setThinkingLevel)
  const disableMemory = useChatModeStore((s) => s.disableMemory)
  const setDisableMemory = useChatModeStore((s) => s.setDisableMemory)
  const enableRAG = useChatModeStore((s) => s.enableRAG)
  const setEnableRAG = useChatModeStore((s) => s.setEnableRAG)
  const enableImageGen = useChatModeStore((s) => s.enableImageGen)
  const setEnableImageGen = useChatModeStore((s) => s.setEnableImageGen)
  const inputTrustLevel = useChatModeStore((s) => s.inputTrustLevel)
  const setInputTrustLevel = useChatModeStore((s) => s.setInputTrustLevel)
  const activeSession = useSessionStore(
    (state) => state.sessions.find((session) => session.id === state.activeId) ?? null,
  )
  const sessionPersonaIds = activeSession?.personaIds ?? []
  const sessionPerspectivesActive = sessionPersonaIds.length > 1

  const [modeOpen, setModeOpen] = useState(false)
  const [modeQuery, setModeQuery] = useState('')
  const [modeCategory, setModeCategory] = useState<ChatModeCategoryId | null>(null)
  const modeTabsId = useId()
  const [contextOpen, setContextOpen] = useState(false)
  const [contextUsageOpen, setContextUsageOpen] = useState(false)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false)
  const [toolbarWidth, setToolbarWidth] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<HTMLDivElement>(null)
  const thinkingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = toolbarRef.current
    if (!node) return
    if (typeof ResizeObserver === 'undefined') {
      setToolbarWidth(Number.POSITIVE_INFINITY)
      return
    }
    const update = () => setToolbarWidth(node.clientWidth || Number.POSITIVE_INFINITY)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!modeOpen && !contextOpen && !thinkingOpen && !contextUsageOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (modeOpen && !modeRef.current?.contains(target)) {
        setModeOpen(false)
        setModeQuery('')
      }
      if (contextOpen && !contextRef.current?.contains(target)) {
        setContextOpen(false)
      }
      if (thinkingOpen && !thinkingRef.current?.contains(target)) setThinkingOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setModeOpen(false)
      setModeQuery('')
      setContextOpen(false)
      setThinkingOpen(false)
      setContextUsageOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [modeOpen, contextOpen, thinkingOpen, contextUsageOpen])

  const displayedMode = sessionPerspectivesActive ? 'persona-panel' : mode
  const presentedChatModes = useMemo(
    () => localizeChatModes(chatModes.filter((entry) => entry.category !== 'external'), (key) => t(key)),
    [chatModes, t],
  )
  const current =
    presentedChatModes.find((candidate) => candidate.id === displayedMode) ??
    presentedChatModes[0] ?? localizeChatModes([CHAT_MODES[0]!], (key) => t(key))[0]!
  const dense = toolbarWidth < 280
  const essentialWidth = displayedMode === 'persona-panel' ? 88 : 58
  const showThinking = toolbarWidth >= essentialWidth + 36
  const showAutonomy = toolbarWidth >= essentialWidth + 104
  const contextUsageIconOnly = toolbarWidth < 360
  const ModeIcon = ICONS[current.iconName]
  useEffect(() => {
    if (!showThinking) setThinkingOpen(false)
  }, [showThinking])
  useEffect(() => {
    if (!sessionPerspectivesActive) return
    setModeOpen(false)
    setModeQuery('')
  }, [sessionPerspectivesActive])
  useEffect(() => {
    const openSessionPersonas = () => {
      setModeOpen(false)
      setModeQuery('')
      if (activeSession) setPersonaDialogOpen(true)
    }
    window.addEventListener('sepilot:open-session-personas', openSessionPersonas)
    return () => window.removeEventListener('sepilot:open-session-personas', openSessionPersonas)
  }, [activeSession])
  const normalizedModeQuery = modeQuery.trim().toLocaleLowerCase()
  const modeCategories = localizeChatModeCategories(
    chatModeCategories(presentedChatModes),
    (key) => t(key),
  )
  const activeModeCategory = modeCategories.find((category) => category.id === modeCategory)?.id
    ?? current.category
  const visibleModeGroups = modeCategories
    .map((category) => ({
      category,
      items: presentedChatModes.filter((candidate) => {
        if (candidate.category !== category.id) return false
        if (!normalizedModeQuery) return true
        return [
          candidate.label,
          candidate.description,
          category.label,
          ...(candidate.searchAliases ?? []),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedModeQuery)
      }),
    }))
    .filter((group) => group.items.length > 0 &&
      (normalizedModeQuery || group.category.id === activeModeCategory))
  if (!chatBackend(backendId).daemonFeatures) return (
    <span className="text-xs text-muted-foreground" title={t('chatBackend.limits')}>
      {t('chatBackend.managedByCli')}
    </span>
  )
  return (
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        className="flex w-full min-w-0 flex-nowrap items-center gap-1"
        aria-label={t('chatModes.ui.executionOptions')}
        data-testid="message-execution-options"
        data-density={dense ? 'compact' : 'comfortable'}
        data-hidden-controls={[!showThinking ? 'thinking' : null, !showAutonomy ? 'autonomy' : null]
          .filter(Boolean)
          .join(',')}
      >
        <ChatBotPicker disabled={sessionPersonaIds.length > 0} />
        <PreviewLauncher />
        <div className="relative shrink-0" ref={contextRef}>
          <button
            type="button"
            onClick={() => {
              setContextOpen((value) => !value)
              setModeOpen(false)
              setModeQuery('')
              setThinkingOpen(false)
              setContextUsageOpen(false)
            }}
            aria-haspopup="menu"
            aria-expanded={contextOpen}
            aria-label="컨텍스트 및 출력 설정"
            className={cn(
              'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              enableRAG || enableImageGen || inputTrustLevel === 'untrusted'
                ? 'border-sky-500/40 bg-sky-500/[0.07] text-sky-700 dark:text-sky-300'
                : 'border-transparent bg-muted/55 text-muted-foreground hover:bg-muted',
            )}
            title="RAG, 이미지 생성, 입력 신뢰 설정"
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span className={cn(dense && 'sr-only')}>옵션</span>
            {enableRAG || enableImageGen || inputTrustLevel === 'untrusted' ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-current"
                aria-label="기본값과 다른 옵션 있음"
              />
            ) : null}
          </button>
          {contextOpen ? (
            <div
              role="menu"
              aria-label="컨텍스트 및 출력 설정"
              className="absolute bottom-full left-0 z-50 mb-1 w-64 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg max-[420px]:fixed max-[420px]:inset-x-2 max-[420px]:bottom-20 max-[420px]:w-auto max-[420px]:max-w-none"
            >
              <ContextOption
                checked={!disableMemory}
                Icon={BookText}
                label="장기 기억 사용"
                description="끄면 이후 전송에서 기억 검색과 학습을 차단합니다. 대화 기록은 유지됩니다."
                title={disableMemory ? '장기 기억 검색·저장 차단' : '장기 기억 사용 허용'}
                onClick={() => setDisableMemory(!disableMemory)}
              />
              <ContextOption
                checked={enableRAG}
                Icon={BookText}
                label="RAG"
                description="연결된 문서를 검색"
                title={enableRAG ? 'RAG: 활성 — 문서 검색 사용' : 'RAG 비활성'}
                onClick={() => setEnableRAG(!enableRAG)}
              />
              <ContextOption
                checked={enableImageGen}
                Icon={ImageIcon}
                label="이미지 생성"
                description="응답에서 이미지 생성 도구 사용"
                title={enableImageGen ? '이미지 생성: 활성' : '이미지 생성 비활성'}
                onClick={() => setEnableImageGen(!enableImageGen)}
              />
              <ContextOption
                checked={inputTrustLevel === 'trusted'}
                Icon={inputTrustLevel === 'untrusted' ? ShieldAlert : ShieldCheck}
                label="입력 신뢰"
                description={
                  inputTrustLevel === 'untrusted' ? '외부 입력으로 취급' : '일반 입력으로 취급'
                }
                title={
                  inputTrustLevel === 'untrusted'
                    ? '입력 신뢰: 낮음 — 현재는 데몬에 참고 표시만 전송'
                    : '입력 신뢰: 일반 — 데몬에 참고 표시만 전송'
                }
                tone={inputTrustLevel === 'untrusted' ? 'warn' : 'neutral'}
                onClick={() =>
                  setInputTrustLevel(inputTrustLevel === 'trusted' ? 'untrusted' : 'trusted')
                }
              />
            </div>
          ) : null}
        </div>
        <div className="relative shrink-0" ref={modeRef}>
          <button
            type="button"
            data-testid="chat-mode-toggle"
            data-chat-mode={current.id}
            onClick={() => {
              if (sessionPerspectivesActive) return
              setModeOpen((value) => {
                setModeQuery('')
                if (!value) setModeCategory(current.category)
                return !value
              })
              setContextOpen(false)
              setThinkingOpen(false)
              setContextUsageOpen(false)
            }}
            aria-haspopup="dialog"
            aria-expanded={modeOpen}
            aria-disabled={sessionPerspectivesActive}
            className={cn(
              'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/[0.1]',
            )}
            title={
              sessionPerspectivesActive
                ? t('chatModes.ui.perspectivesActive')
                : t('chatModes.ui.modeTitle', {
                    label: current.label,
                    description: current.description,
                  })
            }
          >
            <ModeIcon className="h-3 w-3" />
            <span className={cn(dense && 'sr-only')}>
              {selectedBot && sessionPersonaIds.length === 0
                ? mode === 'auto' ? '엔진: 봇 기본' : `엔진: ${current.label}`
                : current.label}
            </span>
          </button>
          {modeOpen && !sessionPerspectivesActive ? (
            <div
              role="dialog"
              aria-label={t('chatModes.ui.selectMode')}
              className="absolute bottom-full left-0 z-50 mb-1 flex max-h-[60vh] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg max-[420px]:fixed max-[420px]:inset-x-2 max-[420px]:bottom-20 max-[420px]:w-auto max-[420px]:max-w-none"
            >
              <div className="shrink-0 border-b border-border/60 p-2">
                <div className="mb-2 flex items-start gap-2 px-0.5">
                  <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      {t('chatModes.ui.current', { label: current.label })}
                    </p>
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      {current.description}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                      {assistantModeSupport(current, (key) => t(key)).description}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    autoFocus
                    value={modeQuery}
                    onChange={(event) => setModeQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setModeOpen(false)
                        setModeQuery('')
                      }
                    }}
                    placeholder={t('chatModes.ui.searchPlaceholder')}
                    aria-label={t('chatModes.ui.searchLabel')}
                    className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {modeQuery ? (
                    <button
                      type="button"
                      onClick={() => setModeQuery('')}
                      aria-label={t('chatModes.ui.clearSearch')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              </div>
              {!normalizedModeQuery ? (
                <div role="tablist" aria-label={t('chatModes.ui.categories')} className="flex shrink-0 flex-wrap gap-1 border-b border-border/60 p-2">
                  {modeCategories.map((category, index) => (
                    <button
                      key={category.id}
                      id={`${modeTabsId}-tab-${category.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeModeCategory === category.id}
                      aria-controls={`${modeTabsId}-panel`}
                      tabIndex={activeModeCategory === category.id ? 0 : -1}
                      onClick={() => setModeCategory(category.id)}
                      onKeyDown={(event) => {
                        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % modeCategories.length
                          : event.key === 'ArrowLeft' ? (index - 1 + modeCategories.length) % modeCategories.length
                            : event.key === 'Home' ? 0
                              : event.key === 'End' ? modeCategories.length - 1 : null
                        if (nextIndex === null) return
                        event.preventDefault()
                        const next = modeCategories[nextIndex]!
                        setModeCategory(next.id)
                        document.getElementById(`${modeTabsId}-tab-${next.id}`)?.focus()
                      }}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        activeModeCategory === category.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              ) : <p className="px-3 pt-2 text-[10px] text-muted-foreground" role="status">{t('chatModes.ui.allCategoryResults')}</p>}
              <div
                key={normalizedModeQuery ? 'search' : activeModeCategory}
                id={`${modeTabsId}-panel`}
                role={normalizedModeQuery ? undefined : 'tabpanel'}
                aria-labelledby={normalizedModeQuery ? undefined : `${modeTabsId}-tab-${activeModeCategory}`}
                className="min-h-0 overflow-y-auto p-1"
              >
                {visibleModeGroups.map(({ category, items }, categoryIndex) => (
                  <ModeCategoryGroup
                    key={category.id}
                    categoryId={category.id}
                    label={category.label}
                    items={items}
                    selectedId={mode}
                    supportsComputerUse={supportsComputerUse}
                    showDivider={categoryIndex > 0}
                    onSelect={(id) => {
                      setModeOpen(false)
                      setModeQuery('')
                      if (id === 'persona-panel') {
                        if (activeSession) setPersonaDialogOpen(true)
                        return
                      }
                      setMode(id)
                    }}
                  />
                ))}
                {visibleModeGroups.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-xs text-muted-foreground">
                    <Search className="h-5 w-5 opacity-50" />
                    <p>{t('chatModes.ui.noMatches')}</p>
                    <button
                      type="button"
                      onClick={() => setModeQuery('')}
                      className="rounded px-2 py-1 text-[11px] text-primary hover:bg-accent"
                    >
                      {t('chatModes.ui.showAll')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {sessionPerspectivesActive || mode === 'persona-panel' ? (
          <button
            type="button"
            onClick={() => setPersonaDialogOpen(true)}
            disabled={!activeSession}
            aria-haspopup="dialog"
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              sessionPersonaIds.length > 0
                ? 'border-primary/30 bg-primary/[0.07] text-primary hover:bg-primary/[0.12]'
                : 'border-amber-500/40 bg-amber-500/[0.08] text-amber-700 hover:bg-amber-500/[0.12] dark:text-amber-300',
            )}
            title={
              sessionPersonaIds.length > 0
                ? `이 대화의 페르소나 ${sessionPersonaIds.length}명 · 구성 변경`
                : '이 대화에 참여할 페르소나를 구성하세요'
            }
          >
            <Users className="h-3 w-3" />
            <span className={cn(dense && 'sr-only')}>
              {sessionPersonaIds.length > 0
                ? `페르소나 ${sessionPersonaIds.length}`
                : '대화 페르소나'}
            </span>
          </button>
        ) : null}

        {showThinking ? (
          <div className="relative shrink-0" ref={thinkingRef}>
            <button
              type="button"
              onClick={() => {
                setThinkingOpen((v) => !v)
                setModeOpen(false)
                setModeQuery('')
                setContextOpen(false)
                setContextUsageOpen(false)
              }}
              aria-haspopup="menu"
              aria-expanded={thinkingOpen}
              className={cn(
                'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                thinkingLevel
                  ? 'border-violet-500/40 bg-violet-500/[0.07] text-violet-700 dark:text-violet-300'
                  : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted',
              )}
              title={t('chatModes.ui.thinkingLevel')}
            >
              <Brain className="h-3 w-3" />
              <span className={cn(dense && 'sr-only')}>
                {thinkingLevel
                  ? localizedThinkingLabel(thinkingLevel, (key) => t(key))
                  : t('chatModes.thinking.default')}
              </span>
            </button>
            {thinkingOpen ? (
              <div
                role="menu"
                className="absolute bottom-full right-0 z-50 mb-1 min-w-[140px] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg max-[420px]:fixed max-[420px]:inset-x-2 max-[420px]:bottom-20"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setThinkingLevel(null)
                    setThinkingOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    thinkingLevel == null
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <span>{t('chatModes.thinking.serverDefault')}</span>
                </button>
                {THINKING_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setThinkingLevel(level)
                      setThinkingOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                      thinkingLevel === level
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50',
                    )}
                  >
                    <span>{localizedThinkingLabel(level, (key) => t(key))}</span>
                    <span className="text-[10px] text-muted-foreground">{level}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {showAutonomy ? <AutonomyIndicator compact iconOnly={dense} /> : null}
        <ContextUsageIndicator
          open={contextUsageOpen}
          iconOnly={contextUsageIconOnly}
          onOpenChange={(nextOpen) => {
            setContextUsageOpen(nextOpen)
            if (!nextOpen) return
            setModeOpen(false)
            setModeQuery('')
            setContextOpen(false)
            setThinkingOpen(false)
          }}
        />
      </div>
      {personaDialogOpen ? (
        <SessionPersonaDialog open session={activeSession} onOpenChange={setPersonaDialogOpen} />
      ) : null}
    </>
  )
}

function ContextOption({
  checked,
  Icon,
  label,
  description,
  title,
  tone = 'neutral',
  onClick,
}: {
  checked: boolean
  Icon: LucideIcon
  label: string
  description: string
  title: string
  tone?: 'warn' | 'neutral'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      title={title}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        tone === 'warn' && 'text-amber-700 dark:text-amber-300',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  )
}

function ModeCategoryGroup({
  categoryId,
  label,
  items,
  selectedId,
  showDivider,
  supportsComputerUse,
  onSelect,
}: {
  categoryId: ChatModeCategoryId
  label: string
  items: readonly ChatModeMeta[]
  selectedId: ChatModeMeta['id']
  showDivider: boolean
  supportsComputerUse: boolean
  onSelect: (id: ChatModeMeta['id']) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-category={categoryId}
      className={cn(showDivider && 'mt-1 border-t border-border/60 pt-1')}
    >
      <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {label}
      </div>
      {items.map((meta) => (
        <ModeMenuItem
          key={meta.id}
          meta={meta}
          selected={meta.id === selectedId}
          disabledReason={meta.daemonId === 'computer-use' && !supportsComputerUse ? '모델 미지원' : undefined}
          onSelect={() => onSelect(meta.id)}
        />
      ))}
    </div>
  )
}

function ModeMenuItem({
  meta,
  selected,
  disabledReason,
  onSelect,
}: {
  meta: ChatModeMeta
  selected: boolean
  disabledReason?: string
  onSelect: () => void
}) {
  const Icon = ICONS[meta.iconName]
  return (
    <button
      type="button"
      data-chat-mode-option={meta.id}
      aria-pressed={selected}
      disabled={Boolean(disabledReason)}
      title={disabledReason}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{meta.label}</span>
        <span className="text-[10px] text-muted-foreground">{meta.description}</span>
      </div>
      {disabledReason ? <span className="ml-auto shrink-0 text-[10px]">{disabledReason}</span> : null}
      {meta.needsWorkingDir ? (
        <span className="ml-auto shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
          cwd 필요
        </span>
      ) : null}
    </button>
  )
}
