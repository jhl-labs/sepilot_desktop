import { dirname, join } from 'node:path'
import type { RendererTarget } from './renderer-resolver'

export const QUICK_INPUT_FORWARD_CHANNEL = 'sepilot:quick-input/forward'
export const QUICK_INPUT_PUBLISH_CHANNEL = 'sepilot:quick-input/publish'
export const QUICK_INPUT_OPEN_CHANNEL = 'sepilot:quick-input/open'
export const QUICK_INPUT_REGISTRATION_CHANNEL = 'sepilot:quick-input/registration'
const QUICK_INPUT_ROUTE = '/quick-input/'
export const DEFAULT_QUICK_INPUT_ACCELERATOR = 'CommandOrControl+Alt+Space'

export const QUICK_INPUT_FALLBACK_ACCELERATORS: readonly string[] = [
  'CommandOrControl+Alt+Space',
  'CommandOrControl+Shift+J',
  'CommandOrControl+Alt+J',
  'CommandOrControl+Shift+Space',
]

export type QuickInputRegistrationStatus =
  | 'pending'
  | 'preferred'
  | 'fallback'
  | 'unavailable'
  | 'disabled'

export interface QuickInputRegistrationState {
  requestedAccelerator: string
  activeAccelerator: string | null
  attemptedAccelerators: string[]
  status: QuickInputRegistrationStatus
}

export function normalizeQuickInputText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

export function normalizeQuickInputAccelerator(value: unknown): string {
  return normalizeQuickInputText(value) ?? DEFAULT_QUICK_INPUT_ACCELERATOR
}

export function resolveQuickInputRendererTarget(
  target: RendererTarget,
  route = QUICK_INPUT_ROUTE,
): RendererTarget {
  if (target.kind === 'url') {
    const base = target.url.endsWith('/') ? target.url : `${target.url}/`
    return { kind: 'url', url: new URL(route, base).toString() }
  }

  const routeDir = route.replace(/^\/+|\/+$/g, '')
  return {
    kind: 'file',
    path: routeDir
      ? join(dirname(target.path), routeDir, 'index.html')
      : target.path,
  }
}
