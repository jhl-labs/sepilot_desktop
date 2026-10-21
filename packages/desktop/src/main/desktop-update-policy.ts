export const DESKTOP_RELEASES_URL = 'https://github.com/jhl-labs/sepilot_desktop/releases'

export type DesktopUpdateMode = 'electron-updater' | 'manual'

export type DesktopUpdatePolicyReason =
  | 'supported-package'
  | 'custom-windows-portable'
  | 'disabled'
  | 'development'

export interface DesktopUpdatePolicy {
  mode: DesktopUpdateMode
  reason: DesktopUpdatePolicyReason
}

export interface DesktopUpdateEnvironment {
  platform: NodeJS.Platform
  portableExecutableFile?: string
  rendererUrl?: string
  disabled: boolean
}

export function resolveDesktopUpdatePolicy(
  environment: DesktopUpdateEnvironment,
): DesktopUpdatePolicy {
  if (environment.disabled) {
    return { mode: 'manual', reason: 'disabled' }
  }

  if (environment.rendererUrl?.trim()) {
    return { mode: 'manual', reason: 'development' }
  }

  if (environment.platform === 'win32' && environment.portableExecutableFile?.trim()) {
    return { mode: 'manual', reason: 'custom-windows-portable' }
  }

  return { mode: 'electron-updater', reason: 'supported-package' }
}
