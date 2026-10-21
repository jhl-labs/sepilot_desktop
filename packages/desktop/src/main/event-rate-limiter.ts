export interface EventRateLimiterOptions {
  windowMs: number
  maxEntries: number
}

export class EventRateLimiter {
  private readonly lastAcceptedAt = new Map<string, number>()

  constructor(private readonly options: EventRateLimiterOptions) {}

  shouldAccept(key: string, now = Date.now()): boolean {
    const previous = this.lastAcceptedAt.get(key)
    if (previous != null && now - previous < this.options.windowMs) return false

    this.lastAcceptedAt.delete(key)
    this.lastAcceptedAt.set(key, now)
    while (this.lastAcceptedAt.size > this.options.maxEntries) {
      const oldest = this.lastAcceptedAt.keys().next().value
      if (typeof oldest !== 'string') break
      this.lastAcceptedAt.delete(oldest)
    }
    return true
  }
}
