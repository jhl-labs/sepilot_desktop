'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Bell,
  BookTemplate,
  Bot,
  Boxes,
  Code2,
  Cpu,
  Database,
  FileText,
  Github,
  Globe,
  HardDrive,
  Image,
  Inbox,
  Languages,
  Mail,
  Mic2,
  Network,
  Package,
  Plug,
  Puzzle,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  Sparkles,
  Webhook,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsSaveStore } from '@/lib/store/settings-save-store'
import { hasUnsavedSettings } from '@/lib/store/settings-dirty-store'
import { confirm } from '@/lib/utils/confirm'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import {
  listSettingsTabs,
  resolveSettingsTabKey,
  searchSettingsTabs,
  type SettingsSectionId,
  type SettingsTab,
} from './registry'
import './_register-tabs'

interface SectionMeta {
  id: SettingsSectionId
  label: string
  icon: LucideIcon
  description: string
  order: number
}

const SECTION_META: Record<SettingsSectionId, SectionMeta> = {
  general: {
    id: 'general',
    label: 'General',
    icon: Languages,
    description: '테마, 언어, 작업 디렉터리',
    order: 0,
  },
  models: {
    id: 'models',
    label: 'AI Models',
    icon: Bot,
    description: 'Provider 연결, 모델 카탈로그, 기본 모델',
    order: 1,
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    icon: Sparkles,
    description: '사용량, 통계, 실행 기본값',
    order: 2,
  },
  tools: {
    id: 'tools',
    label: 'Tools',
    icon: Wrench,
    description: 'Agent 도구, MCP 서버, Skills 카탈로그',
    order: 3,
  },
  memory: {
    id: 'memory',
    label: 'Memory & Knowledge',
    icon: Database,
    description: 'Vector DB, RAG, 문서, 템플릿, 스니펫',
    order: 4,
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    description: '채널, outbound webhook, 알림 정책',
    order: 5,
  },
  integrations: {
    id: 'integrations',
    label: 'Integrations',
    icon: Boxes,
    description: '외부 서비스와 확장 기능',
    order: 6,
  },
  automation: {
    id: 'automation',
    label: 'Automation',
    icon: Zap,
    description: '스케줄, 메시지 구독, 메시지 큐',
    order: 7,
  },
  system: {
    id: 'system',
    label: 'System',
    icon: Server,
    description: '연결 진단, 네트워크, 단축키, 백업',
    order: 8,
  },
}

const DEFAULT_TAB_META = {
  icon: Settings2 as LucideIcon,
  description: 'daemon 설정 항목',
  order: 999,
}

const TAB_META: Record<string, { icon: LucideIcon; description: string; order: number }> = {
  general: {
    icon: Languages,
    description: '테마, 언어, 기본 작업 디렉터리',
    order: 0,
  },
  llm: {
    icon: Bot,
    description: 'Provider 연결부터 안전한 기본 모델 전환까지',
    order: 0,
  },
  agents: {
    icon: Sparkles,
    description: 'user agent 저작과 agent catalog',
    order: 0,
  },
  'agent-runtime': {
    icon: Sparkles,
    description: '권한(privilege), 사고 강도, intent router',
    order: 1,
  },
  usage: {
    icon: BarChart3,
    description: '토큰, 요청량, 비용 집계',
    order: 2,
  },
  'agent-stats': {
    icon: Activity,
    description: '세션, 메시지, tool call 개수',
    order: 3,
  },
  'tool-catalog': {
    icon: Wrench,
    description: 'Agent 도구 활성화와 노출 범위 관리',
    order: 0,
  },
  mcp: {
    icon: Plug,
    description: 'MCP 서버 연결과 도구',
    order: 1,
  },
  skills: {
    icon: Package,
    description: 'daemon skills 활성/비활성',
    order: 2,
  },
  shell: {
    icon: Server,
    description: '터미널 제어, SSH 프로필, Shell 백업',
    order: 3,
  },
  embeddings: {
    icon: Cpu,
    description: '시맨틱 검색용 embedding model 선택',
    order: 0,
  },
  'vector-db': {
    icon: Database,
    description: '벡터 backend 상태, 검색 품질, rerank 설정',
    order: 1,
  },
  rag: {
    icon: FileText,
    description: '문서 폴더와 인덱싱 상태',
    order: 2,
  },
  'memory-lifecycle': {
    icon: Database,
    description: '암호화, lifecycle, proactive digest',
    order: 3,
  },
  docs: {
    icon: FileText,
    description: '로컬 개인 문서와 GitHub 팀 문서 저장소',
    order: 4,
  },
  'prompt-templates': {
    icon: BookTemplate,
    description: '반복 사용하는 프롬프트 템플릿',
    order: 6,
  },
  'code-snippets': {
    icon: Code2,
    description: '스니펫 갤러리와 검색',
    order: 7,
  },
  channels: {
    icon: Bell,
    description: 'Slack / Telegram / Webhook 채널',
    order: 0,
  },
  'outbound-hooks': {
    icon: Webhook,
    description: '외부 webhook으로 이벤트 전송',
    order: 1,
  },
  'chat-notifications': {
    icon: Bell,
    description: '채팅 완료/실패 알림 정책',
    order: 2,
  },
  notifications: {
    icon: Bell,
    description: '알림 정책과 최근 발행 로그',
    order: 3,
  },
  'activity-center': {
    icon: Activity,
    description: 'Shell timeline과 notification activity',
    order: 4,
  },
  'web-search': {
    icon: Search,
    description: '신뢰 도메인으로 제한된 웹 검색 출처',
    order: 0,
  },
  'github-oauth': {
    icon: Github,
    description: 'GitHub OAuth 연결 상태',
    order: 1,
  },
  'github-sync': {
    icon: Github,
    description: 'repo 동기화 정책과 대상 목록',
    order: 2,
  },
  google: {
    icon: Globe,
    description: 'Google OAuth desktop client',
    order: 3,
  },
  'smart-home': {
    icon: Wrench,
    description: 'SmartThings와 Google Home 설정',
    order: 4,
  },
  extensions: {
    icon: Puzzle,
    description: '설치된 확장과 활성 상태',
    order: 5,
  },
  'image-gen': {
    icon: Image,
    description: '이미지 생성 provider 상태',
    order: 6,
  },
  voice: {
    icon: Mic2,
    description: 'Whisper 전사와 로컬 음성 백엔드',
    order: 7,
  },
  scheduler: {
    icon: Zap,
    description: 'cron timezone과 scheduler surface',
    order: 0,
  },
  'message-subscription': {
    icon: Mail,
    description: '외부 메시지 polling, 큐, 알림 처리',
    order: 1,
  },
  'message-queue': {
    icon: Inbox,
    description: '메시지 큐 토픽 상태',
    order: 2,
  },
  connection: {
    icon: Globe,
    description: 'daemon / gateway 도달성 확인',
    order: 0,
  },
  'daemon-connection': {
    icon: Server,
    description: 'Desktop daemon/gateway URL과 token',
    order: 1,
  },
  'status-hub': {
    icon: Activity,
    description: 'desktop, daemon, Shell 통합 상태',
    order: 2,
  },
  'quick-input': {
    icon: Zap,
    description: '전역 입력 호출 키와 prefix',
    order: 3,
  },
  network: {
    icon: Network,
    description: '프록시, 타임아웃, 연결 probe',
    order: 4,
  },
  backup: {
    icon: HardDrive,
    description: '스냅샷 백업 생성과 삭제',
    order: 5,
  },
  'boot-info': {
    icon: Cpu,
    description: 'daemon 부트 옵션 (read-only)',
    order: 6,
  },
  doctor: {
    icon: ShieldAlert,
    description: 'daemon 보안/운영 진단',
    order: 7,
  },
  security: {
    icon: ShieldAlert,
    description: 'sandbox, skill source, webhook 보안',
    order: 8,
  },
  logging: {
    icon: FileText,
    description: '로그 레벨, 회전, 용량 제한',
    order: 9,
  },
  'settings-json': {
    icon: ShieldAlert,
    description: 'config.yaml 직접 편집 (advanced)',
    order: 99,
  },
}

function getTabMeta(tab: SettingsTab) {
  return TAB_META[tab.key] ?? DEFAULT_TAB_META
}

function tFallback(t: TFunction, key: string, fallback: string): string {
  const value = t(key, { defaultValue: fallback })
  return value === key ? fallback : value
}

function sectionLabel(t: TFunction, section: SectionMeta): string {
  return tFallback(t, `settings.section.${section.id}.label`, section.label)
}

function sectionDescription(t: TFunction, section: SectionMeta): string {
  return tFallback(t, `settings.section.${section.id}.description`, section.description)
}

function tabLabel(t: TFunction, tab: SettingsTab): string {
  return tFallback(t, `settings.tab.${tab.key}.label`, tab.label)
}

function tabDescription(t: TFunction, tab: SettingsTab, fallback: string): string {
  return tFallback(t, `settings.tab.${tab.key}.description`, fallback)
}

function sortTabsWithinSection(left: SettingsTab, right: SettingsTab): number {
  const leftMeta = getTabMeta(left)
  const rightMeta = getTabMeta(right)
  if (leftMeta.order !== rightMeta.order) {
    return leftMeta.order - rightMeta.order
  }
  return left.label.localeCompare(right.label)
}

function formatRelative(epoch: number | null): string | null {
  if (!epoch) return null
  const diff = Date.now() - epoch
  if (diff < 0) return null
  if (diff < 5_000) return '방금 전'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}초 전`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return new Date(epoch).toLocaleString()
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialTabKey,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialTabKey?: string | null
}) {
  useModalViewportLock(open)
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const allTabs = useMemo(() => listSettingsTabs().slice(), [])

  const allSections = useMemo<SectionMeta[]>(
    () =>
      Object.values(SECTION_META)
        .filter((section) => allTabs.some((tab) => tab.section === section.id))
        .slice()
        .sort((a, b) => a.order - b.order),
    [],
  )

  const initialKey = useMemo(() => {
    const sorted = allTabs.slice().sort((a, b) => {
      const sectionDiff = SECTION_META[a.section].order - SECTION_META[b.section].order
      return sectionDiff !== 0 ? sectionDiff : sortTabsWithinSection(a, b)
    })
    return sorted[0]?.key ?? ''
  }, [allTabs])

  const [activeKey, setActiveKey] = useState<string>(initialKey)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(
    () => allTabs.find((t) => t.key === initialKey)?.section ?? 'general',
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const requestClose = useCallback(() => {
    if (!hasUnsavedSettings()) {
      onOpenChange(false)
      return
    }
    void confirm('저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?', {
      title: '변경사항 저장 안 됨',
      confirmLabel: '닫기',
      destructive: true,
    }).then((ok) => {
      if (ok) onOpenChange(false)
    })
  }, [onOpenChange])
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose

  const applyInitialTab = useCallback(
    (requestedKey?: string | null) => {
      const resolvedKey = requestedKey ? resolveSettingsTabKey(requestedKey) : null
      const requested = resolvedKey ? allTabs.find((tab) => tab.key === resolvedKey) : undefined
      const next = requested ?? allTabs.find((tab) => tab.key === initialKey)
      setQ('')
      setActiveKey(next?.key ?? initialKey)
      setActiveSection(next?.section ?? 'general')
    },
    [allTabs, initialKey],
  )

  useEffect(() => {
    if (!open) return
    applyInitialTab(initialTabKey)
  }, [open, applyInitialTab, initialTabKey])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        requestCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open])

  const matched = useMemo(() => searchSettingsTabs(q), [q])

  const matchedKeysSet = useMemo(() => new Set(matched.map((tab) => tab.key)), [matched])
  const sectionMatchCounts = useMemo(() => {
    const counts: Partial<Record<SettingsSectionId, number>> = {}
    for (const tab of matched) {
      counts[tab.section] = (counts[tab.section] ?? 0) + 1
    }
    return counts
  }, [matched])

  const subTabs = useMemo(() => {
    const base = allTabs.filter((tab) => tab.section === activeSection)
    const filtered = q.trim() ? base.filter((tab) => matchedKeysSet.has(tab.key)) : base
    return filtered.slice().sort(sortTabsWithinSection)
  }, [allTabs, activeSection, matchedKeysSet, q])

  useEffect(() => {
    if (subTabs.length === 0) return
    if (!subTabs.some((t) => t.key === activeKey)) {
      setActiveKey(subTabs[0].key)
    }
  }, [subTabs, activeKey])

  useEffect(() => {
    if (!open) return
    if (contentRef.current) contentRef.current.scrollTop = 0
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(`#settings-tab-${activeKey}`)
        ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    })
  }, [activeKey, open])

  function selectSection(id: SettingsSectionId): void {
    setActiveSection(id)
    const visible = allTabs
      .filter((tab) => tab.section === id)
      .filter((tab) => (q.trim() ? matchedKeysSet.has(tab.key) : true))
      .slice()
      .sort(sortTabsWithinSection)
    if (visible.length > 0) setActiveKey(visible[0].key)
  }

  const active: SettingsTab | undefined = subTabs.find((tab) => tab.key === activeKey)

  const lastSavedKey = useSettingsSaveStore((s) => s.lastSavedKey)
  const lastSavedAt = useSettingsSaveStore((s) => s.lastSavedAt)
  const lastSavedLabel = formatRelative(lastSavedAt)

  if (!open) return null

  const sectionMeta = SECTION_META[activeSection]
  const activeSectionLabel = sectionLabel(t, sectionMeta)
  const activeSectionDescription = sectionDescription(t, sectionMeta)

  function handleSubTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % subTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + subTabs.length) % subTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = subTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = subTabs[nextIndex]
    setActiveKey(next.key)
    requestAnimationFrame(() => document.getElementById(`settings-tab-${next.key}`)?.focus())
  }

  return (
    <div
      data-testid="settings-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/70 p-2 backdrop-blur-sm sm:p-3 dark:bg-slate-950/60"
      onClick={() => requestClose()}
    >
      <div
        data-testid="settings-frame"
        className="mx-auto flex h-full max-h-[800px] min-h-0 w-full max-w-[1200px] items-stretch justify-center overflow-hidden"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          data-settings-density="compact"
          className="relative flex h-full min-h-0 w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 h-7 w-7"
            onClick={() => requestClose()}
            aria-label={tFallback(t, 'settings.close', '설정 닫기')}
          >
            <X className="h-4 w-4" />
          </Button>

          <aside className="flex h-full min-h-0 w-40 shrink-0 flex-col border-r border-border bg-muted/30 px-2 py-2 sm:w-48">
            <div className="px-1 pr-8">
              <h2 id="settings-dialog-title" className="text-sm font-semibold tracking-tight">
                {tFallback(t, 'settings.title', 'Settings')}
              </h2>
            </div>

            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="text"
                placeholder={tFallback(t, 'settings.searchPlaceholder', '검색')}
                aria-label={tFallback(t, 'settings.searchLabel', '설정 검색')}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="h-8 rounded-md bg-background pl-7 text-xs"
              />
            </div>

            <nav
              aria-label={tFallback(t, 'settings.sections', '설정 섹션')}
              className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
            >
              <div className="flex flex-col gap-px">
                {allSections.map((section) => {
                  const Icon = section.icon
                  const isActive = activeSection === section.id
                  const label = sectionLabel(t, section)
                  const description = sectionDescription(t, section)
                  const matchCount = sectionMatchCounts[section.id] ?? 0
                  const dimmed = q.trim().length > 0 && matchCount === 0
                  return (
                    <button
                      key={section.id}
                      type="button"
                      data-settings-section={section.id}
                      data-testid={`settings-section-${section.id}`}
                      onClick={() => selectSection(section.id)}
                      disabled={dimmed}
                      title={description}
                      aria-current={isActive ? 'page' : undefined}
                      className={
                        'flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ' +
                        (isActive
                          ? 'bg-primary text-primary-foreground'
                          : dimmed
                            ? 'text-muted-foreground/50'
                            : 'text-foreground hover:bg-accent hover:text-accent-foreground')
                      }
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-medium">{label}</span>
                      {q.trim() && matchCount > 0 && !isActive ? (
                        <span className="ml-auto rounded-full bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">
                          {matchCount}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </nav>
          </aside>

          <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-1.5 pr-9">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  <sectionMeta.icon className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold tracking-tight">{activeSectionLabel}</h3>
                <span className="truncate text-[11px] text-muted-foreground max-[760px]:hidden">
                  · {activeSectionDescription}
                </span>
                {lastSavedLabel ? (
                  <span
                    className="ml-auto shrink-0 text-[11px] text-muted-foreground max-[860px]:hidden"
                    title={
                      lastSavedKey
                        ? `마지막 저장: ${lastSavedKey} (${new Date(lastSavedAt!).toLocaleString()})`
                        : ''
                    }
                  >
                    저장됨 · {lastSavedLabel}
                  </span>
                ) : null}
              </div>
              {subTabs.length > 1 ? (
                <div
                  role="tablist"
                  aria-label={`${activeSectionLabel} 설정 항목`}
                  className="flex flex-nowrap items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {subTabs.map((tab, index) => {
                    const meta = getTabMeta(tab)
                    const label = tabLabel(t, tab)
                    const description = tabDescription(t, tab, meta.description)
                    const Icon = meta.icon
                    const isActive = tab.key === activeKey
                    return (
                      <button
                        key={tab.key}
                        id={`settings-tab-${tab.key}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`settings-panel-${tab.key}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => setActiveKey(tab.key)}
                        onKeyDown={(event) => handleSubTabKeyDown(event, index)}
                        title={description}
                        className={
                          'inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors ' +
                          (isActive
                            ? 'border-primary/60 bg-primary/10 text-foreground'
                            : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground')
                        }
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>

            <div
              ref={contentRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-3 py-2.5 text-[13px] [scrollbar-gutter:stable]"
              data-testid="settings-content"
            >
              {subTabs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {tFallback(t, 'settings.noMatchingItems', '이 섹션에 일치하는 항목이 없습니다.')}
                </p>
              ) : (
                <div
                  id={active ? `settings-panel-${active.key}` : undefined}
                  data-testid={active ? `settings-panel-${active.key}` : undefined}
                  role={subTabs.length > 1 ? 'tabpanel' : undefined}
                  aria-labelledby={
                    subTabs.length > 1 && active ? `settings-tab-${active.key}` : undefined
                  }
                  tabIndex={subTabs.length > 1 ? 0 : undefined}
                >
                  {active?.render() ?? null}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
