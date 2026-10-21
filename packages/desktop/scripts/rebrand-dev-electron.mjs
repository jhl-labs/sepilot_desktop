import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'sepilot'
const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = join(scriptDir, '..')

function plistGet(plistPath, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath])
      .toString()
      .trim()
  } catch {
    return null
  }
}

function plistSet(plistPath, key, value) {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath])
}

function main() {
  if (process.platform !== 'darwin') return

  const require = createRequire(import.meta.url)
  let electronPkgDir
  try {
    electronPkgDir = dirname(require.resolve('electron/package.json', { paths: [desktopDir] }))
  } catch {
    return
  }

  const appPath = join(electronPkgDir, 'dist', 'Electron.app')
  if (!existsSync(appPath)) {
    console.warn(`[rebrand-dev-electron] expected ${appPath}, skipping`)
    return
  }

  const plistPath = join(appPath, 'Contents', 'Info.plist')
  if (plistGet(plistPath, 'CFBundleName') === APP_NAME) return

  plistSet(plistPath, 'CFBundleName', APP_NAME)
  plistSet(plistPath, 'CFBundleDisplayName', APP_NAME)

  const customIcon = join(desktopDir, 'build', 'icon.icns')
  const bundledIconName = plistGet(plistPath, 'CFBundleIconFile')
  if (existsSync(customIcon) && bundledIconName) {
    copyFileSync(customIcon, join(appPath, 'Contents', 'Resources', bundledIconName))
  }

  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])

  console.log(`[rebrand-dev-electron] branded dev Electron.app Dock name/icon as ${APP_NAME}`)
}

main()
