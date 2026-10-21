export interface NotificationPushBuffer {
  push(payload: unknown): void
  subscribe<T = unknown>(handler: (payload: T) => void): () => void
}

export interface NotificationPushBufferOptions {
  onHandlerError?: (error: unknown, payload: unknown) => void
  maxPending?: number
}

export function createNotificationPushBuffer(
  options: NotificationPushBufferOptions = {},
): NotificationPushBuffer {
  const handlers = new Set<(payload: unknown) => void>()
  const pending: unknown[] = []
  const onHandlerError = options.onHandlerError ?? (() => {})
  const maxPending = Math.max(1, Math.floor(options.maxPending ?? 100))

  function deliver(payload: unknown): void {
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (err) {
        onHandlerError(err, payload)
      }
    }
  }

  return {
    push(payload) {
      if (handlers.size === 0) {
        pending.push(payload)
        if (pending.length > maxPending) {
          pending.splice(0, pending.length - maxPending)
        }
        return
      }
      deliver(payload)
    },

    subscribe<T>(handler: (payload: T) => void): () => void {
      const wrapped = (payload: unknown): void => handler(payload as T)
      handlers.add(wrapped)
      while (pending.length > 0) {
        const buffered = pending.shift()
        try {
          wrapped(buffered)
        } catch (err) {
          onHandlerError(err, buffered)
        }
      }
      return () => {
        handlers.delete(wrapped)
      }
    },
  }
}
