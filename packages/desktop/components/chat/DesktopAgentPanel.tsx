'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DesktopAgentId, DesktopAgentSession } from '@sepilotd/api-client'
import { useTranslation } from 'react-i18next'
import { useTransport } from '@/components/providers/transport-provider'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { createDesktopAgentApi } from '@/lib/api/desktop-agent'
import { classifyTerminalStreamError } from '@/lib/api/desktop-agent-error'
import { getDesktopApi } from '@/lib/electron/bridge'
import { AgentTerminal } from './AgentTerminal'

export function desktopAgentFromMode(mode: string): DesktopAgentId | null {
  switch (mode) {
    case 'external-claude':
      return 'claude'
    case 'external-codex':
      return 'codex'
    case 'external-gemini':
      return 'gemini'
    case 'external-opencode':
      return 'opencode'
    default:
      return null
  }
}

const cliModes = [
  ['claude', 'Claude CLI'], ['codex', 'Codex CLI'],
  ['gemini', 'Gemini CLI'], ['opencode', 'OpenCode CLI'],
] as const

function normalizedPath(path: string | null | undefined): string {
  return path?.trim() ?? ''
}

export function DesktopAgentPanel({ agent }: { agent: DesktopAgentId }) {
  const { t } = useTranslation()
  const transport = useTransport()
  const api = useMemo(() => createDesktopAgentApi(transport), [transport])
  const setMode = useChatModeStore((state) => state.setMode)
  const activeWorkspace = useSessionStore((state) =>
    normalizedPath(state.sessions.find((session) => session.id === state.activeId)?.cwd),
  )
  const defaultWorkspace = useSettingsStore((state) => normalizedPath(state.general.workingDir))
  const workspace = activeWorkspace || defaultWorkspace
  const [cliCatalog, setCliCatalog] = useState<{ api: typeof api; agents: Awaited<ReturnType<typeof api.list>>['agents'] }>()
  const availableCli = cliCatalog?.api === api ? cliCatalog.agents : undefined
  const cliReady = (id: DesktopAgentId) => availableCli?.some(item => item.id === id && item.available) === true
  const [sessions, setSessions] = useState<DesktopAgentSession[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [cwd, setCwd] = useState(workspace)
  const [remote, setRemote] = useState(false)
  const [sshHost, setSshHost] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const launchKeyRef = useRef('')
  const launchVersionRef = useRef(0)
  const errorMessage = useCallback(
    (cause: unknown) =>
      classifyTerminalStreamError(cause) === 'network'
        ? t('desktopAgent.terminal.networkError')
        : cause instanceof Error
          ? cause.message
          : String(cause),
    [t],
  )

  const refresh = useCallback(async () => {
    const listed = await api.list()
    setSessions(listed.sessions)
    setCliCatalog({ api, agents: listed.agents })
    return listed
  }, [api])

  const launchLocal = useCallback(
    async (path: string, force = false) => {
      const key = `${agent}\u0000${path}`
      if (!force && launchKeyRef.current === key) return
      launchKeyRef.current = key
      const version = ++launchVersionRef.current
      setBusy(true)
      setError('')
      try {
        const listed = await refresh()
        if (version !== launchVersionRef.current) return
        const reusable = listed.sessions.find(
          (session) =>
            session.agent === agent &&
            session.state === 'running' &&
            !session.ssh &&
            (!path || session.cwd === path),
        )
        if (reusable) {
          setSelectedId(reusable.id)
          return
        }
        if (!path) return
        if (!listed.agents?.some(item => item.id === agent && item.available)) {
          setError(t('desktopAgent.cliUnavailable'))
          return
        }
        const created = await api.create(agent, path)
        if (version !== launchVersionRef.current) return
        setSessions((current) => [
          ...current.filter((session) => session.id !== created.id),
          created,
        ])
        setSelectedId(created.id)
      } catch (cause) {
        if (version !== launchVersionRef.current) return
        launchKeyRef.current = ''
        setError(errorMessage(cause))
      } finally {
        if (version === launchVersionRef.current) setBusy(false)
      }
    },
    [agent, api, errorMessage, refresh, t],
  )

  useEffect(() => {
    void launchLocal(workspace)
  }, [launchLocal, workspace])

  useEffect(() => {
    if (!remote) setCwd(workspace)
  }, [remote, workspace])

  const selected = sessions.find((item) => item.id === selectedId)
  const recoverUnavailableSession = useCallback(() => {
    if (selected?.ssh) {
      setSelectedId('')
      setRemote(true)
      setCwd(selected.cwd)
      setSshHost(selected.ssh.host)
      setSshUser(selected.ssh.user ?? '')
      setSshPort(selected.ssh.port ? String(selected.ssh.port) : '')
      setError(t('desktopAgent.terminal.remoteSessionEnded'))
      return
    }
    const recoveryWorkspace = selected && !selected.ssh ? normalizedPath(selected.cwd) : workspace
    setSelectedId('')
    launchKeyRef.current = ''
    void launchLocal(recoveryWorkspace, true)
  }, [launchLocal, selected, t, workspace])

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const createSession = async () => {
    const path = cwd.trim()
    const created = await api.create(
      agent,
      path,
      remote
        ? {
            host: sshHost.trim(),
            ...(sshUser.trim() ? { user: sshUser.trim() } : {}),
            ...(sshPort ? { port: Number(sshPort) } : {}),
          }
        : undefined,
    )
    if (!remote) launchKeyRef.current = `${agent}\u0000${path}`
    setSessions((current) => [
      ...current.filter((session) => session.id !== created.id),
      created,
    ])
    setSelectedId(created.id)
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      aria-label={t('desktopAgent.ariaLabel')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={() => setMode('auto')}
        >
          {t('desktopAgent.backToChat')}
        </button>
        <strong>{t('desktopAgent.title')}</strong>
        <select
          aria-label={t('desktopAgent.agentMode')}
          disabled={busy}
          value={`external-${agent}`}
          onChange={(event) => setMode(event.target.value)}
          className="rounded border bg-background p-2"
        >
          <option value="instant">SEPilot</option>
          {cliModes.map(([id, label]) => (
            <option key={id} value={`external-${id}`} disabled={!cliReady(id)}>
              {label}{cliReady(id) ? '' : ` · ${t(availableCli ? 'desktopAgent.cliUnavailable' : 'desktopAgent.cliChecking')}`}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{t('desktopAgent.pty')}</span>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-destructive">{error}</p>
          {workspace ? (
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void launchLocal(workspace, true)}
            >
              {t('desktopAgent.retry')}
            </button>
          ) : null}
        </div>
      )}

      {selected ? (
        <AgentTerminal
          key={selected.id}
          session={selected}
          api={api}
          onSessionUnavailable={recoverUnavailableSession}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {busy
            ? t('desktopAgent.starting', { agent })
            : workspace
              ? t('desktopAgent.notStarted')
              : t('desktopAgent.workspaceRequired')}
        </div>
      )}

      <details className="rounded-md border px-3 py-2 text-sm" open={!workspace}>
        <summary className="cursor-pointer select-none font-medium">
          {t('desktopAgent.advanced')}
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t('desktopAgent.boundary')}</p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('desktopAgent.session')}
              disabled={busy}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="min-w-0 rounded border bg-background p-2"
            >
              <option value="">{t('desktopAgent.newSession')}</option>
              {sessions
                .filter((item) => item.agent === agent)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.ssh
                      ? `${item.ssh.user ? item.ssh.user + '@' : ''}${item.ssh.host} · `
                      : ''}
                    {item.cwd} · {item.id.slice(0, 8)} · {item.state}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(async () => void (await refresh()))}
              className="rounded border px-2"
            >
              {t('desktopAgent.refreshSessions')}
            </button>
            {selected && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api.close(selected.id)
                    setSelectedId('')
                    launchKeyRef.current = ''
                    await refresh()
                  })
                }
                className="rounded border px-2"
              >
                {t('desktopAgent.closeSession')}
              </button>
            )}
          </div>
          <label className="text-sm">
            {t('desktopAgent.location')}
            <select
              aria-label={t('desktopAgent.location')}
              value={remote ? 'ssh' : 'local'}
              onChange={(event) => setRemote(event.target.value === 'ssh')}
              className="ml-2 rounded border bg-background p-2"
            >
              <option value="local">{t('desktopAgent.daemonHost')}</option>
              <option value="ssh">{t('desktopAgent.sshHost')}</option>
            </select>
          </label>
          {remote && (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label={t('desktopAgent.ssh.hostname')}
                  placeholder={t('desktopAgent.ssh.hostnamePlaceholder')}
                  value={sshHost}
                  onChange={(event) => setSshHost(event.target.value)}
                  className="rounded border bg-background p-2"
                />
                <input
                  aria-label={t('desktopAgent.ssh.user')}
                  placeholder={t('desktopAgent.ssh.userPlaceholder')}
                  value={sshUser}
                  onChange={(event) => setSshUser(event.target.value)}
                  className="rounded border bg-background p-2"
                />
                <input
                  aria-label={t('desktopAgent.ssh.port')}
                  type="number"
                  min={1}
                  max={65535}
                  placeholder={t('desktopAgent.ssh.portPlaceholder')}
                  value={sshPort}
                  onChange={(event) => setSshPort(event.target.value)}
                  className="w-48 rounded border bg-background p-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('desktopAgent.ssh.help')}</p>
            </>
          )}
          <div className="flex gap-2">
            <input
              aria-label={
                remote ? t('desktopAgent.remoteWorkspace') : t('desktopAgent.localWorkspace')
              }
              placeholder={
                remote
                  ? t('desktopAgent.remoteWorkspacePlaceholder')
                  : t('desktopAgent.localWorkspacePlaceholder')
              }
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              className="min-w-0 flex-1 rounded border bg-background p-2"
            />
            {!remote && getDesktopApi() ? (
              <button
                type="button"
                disabled={busy}
                className="rounded border px-3"
                onClick={() =>
                  void act(async () => {
                    const selectedPath = await getDesktopApi()?.selectDirectory(cwd || undefined)
                    if (typeof selectedPath === 'string' && selectedPath.trim()) setCwd(selectedPath)
                  })
                }
              >
                {t('desktopAgent.chooseFolder')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || !cwd.trim() || (remote ? !sshHost.trim() : !cliReady(agent))}
              className="rounded border px-3"
              onClick={() => void act(createSession)}
            >
              {busy ? t('desktopAgent.startingShort') : t('desktopAgent.startTerminal')}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('desktopAgent.persistence')}</p>
        </div>
      </details>
    </section>
  )
}
