import React, { useState, useEffect, useCallback } from 'react'
import { Dashboard } from './Dashboard'
import { DesktopSettingsDialog } from './DesktopSettingsDialog'
import { GallerySurface } from './GallerySurface'
import { Inbox } from './Inbox'
import { Skills } from './Skills'
import { ChatView } from './ChatView'
import { resetDesktopSessionRunRegistry } from './session-run-registry'
import { MemorySearch } from './MemorySearch'
import { KeyboardHelp } from './KeyboardHelp'
import { SessionRail } from './SessionRail'
import type { DesktopView } from './desktop-shell'
import { useDaemonShell } from './useDaemonShell'
import { useDesktopShellViewModels } from './useDesktopShellViewModels'
import { useLocale } from './useLocale'

const SIDEBAR_WIDTH_STORAGE_KEY = 'sepilot_desktop_sidebar_width'
const SIDEBAR_MIN_WIDTH = 248
const SIDEBAR_MAX_WIDTH = 420
const SIDEBAR_DEFAULT_WIDTH = 292

type ServiceStartupStatusPayload = {
  service: 'daemon' | 'gateway'
  status: 'starting' | 'ready' | 'failed'
  title: string
  detail: string
  logPath?: string
  timestamp: string
}

export function App() {
  useEffect(() => () => resetDesktopSessionRunRegistry(), [])
  const { locale } = useLocale()
  const [view, setView] = useState<DesktopView>('chat')
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>()
  const [memoryShortcutQuery, setMemoryShortcutQuery] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [serviceStartupNotice, setServiceStartupNotice] =
    useState<ServiceStartupStatusPayload | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  useEffect(() => {
    const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!storedWidth) {
      return
    }

    const parsedWidth = Number.parseInt(storedWidth, 10)
    if (Number.isFinite(parsedWidth)) {
      setSidebarWidth(
        Math.min(Math.max(parsedWidth, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH),
      )
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 960px)')
    const handleChange = (event: MediaQueryList | MediaQueryListEvent) => {
      if (event.matches) {
        setShowSidebar(false)
      }
    }

    handleChange(mediaQuery)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  useEffect(() => {
    if (!isSidebarResizing) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      setSidebarWidth((currentWidth) => Math.min(
        Math.max(currentWidth + event.movementX, SIDEBAR_MIN_WIDTH),
        SIDEBAR_MAX_WIDTH,
      ))
    }

    const handleMouseUp = () => {
      setIsSidebarResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isSidebarResizing])

  const newSession = useCallback(() => {
    setSessionId(undefined)
    setInitialPrompt(undefined)
    setView('chat')
    setShowSidebar(true)
  }, [])

  const {
    sessions,
    status,
    healthReportSnapshot,
    gatewayWatchHealth,
    updateBanner,
    refreshSessions,
    deleteAllSessions,
  } = useDaemonShell({
    onNewChat: newSession,
  })

  useEffect(() => {
    return window.sepilotd?.on?.<ServiceStartupStatusPayload>(
      'sepilot:service-startup-status',
      (payload) => {
        if (payload?.service !== 'daemon') return
        if (payload.status === 'failed') {
          setServiceStartupNotice(payload)
          return
        }
        if (payload.status === 'ready') {
          setServiceStartupNotice(null)
        }
      },
    ) ?? (() => {})
  }, [])

  const openChat = useCallback((sid: string) => {
    setSessionId(sid)
    setInitialPrompt(undefined)
    setView('chat')
  }, [])

  const handleSelectView = useCallback((nextView: DesktopView) => {
    if (nextView === 'settings') {
      setSettingsOpen(true)
      return
    }
    if (nextView === 'memory') {
      setMemoryShortcutQuery(null)
    }
    setView(nextView)
  }, [])

  const handleOpenMemoryShortcut = useCallback((query?: string) => {
    const trimmed = query?.trim()
    setMemoryShortcutQuery(trimmed || null)
    setView('memory')
  }, [])

  const {
    gatewayHealthStatus,
    gatewayTakeoverMeta,
    sessionRailModel,
  } = useDesktopShellViewModels({
    view,
    showSidebar,
    theme,
    settingsOpen,
    status,
    gatewayWatchHealth,
    sessions,
    sessionId,
    onSelectView: handleSelectView,
    onNewChat: newSession,
    onToggleSidebar: () => setShowSidebar((value) => !value),
    onToggleTheme: toggleTheme,
    onOpenSettings: openSettings,
    onOpenSession: openChat,
    onRefreshSessions: refreshSessions,
    onDeleteAllSessions: deleteAllSessions,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        newSession()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        openSettings()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setShowSidebar((s) => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [newSession, openSettings])

  const startChatWithPrompt = (prompt: string) => {
    setSessionId(undefined)
    setInitialPrompt(prompt)
    setView('chat')
  }
  const handleSessionChange = useCallback((id?: string) => {
    setSessionId(id)
    refreshSessions()
  }, [refreshSessions])

  return (
    <div className="app-root">
      <div className="app-body">
        {showSidebar && (
          <div
            className="workspace-sidebar-shell"
            style={{ width: `${sidebarWidth}px` }}
          >
            <SessionRail model={sessionRailModel} />
            <div
              className="workspace-sidebar-resizer"
              onMouseDown={(event) => {
                event.preventDefault()
                setIsSidebarResizing(true)
              }}
              aria-hidden="true"
            />
          </div>
        )}

        <div className="workspace-main-shell">
          <main className="main-content">
            {updateBanner && (
              <div
                className="disconnect-banner"
                style={{
                  background: 'var(--color-success-subtle)',
                  color: 'var(--color-success)',
                }}
              >
                {updateBanner}
              </div>
            )}
            {serviceStartupNotice?.status === 'failed' && (
              <div className="disconnect-banner" role="alert">
                <strong>{serviceStartupNotice.title}</strong>
                <br />
                {serviceStartupNotice.detail}
                {serviceStartupNotice.logPath ? (
                  <>
                    <br />
                    Log: {serviceStartupNotice.logPath}
                  </>
                ) : null}
              </div>
            )}
            {status === 'disconnected' && (
              <div className="disconnect-banner" role="alert">
                {locale === 'ko'
                  ? 'daemon 연결 끊김 — 백그라운드 상태 점검을 다시 시도하는 중입니다.'
                  : 'Daemon disconnected — retrying background health checks.'}
              </div>
            )}
            {gatewayHealthStatus === 'degraded' && gatewayWatchHealth && (
              <div className="disconnect-banner gateway-watch-banner" role="status">
                {locale === 'ko'
                  ? 'gateway가 오래된 인박스 watch 인수에서 복구되었습니다.'
                  : 'Gateway recovered from a stale inbox watch takeover.'}
                {gatewayTakeoverMeta ? ` ${gatewayTakeoverMeta}.` : ''}
              </div>
            )}
            {view === 'inbox' ? (
              <Inbox
                onStartChat={startChatWithPrompt}
                gatewayWatchHealth={gatewayWatchHealth}
              />
            ) : view === 'dashboard' ? (
              <Dashboard
                sessions={sessions}
                onOpenChat={openChat}
                healthReportSnapshot={healthReportSnapshot}
                gatewayWatchHealth={gatewayWatchHealth}
              />
            ) : view === 'gallery' ? (
              <GallerySurface
                sessions={sessions}
                onOpenChat={openChat}
                onBackToChat={() => handleSelectView('chat')}
              />
            ) : view === 'skills' ? (
              <Skills />
            ) : view === 'memory' ? (
              <MemorySearch
                shortcutQuery={memoryShortcutQuery}
                onBackToChat={() => handleSelectView('chat')}
              />
            ) : (
              <ChatView
                sessionId={sessionId}
                onSessionChange={handleSessionChange}
                initialPrompt={initialPrompt}
                healthReportSnapshot={healthReportSnapshot}
                gatewayWatchHealth={gatewayWatchHealth}
                onOpenMemory={handleOpenMemoryShortcut}
              />
            )}
          </main>
        </div>
      </div>
      <DesktopSettingsDialog
        open={settingsOpen}
        theme={theme}
        onToggleTheme={toggleTheme}
        onClose={closeSettings}
      />
      <KeyboardHelp />
    </div>
  )
}
