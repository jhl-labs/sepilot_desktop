import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Package2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  User,
} from 'lucide-react'
import type { DaemonSessionMeta } from '@sepilotd/api-client'
import type { DesktopSessionRailModel, DesktopView } from './desktop-shell'
import { useLocale, type SupportedLocale } from './useLocale'

const SESSION_RAIL_COPY = {
  en: {
    workspaceAria: 'Workspace navigation',
    workspaceMode: 'Workspace mode',
    chat: 'Chat',
    agentWorkspace: 'Agent workspace',
    coreWorkspace: 'Core workspace',
    utilities: 'Utilities',
    newChat: 'New chat',
    showWorkspace: 'Show workspace',
    hideWorkspace: 'Hide workspace',
    conversations: 'Conversations',
    conversationsAria: 'Search conversations',
    searchPlaceholder: 'Search conversations',
    noConversations: 'No previous conversations yet.',
    noMatch: 'No conversations match this search.',
    untitled: 'Untitled',
    autoProvider: 'auto',
    defaultModel: 'default',
    msgsSuffix: (n: number) => `${n} msgs`,
    deleteSession: 'Delete session',
    deleteAria: (title: string) => `Delete ${title}`,
    delete: 'Delete',
    confirmDelete: (title: string) => `Delete session "${title}"?`,
    deleteAll: 'Clear all',
    deleteAllAria: 'Delete all conversations',
    deleteAllInProgress: 'Clearing...',
    confirmDeleteAll: 'Delete all conversations? This cannot be undone.',
    workspaceShortcutsAria: 'Workspace shortcuts',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    skills: 'Skills',
    documents: 'Documents',
    gallery: 'Gallery',
    settings: 'Settings',
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'This week',
    month: 'This month',
    earlier: 'Earlier',
    summarySaved: (n: number) => `${n} saved`,
    summaryFiltered: (filtered: number, total: number) => `${filtered} of ${total} saved`,
  },
  ko: {
    workspaceAria: '워크스페이스 내비게이션',
    workspaceMode: '워크스페이스 모드',
    chat: '채팅',
    agentWorkspace: '에이전트 워크스페이스',
    coreWorkspace: '핵심 워크스페이스',
    utilities: '유틸리티',
    newChat: '새 채팅',
    showWorkspace: '워크스페이스 표시',
    hideWorkspace: '워크스페이스 숨김',
    conversations: '대화',
    conversationsAria: '대화 검색',
    searchPlaceholder: '대화 검색',
    noConversations: '아직 이전 대화가 없습니다.',
    noMatch: '검색에 일치하는 대화가 없습니다.',
    untitled: '제목 없음',
    autoProvider: 'auto',
    defaultModel: 'default',
    msgsSuffix: (n: number) => `메시지 ${n}개`,
    deleteSession: '세션 삭제',
    deleteAria: (title: string) => `${title} 삭제`,
    delete: '삭제',
    confirmDelete: (title: string) => `"${title}" 세션을 삭제할까요?`,
    deleteAll: '모두 지우기',
    deleteAllAria: '모든 대화 삭제',
    deleteAllInProgress: '지우는 중...',
    confirmDeleteAll: '모든 대화를 삭제할까요? 되돌릴 수 없습니다.',
    workspaceShortcutsAria: '워크스페이스 바로가기',
    lightMode: '라이트 모드',
    darkMode: '다크 모드',
    skills: '스킬',
    documents: '문서',
    gallery: '갤러리',
    settings: '설정',
    today: '오늘',
    yesterday: '어제',
    week: '이번 주',
    month: '이번 달',
    earlier: '이전',
    summarySaved: (n: number) => `${n}개 저장됨`,
    summaryFiltered: (filtered: number, total: number) => `${total}개 중 ${filtered}개`,
  },
} as const

const DAY_IN_MS = 24 * 60 * 60 * 1000

interface SessionRailProps {
  model: DesktopSessionRailModel
}

function formatSessionUpdatedLabel(session: DaemonSessionMeta): string {
  const updatedAt = Date.parse(session.updatedAt)
  if (!Number.isFinite(updatedAt)) {
    return 'Recent'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(updatedAt))
}

function formatSessionUsageLabel(session: DaemonSessionMeta): string {
  if (session.totalCost > 0) {
    return session.totalCost < 0.01
      ? `$${session.totalCost.toFixed(4)}`
      : `$${session.totalCost.toFixed(2)}`
  }

  const totalTokens = (session.totalTokens?.input ?? 0) + (session.totalTokens?.output ?? 0)
  return totalTokens > 0 ? `${totalTokens} tok` : 'Fresh'
}

function groupSessionsByRecency(
  sessions: DaemonSessionMeta[],
  copy: (typeof SESSION_RAIL_COPY)[SupportedLocale],
) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - DAY_IN_MS
  const lastWeek = today - 7 * DAY_IN_MS
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const groups = [
    { key: 'today', label: copy.today, items: [] as DaemonSessionMeta[] },
    { key: 'yesterday', label: copy.yesterday, items: [] as DaemonSessionMeta[] },
    { key: 'week', label: copy.week, items: [] as DaemonSessionMeta[] },
    { key: 'month', label: copy.month, items: [] as DaemonSessionMeta[] },
    { key: 'older', label: copy.earlier, items: [] as DaemonSessionMeta[] },
  ]

  for (const session of sessions) {
    const updatedAt = Date.parse(session.updatedAt)
    if (!Number.isFinite(updatedAt)) {
      groups[groups.length - 1].items.push(session)
      continue
    }

    if (updatedAt >= today) {
      groups[0].items.push(session)
    } else if (updatedAt >= yesterday) {
      groups[1].items.push(session)
    } else if (updatedAt >= lastWeek) {
      groups[2].items.push(session)
    } else if (updatedAt >= currentMonth) {
      groups[3].items.push(session)
    } else {
      groups[4].items.push(session)
    }
  }

  return groups.filter((group) => group.items.length > 0)
}

function getNavIcon(view?: DesktopView) {
  switch (view) {
    case 'chat':
      return MessageSquare
    case 'inbox':
      return Inbox
    case 'dashboard':
      return LayoutDashboard
    case 'memory':
      return FileText
    case 'gallery':
      return ImageIcon
    case 'skills':
      return Package2
    case 'settings':
      return SettingsIcon
    default:
      return MessageSquare
  }
}

export function SessionRail({
  model,
}: SessionRailProps) {
  const { locale } = useLocale()
  const copy = SESSION_RAIL_COPY[locale] ?? SESSION_RAIL_COPY.en
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const ActiveIcon = getNavIcon(model.activeNav?.key)
  const quickActions = useMemo(
    () => [
      {
        key: 'theme',
        label: model.theme === 'dark' ? copy.lightMode : copy.darkMode,
        active: false,
        onClick: model.onToggleTheme,
        icon: model.theme === 'dark' ? Sun : Moon,
      },
      {
        key: 'skills',
        label: copy.skills,
        active: model.activeNav?.key === 'skills',
        onClick: () => model.onSelectView('skills'),
        icon: User,
      },
      {
        key: 'memory',
        label: copy.documents,
        active: model.activeNav?.key === 'memory',
        onClick: () => model.onSelectView('memory'),
        icon: FileText,
      },
      {
        key: 'gallery',
        label: copy.gallery,
        active: model.activeNav?.key === 'gallery',
        onClick: () => model.onSelectView('gallery'),
        icon: ImageIcon,
      },
      {
        key: 'settings',
        label: copy.settings,
        active: model.settingsOpen,
        onClick: model.onOpenSettings,
        icon: SettingsIcon,
      },
    ],
    [copy, model],
  )
  const groupedNavItems = useMemo(
    () => [
      {
        key: 'primary',
        label: copy.coreWorkspace,
        items: model.navItems.filter((item) => item.section === 'primary'),
      },
      {
        key: 'secondary',
        label: copy.utilities,
        items: model.navItems.filter((item) => item.section === 'secondary'),
      },
    ],
    [copy, model.navItems],
  )
  const filteredSessions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return model.sessions
    }

    return model.sessions.filter((session) => {
      const haystack = [
        session.title || 'untitled',
        session.provider || 'auto',
        session.model || 'default',
      ].join(' ').toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [model.sessions, searchQuery])
  const sessionSummaryLabel = searchQuery.trim()
    ? copy.summaryFiltered(filteredSessions.length, model.sessions.length)
    : copy.summarySaved(model.sessions.length)
  const groupedSessions = useMemo(
    () => groupSessionsByRecency(filteredSessions, copy),
    [copy, filteredSessions],
  )

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const handleDeleteSession = async (session: DaemonSessionMeta) => {
    if (!window.confirm(copy.confirmDelete(session.title || copy.untitled))) {
      return
    }

    await window.sepilot.deleteSession(session.id)
    await model.onRefreshSessions()
  }

  const handleDeleteAllSessions = async () => {
    if (deletingAll) return
    if (!window.confirm(copy.confirmDeleteAll)) return

    setDeletingAll(true)
    try {
      await model.onDeleteAllSessions()
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <aside className="workspace-sidebar" aria-label={copy.workspaceAria}>
      <div className="workspace-sidebar-top">
        <div className="shell-mode-menu" ref={menuRef}>
          <button
            className="shell-mode-trigger"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="shell-mode-eyebrow">{copy.workspaceMode}</span>
            <div className="shell-mode-trigger-main">
              <span className="shell-mode-trigger-icon" aria-hidden="true">
                <ActiveIcon className="shell-icon" />
              </span>
              <div className="shell-mode-trigger-stack">
                <div className="shell-mode-trigger-copy">
                  <strong>{model.activeNav?.label ?? copy.chat}</strong>
                  <span className={`shell-mode-chevron ${menuOpen ? 'open' : ''}`}>
                    <ChevronDown className="shell-icon" />
                  </span>
                </div>
                <span className="shell-mode-detail">
                  {model.activeNav?.description ?? copy.agentWorkspace}
                </span>
              </div>
            </div>
          </button>

          {menuOpen && (
            <div className="shell-mode-popover" role="menu">
              {groupedNavItems.map((group) => {
                if (group.items.length === 0) {
                  return null
                }

                return (
                  <div key={group.key} className="shell-mode-group">
                    <span className="shell-mode-group-label">{group.label}</span>
                    <div className="shell-mode-group-stack">
                      {group.items.map((item) => {
                        const ItemIcon = getNavIcon(item.key)
                        return (
                          <button
                            key={item.key}
                            className={`shell-mode-option ${model.activeNav?.key === item.key ? 'active' : ''}`}
                            role="menuitem"
                            onClick={() => {
                              model.onSelectView(item.key)
                              setMenuOpen(false)
                            }}
                          >
                            <span className="shell-mode-option-icon" aria-hidden="true">
                              <ItemIcon className="shell-icon" />
                            </span>
                            <span className="shell-mode-option-copy">
                              <strong>{item.label}</strong>
                              <span>{item.description}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="workspace-sidebar-actions">
          <button
            className="shell-sidebar-square-action primary"
            onClick={model.onNewSession}
            aria-label={copy.newChat}
            title={copy.newChat}
          >
            <Plus className="shell-icon" />
          </button>
          <button
            className="shell-sidebar-square-action"
            onClick={model.onToggleCollapsed}
            title={model.sidebarCollapsed ? copy.showWorkspace : copy.hideWorkspace}
            aria-label={model.sidebarCollapsed ? copy.showWorkspace : copy.hideWorkspace}
          >
            {model.sidebarCollapsed ? <PanelLeftOpen className="shell-icon" /> : <PanelLeftClose className="shell-icon" />}
          </button>
        </div>
      </div>

      <div className="workspace-sidebar-scroll">
        <section className="shell-sidebar-section shell-sidebar-history">
          <div className="shell-sidebar-section-header">
            <span>{copy.conversations}</span>
            <span>{sessionSummaryLabel}</span>
            {model.sessions.length > 0 ? (
              <button
                type="button"
                className="shell-session-delete-all"
                onClick={handleDeleteAllSessions}
                disabled={deletingAll}
                title={copy.deleteAllAria}
                aria-label={copy.deleteAllAria}
              >
                <Trash2 className="shell-icon" />
                <span>{deletingAll ? copy.deleteAllInProgress : copy.deleteAll}</span>
              </button>
            ) : null}
          </div>
          <label className="shell-session-search" aria-label={copy.conversationsAria}>
            <Search className="shell-icon" />
            <input
              className="shell-session-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.conversationsAria}
            />
          </label>
          <div className="shell-session-groups">
            {model.sessions.length === 0 ? (
              <div className="shell-session-empty">
                {copy.noConversations}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="shell-session-empty">
                {copy.noMatch}
              </div>
            ) : (
              groupedSessions.map((group) => (
                <section key={group.key} className="shell-session-group" aria-label={group.label}>
                  <div className="shell-session-group-label">
                    <CalendarDays className="shell-icon" />
                    <span>{group.label}</span>
                  </div>
                  <div className="shell-session-list" role="list">
                    {group.items.map((session) => (
                      <div
                        key={session.id}
                        className={`shell-session-card ${session.id === model.activeSessionId ? 'active' : ''}`}
                        role="listitem"
                      >
                        <div
                          className="shell-session-hitbox"
                          onClick={() => model.onOpenSession(session.id)}
                        >
                          <div className="shell-session-row">
                            <strong className="shell-session-title">
                              {session.title || copy.untitled}
                            </strong>
                            <span className="shell-session-date">
                              {formatSessionUpdatedLabel(session)}
                            </span>
                          </div>
                          <div className="shell-session-meta-row">
                            <span className="shell-session-provider-pill">
                              {session.provider || copy.autoProvider}
                            </span>
                            <span className="shell-session-meta">
                              {session.model || copy.defaultModel}
                            </span>
                          </div>
                          <div className="shell-session-secondary-meta">
                            <span className={`shell-session-status-badge ${session.status}`}>
                              {session.status}
                            </span>
                            <span className="shell-session-meta">
                              {copy.msgsSuffix(session.messageCount)}
                            </span>
                            <span className="shell-session-meta">
                              {formatSessionUsageLabel(session)}
                            </span>
                            {session.tags.slice(0, 1).map((tag) => (
                              <span key={tag} className="shell-session-tag">
                                #{tag}
                              </span>
                            ))}
                            {session.tags.length > 1 ? (
                              <span className="shell-session-tag">
                                +{session.tags.length - 1}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          className="shell-session-delete"
                          onClick={async (event) => {
                            event.stopPropagation()
                            await handleDeleteSession(session)
                          }}
                          title={copy.deleteSession}
                          aria-label={copy.deleteAria(session.title || copy.untitled)}
                        >
                          <Trash2 className="shell-icon" />
                          <span className="sr-only">{copy.delete}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="workspace-sidebar-footer">
        <div className="shell-surface-dock" role="navigation" aria-label={copy.workspaceShortcutsAria}>
          {quickActions.map((item) => {
            const ItemIcon = item.icon
            return (
              <button
                key={item.key}
                className={`shell-surface-item shell-surface-item-dock ${item.active ? 'active' : ''}`}
                onClick={item.onClick}
                aria-current={item.active ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
              >
                <span className="shell-surface-icon-shell" aria-hidden="true">
                  <ItemIcon className="shell-icon" />
                </span>
                <span className="sr-only">{item.label}</span>
              </button>
            )
          })}
        </div>
        <div className="workspace-sidebar-footer-status">
          <div className="workspace-sidebar-footer-pill">
            <span className={`status-dot ${model.connectionState.daemonStatus}`} />
            {model.connectionState.daemonLabel}
          </div>
          <div className="workspace-sidebar-footer-pill">
            <span className={`status-dot ${model.connectionState.gatewayStatus}`} />
            {model.connectionState.gatewayLabel}
          </div>
        </div>
      </div>
    </aside>
  )
}
