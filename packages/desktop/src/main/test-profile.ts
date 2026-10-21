import { mkdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export function desktopNotificationWatchEnabled(
  testProfile: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.SEPILOT_DESKTOP_DISABLE_NOTIFICATION_WATCH === '1'
    || env.SEPILOT_DESKTOP_DISABLE_NOTIFICATION_POLLING === '1') return false
  return !testProfile || env.SEPILOT_TEST_NOTIFICATION_WATCH === '1'
}

export function configureDesktopTestProfile(
  app: { setPath(name: string, path: string): void },
  env: Record<string, string | undefined> = process.env,
): string | null {
  const profile = env.SEPILOT_TEST_PROFILE
  if (!profile) return null
  if (
    !isAbsolute(profile) ||
    !env.SEPILOTD_DATA_DIR ||
    resolve(env.SEPILOTD_DATA_DIR) !== join(resolve(profile), 'daemon')
  )
    throw new Error('A test instance requires an absolute, dedicated profile and daemon directory')
  const userData = join(profile, 'electron')
  mkdirSync(userData, { recursive: true, mode: 0o700 })
  app.setPath('userData', userData)
  app.setPath('sessionData', userData)
  return profile
}
