import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type DaemonInvocation,
  type DaemonProcess,
  DaemonClient,
  resolveDaemonInvocation,
  launchDaemon,
  tryAcquireSpawnLock,
  waitForDaemonReady,
} from '@sepilotd/api-client/node'
import {
  DEFAULT_DAEMON_PORT,
  getDesktopDaemonOrigin,
  getDesktopDataDir,
  isDesktopManagedDaemonOrigin,
} from './runtime-config.js'

const DAEMON_INIT_TIMEOUT_MS = 90_000

let daemonProcess: DaemonProcess | null = null
let embeddedDaemon: EmbeddedDaemonHandle | null = null
let startedByDesktop = false

const DAEMON_ORIGIN = getDesktopDaemonOrigin()
const DAEMON_PORT = daemonPortFromOrigin(DAEMON_ORIGIN)
const HEALTH_URL = `${DAEMON_ORIGIN.replace(/\/$/, '')}/api/v1/health`
const HEALTH_PROBE_TIMEOUT_MS = 2_000
const SPAWN_LOCK_WAIT_TIMEOUT_MS = 15_000
const daemonClient = new DaemonClient({ baseUrl: DAEMON_ORIGIN, surface: 'desktop' })

interface EmbeddedDaemonHandle {
  shutdown(reason?: string): Promise<void>
}

interface EmbeddedDaemonModule {
  startEmbeddedDaemon(options: {
    dataDir: string
    port: number
    host: string
    autoApproveCliFlag?: boolean
  }): Promise<EmbeddedDaemonHandle>
}

export type DaemonStartupResult =
  | { ready: true; source: 'existing' | 'peer' | 'embedded' | 'spawned' }
  | {
      ready: false
      source: 'peer' | 'embedded' | 'spawned' | 'remote' | 'unavailable'
    }

function pathExists(path: string): boolean {
  try {
    accessSync(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function moduleSpecifierForPath(pathOrSpecifier: string): string {
  if (/^(file|data):/u.test(pathOrSpecifier)) return pathOrSpecifier
  return pathToFileURL(pathOrSpecifier).href
}

function canAutoStartLocalDaemon(): boolean {
  return !process.env.SEPILOT_TEST_PROFILE && isDesktopManagedDaemonOrigin(DAEMON_ORIGIN)
}

function daemonPortFromOrigin(origin: string): number {
  try {
    const port = Number.parseInt(new URL(origin).port, 10)
    return Number.isFinite(port) && port > 0 ? port : DEFAULT_DAEMON_PORT
  } catch {
    return DEFAULT_DAEMON_PORT
  }
}

function localDaemonHost(): string {
  try {
    return new URL(DAEMON_ORIGIN).hostname
  } catch {
    return '127.0.0.1'
  }
}

function resolveEmbeddedDaemonModule(): string | null {
  const explicit = process.env.SEPILOTD_EMBEDDED_DAEMON_MODULE?.trim()
  if (explicit) return moduleSpecifierForPath(explicit)

  const resourceSearchRoots =
    typeof process.resourcesPath === 'string' ? [process.resourcesPath] : []
  const appPath = app.getAppPath()
  const candidates = [
    ...resourceSearchRoots.flatMap((root) => [
      join(root, 'daemon', 'embedded.js'),
      join(root, 'daemon', 'dist', 'embedded.js'),
    ]),
    join(appPath, '..', 'daemon', 'dist', 'embedded.js'),
    join(appPath, '..', '..', 'sepilot-cli', 'packages', 'daemon', 'dist', 'embedded.js'),
    join(appPath, '..', '..', '..', 'sepilot-cli', 'packages', 'daemon', 'dist', 'embedded.js'),
  ]

  const found = candidates.find(pathExists)
  return found ? pathToFileURL(found).href : null
}

async function startEmbeddedDaemon(dataDir: string): Promise<boolean> {
  if (process.env.SEPILOTD_DISABLE_EMBEDDED_DAEMON === '1') return false

  const moduleSpecifier = resolveEmbeddedDaemonModule()
  if (!moduleSpecifier) return false

  try {
    const module = await import(moduleSpecifier) as EmbeddedDaemonModule
    embeddedDaemon = await module.startEmbeddedDaemon({
      dataDir,
      port: DAEMON_PORT,
      host: localDaemonHost(),
      autoApproveCliFlag: false,
    })
    startedByDesktop = true
    return true
  } catch (error) {
    console.warn('[daemon-lifecycle] embedded daemon start failed', error)
    embeddedDaemon = null
    startedByDesktop = false
    return false
  }
}

async function isDaemonRunning(): Promise<boolean> {
  try {
    await daemonClient.health({
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    })
    return true
  } catch {
    return false
  }
}

export async function startDaemon(): Promise<DaemonStartupResult> {
  if (await isDaemonRunning()) {
    startedByDesktop = false
    return { ready: true, source: 'existing' }
  }

  if (!canAutoStartLocalDaemon()) {
    console.warn(
      '[daemon-lifecycle] skipping local daemon auto-start for non-local daemon origin',
      DAEMON_ORIGIN,
    )
    startedByDesktop = false
    return { ready: false, source: 'remote' }
  }

  const dataDir = getDesktopDataDir()
  const lock = await tryAcquireSpawnLock({
    lockPath: join(dataDir, '.spawn.lock'),
  })
  if (!lock) {
    startedByDesktop = false
    const ready = await waitForDaemonReady(HEALTH_URL, {
      timeoutMs: SPAWN_LOCK_WAIT_TIMEOUT_MS,
    })
    if (!ready) {
      console.warn(
        '[daemon-lifecycle] another spawn is in progress but daemon never became ready',
      )
    }
    return { ready, source: 'peer' }
  }

  try {
    if (await isDaemonRunning()) {
      startedByDesktop = false
      return { ready: true, source: 'existing' }
    }

    if (await startEmbeddedDaemon(dataDir)) {
      const ready = await waitForDaemonReady(HEALTH_URL)
      if (!ready) {
        console.warn('[daemon-lifecycle] embedded daemon did not become ready within 10 seconds')
      }
      return { ready, source: 'embedded' }
    }

    const invocation = resolveDaemonInvocation({
      moduleSearchRoots: [app.getAppPath()],
      resourceSearchRoots:
        typeof process.resourcesPath === 'string' ? [process.resourcesPath] : [],
      scanPnpmLayout: true,
      execPath: process.execPath,
    })

    await writeDaemonResolveTrace(dataDir, invocation)

    if (!invocation) {
      console.warn('[daemon-lifecycle] could not resolve daemon invocation')
      return { ready: false, source: 'unavailable' }
    }

    await ensureDaemonDataDirInitialized(invocation, dataDir)

    const childEnv = {
      ...process.env,
      SEPILOTD_DATA_DIR: dataDir,
      SEPILOTD_PORT: String(DAEMON_PORT),
    } as Record<string, string>

    daemonProcess = launchDaemon(invocation, {
      env: childEnv,
      detached: true,
      stdio: 'ignore',
    })
    startedByDesktop = true

    const ready = await waitForDaemonReady(HEALTH_URL)
    if (!ready) {
      console.warn('[daemon-lifecycle] daemon did not become ready within 10 seconds')
    }
    return { ready, source: 'spawned' }
  } finally {
    await lock.release()
  }
}

export function stopDaemon(): void {
  if (!startedByDesktop) return

  if (embeddedDaemon) {
    void embeddedDaemon.shutdown('desktop stopDaemon')
    embeddedDaemon = null
    startedByDesktop = false
    return
  }

  if (!daemonProcess) return

  try {
    daemonProcess.stop()
  } finally {
    daemonProcess = null
    startedByDesktop = false
  }
}

export function isDaemonOwnedByThisDesktop(): boolean {
  return startedByDesktop
}

const RESOLVE_TRACE_MAX_BYTES = 1_048_576
const RESOLVE_TRACE_KEEP_LINES = 200

async function rotateResolveTraceIfTooLarge(filePath: string): Promise<void> {
  try {
    const st = await stat(filePath)
    if (st.size <= RESOLVE_TRACE_MAX_BYTES) return
    const text = await readFile(filePath, 'utf8')
    const lines = text.split('\n').filter((line) => line.length > 0)
    const kept = lines.slice(-RESOLVE_TRACE_KEEP_LINES).join('\n') + '\n'
    await writeFile(filePath, kept, 'utf8')
  } catch {
  }
}

async function writeDaemonResolveTrace(
  dataDir: string,
  invocation: DaemonInvocation | null,
): Promise<void> {
  try {
    const logDir = join(dataDir, 'logs')
    await mkdir(logDir, { recursive: true })
    const tracePath = join(logDir, 'desktop-daemon-resolve.log')
    await rotateResolveTraceIfTooLarge(tracePath)
    const resourcesPath =
      typeof process.resourcesPath === 'string' ? process.resourcesPath : null
    const trace = {
      ts: new Date().toISOString(),
      execPath: process.execPath,
      appPath: app.getAppPath(),
      resourcesPath,
      isPackaged: app.isPackaged,
      portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR ?? null,
      portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE ?? null,
      daemonResourceDirExists: resourcesPath
        ? existsSync(join(resourcesPath, 'daemon'))
        : null,
      daemonEntryExists: resourcesPath
        ? existsSync(join(resourcesPath, 'daemon', 'dist', 'index.js'))
        : null,
      gatewayResourceDirExists: resourcesPath
        ? existsSync(join(resourcesPath, 'gateway'))
        : null,
      invocation,
    }
    await appendFile(
      tracePath,
      JSON.stringify(trace) + '\n',
      'utf8',
    )
  } catch (err) {
    console.warn('[daemon-lifecycle] failed to write resolve trace:', err)
  }
}

async function ensureDaemonDataDirInitialized(
  invocation: DaemonInvocation,
  dataDir: string,
): Promise<void> {
  if (existsSync(join(dataDir, 'config.yaml'))) return
  await runDaemonInit(invocation, dataDir)
}

function runDaemonInit(
  invocation: DaemonInvocation,
  dataDir: string,
): Promise<void> {
  const args = [...invocation.args, 'init']
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SEPILOTD_DATA_DIR: dataDir,
    SEPILOTD_PORT: String(DAEMON_PORT),
    ...(invocation.kind === 'module' ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }

  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(invocation.command, args, {
      cwd: invocation.kind === 'module' ? dirname(invocation.args[0]) : undefined,
      env: childEnv,
      stdio: 'ignore',
      windowsHide: process.platform === 'win32',
    })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
      }
      reject(
        new Error(
          `Daemon initialization timed out after ${Math.round(
            DAEMON_INIT_TIMEOUT_MS / 1000,
          )} seconds while preparing ${dataDir}.`,
        ),
      )
    }, DAEMON_INIT_TIMEOUT_MS)

    child.once('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Daemon initialization failed with ${code === null ? `signal ${signal}` : `exit code ${code}`}. Data dir: ${dataDir}`,
        ),
      )
    })
  })
}
