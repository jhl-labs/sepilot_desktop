import { access, lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { app, clipboard, shell } from 'electron'

type Browser = 'chrome' | 'edge'
interface Distribution {
  chromeStoreUrl: string | null
  edgeStoreUrl: string | null
}
const FILE_NAMES = [
  'manifest.json',
  'background.js',
  'protocol.js',
  'popup.html',
  'popup.js',
  'popup.css',
] as const

export function browserStoreUrl(browser: Browser, distribution: Distribution): string | null {
  const raw = browser === 'chrome' ? distribution.chromeStoreUrl : distribution.edgeStoreUrl
  if (!raw) return null
  const url = new URL(raw)
  const host = browser === 'chrome' ? 'chromewebstore.google.com' : 'microsoftedge.microsoft.com'
  const prefix = browser === 'chrome' ? '/detail/' : '/addons/detail/'
  if (
    url.protocol !== 'https:' ||
    url.hostname !== host ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(prefix) ||
    !/\/[a-p]{32}\/?$/.test(url.pathname)
  ) {
    throw new Error('Invalid browser extension store URL')
  }
  return url.href
}

export function browserCandidates(
  browser: Browser,
  platform: string,
  env: Record<string, string | undefined>,
): string[] {
  if (platform === 'darwin') {
    const executable = browser === 'chrome' ? 'Google Chrome' : 'Microsoft Edge'
    return [
      `/Applications/${executable}.app/Contents/MacOS/${executable}`,
      ...(env.HOME
        ? [join(env.HOME, 'Applications', `${executable}.app`, 'Contents', 'MacOS', executable)]
        : []),
    ]
  }
  if (platform === 'win32') {
    const suffix =
      browser === 'chrome'
        ? ['Google', 'Chrome', 'Application', 'chrome.exe']
        : ['Microsoft', 'Edge', 'Application', 'msedge.exe']
    return [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter((path): path is string => Boolean(path))
      .map((path) => join(path, ...suffix))
  }
  return browser === 'chrome'
    ? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome']
    : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge']
}

async function launchBrowser(browser: Browser, url: string): Promise<boolean> {
  for (const executable of browserCandidates(browser, process.platform, process.env)) {
    try {
      await access(executable)
    } catch {
      continue
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [url], { detached: true, stdio: 'ignore', shell: false })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
    return true
  }
  return false
}

export async function prepareBrowserExtension(
  userData: string,
  files: Record<string, string>,
): Promise<string> {
  for (const name of FILE_NAMES) {
    if (typeof files[name] !== 'string' || !files[name])
      throw new Error(`Missing bundled browser asset: ${name}`)
  }
  const manifest = JSON.parse(files['manifest.json']!) as {
    manifest_version?: number
    name?: string
  }
  if (manifest.manifest_version !== 3 || manifest.name !== 'SEPilot Browser Companion')
    throw new Error('Invalid bundled browser manifest')
  const directory = join(userData, 'browser-companion')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (info.isSymbolicLink() || !info.isDirectory())
    throw new Error('Browser extension directory must be a real directory')
  for (const name of FILE_NAMES) {
    const path = join(directory, name)
    const current = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (current?.isSymbolicLink() || (current && !current.isFile()))
      throw new Error('Unexpected browser extension asset type')
    if (current && (await readFile(path, 'utf8')) === files[name]) continue
    const temporary = join(directory, `.${name}.${randomUUID()}.tmp`)
    await writeFile(temporary, files[name]!, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  }
  return directory
}

export async function installBrowserExtension(
  raw: unknown,
  files: Record<string, string>,
  distribution: Distribution,
) {
  const browser = (raw as { browser?: unknown } | null)?.browser
  if (browser !== 'chrome' && browser !== 'edge') throw new Error('Select Chrome or Edge')
  const storeUrl = browserStoreUrl(browser, distribution)
  if (storeUrl) {
    const browserOpened = await launchBrowser(browser, storeUrl)
    if (!browserOpened)
      throw new Error(
        `${browser === 'chrome' ? 'Chrome' : 'Edge'}를 찾을 수 없습니다. 브라우저를 설치한 뒤 다시 시도하세요.`,
      )
    return { method: 'store' as const, browser, storeUrl, browserOpened }
  }
  const directory = await prepareBrowserExtension(app.getPath('userData'), files)
  const browserOpened = await launchBrowser(browser, `${browser}://extensions/`)
  const folderError = await shell.openPath(directory)
  clipboard.writeText(directory)
  return {
    method: 'unpacked' as const,
    browser,
    directory,
    browserOpened,
    folderOpened: !folderError,
  }
}

export async function openChromeInspect(): Promise<{ browserOpened: boolean }> {
  const browserOpened = await launchBrowser('chrome', 'chrome://inspect/#remote-debugging')
  if (!browserOpened) throw new Error('Chrome를 찾을 수 없습니다. Chrome 144 이상을 설치한 뒤 다시 시도하세요.')
  return { browserOpened }
}
