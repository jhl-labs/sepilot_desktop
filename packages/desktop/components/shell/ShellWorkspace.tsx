'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Circle,
  Clipboard,
  Copy,
  Eraser,
  FolderOpen,
  LoaderCircle,
  MessageSquare,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { Button } from '@/components/ui/button'
import {
  type ShellCommandContext,
  validateShellCommandContext,
} from '@/lib/shell/command-dispatch-guard'
import { looksDestructiveCommand } from '@/lib/shell/destructive'
import { useShellStore, type ShellSnippet, type ShellTab } from '@/lib/store/shell-store'
import { cn } from '@/lib/utils/cn'
import { ShellChatPanel, type ShellTerminalSnapshot } from './ShellChatPanel'

type ShellTerminalAction =
  | { kind: 'clear' }
  | { kind: 'copy' }
  | { kind: 'focus' }
  | { kind: 'find'; query: string; direction: 'next' | 'previous' }
  | { kind: 'paste' }
  | { kind: 'save-log' }
  | { kind: 'select-all' }
  | { kind: 'send-chat' }
  | { kind: 'send'; data: string }

interface ShellTerminalActionEvent {
  tabId: string
  action: ShellTerminalAction
}

interface ShellChatOpenEvent {
  userMessage?: string
}

const SHELL_CHAT_HEIGHT_STORAGE_KEY = 'sepilotd.shell-chat.height'
const SHELL_CHAT_DEFAULT_HEIGHT = 280
const SHELL_CHAT_MIN_HEIGHT = 200
const SHELL_TERMINAL_MIN_HEIGHT = 180
const SHELL_MENU_VIEWPORT_GUTTER = 8
const SHELL_MENU_ESTIMATED_WIDTH = 220
const SHELL_CONTEXT_MENU_ESTIMATED_HEIGHT = 308
const SHELL_TAB_MENU_ESTIMATED_HEIGHT = 140

function clampShellMenuPosition(
  x: number,
  y: number,
  estimatedHeight: number,
): { left: number; top: number } {
  const availableWidth = Math.max(0, window.innerWidth - SHELL_MENU_VIEWPORT_GUTTER * 2)
  const availableHeight = Math.max(0, window.innerHeight - SHELL_MENU_VIEWPORT_GUTTER * 2)
  const width = Math.min(SHELL_MENU_ESTIMATED_WIDTH, availableWidth)
  const height = Math.min(estimatedHeight, availableHeight)
  return {
    left: Math.max(
      SHELL_MENU_VIEWPORT_GUTTER,
      Math.min(x, window.innerWidth - width - SHELL_MENU_VIEWPORT_GUTTER),
    ),
    top: Math.max(
      SHELL_MENU_VIEWPORT_GUTTER,
      Math.min(y, window.innerHeight - height - SHELL_MENU_VIEWPORT_GUTTER),
    ),
  }
}

function terminalTheme() {
  return {
    background: '#0b0f14',
    foreground: '#d7dee8',
    cursor: '#7dd3fc',
    selectionBackground: '#26445f',
    black: '#10151d',
    red: '#ef6b73',
    green: '#86efac',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#67e8f9',
    white: '#e5e7eb',
    brightBlack: '#64748b',
    brightRed: '#fca5a5',
    brightGreen: '#bbf7d0',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#a5f3fc',
    brightWhite: '#ffffff',
  }
}

function dispatchShellAction(tabId: string | null, action: ShellTerminalAction): void {
  if (!tabId || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ShellTerminalActionEvent>('sepilot:shell/action', {
      detail: { tabId, action },
    }),
  )
}

function statusDotClass(status: ShellTab['status']): string {
  switch (status) {
    case 'connected':
      return 'text-emerald-500'
    case 'connecting':
      return 'text-amber-500'
    case 'error':
      return 'text-red-500'
    case 'exited':
      return 'text-slate-500'
    default:
      return 'text-slate-500'
  }
}

function formatStatus(tab: ShellTab | null): string {
  if (!tab) return 'No terminal'
  if (tab.status === 'connected') return tab.pid ? `PID ${tab.pid}` : 'Connected'
  if (tab.status === 'connecting') return 'Connecting'
  if (tab.status === 'exited') return `Exited ${tab.exitCode ?? ''}`.trim()
  if (tab.status === 'error') return 'Error'
  return 'Ready'
}

function commandForSnippet(snippet: ShellSnippet): string {
  const command = snippet.command.trim()
  return command.endsWith('\n') || command.endsWith('\r') ? command : `${command}\r`
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeShortcut(event: KeyboardEvent): string {
  const keys: string[] = []
  if (event.ctrlKey || event.metaKey) keys.push('Ctrl')
  if (event.shiftKey) keys.push('Shift')
  if (event.altKey) keys.push('Alt')
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) keys.push(key)
  return keys.join('+')
}

function shouldConfirmPaste(text: string): boolean {
  return text.length > 300 || /\r|\n/.test(text)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function detectTerminalDiagnostic(data: string): string | null {
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(data)) {
    return 'SSH host key changed. Verify known_hosts before reconnecting.'
  }
  if (/Host key verification failed/i.test(data)) {
    return 'SSH host key verification failed.'
  }
  if (/Permission denied \(publickey|Permission denied/i.test(data)) {
    return 'Authentication failed. Check user, key path, agent, or server permissions.'
  }
  if (/Could not resolve hostname|Name or service not known|getaddrinfo ENOTFOUND/i.test(data)) {
    return 'Host could not be resolved. Check DNS, hostname, or proxy command.'
  }
  if (/Connection timed out|Operation timed out/i.test(data)) {
    return 'Connection timed out. Check network reachability, firewall, or bastion.'
  }
  if (/Connection refused/i.test(data)) {
    return 'Connection refused. Check port and whether sshd or the target service is listening.'
  }
  if (/No route to host/i.test(data)) {
    return 'No route to host. Check VPN, routing, or security group rules.'
  }
  return null
}

function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-|-$/g, '') || 'terminal'
  )
}

function shellWorkingLabel(tab: ShellTab | null): string {
  if (!tab) return 'xterm.js terminal'
  if (tab.kind === 'ssh' && tab.ssh) {
    const host = tab.ssh.user ? `${tab.ssh.user}@${tab.ssh.host}` : tab.ssh.host
    const forwarded = tab.ssh.localForwards?.length
      ? ` · ${tab.ssh.localForwards.length} tunnel`
      : ''
    return `${host}:${tab.ssh.port}${forwarded}`
  }
  return tab.cwd || tab.command || 'Local shell'
}

function openShellChatPanel(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ShellChatOpenEvent>('sepilot:shell-chat/open', {
      detail: {},
    }),
  )
}

function buildTerminalSnapshot(
  tab: ShellTab,
  terminal: Terminal,
  outputLog: string[],
): ShellTerminalSnapshot {
  const buffer = terminal.buffer.active
  const firstVisibleRow =
    typeof buffer.viewportY === 'number'
      ? buffer.viewportY
      : Math.max(0, buffer.length - terminal.rows)
  const visibleText = Array.from({ length: terminal.rows }, (_value, index) => {
    const line = buffer.getLine(firstVisibleRow + index)
    return line?.translateToString(true) ?? ''
  })
    .join('\n')
    .replace(/\s+$/g, '')
  const selection = terminal.getSelection().trim()
  return {
    tabId: tab.id,
    title: tab.title,
    target: shellWorkingLabel(tab),
    status: tab.status,
    cwd: tab.cwd,
    command: tab.command,
    selection: selection || undefined,
    visibleText: visibleText.slice(-8000),
    recentOutput: outputLog.join('').slice(-12000),
    updatedAt: Date.now(),
  }
}

function ShellTerminalPane({
  tab,
  active,
  onSnapshot,
}: {
  tab: ShellTab
  active: boolean
  onSnapshot: (snapshot: ShellTerminalSnapshot) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const activeRef = useRef(active)
  const tabRef = useRef(tab)
  const onSnapshotRef = useRef(onSnapshot)
  const launchRef = useRef({
    kind: tab.kind,
    cwd: tab.cwd,
    ssh: tab.ssh,
    startupCommand: tab.startupCommand,
    terminalType: tab.terminalType,
    encoding: tab.encoding,
  })
  const outputLogRef = useRef<string[]>([])
  const searchMatchRef = useRef<{ row: number; col: number; query: string } | null>(null)
  const scheduleSnapshotRef = useRef<(delay?: number) => void>(() => {})
  const preferences = useShellStore((state) => state.preferences)
  const preferencesRef = useRef(preferences)
  const updateTab = useShellStore((state) => state.updateTab)
  const restartTab = useShellStore((state) => state.restartTab)
  const recordActivity = useShellStore((state) => state.recordActivity)
  const recordCommand = useShellStore((state) => state.recordCommand)

  useEffect(() => {
    tabRef.current = tab
  }, [tab])

  useEffect(() => {
    onSnapshotRef.current = onSnapshot
  }, [onSnapshot])

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  useEffect(() => {
    launchRef.current = {
      kind: tab.kind,
      cwd: tab.cwd,
      ssh: tab.ssh,
      startupCommand: tab.startupCommand,
      terminalType: tab.terminalType,
      encoding: tab.encoding,
    }
  }, [tab.kind, tab.cwd, tab.ssh, tab.startupCommand, tab.terminalType, tab.encoding])

  useEffect(() => {
    activeRef.current = active
    if (!active) return
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
        terminalRef.current?.focus()
        scheduleSnapshotRef.current(0)
      } catch {
      }
    })
  }, [active])

  useEffect(() => {
    let disposed = false
    let startupTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let cleanupData: (() => void) | null = null
    let cleanupExit: (() => void) | null = null
    let resizeObserver: ResizeObserver | null = null
    let dataDisposable: { dispose: () => void } | null = null
    let titleDisposable: { dispose: () => void } | null = null
    let selectionDisposable: { dispose: () => void } | null = null
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null

    function emitSnapshot() {
      const terminal = terminalRef.current
      if (!terminal || disposed) return
      onSnapshotRef.current(buildTerminalSnapshot(tabRef.current, terminal, outputLogRef.current))
    }

    function scheduleSnapshot(delay = 120) {
      if (!activeRef.current) return
      if (snapshotTimer) clearTimeout(snapshotTimer)
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null
        emitSnapshot()
      }, delay)
    }

    scheduleSnapshotRef.current = scheduleSnapshot

    async function writeToSession(data: string) {
      const sessionId = sessionIdRef.current
      if (!sessionId || !window.sepilot?.shell) return
      await window.sepilot.shell.write(sessionId, data)
    }

    function confirmTerminalWrite(data: string): boolean {
      const prefs = preferencesRef.current
      if (prefs.warnDestructiveCommands) {
        const match = looksDestructiveCommand(data)
        if (match) {
          return window.confirm(`Potentially destructive command detected: ${match}. Continue?`)
        }
      }
      return true
    }

    function findInTerminal(query: string, direction: 'next' | 'previous') {
      const terminal = terminalRef.current
      if (!terminal || !query.trim()) return
      const needle = query.toLowerCase()
      const buffer = terminal.buffer.active
      const start =
        searchMatchRef.current?.query === query
          ? searchMatchRef.current.row + (direction === 'next' ? 1 : -1)
          : direction === 'next'
            ? 0
            : buffer.length - 1
      for (let offset = 0; offset < buffer.length; offset += 1) {
        const row =
          direction === 'next'
            ? (start + offset + buffer.length) % buffer.length
            : (start - offset + buffer.length) % buffer.length
        const text = buffer.getLine(row)?.translateToString(true) ?? ''
        const col =
          direction === 'next'
            ? text.toLowerCase().indexOf(needle)
            : text.toLowerCase().lastIndexOf(needle)
        if (col >= 0) {
          terminal.scrollToLine(row)
          terminal.select(col, row, query.length)
          searchMatchRef.current = { row, col, query }
          return
        }
      }
      terminal.writeln(`\r\n[find: no matches for "${query}"]`)
    }

    function saveLog() {
      const terminal = terminalRef.current
      const buffer = terminal?.buffer.active
      const scrollback =
        buffer == null
          ? ''
          : Array.from(
              { length: buffer.length },
              (_value, index) => buffer.getLine(index)?.translateToString(true) ?? '',
            ).join('\n')
      const rawOutput = outputLogRef.current.join('')
      const content = scrollback.trim() ? scrollback : rawOutput
      downloadTextFile(
        `${sanitizeFileName(tab.title)}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
        content,
      )
    }

    function onShellAction(event: Event) {
      const detail = (event as CustomEvent<ShellTerminalActionEvent>).detail
      if (!detail || detail.tabId !== tab.id) return
      const terminal = terminalRef.current
      if (!terminal) return

      if (detail.action.kind === 'clear') {
        terminal.clear()
        scheduleSnapshot(0)
        return
      }
      if (detail.action.kind === 'focus') {
        terminal.focus()
        return
      }
      if (detail.action.kind === 'find') {
        findInTerminal(detail.action.query, detail.action.direction)
        scheduleSnapshot(0)
        return
      }
      if (detail.action.kind === 'select-all') {
        terminal.selectAll()
        return
      }
      if (detail.action.kind === 'save-log') {
        saveLog()
        recordActivity({
          kind: 'profile',
          title: 'Terminal log saved',
          message: tab.title,
          severity: 'success',
          tabId: tab.id,
          profileId: tab.profileId,
        })
        scheduleSnapshot(0)
        return
      }
      if (detail.action.kind === 'send-chat') {
        openShellChatPanel()
        recordActivity({
          kind: 'chat',
          title: 'Shell AI opened',
          message: tab.title,
          severity: 'info',
          tabId: tab.id,
          profileId: tab.profileId,
        })
        return
      }
      if (detail.action.kind === 'send') {
        if (!confirmTerminalWrite(detail.action.data)) return
        recordCommand({
          command: detail.action.data.replace(/\r/g, '\n').trim(),
          title: tab.title,
          tabId: tab.id,
          profileId: tab.profileId,
        })
        recordActivity({
          kind: 'command',
          title: 'Command sent',
          message: tab.title,
          severity: 'info',
          tabId: tab.id,
          profileId: tab.profileId,
        })
        void writeToSession(detail.action.data)
        scheduleSnapshot(0)
        return
      }
      if (detail.action.kind === 'copy') {
        const selection = terminal.getSelection()
        if (selection && navigator.clipboard) {
          void navigator.clipboard.writeText(selection)
        }
        return
      }
      if (detail.action.kind === 'paste' && navigator.clipboard) {
        void navigator.clipboard.readText().then((text) => {
          if (!text) return
          const prefs = preferencesRef.current
          if (prefs.confirmPaste && shouldConfirmPaste(text)) {
            const ok = window.confirm(`Paste ${text.split(/\r?\n/).length} lines into terminal?`)
            if (!ok) return
          }
          if (!confirmTerminalWrite(text)) return
          recordCommand({
            command: text.trim(),
            title: tab.title,
            tabId: tab.id,
            profileId: tab.profileId,
          })
          recordActivity({
            kind: 'command',
            title: 'Clipboard pasted',
            message: `${text.split(/\r?\n/).length} line(s) into ${tab.title}`,
            severity: shouldConfirmPaste(text) ? 'warning' : 'info',
            tabId: tab.id,
            profileId: tab.profileId,
          })
          const payload = prefs.bracketedPaste ? `\x1b[200~${text}\x1b[201~` : text
          void writeToSession(payload)
        })
      }
    }

    async function start() {
      if (!hostRef.current) return
      if (!window.sepilot?.shell) {
        updateTab(tab.id, {
          status: 'error',
          error: 'Desktop shell bridge is unavailable.',
        })
        return
      }

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (disposed || !hostRef.current) return

      const terminal = new Terminal({
        allowProposedApi: false,
        cursorBlink: true,
        convertEol: false,
        fontFamily:
          'JetBrains Mono, Fira Code, SFMono-Regular, Consolas, Liberation Mono, monospace',
        fontSize: preferencesRef.current.fontSize,
        lineHeight: 1.2,
        letterSpacing: 0,
        scrollback: preferencesRef.current.scrollback,
        tabStopWidth: 4,
        theme: terminalTheme(),
      })
      const fit = new FitAddon()
      terminalRef.current = terminal
      fitRef.current = fit
      terminal.loadAddon(fit)
      terminal.open(hostRef.current)
      terminal.focus()
      fit.fit()
      scheduleSnapshot(0)
      window.addEventListener('sepilot:shell/action', onShellAction)

      updateTab(tab.id, { status: 'connecting' })
      recordActivity({
        kind: 'connect',
        title: 'Terminal connecting',
        message: tab.title,
        severity: 'info',
        tabId: tab.id,
        profileId: tab.profileId,
      })
      try {
        const info = await window.sepilot.shell.start({
          kind: launchRef.current.kind,
          cwd: launchRef.current.cwd,
          cols: terminal.cols,
          rows: terminal.rows,
          ssh: launchRef.current.ssh,
          terminalType: launchRef.current.terminalType,
          encoding: launchRef.current.encoding,
        })
        if (disposed) {
          await window.sepilot.shell.kill(info.id)
          return
        }
        sessionIdRef.current = info.id
        updateTab(tab.id, {
          status: 'connected',
          sessionId: info.id,
          command: info.command,
          pid: info.pid,
          cwd: info.cwd,
          diagnostic: undefined,
        })
        recordActivity({
          kind: 'connect',
          title: 'Terminal connected',
          message: `${tab.title} (${info.command})`,
          severity: 'success',
          tabId: tab.id,
          profileId: tab.profileId,
        })
        cleanupData = window.sepilot.shell.onData(info.id, (data) => {
          outputLogRef.current.push(data)
          if (outputLogRef.current.length > 10_000) outputLogRef.current.splice(0, 1000)
          const diagnostic = detectTerminalDiagnostic(data)
          if (diagnostic) {
            updateTab(tab.id, { diagnostic })
            recordActivity({
              kind: 'diagnostic',
              title: 'Terminal diagnostic',
              message: diagnostic,
              severity: 'warning',
              tabId: tab.id,
              profileId: tab.profileId,
            })
          }
          terminal.write(data, () => scheduleSnapshot(80))
        })
        cleanupExit = window.sepilot.shell.onExit(info.id, (event) => {
          updateTab(tab.id, {
            status: 'exited',
            exitCode: event.exitCode,
            sessionId: undefined,
            pid: undefined,
          })
          recordActivity({
            kind: 'exit',
            title: 'Terminal exited',
            message: `${tab.title} exited with code ${event.exitCode}`,
            severity: event.exitCode === 0 ? 'info' : 'warning',
            tabId: tab.id,
            profileId: tab.profileId,
          })
          terminal.writeln(`\r\n[process exited with code ${event.exitCode}]`)
          scheduleSnapshot(0)
          const mode = tab.reconnectMode ?? preferencesRef.current.reconnectMode
          if (!disposed && mode !== 'never') {
            const delay = tab.reconnectDelayMs ?? preferencesRef.current.reconnectDelayMs
            terminal.writeln(`\r\n[reconnecting in ${Math.round(delay / 1000)}s]`)
            recordActivity({
              kind: 'reconnect',
              title: 'Terminal reconnect scheduled',
              message: `${tab.title} in ${delay}ms`,
              severity: 'info',
              tabId: tab.id,
              profileId: tab.profileId,
            })
            reconnectTimer = setTimeout(() => restartTab(tab.id), delay)
          }
        })
        dataDisposable = terminal.onData((data) => {
          const sessionId = sessionIdRef.current
          if (sessionId) {
            if (!confirmTerminalWrite(data)) return
            void window.sepilot.shell.write(sessionId, data)
          }
        })
        titleDisposable = terminal.onTitleChange((title) => {
          const normalized = title.trim()
          if (normalized) updateTab(tab.id, { title: normalized })
        })
        selectionDisposable = terminal.onSelectionChange(() => {
          scheduleSnapshot(0)
          if (!preferencesRef.current.copyOnSelect || !navigator.clipboard) return
          const selection = terminal.getSelection()
          if (selection) void navigator.clipboard.writeText(selection)
        })
        resizeObserver = new ResizeObserver(() => {
          if (!activeRef.current) return
          try {
            fit.fit()
            const sessionId = sessionIdRef.current
            if (sessionId) {
              void window.sepilot.shell.resize(sessionId, terminal.cols, terminal.rows)
            }
            scheduleSnapshot(80)
          } catch {
          }
        })
        resizeObserver.observe(hostRef.current)

        const startupCommand = launchRef.current.startupCommand?.trim()
        if (launchRef.current.kind === 'local' && startupCommand) {
          startupTimer = setTimeout(() => {
            if (!confirmTerminalWrite(`${startupCommand}\r`)) return
            recordCommand({
              command: startupCommand,
              title: tab.title,
              tabId: tab.id,
              profileId: tab.profileId,
            })
            void writeToSession(`${startupCommand}\r`)
          }, 200)
        }
      } catch (error) {
        updateTab(tab.id, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        recordActivity({
          kind: 'error',
          title: 'Terminal start failed',
          message: error instanceof Error ? error.message : String(error),
          severity: 'error',
          tabId: tab.id,
          profileId: tab.profileId,
        })
        terminal.writeln(
          `\r\n[terminal start failed: ${error instanceof Error ? error.message : String(error)}]`,
        )
      }
    }

    void start()

    return () => {
      disposed = true
      if (startupTimer) clearTimeout(startupTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (snapshotTimer) clearTimeout(snapshotTimer)
      scheduleSnapshotRef.current = () => {}
      window.removeEventListener('sepilot:shell/action', onShellAction)
      resizeObserver?.disconnect()
      dataDisposable?.dispose()
      titleDisposable?.dispose()
      selectionDisposable?.dispose()
      cleanupData?.()
      cleanupExit?.()
      const sessionId = sessionIdRef.current
      if (sessionId && window.sepilot?.shell) {
        void window.sepilot.shell.kill(sessionId)
      }
      sessionIdRef.current = null
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [
    preferences.scrollback,
    recordActivity,
    recordCommand,
    restartTab,
    tab.id,
    tab.reconnectDelayMs,
    tab.reconnectMode,
    tab.restartNonce,
    updateTab,
  ])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.fontSize = preferences.fontSize
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
      }
    })
  }, [preferences.fontSize])

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button === 1) {
        event.preventDefault()
        dispatchShellAction(tab.id, { kind: 'paste' })
      }
    },
    [tab.id],
  )

  return (
    <div
      className={cn(
        'shell-terminal-host absolute inset-0 min-h-0 bg-[#0b0f14]',
        active ? 'block' : 'hidden',
      )}
      ref={hostRef}
      onMouseDown={handleMouseDown}
    />
  )
}

export function ShellWorkspace({ visible = true }: { visible?: boolean }) {
  const rawTabs = useShellStore((state) => state.tabs)
  const tabs = useMemo(() => {
    const seen = new Set<string>()
    const out: typeof rawTabs = []
    for (const tab of rawTabs) {
      if (seen.has(tab.id)) continue
      seen.add(tab.id)
      out.push(tab)
    }
    return out
  }, [rawTabs])
  const activeId = useShellStore((state) => state.activeId)
  const snippets = useShellStore((state) => state.snippets)
  const preferences = useShellStore((state) => state.preferences)
  const addLocalTab = useShellStore((state) => state.addLocalTab)
  const addProfile = useShellStore((state) => state.addProfile)
  const duplicateTab = useShellStore((state) => state.duplicateTab)
  const restartTab = useShellStore((state) => state.restartTab)
  const removeTab = useShellStore((state) => state.removeTab)
  const setActive = useShellStore((state) => state.setActive)
  const setPreferences = useShellStore((state) => state.setPreferences)
  const updateTab = useShellStore((state) => state.updateTab)
  const reorderTab = useShellStore((state) => state.reorderTab)
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [shellChatOpen, setShellChatOpen] = useState(false)
  const [shellChatInitialMessage, setShellChatInitialMessage] = useState<string | undefined>(
    undefined,
  )
  const [shellChatInitialSeq, setShellChatInitialSeq] = useState(0)
  const [shellChatHeight, setShellChatHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return SHELL_CHAT_DEFAULT_HEIGHT
    const raw = Number.parseInt(
      window.localStorage.getItem(SHELL_CHAT_HEIGHT_STORAGE_KEY) ?? '',
      10,
    )
    return Number.isFinite(raw) ? Math.max(SHELL_CHAT_MIN_HEIGHT, raw) : SHELL_CHAT_DEFAULT_HEIGHT
  })
  const [shellChatResizing, setShellChatResizing] = useState(false)
  const terminalRegionRef = useRef<HTMLDivElement>(null)
  const shellChatDockRef = useRef<HTMLDivElement>(null)
  const shellChatResizeRef = useRef<{
    startY: number
    startChatHeight: number
    startTerminalHeight: number
  } | null>(null)
  const [terminalSnapshots, setTerminalSnapshots] = useState<Record<string, ShellTerminalSnapshot>>(
    {},
  )
  const latestShellDispatchRef = useRef({ activeId, tabs, terminalSnapshots })
  latestShellDispatchRef.current = { activeId, tabs, terminalSnapshots }
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const ActiveIcon = activeTab?.kind === 'ssh' ? Server : Monitor
  const workingLabel = shellWorkingLabel(activeTab)
  const canOperate = Boolean(activeId && activeTab)
  const primarySnippets = useMemo(() => snippets.slice(0, 8), [snippets])
  const activeTerminalSnapshot = activeId ? (terminalSnapshots[activeId] ?? null) : null

  const updateTerminalSnapshot = useCallback((snapshot: ShellTerminalSnapshot) => {
    setTerminalSnapshots((prev) => ({ ...prev, [snapshot.tabId]: snapshot }))
  }, [])

  function runSnippet(snippet: ShellSnippet) {
    dispatchShellAction(activeId, { kind: 'send', data: commandForSnippet(snippet) })
    dispatchShellAction(activeId, { kind: 'focus' })
  }

  function runSearch(direction: 'next' | 'previous' = 'next') {
    if (!searchQuery.trim()) return
    dispatchShellAction(activeId, { kind: 'find', query: searchQuery, direction })
  }

  async function openLocalFromFolder() {
    const selected = await window.sepilot?.selectDirectory?.(activeTab?.cwd)
    if (!selected) return
    const title = selected.split(/[\\/]/).filter(Boolean).at(-1) || selected
    addLocalTab({ cwd: selected, title })
  }

  function saveActiveProfile() {
    if (!activeTab) return
    const title = activeTab.title || (activeTab.kind === 'ssh' ? 'SSH Host' : 'Local Shell')
    const profileId = addProfile({
      title,
      kind: activeTab.kind,
      cwd: activeTab.kind === 'local' ? activeTab.cwd : undefined,
      ssh: activeTab.ssh,
      startupCommand: activeTab.startupCommand,
      terminalType: activeTab.terminalType,
      encoding: activeTab.encoding,
      color: activeTab.color,
      tags: activeTab.kind === 'ssh' && activeTab.ssh?.host ? [activeTab.ssh.host] : [],
    })
    if (profileId) updateTab(activeTab.id, { profileId })
  }

  const openShellChat = useCallback((userMessage?: string) => {
    setShellChatOpen(true)
    if (userMessage?.trim()) {
      setShellChatInitialMessage(userMessage)
      setShellChatInitialSeq((seq) => seq + 1)
    }
  }, [])

  const runShellCommand = useCallback((command: string, context: ShellCommandContext): boolean => {
    const latest = latestShellDispatchRef.current
    if (!latest.tabs.some((tab) => tab.id === context.tabId)) return false
    const validation = validateShellCommandContext(context, {
      activeTabId: latest.activeId,
      workspaceRoot: context.workspaceRoot,
      terminalSnapshot: latest.terminalSnapshots[context.tabId] ?? null,
    })
    if (!validation.ok) return false
    const payload = command.endsWith('\n') || command.endsWith('\r') ? command : `${command}\r`
    dispatchShellAction(context.tabId, { kind: 'send', data: payload })
    dispatchShellAction(context.tabId, { kind: 'focus' })
    return true
  }, [])

  const beginShellChatResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const terminalRegion = terminalRegionRef.current
      const chatDock = shellChatDockRef.current
      if (!terminalRegion || !chatDock) return

      event.preventDefault()
      const startY = Number.isFinite(event.clientY) ? event.clientY : 0
      const startChatHeight = chatDock.getBoundingClientRect().height || shellChatHeight
      const startTerminalHeight = terminalRegion.getBoundingClientRect().height
      shellChatResizeRef.current = {
        startY,
        startChatHeight: Number.isFinite(startChatHeight) ? startChatHeight : shellChatHeight,
        startTerminalHeight: Number.isFinite(startTerminalHeight) ? startTerminalHeight : 0,
      }
      setShellChatResizing(true)
    },
    [shellChatHeight],
  )

  useEffect(() => {
    if (!shellChatOpen || typeof window === 'undefined') return
    window.localStorage.setItem(SHELL_CHAT_HEIGHT_STORAGE_KEY, String(Math.round(shellChatHeight)))
  }, [shellChatHeight, shellChatOpen])

  useEffect(() => {
    if (!shellChatResizing) return undefined

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    function onPointerMove(event: PointerEvent) {
      const drag = shellChatResizeRef.current
      if (!drag) return
      if (!Number.isFinite(event.clientY)) return
      const availableHeight = drag.startChatHeight + drag.startTerminalHeight
      const maxChatHeight = Math.max(
        SHELL_CHAT_MIN_HEIGHT,
        availableHeight - SHELL_TERMINAL_MIN_HEIGHT,
      )
      const nextHeight = clampNumber(
        drag.startChatHeight - (event.clientY - drag.startY),
        SHELL_CHAT_MIN_HEIGHT,
        maxChatHeight,
      )
      setShellChatHeight(Math.round(nextHeight))
    }

    function endResize() {
      shellChatResizeRef.current = null
      setShellChatResizing(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endResize)
    window.addEventListener('pointercancel', endResize)
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endResize)
      window.removeEventListener('pointercancel', endResize)
    }
  }, [shellChatResizing])

  useEffect(() => {
    const ids = new Set(tabs.map((tab) => tab.id))
    setTerminalSnapshots((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)))
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(next)
      return nextKeys.length === prevKeys.length && nextKeys.every((id) => prev[id] === next[id])
        ? prev
        : next
    })
  }, [tabs])

  useEffect(() => {
    if (!visible) return undefined
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = normalizeShortcut(event)
      const keymap = preferences.keymap
      if (shortcut === keymap.copy) {
        event.preventDefault()
        dispatchShellAction(activeId, { kind: 'copy' })
        return
      }
      if (shortcut === keymap.paste || shortcut === 'Shift+Insert') {
        event.preventDefault()
        dispatchShellAction(activeId, { kind: 'paste' })
        return
      }
      if (shortcut === keymap.clear) {
        event.preventDefault()
        dispatchShellAction(activeId, { kind: 'clear' })
        return
      }
      if (shortcut === keymap.find) {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (shortcut === keymap.reconnect && activeTab) {
        event.preventDefault()
        restartTab(activeTab.id)
        return
      }
      if (shortcut === keymap.duplicate && activeTab) {
        event.preventDefault()
        duplicateTab(activeTab.id)
        return
      }
      if (shortcut === keymap.close && activeTab) {
        event.preventDefault()
        removeTab(activeTab.id)
        return
      }
      if (shortcut === 'Ctrl+Shift+T') {
        event.preventDefault()
        addLocalTab()
        return
      }
      if (shortcut === 'Ctrl+Shift+A') {
        event.preventDefault()
        dispatchShellAction(activeId, { kind: 'select-all' })
        return
      }
      if (shortcut === 'Ctrl+Tab') {
        event.preventDefault()
        if (tabs.length > 1) {
          const idx = tabs.findIndex((tab) => tab.id === activeId)
          const next = tabs[(Math.max(idx, 0) + 1) % tabs.length]
          if (next) setActive(next.id)
        }
        return
      }
      if (shortcut === 'Ctrl+Shift+Tab') {
        event.preventDefault()
        if (tabs.length > 1) {
          const idx = tabs.findIndex((tab) => tab.id === activeId)
          const prev = tabs[(Math.max(idx, 0) - 1 + tabs.length) % tabs.length]
          if (prev) setActive(prev.id)
        }
        return
      }
      const numberMatch = /^Ctrl\+([1-9])$/.exec(shortcut)
      if (numberMatch) {
        event.preventDefault()
        const n = Number.parseInt(numberMatch[1] ?? '0', 10)
        const target = n === 9 ? tabs.at(-1) : tabs[n - 1]
        if (target) setActive(target.id)
        return
      }
      if (shortcut === 'Ctrl+=' || shortcut === 'Ctrl++' || shortcut === 'Ctrl+Shift+=') {
        event.preventDefault()
        setPreferences({ fontSize: Math.min(32, preferences.fontSize + 1) })
        return
      }
      if (shortcut === 'Ctrl+-' || shortcut === 'Ctrl+_') {
        event.preventDefault()
        setPreferences({ fontSize: Math.max(8, preferences.fontSize - 1) })
        return
      }
      if (shortcut === 'Ctrl+0') {
        event.preventDefault()
        setPreferences({ fontSize: 13 })
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeId,
    activeTab,
    addLocalTab,
    duplicateTab,
    preferences.fontSize,
    preferences.keymap,
    removeTab,
    restartTab,
    setActive,
    setPreferences,
    tabs,
    visible,
  ])

  useEffect(() => {
    function onShellChatOpen(event: Event) {
      const detail = (event as CustomEvent<ShellChatOpenEvent>).detail
      openShellChat(detail?.userMessage)
    }
    window.addEventListener('sepilot:shell-chat/open', onShellChatOpen as EventListener)
    return () =>
      window.removeEventListener('sepilot:shell-chat/open', onShellChatOpen as EventListener)
  }, [openShellChat])

  useEffect(() => {
    if (!contextMenu) return undefined
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!tabMenu) return undefined
    const close = () => setTabMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [tabMenu])

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-[#0b0f14] text-slate-100"
      onContextMenu={(event) => {
        if (!activeTab) return
        event.preventDefault()
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
        })
      }}
    >
      {}
      {tabs.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-[#0b0f14] px-2 py-1.5">
          {tabs.map((tab, index) => {
            const tabActive = tab.id === activeId
            const TabIcon = tab.kind === 'ssh' ? Server : Monitor
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tabActive}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-sepilot-shell-tab', tab.id)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('application/x-sepilot-shell-tab')) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDrop={(event) => {
                  const sourceId = event.dataTransfer.getData('application/x-sepilot-shell-tab')
                  if (!sourceId || sourceId === tab.id) return
                  event.preventDefault()
                  reorderTab(sourceId, index)
                }}
                onClick={() => setActive(tab.id)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault()
                    removeTab(tab.id)
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setTabMenu({
                    x: event.clientX,
                    y: event.clientY,
                    tabId: tab.id,
                  })
                }}
                className={cn(
                  'group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                  tabActive
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
                title={tab.title}
              >
                <TabIcon
                  className="h-3.5 w-3.5 shrink-0"
                  style={tab.color ? { color: tab.color } : undefined}
                />
                <span className="max-w-[160px] truncate">{tab.title}</span>
                {tab.status === 'connecting' ? (
                  <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
                ) : (
                  <Circle
                    className={cn('h-2 w-2 shrink-0 fill-current', statusDotClass(tab.status))}
                  />
                )}
                <button
                  type="button"
                  className={cn(
                    'ml-1 rounded p-0.5 text-slate-400 transition-opacity hover:bg-slate-700 hover:text-slate-100',
                    tabActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeTab(tab.id)
                  }}
                  aria-label={`close ${tab.title}`}
                  title="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-slate-300 hover:bg-slate-800"
            onClick={() => addLocalTab()}
            title="New local terminal"
            aria-label="new local terminal"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#111827] px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950"
            style={activeTab?.color ? { color: activeTab.color } : undefined}
          >
            <ActiveIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-medium">{activeTab?.title ?? 'Shell'}</div>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-normal',
                  activeTab?.status === 'connected'
                    ? 'border-emerald-500/40 text-emerald-300'
                    : activeTab?.status === 'error'
                      ? 'border-red-500/40 text-red-300'
                      : 'border-slate-600 text-slate-400',
                )}
              >
                {formatStatus(activeTab)}
              </span>
            </div>
            <div className="truncate text-[11px] text-slate-400">{workingLabel}</div>
            {activeTab?.diagnostic ? (
              <div className="mt-0.5 max-w-[52rem] truncate text-[11px] text-amber-300">
                {activeTab.diagnostic}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Copy selection"
            aria-label="copy terminal selection"
            disabled={!canOperate}
            onClick={() => dispatchShellAction(activeId, { kind: 'copy' })}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Paste"
            aria-label="paste clipboard into terminal"
            disabled={!canOperate}
            onClick={() => dispatchShellAction(activeId, { kind: 'paste' })}
          >
            <Clipboard className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Clear"
            aria-label="clear terminal"
            disabled={!canOperate}
            onClick={() => dispatchShellAction(activeId, { kind: 'clear' })}
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Find"
            aria-label="find in terminal"
            disabled={!canOperate}
            onClick={() => setSearchOpen((value) => !value)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Save log"
            aria-label="save terminal log"
            disabled={!canOperate}
            onClick={() => dispatchShellAction(activeId, { kind: 'save-log' })}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Ask Shell AI about this terminal"
            aria-label="ask shell ai about this terminal"
            disabled={!canOperate}
            onClick={() => dispatchShellAction(activeId, { kind: 'send-chat' })}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Settings"
            aria-label="terminal control settings"
            onClick={() => setPreferencesOpen((value) => !value)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Reconnect"
            aria-label="reconnect terminal"
            disabled={!activeTab}
            onClick={() => activeTab && restartTab(activeTab.id)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Duplicate"
            aria-label="duplicate terminal"
            disabled={!activeTab}
            onClick={() => activeTab && duplicateTab(activeTab.id)}
          >
            <TerminalSquare className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Save profile"
            aria-label="save terminal profile"
            disabled={!activeTab}
            onClick={saveActiveProfile}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-slate-800"
            title="Open folder"
            aria-label="open local terminal from folder"
            onClick={() => void openLocalFromFolder()}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-2 bg-slate-800 text-slate-100 hover:bg-slate-700"
            onClick={() => addLocalTab()}
          >
            <Monitor className="h-4 w-4" />
            Local
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:bg-red-950 hover:text-red-200"
            title="Close"
            aria-label="close terminal"
            disabled={!activeTab}
            onClick={() => activeTab && removeTab(activeTab.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {searchOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0f1722] px-4 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-500"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runSearch(event.shiftKey ? 'previous' : 'next')
              if (event.key === 'Escape') setSearchOpen(false)
            }}
            placeholder="Find in terminal"
            aria-label="find in terminal"
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-slate-200 hover:bg-slate-800"
            onClick={() => runSearch('previous')}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-slate-200 hover:bg-slate-800"
            onClick={() => runSearch('next')}
          >
            Next
          </Button>
        </div>
      ) : null}

      {preferencesOpen ? (
        <div className="grid shrink-0 gap-3 border-b border-slate-800 bg-[#0f1722] px-4 py-3 text-xs text-slate-300 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.copyOnSelect}
              onChange={(event) => setPreferences({ copyOnSelect: event.target.checked })}
            />
            Copy on select
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.confirmPaste}
              onChange={(event) => setPreferences({ confirmPaste: event.target.checked })}
            />
            Confirm multi-line paste
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.bracketedPaste}
              onChange={(event) => setPreferences({ bracketedPaste: event.target.checked })}
            />
            Bracketed paste
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.warnDestructiveCommands}
              onChange={(event) =>
                setPreferences({ warnDestructiveCommands: event.target.checked })
              }
            />
            Warn destructive commands
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.restoreTabs}
              onChange={(event) => setPreferences({ restoreTabs: event.target.checked })}
            />
            Restore tabs
          </label>
          <label className="grid gap-1">
            Reconnect
            <select
              className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-100"
              value={preferences.reconnectMode}
              onChange={(event) =>
                setPreferences({
                  reconnectMode: event.target.value as typeof preferences.reconnectMode,
                })
              }
            >
              <option value="never">Never</option>
              <option value="on-exit">On exit</option>
              <option value="always">Always</option>
            </select>
          </label>
          <label className="grid gap-1">
            Reconnect delay
            <input
              className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-100"
              type="number"
              min={250}
              max={60000}
              value={preferences.reconnectDelayMs}
              onChange={(event) =>
                setPreferences({ reconnectDelayMs: Number.parseInt(event.target.value, 10) })
              }
            />
          </label>
          <label className="grid gap-1">
            Scrollback
            <input
              className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-100"
              type="number"
              min={1000}
              max={100000}
              value={preferences.scrollback}
              onChange={(event) =>
                setPreferences({ scrollback: Number.parseInt(event.target.value, 10) })
              }
            />
          </label>
          <div className="text-slate-500">
            Shortcuts: {preferences.keymap.copy}, {preferences.keymap.paste},{' '}
            {preferences.keymap.find}
          </div>
        </div>
      ) : null}

      {tabs.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0f1722] px-4 py-2">
          <Button
            variant={snippetOpen ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-2 text-xs text-slate-200 hover:bg-slate-800"
            onClick={() => setSnippetOpen((value) => !value)}
          >
            <Play className="h-3.5 w-3.5" />
            Snippets
          </Button>
          {snippetOpen ? (
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {primarySnippets.map((snippet) => (
                <button
                  type="button"
                  key={snippet.id}
                  className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  onClick={() => runSnippet(snippet)}
                  title={snippet.command}
                >
                  {snippet.title}
                </button>
              ))}
            </div>
          ) : (
            <div className="truncate text-xs text-slate-500">{activeTab?.command ?? 'Ready'}</div>
          )}
        </div>
      ) : null}

      <div
        ref={terminalRegionRef}
        data-testid="shell-terminal-region"
        className={cn('relative flex-1', shellChatOpen ? 'min-h-[180px]' : 'min-h-0')}
        style={shellChatOpen ? { minHeight: SHELL_TERMINAL_MIN_HEIGHT } : undefined}
      >
        {tabs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <TerminalSquare className="h-10 w-10 text-slate-500" />
            <div>
              <div className="text-sm font-medium text-slate-100">Shell 탭을 열어 시작하세요</div>
              <div className="mt-1 text-xs text-slate-400">
                로컬 셸 또는 SSH 세션을 xterm 기반 터미널로 실행합니다.
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => addLocalTab()}>Local 열기</Button>
              <Button variant="outline" onClick={() => void openLocalFromFolder()}>
                폴더에서 열기
              </Button>
            </div>
          </div>
        ) : (
          tabs.map((tab) => (
            <ShellTerminalPane
              key={tab.id}
              tab={tab}
              active={visible && tab.id === activeId}
              onSnapshot={updateTerminalSnapshot}
            />
          ))
        )}
      </div>

      {shellChatOpen ? (
        <>
          <button
            type="button"
            data-testid="shell-chat-resize-handle"
            className={cn(
              'group flex h-2 w-full shrink-0 cursor-row-resize items-center justify-center border-y border-slate-800 bg-[#0b0f14] outline-none transition-colors hover:bg-slate-900 focus-visible:bg-slate-900 focus-visible:ring-1 focus-visible:ring-sky-500',
              shellChatResizing && 'bg-slate-900',
            )}
            onPointerDown={beginShellChatResize}
            aria-label="resize shell ai panel"
            title="Drag to resize Shell AI"
          >
            <span className="h-px w-16 rounded-full bg-slate-700 transition-colors group-hover:bg-sky-500 group-focus-visible:bg-sky-500" />
          </button>
          <div
            ref={shellChatDockRef}
            data-testid="shell-chat-dock"
            className="flex w-full min-w-0 shrink-0 border-t border-slate-800"
            style={{
              height: shellChatHeight,
              minHeight: SHELL_CHAT_MIN_HEIGHT,
            }}
          >
            <ShellChatPanel
              activeTabId={activeId}
              terminalSnapshot={activeTerminalSnapshot}
              initialMessage={shellChatInitialMessage}
              initialMessageSeq={shellChatInitialSeq}
              onClose={() => setShellChatOpen(false)}
              onRunCommand={runShellCommand}
            />
          </div>
        </>
      ) : null}

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-44 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-slate-700 bg-slate-950 py-1 text-sm text-slate-100 shadow-xl [scrollbar-gutter:stable]"
          style={clampShellMenuPosition(
            contextMenu.x,
            contextMenu.y,
            SHELL_CONTEXT_MENU_ESTIMATED_HEIGHT,
          )}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {[
            ['Copy', () => dispatchShellAction(activeId, { kind: 'copy' })],
            ['Paste', () => dispatchShellAction(activeId, { kind: 'paste' })],
            ['Select all', () => dispatchShellAction(activeId, { kind: 'select-all' })],
            ['Find', () => setSearchOpen(true)],
            ['Clear', () => dispatchShellAction(activeId, { kind: 'clear' })],
            ['Save log', () => dispatchShellAction(activeId, { kind: 'save-log' })],
            ['Ask Shell AI', () => dispatchShellAction(activeId, { kind: 'send-chat' })],
            ['Reconnect', () => activeTab && restartTab(activeTab.id)],
            ['Duplicate', () => activeTab && duplicateTab(activeTab.id)],
            ['Close', () => activeTab && removeTab(activeTab.id)],
          ].map(([label, handler]) => (
            <button
              key={String(label)}
              type="button"
              role="menuitem"
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-slate-800"
              onClick={() => {
                setContextMenu(null)
                ;(handler as () => void)()
              }}
            >
              {String(label)}
            </button>
          ))}
        </div>
      ) : null}

      {tabMenu ? (
        <div
          className="fixed z-50 min-w-44 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-slate-700 bg-slate-950 py-1 text-sm text-slate-100 shadow-xl [scrollbar-gutter:stable]"
          style={clampShellMenuPosition(
            tabMenu.x,
            tabMenu.y,
            SHELL_TAB_MENU_ESTIMATED_HEIGHT,
          )}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const menuTabId = tabMenu.tabId
            const menuTab = tabs.find((tab) => tab.id === menuTabId) ?? null
            const otherTabIds = tabs.filter((tab) => tab.id !== menuTabId).map((tab) => tab.id)
            return [
              ['Reconnect', () => menuTab && restartTab(menuTab.id)],
              ['Duplicate', () => menuTab && duplicateTab(menuTab.id)],
              ['Close', () => menuTab && removeTab(menuTab.id)],
              [
                `Close others${otherTabIds.length ? ` (${otherTabIds.length})` : ''}`,
                () => {
                  for (const id of otherTabIds) removeTab(id)
                },
              ],
            ] as Array<[string, () => void]>
          })().map(([label, handler]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="block w-full whitespace-nowrap px-3 py-1.5 text-left hover:bg-slate-800"
              onClick={() => {
                setTabMenu(null)
                handler()
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
