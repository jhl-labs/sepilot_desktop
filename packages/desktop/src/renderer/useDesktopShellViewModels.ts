import { useMemo } from 'react'
import type {
  DaemonSessionMeta,
  GatewayTicketWatchRevalidateHealth,
} from '@sepilotd/api-client'
import {
  DESKTOP_NAV_ITEMS,
  getDesktopActiveNav,
  getDesktopGatewayHealthLabel,
  getDesktopGatewayHealthStatus,
  type DesktopSessionRailModel,
  type DesktopView,
} from './desktop-shell'

interface UseDesktopShellViewModelsParams {
  view: DesktopView
  showSidebar: boolean
  theme: 'dark' | 'light'
  settingsOpen: boolean
  status: 'connected' | 'disconnected'
  gatewayWatchHealth: GatewayTicketWatchRevalidateHealth | null
  sessions: DaemonSessionMeta[]
  sessionId?: string
  onSelectView: (view: DesktopView) => void
  onNewChat: () => void
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenSession: (sessionId: string) => void
  onRefreshSessions: () => Promise<void> | void
  onDeleteAllSessions: () => Promise<void>
}

export function useDesktopShellViewModels({
  view,
  showSidebar,
  theme,
  settingsOpen,
  status,
  gatewayWatchHealth,
  sessions,
  sessionId,
  onSelectView,
  onNewChat,
  onToggleSidebar,
  onToggleTheme,
  onOpenSettings,
  onOpenSession,
  onRefreshSessions,
  onDeleteAllSessions,
}: UseDesktopShellViewModelsParams) {
  const activeNav = useMemo(() => getDesktopActiveNav(view), [view])
  const isChatView = view === 'chat'
  const gatewayHealthStatus = useMemo(
    () => getDesktopGatewayHealthStatus(gatewayWatchHealth),
    [gatewayWatchHealth],
  )
  const gatewayHealthLabel = useMemo(
    () => getDesktopGatewayHealthLabel(gatewayHealthStatus),
    [gatewayHealthStatus],
  )
  const gatewayTakeoverMeta = gatewayWatchHealth?.lastStaleHeartbeatTakeoverAt
    ? `Last ${
      new Date(gatewayWatchHealth.lastStaleHeartbeatTakeoverAt).toLocaleTimeString()
    }`
    : null
  const daemonLabel = status === 'connected' ? 'Connected' : 'Reconnecting'

  const sessionRailModel = useMemo<DesktopSessionRailModel>(
    () => ({
      activeNav,
      navItems: DESKTOP_NAV_ITEMS,
      isChatView,
      sidebarCollapsed: !showSidebar,
      theme,
      settingsOpen,
      sessions,
      activeSessionId: sessionId,
      connectionState: {
        daemonStatus: status,
        daemonLabel,
        gatewayStatus: gatewayHealthStatus,
        gatewayLabel: gatewayHealthLabel,
      },
      onSelectView,
      onToggleCollapsed: onToggleSidebar,
      onToggleTheme,
      onOpenSettings,
      onNewSession: onNewChat,
      onOpenSession,
      onRefreshSessions,
      onDeleteAllSessions,
    }),
    [
      activeNav,
      daemonLabel,
      gatewayHealthLabel,
      gatewayHealthStatus,
      isChatView,
      onNewChat,
      onOpenSettings,
      onOpenSession,
      onRefreshSessions,
      onDeleteAllSessions,
      onSelectView,
      onToggleSidebar,
      onToggleTheme,
      sessionId,
      settingsOpen,
      sessions,
      showSidebar,
      status,
      theme,
    ],
  )

  return {
    activeNav,
    isChatView,
    gatewayHealthStatus,
    gatewayTakeoverMeta,
    sessionRailModel,
  }
}
