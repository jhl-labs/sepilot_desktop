import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

type LayeredWindow = Pick<BrowserWindow, 'setAlwaysOnTop' | 'setVisibleOnAllWorkspaces'>

export function petWindowPlatformOptions(
  platform: NodeJS.Platform,
): Pick<BrowserWindowConstructorOptions, 'thickFrame'> {
  return platform === 'win32' ? { thickFrame: false } : {}
}

export function configurePetWindowLayer(win: LayeredWindow, platform: NodeJS.Platform): void {
  if (platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    return
  }
  win.setAlwaysOnTop(true)
}
