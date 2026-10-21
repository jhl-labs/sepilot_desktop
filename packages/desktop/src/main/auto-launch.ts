import { app } from 'electron'
import { spawnSync } from 'node:child_process'
import { win32 } from 'node:path'

const USER_DATA_DIR_ARG_PREFIX = '--user-data-dir='
const USER_DATA_DIR_ENV = 'SEPILOT_LAUNCHER_USER_DATA_DIR'
const WINDOWS_LOGIN_ITEM_NAME = 'com.sepilot.desktop'
const LEGACY_WINDOWS_LOGIN_ITEM_NAMES = [WINDOWS_LOGIN_ITEM_NAME, 'electron.app.Electron'] as const
const WINDOWS_RUN_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
const WINDOWS_STARTUP_APPROVED_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
const LEGACY_RUNTIME_EXE_PATTERN = /\\sepilot\\runtime\\[0-9a-f]{64}\\sepilotd\.exe(?=["\s]|$)/iu

interface WindowsLoginItemTarget {
  path: string
  args: string[]
}

interface RegistryQueryResult {
  found: boolean
  output: string
}

interface LegacyCachedLoginItem {
  name: string
  enabled: boolean
}

export interface AutoLaunchState {
  enabled: boolean
  supported: boolean
}

let cachedAutoLaunchState: AutoLaunchState | null = null

function effectiveWindowsUserDataDir(): string | undefined {
  const fromLauncher = process.env[USER_DATA_DIR_ENV]
  if (fromLauncher && win32.isAbsolute(fromLauncher) && !fromLauncher.includes('"')) {
    return fromLauncher
  }

  const terminator = process.argv.indexOf('--')
  const electronArgs = terminator === -1 ? process.argv : process.argv.slice(0, terminator)
  const canonicalArg = electronArgs.find(
    (arg) =>
      arg.startsWith(USER_DATA_DIR_ARG_PREFIX) && arg.length > USER_DATA_DIR_ARG_PREFIX.length,
  )
  const fromArgument = canonicalArg?.slice(USER_DATA_DIR_ARG_PREFIX.length)
  return fromArgument && win32.isAbsolute(fromArgument) && !fromArgument.includes('"')
    ? fromArgument
    : undefined
}

function windowsLoginUserDataArg(userDataDir: string): string {
  if (!/\s/u.test(userDataDir)) return `${USER_DATA_DIR_ARG_PREFIX}${userDataDir}`

  const quotedPath = userDataDir.replace(/(\\+)$/u, '$1$1')
  return `${USER_DATA_DIR_ARG_PREFIX}"${quotedPath}"`
}

function queryRegistryValue(key: string, name: string): RegistryQueryResult | undefined {
  const result = spawnSync('reg.exe', ['query', key, '/v', name], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result.error || result.status === null) return undefined
  return {
    found: result.status === 0,
    output: typeof result.stdout === 'string' ? result.stdout : '',
  }
}

function findLegacyCachedLoginItem(): LegacyCachedLoginItem | undefined {
  for (const name of LEGACY_WINDOWS_LOGIN_ITEM_NAMES) {
    const runItem = queryRegistryValue(WINDOWS_RUN_KEY, name)
    if (!runItem?.found || !LEGACY_RUNTIME_EXE_PATTERN.test(runItem.output)) continue

    const approval = queryRegistryValue(WINDOWS_STARTUP_APPROVED_KEY, name)
    if (!approval) return undefined
    if (!approval.found) return { name, enabled: true }

    const binary = /\bREG_BINARY\s+([0-9a-f]+)/iu.exec(approval.output)?.[1]
    return {
      name,
      enabled: binary?.startsWith('00') === true || binary?.startsWith('02') === true,
    }
  }
  return undefined
}

function resolveWindowsLoginItemTarget(): WindowsLoginItemTarget | undefined {
  if (process.platform !== 'win32') return undefined

  const portableExecutable = process.env.PORTABLE_EXECUTABLE_FILE?.trim()
  if (!portableExecutable || !win32.isAbsolute(portableExecutable)) return undefined

  const userDataDir = effectiveWindowsUserDataDir()

  return {
    path: portableExecutable,
    args: userDataDir ? [windowsLoginUserDataArg(userDataDir)] : [],
  }
}

function writeWindowsLoginItem(
  enabled: boolean,
  target: WindowsLoginItemTarget,
  legacyName?: string,
): void {
  app.setLoginItemSettings({ openAtLogin: false })
  if (legacyName && legacyName !== WINDOWS_LOGIN_ITEM_NAME) {
    app.setLoginItemSettings({ openAtLogin: false, name: legacyName })
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled,
    name: WINDOWS_LOGIN_ITEM_NAME,
    ...target,
  })
}

export function getAutoLaunchState(options: { refresh?: boolean } = {}): AutoLaunchState {
  if (!options.refresh && cachedAutoLaunchState) return cachedAutoLaunchState

  if (process.platform === 'linux') {
    cachedAutoLaunchState = { enabled: false, supported: false }
    return cachedAutoLaunchState
  }
  const loginItemTarget = resolveWindowsLoginItemTarget()
  if (loginItemTarget) {
    const settings = app.getLoginItemSettings(loginItemTarget)
    if (settings.openAtLogin) {
      cachedAutoLaunchState = { enabled: true, supported: true }
      return cachedAutoLaunchState
    }
    const legacy = findLegacyCachedLoginItem()
    if (legacy?.enabled) {
      writeWindowsLoginItem(true, loginItemTarget, legacy.name)
      cachedAutoLaunchState = { enabled: true, supported: true }
      return cachedAutoLaunchState
    }
    cachedAutoLaunchState = { enabled: false, supported: true }
    return cachedAutoLaunchState
  }
  const settings = app.getLoginItemSettings()
  cachedAutoLaunchState = { enabled: settings.openAtLogin, supported: true }
  return cachedAutoLaunchState
}

export function setAutoLaunchEnabled(enabled: boolean): AutoLaunchState {
  if (process.platform === 'linux') {
    cachedAutoLaunchState = { enabled: false, supported: false }
    return cachedAutoLaunchState
  }
  const loginItemTarget = resolveWindowsLoginItemTarget()
  if (loginItemTarget) {
    writeWindowsLoginItem(enabled, loginItemTarget, findLegacyCachedLoginItem()?.name)
    cachedAutoLaunchState = { enabled, supported: true }
    return cachedAutoLaunchState
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled,
  })
  cachedAutoLaunchState = { enabled, supported: true }
  return cachedAutoLaunchState
}
