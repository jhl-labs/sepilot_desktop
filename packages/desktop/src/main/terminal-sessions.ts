import type { WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { platform } from 'node:process'
import { lookup } from 'node:dns/promises'
import { Socket } from 'node:net'
import { promisify } from 'node:util'
import { resolveLocalCommandLaunch } from './local-command'
import type * as PtyTypes from 'node-pty'
const nativeRequire = createRequire(import.meta.url)
let pty: typeof PtyTypes | null = null

function getPty(): typeof PtyTypes {
  pty ??= nativeRequire('node-pty') as typeof PtyTypes
  return pty
}

export type DesktopShellKind = 'local' | 'ssh'

export interface DesktopShellStartInput {
  id?: string
  kind?: DesktopShellKind
  cwd?: string
  command?: string[]
  title?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
  terminalType?: string
  encoding?: string
  ssh?: {
    host?: string
    user?: string
    port?: number
    identityFile?: string
    jumpHost?: string
    proxyCommand?: string
    localForwards?: string[]
    remoteEnv?: string[]
    keepAlive?: boolean
    agentForwarding?: boolean
    x11Forwarding?: boolean
    compression?: boolean
    terminalType?: string
    encoding?: string
  }
}

export interface DesktopShellSessionInfo {
  id: string
  kind: DesktopShellKind
  pid: number
  title: string
  command: string
  cwd: string
}

export interface DesktopShellDoctorCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  detail?: string
}

export interface DesktopShellDoctorReport {
  target: string
  generatedAt: string
  checks: DesktopShellDoctorCheck[]
}

interface TerminalSession {
  id: string
  kind: DesktopShellKind
  pty: PtyTypes.IPty
  owner: WebContents
  removeOwnerListener: () => void
}

const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const SHELL_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const execFileAsync = promisify(execFile)

function resolveShellSessionId(value: unknown): string {
  if (value === undefined) return randomUUID()
  if (typeof value !== 'string' || !SHELL_SESSION_ID_PATTERN.test(value)) {
    throw new Error('Shell session id must be a valid UUID v4')
  }
  return value
}

function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return resolve(homedir(), value.slice(2))
  return value
}

function clampDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(2, Math.min(500, Math.floor(value)))
    : fallback
}

function resolveCwd(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return homedir()
  const candidate = resolve(value.trim())
  try {
    return statSync(candidate).isDirectory() ? candidate : homedir()
  } catch {
    return homedir()
  }
}

function defaultLocalShell(): string {
  if (platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

function normalizeLocalCommand(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const command = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
  const file = command[0]
  if (!file) return null
  return [file, ...command.slice(1)]
}

function normalizeShellEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const env: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!key || typeof item !== 'string') continue
    env[key] = item
  }
  return env
}

function normalizeTerminalType(input: DesktopShellStartInput): string {
  const fromInput = input.terminalType?.trim()
  const fromSsh = input.ssh?.terminalType?.trim()
  return fromSsh || fromInput || 'xterm-256color'
}

function normalizeEncoding(input: DesktopShellStartInput): string | undefined {
  return input.ssh?.encoding?.trim() || input.encoding?.trim() || undefined
}

function normalizeSshTarget(input: DesktopShellStartInput['ssh']): {
  host: string
  target: string
  port: number
  identityFile?: string
  jumpHost?: string
  proxyCommand?: string
  localForwards: string[]
  remoteEnv: string[]
  keepAlive: boolean
  agentForwarding: boolean
  x11Forwarding: boolean
  compression: boolean
  terminalType?: string
  encoding?: string
} {
  const host = input?.host?.trim()
  if (!host) {
    throw new Error('SSH host is required')
  }
  const user = input?.user?.trim()
  const port =
    typeof input?.port === 'number' && Number.isFinite(input.port)
      ? Math.max(1, Math.min(65_535, Math.floor(input.port)))
      : 22
  return {
    host,
    target: user ? `${user}@${host}` : host,
    port,
    identityFile: input?.identityFile?.trim() || undefined,
    jumpHost: input?.jumpHost?.trim() || undefined,
    proxyCommand: input?.proxyCommand?.trim() || undefined,
    localForwards: Array.isArray(input?.localForwards)
      ? input.localForwards
          .filter((forward): forward is string => typeof forward === 'string')
          .map((forward) => forward.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    remoteEnv: Array.isArray(input?.remoteEnv)
      ? input.remoteEnv
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 24)
      : [],
    keepAlive: Boolean(input?.keepAlive),
    agentForwarding: Boolean(input?.agentForwarding),
    x11Forwarding: Boolean(input?.x11Forwarding),
    compression: Boolean(input?.compression),
    terminalType: input?.terminalType?.trim() || undefined,
    encoding: input?.encoding?.trim() || undefined,
  }
}

export function readDefaultSshConfig(): string | null {
  try {
    const path = join(homedir(), '.ssh', 'config')
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

async function commandOutput(file: string, args: string[]): Promise<string> {
  const result = await execFileAsync(file, args, { timeout: 4000 })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

async function canConnect(host: string, port: number, timeoutMs = 2500): Promise<string | null> {
  return new Promise((resolveResult) => {
    const socket = new Socket()
    let finished = false
    const finish = (message: string | null) => {
      if (finished) return
      finished = true
      socket.destroy()
      resolveResult(message)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(null))
    socket.once('timeout', () => finish('connection timed out'))
    socket.once('error', (error) => finish(error.message))
    socket.connect(port, host)
  })
}

function addCheck(
  checks: DesktopShellDoctorCheck[],
  check: DesktopShellDoctorCheck,
): DesktopShellDoctorCheck[] {
  checks.push(check)
  return checks
}

export async function diagnoseShellTarget(
  input: DesktopShellStartInput,
): Promise<DesktopShellDoctorReport> {
  const kind = input.kind === 'ssh' ? 'ssh' : 'local'
  const checks: DesktopShellDoctorCheck[] = []

  if (kind === 'local') {
    const shellPath = defaultLocalShell()
    addCheck(checks, {
      id: 'local-shell',
      label: 'Local shell',
      status: shellPath ? 'pass' : 'fail',
      message: shellPath ? `Default shell: ${shellPath}` : 'No local shell was resolved.',
    })
    return {
      target: shellPath || 'local shell',
      generatedAt: new Date().toISOString(),
      checks,
    }
  }

  let target: ReturnType<typeof normalizeSshTarget>
  try {
    target = normalizeSshTarget(input.ssh)
    addCheck(checks, {
      id: 'target',
      label: 'Target',
      status: 'pass',
      message: `${target.target}:${target.port}`,
    })
  } catch (error) {
    addCheck(checks, {
      id: 'target',
      label: 'Target',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      target: 'ssh',
      generatedAt: new Date().toISOString(),
      checks,
    }
  }

  try {
    const version = await commandOutput('ssh', ['-V'])
    addCheck(checks, {
      id: 'ssh-binary',
      label: 'SSH binary',
      status: 'pass',
      message: version || 'ssh is available',
    })
  } catch (error) {
    addCheck(checks, {
      id: 'ssh-binary',
      label: 'SSH binary',
      status: 'fail',
      message: 'ssh executable is not available on PATH.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  if (target.identityFile) {
    const keyPath = resolve(expandHome(target.identityFile))
    try {
      const stat = statSync(keyPath)
      addCheck(checks, {
        id: 'identity-file',
        label: 'Identity file',
        status: stat.isFile() ? 'pass' : 'fail',
        message: stat.isFile() ? keyPath : `${keyPath} is not a regular file.`,
      })
      if (platform !== 'win32') {
        const mode = stat.mode & 0o777
        if ((mode & 0o077) !== 0) {
          addCheck(checks, {
            id: 'identity-file-mode',
            label: 'Identity file permissions',
            status: 'warn',
            message: `${keyPath} is ${mode.toString(8)}; OpenSSH may reject overly open keys.`,
          })
        } else {
          addCheck(checks, {
            id: 'identity-file-mode',
            label: 'Identity file permissions',
            status: 'pass',
            message: `${keyPath} permissions look restricted.`,
          })
        }
      }
    } catch {
      addCheck(checks, {
        id: 'identity-file',
        label: 'Identity file',
        status: 'fail',
        message: `${keyPath} does not exist or cannot be read.`,
      })
    }
  } else {
    addCheck(checks, {
      id: 'identity-file',
      label: 'Identity file',
      status: 'warn',
      message: 'No explicit identity file is configured. SSH agent or password auth must work.',
    })
  }

  if (process.env.SSH_AUTH_SOCK || platform === 'win32') {
    try {
      const output = await commandOutput('ssh-add', ['-l'])
      addCheck(checks, {
        id: 'ssh-agent',
        label: 'SSH agent',
        status: output.includes('The agent has no identities') ? 'warn' : 'pass',
        message: output || 'SSH agent is available.',
      })
    } catch (error) {
      addCheck(checks, {
        id: 'ssh-agent',
        label: 'SSH agent',
        status: target.identityFile ? 'warn' : 'fail',
        message: target.identityFile
          ? 'SSH agent could not be queried, but an identity file is configured.'
          : 'SSH agent could not be queried and no identity file is configured.',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    addCheck(checks, {
      id: 'ssh-agent',
      label: 'SSH agent',
      status: target.identityFile ? 'warn' : 'fail',
      message: target.identityFile
        ? 'SSH_AUTH_SOCK is not set; key file auth may still work.'
        : 'SSH_AUTH_SOCK is not set and no identity file is configured.',
    })
  }

  if (target.proxyCommand || target.jumpHost) {
    addCheck(checks, {
      id: 'network-route',
      label: 'Network route',
      status: 'warn',
      message: target.proxyCommand
        ? 'ProxyCommand is configured; direct DNS/TCP checks may not reflect the final route.'
        : `ProxyJump is configured (${target.jumpHost}); direct TCP checks may not reflect the final route.`,
    })
  } else {
    try {
      const result = await lookup(target.host)
      addCheck(checks, {
        id: 'dns',
        label: 'DNS',
        status: 'pass',
        message: `${target.host} resolves to ${result.address}`,
      })
    } catch (error) {
      addCheck(checks, {
        id: 'dns',
        label: 'DNS',
        status: 'fail',
        message: `${target.host} could not be resolved.`,
        detail: error instanceof Error ? error.message : String(error),
      })
    }

    const connectError = await canConnect(target.host, target.port)
    addCheck(checks, {
      id: 'tcp',
      label: 'TCP reachability',
      status: connectError ? 'fail' : 'pass',
      message: connectError
        ? `${target.host}:${target.port} is not reachable (${connectError}).`
        : `${target.host}:${target.port} accepted a TCP connection.`,
    })
  }

  return {
    target: `${target.target}:${target.port}`,
    generatedAt: new Date().toISOString(),
    checks,
  }
}

function buildLaunch(input: DesktopShellStartInput): {
  kind: DesktopShellKind
  file: string
  args: string[]
  title: string
  command: string
} {
  const kind = input.kind === 'ssh' ? 'ssh' : 'local'
  if (kind === 'ssh') {
    const {
      target,
      port,
      identityFile,
      jumpHost,
      proxyCommand,
      localForwards,
      remoteEnv,
      keepAlive,
      agentForwarding,
      x11Forwarding,
      compression,
    } = normalizeSshTarget(input.ssh)
    const args = ['-o', 'RequestTTY=force', '-p', String(port)]
    if (identityFile) {
      args.push('-i', identityFile)
    }
    if (jumpHost) {
      args.push('-J', jumpHost)
    }
    if (proxyCommand) {
      args.push('-o', `ProxyCommand=${proxyCommand}`)
    }
    if (keepAlive) {
      args.push('-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3')
    }
    if (agentForwarding) {
      args.push('-A')
    }
    if (x11Forwarding) {
      args.push('-X')
    }
    if (compression) {
      args.push('-C')
    }
    for (const forward of localForwards) {
      args.push('-L', forward)
    }
    for (const env of remoteEnv) {
      args.push('-o', `SetEnv=${env}`)
    }
    args.push(target)
    const sshBinary = platform === 'win32' ? 'ssh.exe' : 'ssh'
    return {
      kind,
      file: sshBinary,
      args,
      title: target,
      command: [sshBinary, ...args].join(' '),
    }
  }

  const localCommand = normalizeLocalCommand(input.command)
  if (localCommand) {
    const localLaunch = resolveLocalCommandLaunch(localCommand)
    return {
      kind,
      file: localLaunch.file,
      args: localLaunch.args,
      title: input.title?.trim() || localCommand[0]!,
      command: localLaunch.command,
    }
  }

  const file = defaultLocalShell()
  return {
    kind,
    file,
    args: [],
    title: platform === 'win32' ? 'Local PowerShell' : 'Local Shell',
    command: file,
  }
}

export class DesktopTerminalSessions {
  private readonly sessions = new Map<string, TerminalSession>()

  start(input: DesktopShellStartInput, owner: WebContents): DesktopShellSessionInfo {
    const id = resolveShellSessionId(input.id)
    if (this.sessions.has(id)) {
      throw new Error('Shell session id is already active')
    }
    const launch = buildLaunch(input)
    const cwd = resolveCwd(input.cwd)
    const terminalType = normalizeTerminalType(input)
    const encoding = normalizeEncoding(input)
    const terminal = getPty().spawn(launch.file, launch.args, {
      name: terminalType,
      cols: clampDimension(input.cols, DEFAULT_COLS),
      rows: clampDimension(input.rows, DEFAULT_ROWS),
      cwd,
      env: {
        ...process.env,
        TERM: terminalType,
        COLORTERM: 'truecolor',
        ...normalizeShellEnv(input.env),
        ...(encoding ? { LC_CTYPE: encoding } : {}),
      },
    })

    const onOwnerDestroyed = () => {
      this.kill(id)
    }
    const session: TerminalSession = {
      id,
      kind: launch.kind,
      pty: terminal,
      owner,
      removeOwnerListener: () => {
        owner.removeListener('destroyed', onOwnerDestroyed)
      },
    }
    this.sessions.set(id, session)
    owner.once('destroyed', onOwnerDestroyed)

    terminal.onData((data) => {
      if (!owner.isDestroyed()) {
        owner.send(`sepilot:shell:data:${id}`, data)
      }
    })
    terminal.onExit((event) => {
      this.sessions.delete(id)
      session.removeOwnerListener()
      if (!owner.isDestroyed()) {
        owner.send(`sepilot:shell:exit:${id}`, event)
      }
    })

    return {
      id,
      kind: launch.kind,
      pid: terminal.pid,
      title: launch.title,
      command: launch.command,
      cwd,
    }
  }

  write(id: unknown, data: unknown): void {
    if (typeof id !== 'string' || typeof data !== 'string') return
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: unknown, cols: unknown, rows: unknown): void {
    if (typeof id !== 'string') return
    this.sessions
      .get(id)
      ?.pty.resize(clampDimension(cols, DEFAULT_COLS), clampDimension(rows, DEFAULT_ROWS))
  }

  kill(id: unknown): void {
    if (typeof id !== 'string') return
    const session = this.sessions.get(id)
    if (!session) return
    try {
      session.pty.kill()
    } catch {
      return
    }
    this.sessions.delete(id)
    session.removeOwnerListener()
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.kill(id)
    }
  }
}
