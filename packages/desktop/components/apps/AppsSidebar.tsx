'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownAZ,
  BookOpen,
  Bug,
  CalendarDays,
  Car,
  ChevronDown,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileText,
  FolderTree,
  GitBranch,
  House,
  Inbox,
  KanbanSquare,
  KeyRound,
  ListOrdered,
  MessageCircle,
  Monitor,
  Network,
  Newspaper,
  NotebookPen,
  Receipt,
  RotateCcw,
  Server,
  Settings,
  StickyNote,
  TableProperties,
  TimerReset,
  TrendingUp,
  UsersRound,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { ENABLED_APP_TEMPLATES, isAppPageEnabled, isAppTemplateEnabled } from '@/lib/apps/catalog'
import { sharedWorkspaceLinkedAppsForKind } from '@/lib/apps/shared-work'
import { buildAppToolContracts, summarizeToolContracts } from '@/lib/apps/tool-contracts'
import type { AppPageKind } from '@/lib/apps/types'
import { useAppsStore } from '@/lib/store/apps-store'
import { cn } from '@/lib/utils/cn'
import type { SepilotAppCapabilities } from '@sepilotd/api-client'

const TEMPLATE_ICONS: Record<AppPageKind, LucideIcon> = {
  calendar: CalendarDays,
  todo: ClipboardList,
  notepad: NotebookPen,
  scrum: UsersRound,
  meetings: MessageCircle,
  inbox: Inbox,
  briefing: Newspaper,
  timeline: TimerReset,
  mermaid: GitBranch,
  mindmap: Network,
  table: TableProperties,
  kanban: KanbanSquare,
  sticky: StickyNote,
  vault: KeyRound,
  subscriptions: CreditCard,
  portfolio: Wallet,
  stocks: TrendingUp,
  ledger: Receipt,
  devices: Monitor,
  services: Server,
  jira: Bug,
  confluence: BookOpen,
  clusters: Database,
  network: Network,
  storage: FolderTree,
  smarthome: House,
  smartcar: Car,
  gitrepos: GitBranch,
  bookmarks: BookOpen,
  architect: Network,
  custom: FileText,
}

type AppsSidebarTab = 'my-apps' | 'catalog'
type CatalogSortMode = 'default' | 'name'

interface CatalogGroup {
  category: string
  templates: CatalogApp[]
}

interface CatalogApp {
  key: string
  kind: AppPageKind
  title: string
  category: string
  summary?: string
  description?: string
  accent?: string
  pageId?: string
}

const CATALOG_DEFAULT_CATEGORY_ORDER = [
  '일정',
  '업무',
  '개발',
  '실행',
  '노트',
  '팀',
  '브리핑',
  '워크로그',
  '문서',
  '다이어그램',
  '마인드맵',
  '데이터',
  '워크플로',
  '대시보드',
  '인프라',
  '보안',
  '재무',
  'Smart',
  '도구',
] as const

const CATALOG_DEFAULT_CATEGORY_RANK = new Map<string, number>(
  CATALOG_DEFAULT_CATEGORY_ORDER.map((category, index) => [category, index]),
)

const PERMISSION_LABELS = {
  storage: '저장소',
  network: '네트워크',
  clipboard: '클립보드',
  fileSystem: '파일',
  shell: '셸',
} as const

const CAPABILITY_LABELS: Array<{
  key: keyof SepilotAppCapabilities
  label: string
  description: string
}> = [
  {
    key: 'scheduler',
    label: 'Tasks/Scheduler',
    description: 'Due Date, 반복, 알림 예약을 daemon Scheduler 작업으로 저장합니다.',
  },
  {
    key: 'notifications',
    label: '알림',
    description: 'desktop/daemon 알림을 발행하거나 예약 알림을 생성합니다.',
  },
  {
    key: 'interAppRead',
    label: '앱 간 읽기',
    description: '다른 앱의 redacted context를 읽어 공유 업무 흐름을 연결합니다.',
  },
  {
    key: 'agentTools',
    label: 'Agent 도구',
    description: '앱 전용 Agent 보조 기능을 호출합니다.',
  },
  {
    key: 'workflow',
    label: '워크플로',
    description: 'GitHub Projects 같은 외부 워크플로 브리지를 사용합니다.',
  },
  {
    key: 'encryption',
    label: '암호화',
    description: '앱 데이터 암복호화 SDK를 사용합니다.',
  },
  {
    key: 'backup',
    label: '백업',
    description: '앱 데이터를 백업 대상에 포함합니다.',
  },
]

function capabilityEnabled(
  capabilities: SepilotAppCapabilities | undefined,
  key: keyof SepilotAppCapabilities,
): boolean {
  return capabilities?.[key] !== false
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function countTopLevelData(value: Record<string, unknown>): number {
  return Object.keys(value).length
}

function appStorageDirectory(
  pageId: string,
  pageStoragePath: string | undefined,
  rootPath: string | null,
): string {
  if (pageStoragePath) return pageStoragePath
  const root = rootPath?.trim() || '~/.sepilotd/apps'
  const separator = root.includes('\\') ? '\\' : '/'
  return root.endsWith('/') || root.endsWith('\\')
    ? `${root}${pageId}`
    : `${root}${separator}${pageId}`
}

function appDataPath(storageDirectory: string): string {
  const separator = storageDirectory.includes('\\') ? '\\' : '/'
  return storageDirectory.endsWith('/') || storageDirectory.endsWith('\\')
    ? `${storageDirectory}data.json`
    : `${storageDirectory}${separator}data.json`
}

function templateAccent(kind: AppPageKind): string {
  return ENABLED_APP_TEMPLATES.find((template) => template.id === kind)?.accent ?? '#2563eb'
}

function buildCatalogGroups(
  templates: readonly CatalogApp[],
  sortMode: CatalogSortMode,
): CatalogGroup[] {
  const groups = new Map<string, CatalogApp[]>()
  for (const template of templates) {
    const key = template.category.trim() || '기타'
    groups.set(key, [...(groups.get(key) ?? []), template])
  }

  return [...groups.entries()]
    .map(([category, groupTemplates]) => ({
      category,
      templates:
        sortMode === 'name'
          ? [...groupTemplates].sort((a, b) => a.title.localeCompare(b.title, 'ko-KR'))
          : groupTemplates,
    }))
    .sort((a, b) => {
      if (sortMode === 'name') return a.category.localeCompare(b.category, 'ko-KR')
      const aRank = CATALOG_DEFAULT_CATEGORY_RANK.get(a.category) ?? Number.MAX_SAFE_INTEGER
      const bRank = CATALOG_DEFAULT_CATEGORY_RANK.get(b.category) ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) return aRank - bRank
      return a.category.localeCompare(b.category, 'ko-KR')
    })
}

export function AppsSidebar({ onOpenSettings, onOpenApp, onOpenMemory, onOpenTasks, onOpenDocuments, activeView = 'office' }: {
  onOpenSettings: () => void
  onOpenApp?: (id: string) => void
  onOpenMemory?: () => void
  onOpenTasks?: () => void
  onOpenDocuments?: () => void
  activeView?: string
}) {
  const pages = useAppsStore((state) => state.pages)
  const activeId = useAppsStore((state) => state.activeId)
  const openIds = useAppsStore((state) => state.openIds)
  const storagePath = useAppsStore((state) => state.storagePath)
  const addFromTemplate = useAppsStore((state) => state.addFromTemplate)
  const setActive = useAppsStore((state) => state.setActive)
  const closePage = useAppsStore((state) => state.closePage)
  const resetToTemplates = useAppsStore((state) => state.resetToTemplates)
  const updatePage = useAppsStore((state) => state.updatePage)
  const [tab, setTab] = useState<AppsSidebarTab>('catalog')
  const [catalogSortMode, setCatalogSortMode] = useState<CatalogSortMode>('default')
  const [collapsedCatalogGroups, setCollapsedCatalogGroups] = useState<Set<string>>(() => new Set())
  const listedOpenPages = pages.filter((page) => openIds.includes(page.id))
  const activeStoredPage = pages.find((page) => page.id === activeId) ?? null
  const openPages =
    listedOpenPages.length > 0 || !activeStoredPage ? listedOpenPages : [activeStoredPage]
  const activePage = openPages.find((page) => page.id === activeId) ?? openPages[0] ?? null
  const activeStorageDirectory = activePage
    ? appStorageDirectory(activePage.id, activePage.storagePath, storagePath)
    : ''
  const activeDataPath = activeStorageDirectory ? appDataPath(activeStorageDirectory) : ''
  const [draftTitle, setDraftTitle] = useState(activePage?.title ?? '')
  const [draftSummary, setDraftSummary] = useState(activePage?.summary ?? '')
  const linkedApps = useMemo(
    () =>
      activePage
        ? sharedWorkspaceLinkedAppsForKind(activePage.kind).filter((app) =>
            isAppTemplateEnabled(app.kind),
          )
        : [],
    [activePage?.kind],
  )
  const toolContracts = useMemo(
    () => (activePage ? buildAppToolContracts(activePage) : []),
    [activePage],
  )
  const toolSummary = useMemo(() => summarizeToolContracts(toolContracts), [toolContracts])
  const catalogGroups = useMemo(
    () => {
      const savedApps: CatalogApp[] = pages.filter(isAppPageEnabled).map(page => ({
        key: page.id, pageId: page.id, kind: page.kind, title: page.title,
        category: page.category || ENABLED_APP_TEMPLATES.find(template => template.id === page.kind)?.category || '내 앱',
        summary: page.summary, accent: page.accent,
      }))
      const availableApps: CatalogApp[] = ENABLED_APP_TEMPLATES
        .filter(template => !savedApps.some(app => app.kind === template.id))
        .map(template => ({ ...template, key: `template:${template.id}`, kind: template.id }))
      return buildCatalogGroups([...savedApps, ...availableApps], catalogSortMode)
    },
    [pages, catalogSortMode],
  )

  useEffect(() => {
    setDraftTitle(activePage?.title ?? '')
    setDraftSummary(activePage?.summary ?? '')
  }, [activePage?.id, activePage?.summary, activePage?.title])

  function openCatalogApp(app: CatalogApp): void {
    const id = app.pageId ?? addFromTemplate(app.kind)
    if (!id) return
    if (app.pageId) setActive(id)
    onOpenApp?.(id)
  }

  function resetTemplates(): void {
    resetToTemplates()
    setTab('my-apps')
  }

  function toggleCatalogGroup(category: string): void {
    setCollapsedCatalogGroups((current) => {
      const next = new Set(current)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  function commitActiveDetails(): void {
    if (!activePage) return
    const title = draftTitle.trim()
    const summary = draftSummary.trim()
    if (!title) {
      setDraftTitle(activePage.title)
      return
    }
    if (title !== activePage.title || summary !== (activePage.summary ?? '')) {
      updatePage(activePage.id, { title, summary })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {tab === 'catalog' ? (
          <div className="space-y-1">
            <div className="flex items-center justify-end px-1.5 pb-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  variant={catalogSortMode === 'default' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 gap-1 rounded-md px-1.5 text-[10px]"
                  onClick={() => setCatalogSortMode('default')}
                  aria-pressed={catalogSortMode === 'default'}
                  aria-label="앱 카탈로그 기본 정렬"
                  title="기본 정렬"
                >
                  <ListOrdered className="h-3 w-3" />
                  기본 정렬
                </Button>
                <Button
                  variant={catalogSortMode === 'name' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 gap-1 rounded-md px-1.5 text-[10px]"
                  onClick={() => setCatalogSortMode('name')}
                  aria-pressed={catalogSortMode === 'name'}
                  aria-label="앱 카탈로그 이름순 정렬"
                  title="이름순 정렬"
                >
                  <ArrowDownAZ className="h-3 w-3" />
                  이름순
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-md"
                  onClick={resetTemplates}
                  aria-label="reset apps templates"
                  title="템플릿 초기화"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="space-y-1" role="tree" aria-label="앱 카탈로그 그룹">
              {catalogGroups.map((group) => {
                const collapsed = collapsedCatalogGroups.has(group.category)
                const groupId = `app-catalog-group-${group.category}`
                return (
                  <section key={group.category} className="space-y-0.5">
                    <button
                      type="button"
                      role="treeitem"
                      aria-label={`${group.category} 그룹`}
                      aria-expanded={!collapsed}
                      aria-controls={groupId}
                      onClick={() => toggleCatalogGroup(group.category)}
                      className="group flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 shrink-0 transition-transform',
                          collapsed && '-rotate-90',
                        )}
                      />
                      <span className="truncate">{group.category}</span>
                      <span className="ml-auto rounded border bg-background px-1 py-0 text-[9px] leading-4 text-muted-foreground">
                        {group.templates.length}
                      </span>
                    </button>
                    {collapsed ? null : (
                      <div id={groupId} role="group" className="space-y-0.5">
                        {group.templates.map((template) => {
                          const Icon = TEMPLATE_ICONS[template.kind]
                          const selected = activeView === 'office' && template.pageId === activeId
                          const stateLabel = template.pageId
                            ? openIds.includes(template.pageId)
                              ? '열림'
                              : '다시 열기'
                            : '사용하기'
                          return (
                            <button
                              key={template.key}
                              type="button"
                              role="treeitem"
                              aria-label={template.title}
                              onClick={() => openCatalogApp(template)}
                              aria-selected={selected}
                              title={template.description}
                              className={cn('group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent',
                                selected ? 'border-primary/25 bg-primary/10' : 'border-transparent bg-background')}
                            >
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white"
                                style={{ backgroundColor: template.accent ?? '#2563eb' }}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center justify-between gap-2">
                                  <span className="truncate text-xs font-semibold text-foreground">
                                    {template.title}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {stateLabel}
                                  </span>
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                  {template.summary}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        ) : !activePage ? (
          <div className="mx-1.5 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-foreground">열린 앱이 없어요</p>
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" className="h-7 rounded-md px-2" onClick={() => setTab('catalog')}>
                앱 목록
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-1.5 pb-3">
            <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: activePage.accent ?? '#2563eb' }}
              >
                {(() => {
                  const Icon = TEMPLATE_ICONS[activePage.kind] ?? FileText
                  return <Icon className="h-5 w-5" />
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {activePage.title}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {activePage.category ??
                    (activePage.kind === 'custom' ? 'Custom' : activePage.kind)}
                  {activePage.version ? ` · v${activePage.version}` : ''}
                </div>
              </div>
            </div>

            <section className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                앱 정보
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">이름</span>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none transition-colors focus:border-primary"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={commitActiveDetails}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  aria-label="app title"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium text-muted-foreground">요약</span>
                <textarea
                  className="min-h-16 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none transition-colors focus:border-primary"
                  value={draftSummary}
                  onChange={(event) => setDraftSummary(event.target.value)}
                  onBlur={commitActiveDetails}
                  aria-label="app summary"
                />
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="rounded-md border bg-background px-2 py-1.5">
                  <div className="text-muted-foreground">생성 방식</div>
                  <div className="mt-0.5 font-medium text-foreground">
                    {activePage.origin === 'code-agent' ? 'Code Agent' : 'Template'}
                  </div>
                </div>
                <div className="rounded-md border bg-background px-2 py-1.5">
                  <div className="text-muted-foreground">업데이트</div>
                  <div className="mt-0.5 truncate font-medium text-foreground">
                    {formatDateTime(activePage.updatedAt)}
                  </div>
                </div>
              </div>
            </section>

            {linkedApps.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Network className="h-3 w-3" />
                    연결된 앱
                  </span>
                  <span className="rounded border bg-background px-1 py-0 text-[9px] leading-4">
                    {linkedApps.length}개
                  </span>
                </div>
                <div className="space-y-1 rounded-md border bg-background p-1.5">
                  {linkedApps.map((linkedApp) => {
                    const linkedPage = pages.find((page) => page.kind === linkedApp.kind)
                    const Icon = TEMPLATE_ICONS[linkedApp.kind] ?? FileText
                    const stateLabel = linkedPage
                      ? openIds.includes(linkedPage.id)
                        ? '열림'
                        : '저장됨'
                      : '템플릿'
                    return (
                      <div
                        key={linkedApp.kind}
                        className="flex min-w-0 items-center gap-2 rounded border border-transparent bg-muted/30 px-1.5 py-1.5"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white"
                          style={{
                            backgroundColor: linkedPage?.accent ?? templateAccent(linkedApp.kind),
                          }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-foreground">
                              {linkedApp.title}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 text-[10px] font-medium',
                                linkedPage ? 'text-primary' : 'text-muted-foreground',
                              )}
                            >
                              {stateLabel}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {linkedApp.relationship}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Database className="h-3 w-3" />
                데이터
              </div>
              <div className="space-y-1.5 rounded-md border bg-background p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">저장 항목</span>
                  <span className="font-medium">{countTopLevelData(activePage.data)}개</span>
                </div>
                <div className="space-y-1 border-t pt-1.5">
                  <div className="text-muted-foreground">App ID</div>
                  <div
                    className="truncate rounded border bg-muted/30 px-1.5 py-1 font-mono text-[10px] text-foreground"
                    title={activePage.id}
                  >
                    {activePage.id}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">데이터 경로</div>
                  <div
                    className="truncate rounded border bg-muted/30 px-1.5 py-1 font-mono text-[10px] text-foreground"
                    title={activeDataPath}
                  >
                    {activeDataPath}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">AI 읽기</span>
                  <span className="font-medium">
                    {activePage.dataPolicy?.aiReadable === false ? '꺼짐' : '켜짐'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">AI 쓰기</span>
                  <span className="font-medium">
                    {activePage.dataPolicy?.aiWritable === false ? '꺼짐' : '켜짐'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">백업</span>
                  <span className="font-medium">
                    {activePage.dataPolicy?.backup === 'excluded' ? '제외' : '포함'}
                  </span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                권한
              </div>
              <div className="space-y-1.5 rounded-md border bg-background p-2">
                <div className="space-y-1">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    샌드박스
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                      const enabled =
                        activePage.permissions?.[key as keyof typeof PERMISSION_LABELS] === true
                      return (
                        <span
                          key={key}
                          className={cn(
                            'rounded border px-1.5 py-1 text-[10px] font-medium',
                            enabled
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-muted/30 text-muted-foreground',
                          )}
                        >
                          {label}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <section className="space-y-1" aria-label="Daemon 연동 권한">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Daemon / SDK
                    </span>
                    <span className="text-[9px] text-muted-foreground">Tasks·알림 포함</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CAPABILITY_LABELS.map((capability) => {
                      const enabled = capabilityEnabled(activePage.capabilities, capability.key)
                      return (
                        <span
                          key={capability.key}
                          className={cn(
                            'rounded border px-1.5 py-1 text-[10px] font-medium',
                            enabled
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'border-border bg-muted/30 text-muted-foreground',
                          )}
                          title={capability.description}
                          aria-label={`${capability.label} ${enabled ? '사용' : '차단'}`}
                        >
                          {capability.label}
                        </span>
                      )
                    })}
                  </div>
                  <div className="text-[10px] leading-snug text-muted-foreground">
                    Due Date와 ToDo 알림은 Tasks/Scheduler와 알림 capability를 통해 daemon에
                    저장됩니다.
                  </div>
                </section>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />
                  Agent 도구
                </span>
                <span className="rounded border bg-background px-1 py-0 text-[9px] leading-4">
                  {toolSummary.enabled}/{toolSummary.total}
                </span>
              </div>
              <div className="space-y-1 rounded-md border bg-background p-1.5 text-[10px]">
                <div className="flex items-center justify-between gap-2 rounded border bg-muted/30 px-1.5 py-1 text-muted-foreground">
                  <span>호출 가능</span>
                  <span className="font-medium text-foreground">
                    {toolSummary.enabled}개 · 차단 {toolSummary.disabled}개
                  </span>
                </div>
                {toolContracts.map((tool) => (
                  <details key={tool.op} className="group rounded border bg-background">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-1.5 py-1.5 marker:content-none">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          tool.availability === 'enabled' ? 'bg-primary' : 'bg-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground">
                          {tool.op}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {tool.group} · {tool.label}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded border px-1 py-0 text-[9px] leading-4',
                          tool.availability === 'enabled'
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border bg-muted/30 text-muted-foreground',
                        )}
                      >
                        {tool.availability === 'enabled' ? '사용' : '차단'}
                      </span>
                    </summary>
                    <div className="space-y-1.5 border-t px-1.5 py-1.5">
                      <p className="leading-snug text-muted-foreground">{tool.description}</p>
                      {tool.disabledReason ? (
                        <div className="rounded border border-border bg-muted/30 px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                          {tool.disabledReason}
                        </div>
                      ) : null}
                      <div className="grid gap-1">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          입력
                        </div>
                        {tool.input.length ? (
                          tool.input.map((param) => (
                            <div
                              key={`${tool.op}:input:${param.name}`}
                              className="rounded border bg-muted/20 px-1.5 py-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[9px] text-foreground">
                                  {param.name}
                                </span>
                                <span className="shrink-0 text-[9px] text-muted-foreground">
                                  {param.type}
                                  {param.required ? ' · 필수' : ''}
                                </span>
                              </div>
                              <div className="mt-0.5 leading-snug text-muted-foreground">
                                {param.description}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded border bg-muted/20 px-1.5 py-1 text-muted-foreground">
                            입력 없음
                          </div>
                        )}
                      </div>
                      <div className="grid gap-1">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          출력
                        </div>
                        {tool.output.length ? (
                          tool.output.map((param) => (
                            <div
                              key={`${tool.op}:output:${param.name}`}
                              className="rounded border bg-muted/20 px-1.5 py-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[9px] text-foreground">
                                  {param.name}
                                </span>
                                <span className="shrink-0 text-[9px] text-muted-foreground">
                                  {param.type}
                                </span>
                              </div>
                              <div className="mt-0.5 leading-snug text-muted-foreground">
                                {param.description}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded border bg-muted/20 px-1.5 py-1 text-muted-foreground">
                            출력 없음
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            {activePage.hostRequests?.length ? (
              <section className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  외부 연동
                </div>
                <div className="space-y-1 rounded-md border bg-background p-2 text-[10px]">
                  {activePage.hostRequests.map((request) => (
                    <div key={request.op} className="space-y-0.5">
                      <div className="font-semibold text-foreground">{request.op}</div>
                      {request.reason ? (
                        <div className="leading-snug text-muted-foreground">{request.reason}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                검증
              </div>
              <div className="rounded-md border bg-background p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">상태</span>
                  <span
                    className={cn(
                      'font-medium',
                      activePage.validation?.ok === false ? 'text-destructive' : 'text-primary',
                    )}
                  >
                    {activePage.validation?.ok === false ? '확인 필요' : '정상'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">이슈</span>
                  <span className="font-medium">{activePage.validation?.issues.length ?? 0}개</span>
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-full justify-center gap-1.5 rounded-md text-muted-foreground hover:text-destructive"
                onClick={() => closePage(activePage.id)}
                aria-label="close current app"
              >
                <X className="h-3.5 w-3.5" />
                현재 앱 닫기
              </Button>
            </section>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t px-1.5 py-1.5">
        <div
          className="grid grid-cols-2 rounded-md border bg-muted/20 p-0.5"
          role="tablist"
          aria-label="Apps sidebar sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'my-apps'}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium transition-colors',
              tab === 'my-apps'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('my-apps')}
          >
            현재 앱
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'catalog'}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium transition-colors',
              tab === 'catalog'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab('catalog')}
          >
            앱 목록
          </button>
        </div>
        <div className="flex items-center gap-0.5" role="group" aria-label="Apps 하단 도구">
          <ThemeToggle className="h-8 flex-1 [&>svg]:h-4 [&>svg]:w-4" />
          {([
            { label: '메모리', icon: Database, onClick: onOpenMemory, active: activeView === 'memory' },
            { label: 'Tasks', icon: Clock, onClick: onOpenTasks, active: activeView === 'tasks' },
            { label: '문서', icon: FileText, onClick: onOpenDocuments, active: activeView === 'rag' },
          ]).map(({ label, icon: Icon, onClick, active }) => onClick ? (
            <Button key={label} variant={active ? 'secondary' : 'ghost'} size="icon" className="h-8 flex-1"
              onClick={onClick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </Button>
          ) : null)}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 flex-1 rounded-md"
            onClick={onOpenSettings}
            title="설정"
            aria-label="settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
