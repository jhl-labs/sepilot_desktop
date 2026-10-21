'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DaemonChatBackgroundStartResult,
  DaemonChatBackgroundStatusResult,
} from '@sepilotd/api-client'
import type { Transport } from '@/lib/transport/transport-adapter'
import {
  createBackgroundWorkApi,
  type BackgroundChatOptions,
  type BackgroundWorkApi,
} from '@/lib/api/background-work'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

interface TrackedJob {
  jobId: string
  sessionId: string
}

export function useBackgroundChat({
  transport,
  onFinished,
  pollMs = 3000,
}: {
  transport: Transport | null
  onFinished: (job: DaemonChatBackgroundStatusResult) => void
  pollMs?: number
}): {
  api: BackgroundWorkApi | null
  start: (
    message: string,
    sessionId: string,
    options?: BackgroundChatOptions,
  ) => Promise<DaemonChatBackgroundStartResult>
} {
  const [api, setApi] = useState<BackgroundWorkApi | null>(null)
  const [tracked, setTracked] = useState<TrackedJob[]>([])
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    setApi(null)
    if (!transport) return
    let cancelled = false
    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      const next = await createBackgroundWorkApi(transport)
      if (!cancelled) setApi(next)
    })().catch(() => {
    })
    return () => {
      cancelled = true
    }
  }, [transport])

  const start = useCallback(
    async (message: string, sessionId: string, options?: BackgroundChatOptions) => {
      if (!api) throw new Error('daemon unavailable')
      const started = await api.startBackgroundChat(message, sessionId, options)
      setTracked((current) =>
        current.some((job) => job.jobId === started.jobId)
          ? current
          : [...current, { jobId: started.jobId, sessionId: started.sessionId }],
      )
      return started
    },
    [api],
  )

  useEffect(() => {
    if (!api || tracked.length === 0) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        const finished: string[] = []
        await Promise.all(
          tracked.map(async (job) => {
            try {
              const status = await api.backgroundChatStatus(job.jobId)
              if (status.status !== 'running' && !stopped) {
                finished.push(job.jobId)
                onFinishedRef.current(status)
              }
            } catch {
            }
          }),
        )
        if (finished.length > 0 && !stopped) {
          setTracked((current) => current.filter((job) => !finished.includes(job.jobId)))
          return
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), pollMs)
    }
    timer = setTimeout(() => void tick(), pollMs)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [api, pollMs, tracked])

  return { api, start }
}
