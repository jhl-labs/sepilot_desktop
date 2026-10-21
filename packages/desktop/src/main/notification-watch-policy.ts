export const NOTIFICATION_WATCH_BASE_RETRY_MS = 5_000
export const NOTIFICATION_WATCH_MAX_RETRY_MS = 5 * 60_000
export const NOTIFICATION_WATCH_STABLE_MS = 30_000

export function notificationWatchRetryDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.min(10, Math.max(0, Math.floor(attempt) - 1))
  const bounded = Math.min(
    NOTIFICATION_WATCH_MAX_RETRY_MS,
    NOTIFICATION_WATCH_BASE_RETRY_MS * 2 ** exponent,
  )
  const jitter = 0.8 + Math.min(1, Math.max(0, random())) * 0.4
  return Math.round(bounded * jitter)
}

export function shouldLogNotificationWatchFailure(attempt: number): boolean {
  const normalized = Math.max(1, Math.floor(attempt))
  return (normalized & (normalized - 1)) === 0
}

export function isNotificationWatchUnavailableStatus(status: number): boolean {
  return status === 404 || status === 410
}

export function isNotificationWatchConnectionStable(
  connectedAt: number,
  now = Date.now(),
): boolean {
  return now - connectedAt >= NOTIFICATION_WATCH_STABLE_MS
}
