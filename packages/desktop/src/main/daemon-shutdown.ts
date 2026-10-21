import { dialog, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DaemonClient } from '@sepilotd/api-client/node'
import {
  getDesktopDaemonOrigin,
  getDesktopDataDirCandidates,
} from './runtime-config.js'

const DAEMON_ORIGIN = getDesktopDaemonOrigin()
const SHUTDOWN_REQUEST_TIMEOUT_MS = 5_000

async function readDaemonToken(): Promise<string | null> {
  for (const dir of getDesktopDataDirCandidates()) {
    try {
      return (
        await readFile(join(dir, 'security', 'daemon.token'), 'utf-8')
      ).trim()
    } catch {
    }
  }
  return null
}

interface ConfirmAndShutdownOptions {
  parentWindow?: BrowserWindow | null
}

export async function confirmAndShutdownDaemon(
  options: ConfirmAndShutdownOptions = {},
): Promise<void> {
  const result = await (options.parentWindow
    ? dialog.showMessageBox(options.parentWindow, {
        type: 'warning',
        buttons: ['Shutdown daemon', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Shutdown daemon',
        message: 'Stop the sepilotd daemon for everyone?',
        detail:
          'All connected desktops, CLIs, and web sessions will lose their connection. ' +
          'Use Close Desktop Window instead if you only want to hide this window.',
      })
    : dialog.showMessageBox({
        type: 'warning',
        buttons: ['Shutdown daemon', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Shutdown daemon',
        message: 'Stop the sepilotd daemon for everyone?',
        detail:
          'All connected desktops, CLIs, and web sessions will lose their connection. ' +
          'Use Close Desktop Window instead if you only want to hide this window.',
      }))

  if (result.response !== 0) return

  const client = new DaemonClient({
    baseUrl: DAEMON_ORIGIN,
    token: await readDaemonToken(),
    surface: 'desktop',
  })

  try {
    await client.systemShutdown({
      signal: AbortSignal.timeout(SHUTDOWN_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Daemon shutdown',
      message: 'Daemon did not respond to the shutdown request',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
