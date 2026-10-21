export interface MacDevDockApp {
  dock?: {
    isVisible(): boolean
    show(): Promise<void>
  }
  setActivationPolicy?(policy: 'regular'): void
}

function isMacDev(options: { platform: NodeJS.Platform; isPackaged: boolean }): boolean {
  return options.platform === 'darwin' && !options.isPackaged
}

export function configureMacDevDock(
  app: MacDevDockApp,
  options: { platform: NodeJS.Platform; isPackaged: boolean },
): boolean {
  if (!isMacDev(options)) return false

  app.setActivationPolicy?.('regular')
  return true
}

export async function showMacDevDock(
  app: MacDevDockApp,
  options: { platform: NodeJS.Platform; isPackaged: boolean },
): Promise<boolean> {
  if (!isMacDev(options)) return false

  if (!app.dock) return false

  await app.dock.show()
  return app.dock.isVisible()
}
