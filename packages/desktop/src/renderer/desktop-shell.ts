import type {
  DaemonSessionMeta,
  GatewayTicketWatchRevalidateHealth,
} from '@sepilotd/api-client'

export type DesktopView =
  | 'inbox'
  | 'chat'
  | 'dashboard'
  | 'gallery'
  | 'skills'
  | 'memory'
  | 'settings'

export interface DesktopNavItem {
  key: DesktopView
  label: string
  description: string
  shortLabel: string
  section: 'primary' | 'secondary'
}

export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  {
    key: 'chat',
    label: 'Chat',
    description: 'Primary conversation surface',
    shortLabel: 'CH',
    section: 'primary',
  },
  {
    key: 'inbox',
    label: 'Inbox',
    description: 'Suggested entry points',
    shortLabel: 'IB',
    section: 'primary',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Recent activity and sessions',
    shortLabel: 'DB',
    section: 'primary',
  },
  {
    key: 'memory',
    label: 'Documents',
    description: 'Indexed sources and retrieval',
    shortLabel: 'DOC',
    section: 'primary',
  },
  {
    key: 'gallery',
    label: 'Gallery',
    description: 'Saved artifacts and outputs',
    shortLabel: 'GL',
    section: 'primary',
  },
  {
    key: 'skills',
    label: 'Skills',
    description: 'Installed capabilities',
    shortLabel: 'SK',
    section: 'secondary',
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Theme and daemon preferences',
    shortLabel: 'ST',
    section: 'secondary',
  },
]

export type DesktopGatewayHealthStatus =
  | 'connected'
  | 'degraded'
  | 'disconnected'

interface DesktopConnectionState {
  daemonStatus: 'connected' | 'disconnected'
  daemonLabel: string
  gatewayStatus: DesktopGatewayHealthStatus
  gatewayLabel: string
}

export interface DesktopSessionRailModel {
  activeNav?: DesktopNavItem
  navItems: DesktopNavItem[]
  isChatView: boolean
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'
  settingsOpen: boolean
  sessions: DaemonSessionMeta[]
  activeSessionId?: string
  connectionState: DesktopConnectionState
  onSelectView: (view: DesktopView) => void
  onToggleCollapsed: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onNewSession: () => void
  onOpenSession: (sessionId: string) => void
  onRefreshSessions: () => Promise<void> | void
  onDeleteAllSessions: () => Promise<void>
}

export function getDesktopActiveNav(
  view: DesktopView,
): DesktopNavItem | undefined {
  return DESKTOP_NAV_ITEMS.find((item) => item.key === view)
}

export function getDesktopGatewayHealthStatus(
  gatewayWatchHealth: GatewayTicketWatchRevalidateHealth | null,
): DesktopGatewayHealthStatus {
  if (!gatewayWatchHealth) {
    return 'disconnected'
  }

  return gatewayWatchHealth.recentStaleHeartbeatTakeover
    || gatewayWatchHealth.status === 'degraded'
    ? 'degraded'
    : 'connected'
}

export function getDesktopGatewayHealthLabel(
  gatewayHealthStatus: DesktopGatewayHealthStatus,
): string {
  if (gatewayHealthStatus === 'connected') {
    return 'Gateway Stable'
  }
  if (gatewayHealthStatus === 'degraded') {
    return 'Gateway Degraded'
  }
  return 'Gateway Offline'
}
