import { dirname, join } from 'node:path'
import type { RendererTarget } from './renderer-resolver'

export const NOTIFICATION_PUSH_CHANNEL = 'sepilot:notifications/push'
export const NOTIFICATION_PUBLISH_CHANNEL = 'sepilot:notifications/publish'
export const NOTIFICATION_OPEN_CHANNEL = 'sepilot:notifications/open'
export const NOTIFICATION_DISMISS_CHANNEL = 'sepilot:notifications/dismiss'
export const NOTIFICATION_OPENED_CHANNEL = 'sepilot:notification/opened'
const NOTIFICATION_ROUTE = '/notification/'
const DEFAULT_NOTIFICATION_VISIBLE_MS = 10_000
const APPROVAL_NOTIFICATION_VISIBLE_MS = 45_000

export interface DesktopNotificationPayload {
  id: string
  title: string
  body: string
  url: string | null
  topic: string | null
  createdAt: number
  readAt: number | null
}

function normalizeString(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().slice(0, maxLength)
  return text.length > 0 ? text : null
}

function normalizeOptionalString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeUrl(value: unknown, maxLength: number): string | null {
  if (value == null) return null
  const text = normalizeOptionalString(value, maxLength)
  return text.length > 0 ? text : null
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Date.now()
  return Number.isNaN(new Date(value).getTime()) ? Date.now() : value
}

function normalizeReadAt(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

export function normalizeNotificationPayload(
  value: unknown,
): DesktopNotificationPayload | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const title = normalizeString(record.title)
  if (!title) return null

  return {
    id: normalizeString(record.id) ?? `notification-${Date.now()}`,
    title,
    body: normalizeOptionalString(record.body, 2_000),
    url: normalizeUrl(record.url, 2_048),
    topic: normalizeUrl(record.topic, 512),
    createdAt: normalizeTimestamp(record.createdAt),
    readAt: normalizeReadAt(record.readAt),
  }
}

export function notificationSessionId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const target = new URL(url)
    if (target.protocol !== 'sepilotd:' || target.hostname !== 'chat') return null
    return normalizeString(target.searchParams.get('sessionId'), 240)
  } catch {
    return null
  }
}

export function notificationTargetView(url: string | null | undefined): 'chat' | 'tasks' | null {
  if (!url) return null
  try {
    const target = new URL(url)
    if (target.protocol !== 'sepilotd:') return null
    return target.hostname === 'chat' || target.hostname === 'tasks' ? target.hostname : null
  } catch {
    return null
  }
}

export function notificationJobId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const target = new URL(url)
    if (target.protocol !== 'sepilotd:' || target.hostname !== 'tasks') return null
    return normalizeString(target.searchParams.get('jobId'), 240)
  } catch {
    return null
  }
}

export function notificationVisibleDurationMs(
  payload: Pick<DesktopNotificationPayload, 'title' | 'topic'>,
): number {
  return payload.topic?.startsWith('approval:') && !/^Approval expired:/i.test(payload.title)
    ? APPROVAL_NOTIFICATION_VISIBLE_MS
    : DEFAULT_NOTIFICATION_VISIBLE_MS
}

export function resolveNotificationRendererTarget(
  target: RendererTarget,
  route = NOTIFICATION_ROUTE,
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
