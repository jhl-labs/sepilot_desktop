import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath))
  return (
    relativePath === '' ||
    (relativePath.length > 0 && !relativePath.startsWith('..') && !isAbsolute(relativePath))
  )
}

function httpOrigin(value: string | undefined | null): string | null {
  if (!value) return null
  const url = parseUrl(value)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null
  if (url.username || url.password) return null
  return url.origin
}

function isAllowedAppProtocolUrl(url: URL, options: MainFrameNavigationOptions): boolean {
  if (url.protocol !== `${options.appProtocolName}:`) return false
  if (url.hostname !== options.appProtocolHost || url.port) return false
  if (url.username || url.password) return false

  try {
    return !decodeURIComponent(url.pathname).includes('\0')
  } catch {
    return false
  }
}

function isAllowedRendererFileUrl(url: URL, rendererAssetRoots: readonly string[]): boolean {
  if (url.protocol !== 'file:' || url.username || url.password) return false

  try {
    const candidatePath = fileURLToPath(url)
    return rendererAssetRoots.some((rootPath) => isPathInside(rootPath, candidatePath))
  } catch {
    return false
  }
}

export interface MainFrameNavigationOptions {
  rendererDevUrl?: string | null
  rendererAssetRoots: readonly string[]
  appProtocolName: string
  appProtocolHost: string
}

export function isHttpOrHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false
  const url = parseUrl(value)
  return (
    (url?.protocol === 'http:' || url?.protocol === 'https:') &&
    !url.username &&
    !url.password
  )
}

export function isAllowedMainFrameNavigation(
  value: string,
  options: MainFrameNavigationOptions,
): boolean {
  const url = parseUrl(value)
  if (!url) return false

  if (isAllowedAppProtocolUrl(url, options)) return true
  if (isAllowedRendererFileUrl(url, options.rendererAssetRoots)) return true

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false

  const rendererDevOrigin = httpOrigin(options.rendererDevUrl)
  return rendererDevOrigin != null && url.origin === rendererDevOrigin
}

const RENDERER_PERMISSIONS = new Set([
  'media',
  'notifications',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
])

export function isRendererPermissionAllowed(input: {
  permission: string
  requestingUrl: string | undefined
  mediaTypes?: readonly string[]
  navigation: MainFrameNavigationOptions | null
}): boolean {
  if (!input.navigation || !input.requestingUrl) return false
  if (!RENDERER_PERMISSIONS.has(input.permission)) return false
  if (input.permission === 'media' && input.mediaTypes?.some((type) => type !== 'audio')) return false
  return isAllowedMainFrameNavigation(input.requestingUrl, input.navigation)
}
