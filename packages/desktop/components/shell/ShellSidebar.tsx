'use client'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Activity,
  Circle,
  Info,
  CopyPlus,
  Download,
  Edit3,
  Folder,
  KeyRound,
  LoaderCircle,
  Monitor,
  Network,
  Plus,
  Play,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Star,
  TerminalSquare,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import {
  useShellStore,
  type ShellCommandHistoryItem,
  type ShellProfile,
  type ShellTab,
} from '@/lib/store/shell-store'
import { cn } from '@/lib/utils/cn'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import type { DesktopShellDoctorReport } from '@sepilotd/api-client'

type ProfileDialogKind = 'local' | 'ssh'
type ShellSidebarTab = 'info' | 'profiles' | 'sessions' | 'activity' | 'snippets'

interface ProfileFormState {
  id?: string
  kind: ProfileDialogKind
  title: string
  host: string
  user: string
  port: string
  cwd: string
  startupCommand: string
  identityFile: string
  jumpHost: string
  proxyCommand: string
  localForwards: string
  remoteEnv: string
  keepAlive: boolean
  agentForwarding: boolean
  x11Forwarding: boolean
  compression: boolean
  terminalType: string
  encoding: string
  tags: string
  color: string
  groupId: string
  favorite: boolean
  reconnectMode: 'never' | 'on-exit' | 'always'
  reconnectDelayMs: string
  restoreOnLaunch: boolean
}

const DEFAULT_COLOR = '#38bdf8'

function emptyProfileForm(kind: ProfileDialogKind): ProfileFormState {
  return {
    kind,
    title: '',
    host: '',
    user: '',
    port: '22',
    cwd: '',
    startupCommand: '',
    identityFile: '',
    jumpHost: '',
    proxyCommand: '',
    localForwards: '',
    remoteEnv: '',
    keepAlive: true,
    agentForwarding: false,
    x11Forwarding: false,
    compression: false,
    terminalType: 'xterm-256color',
    encoding: 'utf-8',
    tags: '',
    color: DEFAULT_COLOR,
    groupId: 'default',
    favorite: false,
    reconnectMode: 'never',
    reconnectDelayMs: '1500',
    restoreOnLaunch: false,
  }
}

function profileToForm(profile: ShellProfile): ProfileFormState {
  return {
    id: profile.id,
    kind: profile.kind,
    title: profile.title,
    host: profile.ssh?.host ?? '',
    user: profile.ssh?.user ?? '',
    port: String(profile.ssh?.port ?? 22),
    cwd: profile.cwd ?? '',
    startupCommand: profile.startupCommand ?? '',
    identityFile: profile.ssh?.identityFile ?? '',
    jumpHost: profile.ssh?.jumpHost ?? '',
    proxyCommand: profile.ssh?.proxyCommand ?? '',
    localForwards: profile.ssh?.localForwards?.join('\n') ?? '',
    remoteEnv: profile.ssh?.remoteEnv?.join('\n') ?? '',
    keepAlive: profile.ssh?.keepAlive ?? true,
    agentForwarding: profile.ssh?.agentForwarding ?? false,
    x11Forwarding: profile.ssh?.x11Forwarding ?? false,
    compression: profile.ssh?.compression ?? false,
    terminalType: profile.ssh?.terminalType ?? profile.terminalType ?? 'xterm-256color',
    encoding: profile.ssh?.encoding ?? profile.encoding ?? 'utf-8',
    tags: profile.tags.join(', '),
    color: profile.color || DEFAULT_COLOR,
    groupId: profile.groupId ?? 'default',
    favorite: profile.favorite,
    reconnectMode: profile.reconnectMode ?? 'never',
    reconnectDelayMs: String(profile.reconnectDelayMs ?? 1500),
    restoreOnLaunch: profile.restoreOnLaunch,
  }
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(65_535, parsed)) : 22
}

function statusClass(status: ShellTab['status']): string {
  switch (status) {
    case 'connected':
      return 'text-emerald-500'
    case 'connecting':
      return 'text-amber-500'
    case 'error':
      return 'text-destructive'
    case 'exited':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function statusLabel(status: ShellTab['status']): string {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'connecting':
      return 'connecting'
    case 'error':
      return 'error'
    case 'exited':
      return 'exited'
    default:
      return 'ready'
  }
}

function profileSubtitle(profile: ShellProfile): string {
  if (profile.kind === 'ssh' && profile.ssh) {
    const target = profile.ssh.user ? `${profile.ssh.user}@${profile.ssh.host}` : profile.ssh.host
    const forwards = profile.ssh.localForwards?.length
      ? ` · ${profile.ssh.localForwards.length} tunnel`
      : ''
    return `${target}:${profile.ssh.port}${forwards}`
  }
  return profile.cwd || 'Local shell'
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatActivityTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toLocaleString()
    : '없음'
}

function formatShellTarget(tab: ShellTab | null): string {
  if (!tab) return '없음'
  if (tab.kind === 'ssh' && tab.ssh) {
    const target = tab.ssh.user ? `${tab.ssh.user}@${tab.ssh.host}` : tab.ssh.host
    return `${target}:${tab.ssh.port}`
  }
  return tab.cwd || 'Local shell'
}

function doctorStatusClass(status: DesktopShellDoctorReport['checks'][number]['status']): string {
  if (status === 'pass') return 'border-emerald-500/30 text-emerald-600'
  if (status === 'warn') return 'border-amber-500/30 text-amber-600'
  return 'border-destructive/30 text-destructive'
}

function commandForHistory(item: ShellCommandHistoryItem): string {
  return item.command.endsWith('\n') || item.command.endsWith('\r')
    ? item.command
    : `${item.command}\r`
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 border-b py-1.5 last:border-b-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-xs text-foreground">{value || '없음'}</dd>
    </div>
  )
}

export function ShellSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const tabs = useShellStore((state) => state.tabs)
  const activeId = useShellStore((state) => state.activeId)
  const profiles = useShellStore((state) => state.profiles)
  const groups = useShellStore((state) => state.groups)
  const snippets = useShellStore((state) => state.snippets)
  const activity = useShellStore((state) => state.activity)
  const commandHistory = useShellStore((state) => state.commandHistory)
  const profileSearch = useShellStore((state) => state.profileSearch)
  const activeGroupId = useShellStore((state) => state.activeGroupId)
  const profileSort = useShellStore((state) => state.profileSort)
  const selectedProfileIds = useShellStore((state) => state.selectedProfileIds)
  const addLocalTab = useShellStore((state) => state.addLocalTab)
  const addTabFromProfile = useShellStore((state) => state.addTabFromProfile)
  const removeTab = useShellStore((state) => state.removeTab)
  const setActive = useShellStore((state) => state.setActive)
  const setProfileSearch = useShellStore((state) => state.setProfileSearch)
  const setActiveGroup = useShellStore((state) => state.setActiveGroup)
  const setProfileSort = useShellStore((state) => state.setProfileSort)
  const toggleProfileSelection = useShellStore((state) => state.toggleProfileSelection)
  const clearProfileSelection = useShellStore((state) => state.clearProfileSelection)
  const addGroup = useShellStore((state) => state.addGroup)
  const updateGroup = useShellStore((state) => state.updateGroup)
  const removeGroup = useShellStore((state) => state.removeGroup)
  const addProfile = useShellStore((state) => state.addProfile)
  const updateProfile = useShellStore((state) => state.updateProfile)
  const removeProfile = useShellStore((state) => state.removeProfile)
  const removeProfiles = useShellStore((state) => state.removeProfiles)
  const duplicateProfile = useShellStore((state) => state.duplicateProfile)
  const toggleFavorite = useShellStore((state) => state.toggleFavorite)
  const moveProfilesToGroup = useShellStore((state) => state.moveProfilesToGroup)
  const exportLibrary = useShellStore((state) => state.exportLibrary)
  const importLibrary = useShellStore((state) => state.importLibrary)
  const importSshConfig = useShellStore((state) => state.importSshConfig)
  const recordActivity = useShellStore((state) => state.recordActivity)
  const clearActivity = useShellStore((state) => state.clearActivity)
  const clearCommandHistory = useShellStore((state) => state.clearCommandHistory)
  const addSnippet = useShellStore((state) => state.addSnippet)
  const removeSnippet = useShellStore((state) => state.removeSnippet)
  const [profileForm, setProfileForm] = useState<ProfileFormState | null>(null)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [renameGroupTitle, setRenameGroupTitle] = useState('')
  const [snippetTitle, setSnippetTitle] = useState('')
  const [snippetCommand, setSnippetCommand] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [doctorReport, setDoctorReport] = useState<DesktopShellDoctorReport | null>(null)
  const [doctorBusyId, setDoctorBusyId] = useState<string | null>(null)
  const [activePanelTab, setActivePanelTab] = useState<ShellSidebarTab>('profiles')
  useModalViewportLock(Boolean(profileForm) || Boolean(doctorReport))
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const sshConfigInputRef = useRef<HTMLInputElement>(null)

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeId) ?? null,
    [activeId, tabs],
  )
  const activeProfile = useMemo(
    () =>
      activeTab?.profileId
        ? profiles.find((profile) => profile.id === activeTab.profileId) ?? null
        : null,
    [activeTab?.profileId, profiles],
  )
  const activeTabActivity = useMemo(
    () =>
      activeTab
        ? activity
            .filter(
              (item) =>
                item.tabId === activeTab.id ||
                (activeTab.profileId && item.profileId === activeTab.profileId),
            )
            .slice(0, 3)
        : [],
    [activeTab, activity],
  )

  useEffect(() => {
    if (profileForm) {
      requestAnimationFrame(() => firstFieldRef.current?.focus())
    }
  }, [profileForm?.id, profileForm?.kind])

  const activeCustomGroup = useMemo(
    () =>
      activeGroupId && !['default', 'favorites', 'recent'].includes(activeGroupId)
        ? groups.find((group) => group.id === activeGroupId)
        : null,
    [activeGroupId, groups],
  )

  useEffect(() => {
    setRenameGroupTitle(activeCustomGroup?.title ?? '')
  }, [activeCustomGroup?.id, activeCustomGroup?.title])

  const canReadDefaultSshConfig =
    typeof window !== 'undefined' && Boolean(window.sepilot?.shell.readSshConfig)

  const filteredProfiles = useMemo(() => {
    const query = profileSearch.trim().toLowerCase()
    return profiles
      .filter((profile) => {
        if (activeGroupId === 'favorites' && !profile.favorite) return false
        if (activeGroupId === 'recent' && !profile.lastConnectedAt) return false
        if (
          activeGroupId &&
          activeGroupId !== 'favorites' &&
          activeGroupId !== 'recent' &&
          profile.groupId !== activeGroupId
        ) {
          return false
        }
        if (!query) return true
        const haystack = [
          profile.title,
          profile.kind,
          profile.cwd,
          profile.ssh?.host,
          profile.ssh?.user,
          profile.ssh?.jumpHost,
          profile.tags.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => {
        if (profileSort === 'title') return a.title.localeCompare(b.title)
        if (profileSort === 'host') {
          const left = a.ssh?.host ?? a.cwd ?? a.title
          const right = b.ssh?.host ?? b.cwd ?? b.title
          return left.localeCompare(right)
        }
        return (b.lastConnectedAt ?? b.updatedAt) - (a.lastConnectedAt ?? a.updatedAt)
      })
  }, [activeGroupId, profiles, profileSearch, profileSort])

  function saveProfile(connectAfterSave: boolean) {
    if (!profileForm) return
    const title =
      profileForm.title.trim() ||
      (profileForm.kind === 'ssh'
        ? profileForm.user.trim()
          ? `${profileForm.user.trim()}@${profileForm.host.trim()}`
          : profileForm.host.trim()
        : 'Local Shell')
    if (profileForm.kind === 'ssh' && !profileForm.host.trim()) return

    const input = {
      title,
      kind: profileForm.kind,
      cwd: profileForm.cwd.trim(),
      startupCommand: profileForm.startupCommand.trim(),
      terminalType: profileForm.terminalType.trim() || undefined,
      encoding: profileForm.encoding.trim() || undefined,
      ssh:
        profileForm.kind === 'ssh'
          ? {
              host: profileForm.host.trim(),
              user: profileForm.user.trim() || undefined,
              port: parsePort(profileForm.port),
              identityFile: profileForm.identityFile.trim() || undefined,
              jumpHost: profileForm.jumpHost.trim() || undefined,
              proxyCommand: profileForm.proxyCommand.trim() || undefined,
              localForwards: splitList(profileForm.localForwards),
              remoteEnv: splitList(profileForm.remoteEnv),
              keepAlive: profileForm.keepAlive,
              agentForwarding: profileForm.agentForwarding,
              x11Forwarding: profileForm.x11Forwarding,
              compression: profileForm.compression,
              terminalType: profileForm.terminalType.trim() || undefined,
              encoding: profileForm.encoding.trim() || undefined,
            }
          : undefined,
      tags: splitList(profileForm.tags),
      color: profileForm.color.trim() || DEFAULT_COLOR,
      groupId: profileForm.groupId,
      favorite: profileForm.favorite,
      reconnectMode: profileForm.reconnectMode,
      reconnectDelayMs: Number.parseInt(profileForm.reconnectDelayMs, 10),
      restoreOnLaunch: profileForm.restoreOnLaunch,
    }

    let profileId = profileForm.id
    if (profileId) {
      updateProfile(profileId, input)
    } else {
      profileId = addProfile(input)
    }
    setProfileForm(null)
    if (connectAfterSave && profileId) {
      addTabFromProfile(profileId)
    }
  }

  function connectProfile(profile: ShellProfile) {
    addTabFromProfile(profile.id)
  }

  function sendShellAction(tabId: string | null, action: unknown) {
    if (!tabId || typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('sepilot:shell/action', {
        detail: { tabId, action },
      }),
    )
  }

  function runHistoryCommand(item: ShellCommandHistoryItem) {
    sendShellAction(activeId, { kind: 'send', data: commandForHistory(item) })
  }

  function createSnippet() {
    const command = snippetCommand.trim()
    if (!command) return
    addSnippet({
      title: snippetTitle.trim() || command.slice(0, 32),
      command,
    })
    setSnippetTitle('')
    setSnippetCommand('')
  }

  function exportShellLibrary() {
    downloadJson(`sepilotd-shell-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary())
  }

  async function importShellLibraryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const ok = importLibrary(await file.text())
    if (!ok) window.alert('Shell backup file could not be imported.')
  }

  function applySshConfig(content: string) {
    const count = importSshConfig(content)
    setImportStatus(count > 0 ? `Imported ${count} SSH profile(s).` : 'No new SSH profiles found.')
  }

  async function importDefaultSshConfig() {
    const content = await window.sepilot?.shell.readSshConfig?.()
    if (!content) {
      setImportStatus('~/.ssh/config was not found or could not be read.')
      return
    }
    applySshConfig(content)
  }

  async function importSshConfigFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    applySshConfig(await file.text())
  }

  async function runDoctor(profile: ShellProfile) {
    if (profile.kind !== 'ssh' || !profile.ssh || !window.sepilot?.shell.diagnose) return
    setDoctorBusyId(profile.id)
    try {
      const report = await window.sepilot.shell.diagnose({
        kind: 'ssh',
        ssh: profile.ssh,
        terminalType: profile.terminalType,
        encoding: profile.encoding,
      })
      setDoctorReport(report)
      recordActivity({
        kind: 'diagnostic',
        title: 'SSH Doctor completed',
        message: profile.title,
        severity: report.checks.some((check) => check.status === 'fail')
          ? 'error'
          : report.checks.some((check) => check.status === 'warn')
            ? 'warning'
            : 'success',
        profileId: profile.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDoctorReport({
        target: profile.title,
        generatedAt: new Date().toISOString(),
        checks: [
          {
            id: 'doctor-error',
            label: 'Doctor',
            status: 'fail',
            message,
          },
        ],
      })
    } finally {
      setDoctorBusyId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="justify-start gap-2"
            onClick={() => addLocalTab()}
          >
            <Monitor className="h-4 w-4" />
            Local
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => setProfileForm(emptyProfileForm('ssh'))}
          >
            <Server className="h-4 w-4" />
            SSH
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {activePanelTab === 'info' ? (
          <section
            id="shell-sidebar-panel-info"
            role="tabpanel"
            aria-labelledby="shell-sidebar-tab-info"
            className="space-y-3"
          >
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              세션 정보
            </div>
            {!activeTab ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-muted-foreground">
                <Info className="mb-2 h-8 w-8 opacity-60" />
                <p className="text-sm font-medium text-foreground">활성 터미널 세션이 없습니다</p>
                <p className="mt-1 text-xs">Local 또는 SSH 프로필로 세션을 시작하세요.</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-background/70 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {activeTab.kind === 'ssh' ? (
                      <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{activeTab.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatShellTarget(activeTab)}
                      </div>
                    </div>
                  </div>
                </div>

                <dl className="rounded-md border px-3 py-1">
                  <InfoRow label="상태" value={statusLabel(activeTab.status)} />
                  <InfoRow label="종류" value={activeTab.kind === 'ssh' ? 'SSH' : 'Local'} />
                  <InfoRow label="대상" value={formatShellTarget(activeTab)} />
                  <InfoRow label="작업 폴더" value={activeTab.cwd || '기본값'} />
                  <InfoRow
                    label="세션 ID"
                    value={
                      activeTab.sessionId ? (
                        <span className="font-mono">{activeTab.sessionId}</span>
                      ) : (
                        '아직 연결되지 않음'
                      )
                    }
                  />
                  <InfoRow label="PID" value={activeTab.pid ? String(activeTab.pid) : '없음'} />
                  <InfoRow label="프로필" value={activeProfile?.title ?? '임시 세션'} />
                  <InfoRow label="생성 시각" value={formatDateTime(activeTab.createdAt)} />
                  <InfoRow label="터미널" value={activeTab.terminalType || '기본값'} />
                  <InfoRow label="인코딩" value={activeTab.encoding || '기본값'} />
                  <InfoRow label="시작 명령" value={activeTab.startupCommand || '없음'} />
                  <InfoRow
                    label="재접속"
                    value={
                      activeTab.reconnectMode && activeTab.reconnectMode !== 'never'
                        ? `${activeTab.reconnectMode} · ${activeTab.reconnectDelayMs ?? 1500}ms`
                        : '사용 안 함'
                    }
                  />
                  <InfoRow label="복원" value={activeTab.restoreOnLaunch ? '켜짐' : '꺼짐'} />
                  <InfoRow label="진단" value={activeTab.diagnostic || activeTab.error || '없음'} />
                </dl>

                {activeTab.kind === 'ssh' && activeTab.ssh ? (
                  <dl className="rounded-md border px-3 py-1">
                    <InfoRow label="Host" value={activeTab.ssh.host} />
                    <InfoRow label="User" value={activeTab.ssh.user || '기본값'} />
                    <InfoRow label="Port" value={String(activeTab.ssh.port)} />
                    <InfoRow label="Identity" value={activeTab.ssh.identityFile || '없음'} />
                    <InfoRow label="Jump" value={activeTab.ssh.jumpHost || '없음'} />
                    <InfoRow label="Proxy" value={activeTab.ssh.proxyCommand || '없음'} />
                    <InfoRow
                      label="Tunnels"
                      value={
                        activeTab.ssh.localForwards?.length
                          ? activeTab.ssh.localForwards.join(', ')
                          : '없음'
                      }
                    />
                    <InfoRow
                      label="Remote env"
                      value={
                        activeTab.ssh.remoteEnv?.length
                          ? activeTab.ssh.remoteEnv.join(', ')
                          : '없음'
                      }
                    />
                    <InfoRow
                      label="옵션"
                      value={[
                        activeTab.ssh.keepAlive ? 'KeepAlive' : null,
                        activeTab.ssh.agentForwarding ? 'AgentForward' : null,
                        activeTab.ssh.x11Forwarding ? 'X11' : null,
                        activeTab.ssh.compression ? 'Compression' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || '없음'}
                    />
                  </dl>
                ) : null}

                <section className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    최근 활동
                  </div>
                  {activeTabActivity.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                      이 세션의 활동 기록이 아직 없습니다
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {activeTabActivity.map((item) => (
                        <div key={item.id} className="rounded-md border px-2 py-1.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{item.title}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatActivityTime(item.at)}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        ) : null}

        {activePanelTab === 'profiles' ? (
          <section
            id="shell-sidebar-panel-profiles"
            role="tabpanel"
            aria-labelledby="shell-sidebar-tab-profiles"
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Profiles
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Export shell backup"
                  aria-label="export shell backup"
                  onClick={exportShellLibrary}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Import shell backup"
                  aria-label="import shell backup"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="New local profile"
                  aria-label="new local shell profile"
                  onClick={() => setProfileForm(emptyProfileForm('local'))}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="New SSH profile"
                  aria-label="new ssh profile"
                  onClick={() => setProfileForm(emptyProfileForm('ssh'))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border px-2 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                value={profileSearch}
                onChange={(event) => setProfileSearch(event.target.value)}
                placeholder="Search hosts"
                aria-label="search shell profiles"
              />
            </label>
            <div className="grid grid-cols-2 gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void importDefaultSshConfig()}
                disabled={!canReadDefaultSshConfig}
              >
                <Download className="h-4 w-4" />
                ~/.ssh/config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sshConfigInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                SSH config
              </Button>
            </div>
            {importStatus ? (
              <div className="text-xs text-muted-foreground">{importStatus}</div>
            ) : null}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                { id: null, title: 'All' },
                { id: 'favorites', title: 'Favorites' },
                { id: 'recent', title: 'Recent' },
                ...groups.map((group) => ({ id: group.id, title: group.title })),
              ].map((group) => (
                <button
                  key={group.id ?? 'all'}
                  type="button"
                  className={cn(
                    'shrink-0 rounded-md border px-2 py-1 text-xs',
                    activeGroupId === group.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.title}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-1">
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={profileSort}
                onChange={(event) => setProfileSort(event.target.value as typeof profileSort)}
                aria-label="sort shell profiles"
              >
                <option value="recent">recent</option>
                <option value="title">title</option>
                <option value="host">host</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const title = newGroupTitle.trim()
                  if (!title) return
                  addGroup(title)
                  setNewGroupTitle('')
                }}
                disabled={!newGroupTitle.trim()}
              >
                <Folder className="h-4 w-4" />
                Add
              </Button>
            </div>
            <Input
              value={newGroupTitle}
              onChange={(event) => setNewGroupTitle(event.target.value)}
              placeholder="New group"
              aria-label="new shell profile group"
            />
            {activeCustomGroup ? (
              <div className="grid gap-1 rounded-md border p-2">
                <Input
                  value={renameGroupTitle}
                  onChange={(event) => setRenameGroupTitle(event.target.value)}
                  placeholder="Group name"
                  aria-label="rename shell profile group"
                />
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateGroup(activeCustomGroup.id, renameGroupTitle)}
                    disabled={!renameGroupTitle.trim()}
                  >
                    Save group
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeGroup(activeCustomGroup.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}
            {selectedProfileIds.length > 0 ? (
              <div className="grid gap-1 rounded-md border bg-muted/30 p-2 text-xs">
                <div className="font-medium">{selectedProfileIds.length} selected</div>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeProfiles(selectedProfileIds)}
                  >
                    Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearProfileSelection}>
                    Clear
                  </Button>
                </div>
                <select
                  className="h-8 rounded-md border bg-background px-2"
                  value=""
                  onChange={(event) => {
                    moveProfilesToGroup(selectedProfileIds, event.target.value || null)
                  }}
                  aria-label="move selected shell profiles"
                >
                  <option value="">Move to...</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {filteredProfiles.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                저장된 프로필이 없습니다
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProfiles.map((profile) => {
                  const Icon = profile.kind === 'ssh' ? Server : Monitor
                  return (
                    <div
                      key={profile.id}
                      className="group rounded-md border bg-background/70 p-2 transition-colors hover:bg-accent"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-2"
                          checked={selectedProfileIds.includes(profile.id)}
                          onChange={() => toggleProfileSelection(profile.id)}
                          aria-label={`select ${profile.title}`}
                        />
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                          style={{ color: profile.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => connectProfile(profile)}
                        >
                          <div className="truncate text-sm font-medium">{profile.title}</div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {profileSubtitle(profile)}
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={profile.favorite ? 'Unfavorite' : 'Favorite'}
                          aria-label={`${profile.favorite ? 'unfavorite' : 'favorite'} ${profile.title}`}
                          onClick={() => toggleFavorite(profile.id)}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              profile.favorite && 'fill-current text-amber-400',
                            )}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Connect"
                          aria-label={`connect ${profile.title}`}
                          onClick={() => connectProfile(profile)}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 gap-1 overflow-hidden">
                          {profile.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                          {profile.ssh?.identityFile ? (
                            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-muted-foreground">
                              <KeyRound className="h-3 w-3" />
                            </span>
                          ) : null}
                          {profile.ssh?.jumpHost ? (
                            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-muted-foreground">
                              <Network className="h-3 w-3" />
                            </span>
                          ) : null}
                          {profile.ssh?.keepAlive ? (
                            <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-muted-foreground">
                              <ShieldCheck className="h-3 w-3" />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                          {profile.kind === 'ssh' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Run SSH Doctor"
                              aria-label={`run ssh doctor for ${profile.title}`}
                              onClick={() => void runDoctor(profile)}
                              disabled={doctorBusyId === profile.id}
                            >
                              {doctorBusyId === profile.id ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Edit"
                            aria-label={`edit ${profile.title}`}
                            onClick={() => setProfileForm(profileToForm(profile))}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Duplicate"
                            aria-label={`duplicate ${profile.title}`}
                            onClick={() => duplicateProfile(profile.id)}
                          >
                            <CopyPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            aria-label={`delete ${profile.title}`}
                            onClick={() => removeProfile(profile.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}

        {activePanelTab === 'sessions' ? (
          <section
            id="shell-sidebar-panel-sessions"
            role="tabpanel"
            aria-labelledby="shell-sidebar-tab-sessions"
            className="space-y-2"
          >
            <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
              Sessions
            </div>
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-muted-foreground">
                <TerminalSquare className="mb-2 h-8 w-8 opacity-60" />
                <p className="text-sm font-medium text-foreground">터미널 탭이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tabs.map((tab) => {
                  const selected = tab.id === activeId
                  const Icon = tab.kind === 'ssh' ? Server : Monitor
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        'group flex items-center gap-1 rounded-md transition-colors hover:bg-accent',
                        selected && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-3 py-2 text-left"
                        onClick={() => setActive(tab.id)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate text-sm font-medium">{tab.title}</span>
                        </div>
                        <div
                          className={cn(
                            'mt-1 flex items-center gap-1 text-[11px]',
                            selected ? 'text-accent-foreground/75' : 'text-muted-foreground',
                          )}
                        >
                          {tab.status === 'connecting' ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                          ) : (
                            <Circle
                              className={cn('h-2.5 w-2.5 fill-current', statusClass(tab.status))}
                            />
                          )}
                          <span>{statusLabel(tab.status)}</span>
                        </div>
                        {tab.diagnostic ? (
                          <div className="mt-1 truncate text-[11px] text-amber-500">
                            {tab.diagnostic}
                          </div>
                        ) : null}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-1 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="close shell tab"
                        onClick={() => removeTab(tab.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}

        {activePanelTab === 'activity' ? (
          <section
            id="shell-sidebar-panel-activity"
            role="tabpanel"
            aria-labelledby="shell-sidebar-tab-activity"
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Activity
              </div>
              {activity.length > 0 ? (
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={clearActivity}>
                  Clear
                </Button>
              ) : null}
            </div>
            {activity.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                아직 기록된 터미널 이벤트가 없습니다
              </div>
            ) : (
              <div className="space-y-1">
                {activity.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-md border px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'truncate font-medium',
                          item.severity === 'error'
                            ? 'text-destructive'
                            : item.severity === 'warning'
                              ? 'text-amber-600'
                              : item.severity === 'success'
                                ? 'text-emerald-600'
                                : 'text-foreground',
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatActivityTime(item.at)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activePanelTab === 'snippets' ? (
          <div
            id="shell-sidebar-panel-snippets"
            role="tabpanel"
            aria-labelledby="shell-sidebar-tab-snippets"
          >
            <section className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Snippets
              </div>
              <div className="grid gap-1.5">
                <Input
                  value={snippetTitle}
                  onChange={(event) => setSnippetTitle(event.target.value)}
                  placeholder="Title"
                  aria-label="shell snippet title"
                />
                <Input
                  value={snippetCommand}
                  onChange={(event) => setSnippetCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') createSnippet()
                  }}
                  placeholder="Command"
                  aria-label="shell snippet command"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createSnippet}
                  disabled={!snippetCommand.trim()}
                >
                  <Save className="h-4 w-4" />
                  저장
                </Button>
              </div>
              <div className="space-y-1">
                {snippets.slice(0, 8).map((snippet) => (
                  <div
                    key={snippet.id}
                    className="group flex items-center gap-1 rounded-md border px-2 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{snippet.title}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {snippet.command}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`delete ${snippet.title}`}
                      onClick={() => removeSnippet(snippet.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  Command History
                </div>
                {commandHistory.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={clearCommandHistory}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              {commandHistory.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                  스니펫, 붙여넣기, startup command 실행 기록이 여기에 표시됩니다
                </div>
              ) : (
                <div className="space-y-1">
                  {commandHistory.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => runHistoryCommand(item)}
                      disabled={!activeId}
                    >
                      <div className="truncate font-mono">{item.command}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {item.title ?? 'terminal'} · {formatActivityTime(item.at)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t bg-background/95">
        <div className="grid grid-cols-5 gap-1 p-1.5" role="tablist" aria-label="Shell panels">
          {[
            { id: 'info' as const, label: 'Info', Icon: Info, count: 0 },
            { id: 'profiles' as const, label: 'Profiles', Icon: Server, count: profiles.length },
            {
              id: 'sessions' as const,
              label: 'Sessions',
              Icon: TerminalSquare,
              count: tabs.length,
            },
            { id: 'activity' as const, label: 'Activity', Icon: Activity, count: activity.length },
            {
              id: 'snippets' as const,
              label: 'Commands',
              Icon: Save,
              count: snippets.length + commandHistory.length,
            },
          ].map((tab) => {
            const selected = activePanelTab === tab.id
            const TabIcon = tab.Icon

            return (
              <button
                key={tab.id}
                id={`shell-sidebar-tab-${tab.id}`}
                type="button"
                role="tab"
                className={cn(
                  'relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                  selected && 'bg-accent text-accent-foreground',
                )}
                onClick={() => setActivePanelTab(tab.id)}
                title={tab.label}
                aria-label={tab.label}
                aria-controls={`shell-sidebar-panel-${tab.id}`}
                aria-selected={selected}
              >
                <TabIcon className="h-4 w-4" />
                <span className="max-w-full truncate px-1">{tab.label}</span>
                {tab.count > 0 ? (
                  <span
                    className={cn(
                      'absolute right-1 top-1 rounded-full border bg-background px-1 text-[9px] leading-3 text-muted-foreground',
                      selected && 'border-accent-foreground/30 text-accent-foreground',
                    )}
                  >
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {}
        <div className="grid grid-cols-2 gap-1 border-t p-1.5">
          <ThemeToggle className="h-8 w-full" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-full"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {profileForm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
          onClick={() => setProfileForm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shell-profile-dialog-title"
            aria-describedby="shell-profile-dialog-description"
            className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-background p-4 shadow-lg sm:max-h-[calc(100dvh-2rem)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b pb-3">
              <div>
                <h2 id="shell-profile-dialog-title" className="text-lg font-semibold">
                  {profileForm.kind === 'ssh' ? 'SSH 프로필' : '로컬 프로필'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {profileForm.id ? '프로필 수정' : '새 프로필'}
                </p>
                <p
                  id="shell-profile-dialog-description"
                  className="mt-1 max-w-md text-xs text-muted-foreground"
                >
                  SSH 프로필은 host, path, 옵션만 저장하며 비밀번호나 개인키 본문은 저장하지
                  않습니다.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="프로필 대화상자 닫기"
                onClick={() => setProfileForm(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div
              role="region"
              aria-label="프로필 설정"
              className="mt-3 grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
            >
              <label className="grid gap-1.5 text-sm">
                Name
                <Input
                  ref={firstFieldRef}
                  value={profileForm.title}
                  onChange={(event) =>
                    setProfileForm((curr) => (curr ? { ...curr, title: event.target.value } : curr))
                  }
                  placeholder={profileForm.kind === 'ssh' ? 'production' : 'repo shell'}
                />
              </label>
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <label className="grid gap-1.5 text-sm">
                  Group
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    value={profileForm.groupId}
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr ? { ...curr, groupId: event.target.value } : curr,
                      )
                    }
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={profileForm.favorite}
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr ? { ...curr, favorite: event.target.checked } : curr,
                      )
                    }
                  />
                  Favorite
                </label>
              </div>

              {profileForm.kind === 'local' ? (
                <>
                  <label className="grid gap-1.5 text-sm">
                    Working directory
                    <Input
                      value={profileForm.cwd}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, cwd: event.target.value } : curr,
                        )
                      }
                      placeholder="/workspace/project"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Startup command
                    <Input
                      value={profileForm.startupCommand}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, startupCommand: event.target.value } : curr,
                        )
                      }
                      placeholder="nvm use"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-sm">
                      Terminal type
                      <Input
                        value={profileForm.terminalType}
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, terminalType: event.target.value } : curr,
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      Encoding
                      <Input
                        value={profileForm.encoding}
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, encoding: event.target.value } : curr,
                          )
                        }
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <label className="grid gap-1.5 text-sm">
                      Host
                      <Input
                        value={profileForm.host}
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, host: event.target.value } : curr,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveProfile(true)
                          if (event.key === 'Escape') setProfileForm(null)
                        }}
                        placeholder="example.com"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      Port
                      <Input
                        value={profileForm.port}
                        inputMode="numeric"
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, port: event.target.value } : curr,
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-sm">
                    User
                    <Input
                      value={profileForm.user}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, user: event.target.value } : curr,
                        )
                      }
                      placeholder="ubuntu"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Identity file
                    <Input
                      value={profileForm.identityFile}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, identityFile: event.target.value } : curr,
                        )
                      }
                      placeholder="~/.ssh/id_ed25519"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Jump host
                    <Input
                      value={profileForm.jumpHost}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, jumpHost: event.target.value } : curr,
                        )
                      }
                      placeholder="bastion"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Proxy command
                    <Input
                      value={profileForm.proxyCommand}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, proxyCommand: event.target.value } : curr,
                        )
                      }
                      placeholder="nc -x proxy:1080 %h %p"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Local forwards
                    <textarea
                      className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={profileForm.localForwards}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, localForwards: event.target.value } : curr,
                        )
                      }
                      placeholder="8080:127.0.0.1:80"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Remote env
                    <textarea
                      className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={profileForm.remoteEnv}
                      onChange={(event) =>
                        setProfileForm((curr) =>
                          curr ? { ...curr, remoteEnv: event.target.value } : curr,
                        )
                      }
                      placeholder="LANG=en_US.UTF-8"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-sm">
                      Terminal type
                      <Input
                        value={profileForm.terminalType}
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, terminalType: event.target.value } : curr,
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      Encoding
                      <Input
                        value={profileForm.encoding}
                        onChange={(event) =>
                          setProfileForm((curr) =>
                            curr ? { ...curr, encoding: event.target.value } : curr,
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      ['Keepalive', 'keepAlive'],
                      ['Agent forwarding', 'agentForwarding'],
                      ['X11 forwarding', 'x11Forwarding'],
                      ['Compression', 'compression'],
                    ].map(([label, key]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(profileForm[key as keyof ProfileFormState])}
                          onChange={(event) =>
                            setProfileForm((curr) =>
                              curr ? { ...curr, [key]: event.target.checked } : curr,
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              <div className="grid grid-cols-[1fr_128px] gap-3">
                <label className="grid gap-1.5 text-sm">
                  Reconnect
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    value={profileForm.reconnectMode}
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr
                          ? {
                              ...curr,
                              reconnectMode: event.target
                                .value as ProfileFormState['reconnectMode'],
                            }
                          : curr,
                      )
                    }
                  >
                    <option value="never">never</option>
                    <option value="on-exit">on exit</option>
                    <option value="always">always</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  Delay ms
                  <Input
                    value={profileForm.reconnectDelayMs}
                    inputMode="numeric"
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr ? { ...curr, reconnectDelayMs: event.target.value } : curr,
                      )
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm.restoreOnLaunch}
                  onChange={(event) =>
                    setProfileForm((curr) =>
                      curr ? { ...curr, restoreOnLaunch: event.target.checked } : curr,
                    )
                  }
                />
                Restore this profile on launch
              </label>

              <div className="grid grid-cols-[1fr_96px] gap-3">
                <label className="grid gap-1.5 text-sm">
                  Tags
                  <Input
                    value={profileForm.tags}
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr ? { ...curr, tags: event.target.value } : curr,
                      )
                    }
                    placeholder="prod, api"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  Color
                  <Input
                    type="color"
                    value={profileForm.color}
                    onChange={(event) =>
                      setProfileForm((curr) =>
                        curr ? { ...curr, color: event.target.value } : curr,
                      )
                    }
                    aria-label="profile color"
                  />
                </label>
              </div>
            </div>

            <footer className="mt-3 flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setProfileForm(null)}>
                취소
              </Button>
              <Button variant="secondary" onClick={() => saveProfile(false)}>
                저장
              </Button>
              <Button
                onClick={() => saveProfile(true)}
                disabled={profileForm.kind === 'ssh' && !profileForm.host.trim()}
              >
                연결
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
      {doctorReport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
          onClick={() => setDoctorReport(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shell-doctor-dialog-title"
            aria-describedby="shell-doctor-dialog-description"
            className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-background p-4 shadow-lg sm:max-h-[calc(100dvh-2rem)] sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b pb-3">
              <div>
                <h2 id="shell-doctor-dialog-title" className="text-lg font-semibold">
                  SSH Doctor
                </h2>
                <p id="shell-doctor-dialog-description" className="text-sm text-muted-foreground">
                  {doctorReport.target} · {new Date(doctorReport.generatedAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="SSH Doctor 대화상자 닫기"
                onClick={() => setDoctorReport(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div
              role="region"
              aria-label="SSH 진단 결과"
              className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
            >
              {doctorReport.checks.map((check) => (
                <div key={check.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{check.label}</div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] uppercase',
                        doctorStatusClass(check.status),
                      )}
                    >
                      {check.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{check.message}</div>
                  {check.detail ? (
                    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-[11px]">
                      {check.detail}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
            <footer className="mt-3 flex shrink-0 justify-end border-t pt-3">
              <Button variant="outline" onClick={() => setDoctorReport(null)}>
                닫기
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void importShellLibraryFile(event)}
      />
      <input
        ref={sshConfigInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void importSshConfigFile(event)}
      />
    </div>
  )
}
