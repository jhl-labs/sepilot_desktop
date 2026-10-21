import { join, normalize, sep } from 'node:path'

export function mapAppUrlToFile(url: string, root: string): string {
  const parsed = new URL(url)
  const rawPath = decodeURIComponent(parsed.pathname || '/')
  const trimmed = rawPath.replace(/^\/+/, '')
  const hasExt = /\.[a-z0-9]+$/i.test(trimmed)
  const relative = hasExt
    ? trimmed
    : `${trimmed.replace(/\/+$/, '')}/index.html`.replace(/^\/+/, '')
  const normalized = normalize(join(root, relative))
  const normalizedRoot = normalize(root)
  if (
    !normalized.startsWith(normalizedRoot + sep) &&
    normalized !== normalizedRoot
  ) {
    throw new Error('Path traversal blocked')
  }
  return normalized
}

export const APP_PROTOCOL_NAME = 'app'
export const APP_PROTOCOL_HOST = 'index'
export const APP_PROTOCOL_ENTRY_URL = `${APP_PROTOCOL_NAME}://${APP_PROTOCOL_HOST}/`

export function pickMime(ext: string | undefined): string {
  switch (ext) {
    case 'html':
      return 'text/html; charset=utf-8'
    case 'js':
      return 'text/javascript; charset=utf-8'
    case 'css':
      return 'text/css; charset=utf-8'
    case 'json':
      return 'application/json; charset=utf-8'
    case 'txt':
      return 'text/plain; charset=utf-8'
    case 'svg':
      return 'image/svg+xml'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

export function appProtocolResponseHeaders(
  filePath: string,
  contentSecurityPolicy: string,
): Record<string, string> {
  const ext = /\.([a-z0-9]+)$/i.exec(filePath)?.[1]?.toLowerCase()
  const headers: Record<string, string> = {
    'content-type': pickMime(ext),
    'x-content-type-options': 'nosniff',
  }
  if (ext === 'html') headers['content-security-policy'] = contentSecurityPolicy
  return headers
}
