export interface DesktopLifecycleApp {
  whenReady(): Promise<void>
  on?(event: 'before-quit', listener: () => void): void
}

export interface DesktopLifecycleHandlers {
  onAppReady?: () => Promise<void> | void
  onServiceStartupError?: (
    service: 'daemon' | 'gateway',
    error: unknown,
  ) => void
  onDaemonReady?: () => Promise<void> | void
  onGatewayReady?: () => Promise<void> | void
  startDaemon: () => Promise<{ ready: boolean }>
  startGateway?: () => Promise<{ ready: boolean }>
  stopGateway?: () => void
  onReady: () => Promise<void> | void
}

export function wireDesktopDaemonLifecycle(
  app: DesktopLifecycleApp,
  handlers: DesktopLifecycleHandlers,
): Promise<void> {
  let quitRequested = false
  const startup = app.whenReady().then(async () => {
    await handlers.onAppReady?.()

    void (async () => {
      try {
        const daemon = await handlers.startDaemon()
        if (daemon.ready) {
          await handlers.onDaemonReady?.()
        }
      } catch (error) {
        console.warn('[desktop] Failed to auto-start daemon', error)
        handlers.onServiceStartupError?.('daemon', error)
      }

      if (handlers.startGateway && !quitRequested) {
        try {
          const gateway = await handlers.startGateway()
          if (gateway.ready && !quitRequested) {
            await handlers.onGatewayReady?.()
          }
        } catch (error) {
          console.warn('[desktop] Failed to auto-start gateway', error)
          handlers.onServiceStartupError?.('gateway', error)
        }
      }
    })()

    await handlers.onReady()
  })

  if (handlers.stopGateway && app.on) {
    app.on('before-quit', () => {
      quitRequested = true
      handlers.stopGateway?.()
    })
  }

  return startup
}
