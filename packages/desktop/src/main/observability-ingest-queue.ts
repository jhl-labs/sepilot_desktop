import type { DaemonObservabilityEventInput } from '@sepilotd/api-client'

const DAEMON_OBSERVABILITY_BATCH_MAX = 100
const DEFAULT_BATCH_WINDOW_MS = 10
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_QUEUE_CAPACITY = 512

export type DesktopObservabilityIngestDiagnostic =
  | {
      kind: 'overflow'
      droppedTotal: number
      queueCapacity: number
    }
  | {
      kind: 'send-failed'
      failedBatchSize: number
      failedBatchTotal: number
    }

export interface DesktopObservabilityIngestQueueOptions {
  sendBatch: (events: DaemonObservabilityEventInput[]) => Promise<unknown>
  onDiagnostic?: (diagnostic: DesktopObservabilityIngestDiagnostic) => void
  batchWindowMs?: number
  maxBatchSize?: number
  queueCapacity?: number
}

export interface DesktopObservabilityIngestQueueSnapshot {
  queued: number
  inFlight: number
  outstanding: number
  dropped: number
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value!)))
}

function isSparseDiagnosticCount(count: number): boolean {
  return count > 0 && Number.isInteger(Math.log2(count))
}

export class DesktopObservabilityIngestQueue {
  private readonly sendBatch: DesktopObservabilityIngestQueueOptions['sendBatch']
  private readonly onDiagnostic?: DesktopObservabilityIngestQueueOptions['onDiagnostic']
  private readonly batchWindowMs: number
  private readonly maxBatchSize: number
  private readonly queueCapacity: number
  private readonly queue: DaemonObservabilityEventInput[] = []
  private readonly idleWaiters = new Set<() => void>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushRunning = false
  private inFlight = 0
  private outstanding = 0
  private dropped = 0
  private failedBatches = 0

  constructor(options: DesktopObservabilityIngestQueueOptions) {
    this.sendBatch = options.sendBatch
    this.onDiagnostic = options.onDiagnostic
    this.batchWindowMs = boundedInteger(
      options.batchWindowMs,
      DEFAULT_BATCH_WINDOW_MS,
      0,
      1_000,
    )
    this.maxBatchSize = boundedInteger(
      options.maxBatchSize,
      DEFAULT_BATCH_SIZE,
      1,
      DAEMON_OBSERVABILITY_BATCH_MAX,
    )
    this.queueCapacity = boundedInteger(
      options.queueCapacity,
      DEFAULT_QUEUE_CAPACITY,
      1,
      10_000,
    )
  }

  enqueue(event: DaemonObservabilityEventInput): boolean {
    if (this.outstanding >= this.queueCapacity) {
      this.dropped += 1
      if (isSparseDiagnosticCount(this.dropped)) {
        this.reportDiagnostic({
          kind: 'overflow',
          droppedTotal: this.dropped,
          queueCapacity: this.queueCapacity,
        })
      }
      return false
    }

    this.queue.push(event)
    this.outstanding += 1
    this.scheduleFlush()
    return true
  }

  snapshot(): DesktopObservabilityIngestQueueSnapshot {
    return {
      queued: this.queue.length,
      inFlight: this.inFlight,
      outstanding: this.outstanding,
      dropped: this.dropped,
    }
  }

  whenIdle(): Promise<void> {
    if (this.outstanding === 0 && !this.flushRunning && this.queue.length === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.idleWaiters.add(resolve)
    })
  }

  private reportDiagnostic(diagnostic: DesktopObservabilityIngestDiagnostic): void {
    try {
      this.onDiagnostic?.(diagnostic)
    } catch {
    }
  }

  private scheduleFlush(delayMs = this.batchWindowMs): void {
    if (this.flushRunning || this.flushTimer || this.queue.length === 0) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flushNextBatch()
    }, delayMs)
    this.flushTimer.unref?.()
  }

  private async flushNextBatch(): Promise<void> {
    if (this.flushRunning || this.queue.length === 0) return
    this.flushRunning = true
    const batch = this.queue.splice(0, this.maxBatchSize)
    this.inFlight = batch.length
    try {
      await this.sendBatch(batch)
    } catch {
      this.failedBatches += 1
      if (isSparseDiagnosticCount(this.failedBatches)) {
        this.reportDiagnostic({
          kind: 'send-failed',
          failedBatchSize: batch.length,
          failedBatchTotal: this.failedBatches,
        })
      }
    } finally {
      this.inFlight = 0
      this.outstanding = Math.max(0, this.outstanding - batch.length)
      this.flushRunning = false
      if (this.queue.length > 0) {
        this.scheduleFlush(0)
      } else if (this.outstanding === 0) {
        for (const resolve of this.idleWaiters) resolve()
        this.idleWaiters.clear()
      }
    }
  }
}
