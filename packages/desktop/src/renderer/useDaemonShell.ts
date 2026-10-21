import { useCallback, useEffect, useRef, useState } from 'react'
import { getGatewayWatchHealthFromDaemonHealth } from '@sepilotd/api-client'
import type {
  DaemonHealthReportSnapshot,
  DaemonSessionMeta,
  DaemonSessionsWatchPayload,
  GatewayTicketWatchRevalidateHealth,
} from '@sepilotd/api-client'

interface UseDaemonShellParams {
  onNewChat: () => void
}

function isHealthReportSnapshot(value: unknown): value is DaemonHealthReportSnapshot {
  return Boolean(
    value
    && typeof value === 'object'
    && 'health' in value
    && 'readiness' in value,
  )
}

export function useDaemonShell({
  onNewChat,
}: UseDaemonShellParams) {
  const [sessions, setSessions] = useState<DaemonSessionMeta[]>([])
  const [status, setStatus] = useState<'connected' | 'disconnected'>(
    'disconnected',
  )
  const [healthReportSnapshot, setHealthReportSnapshot] =
    useState<DaemonHealthReportSnapshot | null>(null)
  const [gatewayWatchHealth, setGatewayWatchHealth] =
    useState<GatewayTicketWatchRevalidateHealth | null>(null)
  const [updateBanner, setUpdateBanner] = useState<string | null>(null)
  const prevStatus = useRef(status)

  const refreshSessions = useCallback(() => {
    window.sepilot
      ?.sessions(undefined, { perPage: 50 })
      .then((result) => {
        setSessions(result.items.slice(0, 50))
      })
      .catch(() => {})
  }, [])

  const deleteAllSessions = useCallback(async () => {
    if (!window.sepilot) return

    for (let guard = 0; guard < 1000; guard += 1) {
      const result = await window.sepilot.sessions(undefined, { perPage: 100 })
      if (result.items.length === 0) break

      for (const session of result.items) {
        await window.sepilot.deleteSession(session.id).catch(() => {})
      }
    }

    await refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (status === 'connected' && prevStatus.current === 'disconnected') {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('sepilotd', { body: 'Daemon connected' })
      }
    }
    prevStatus.current = status
  }, [status])

  useEffect(() => {
    window.sepilot.onUpdateDownloaded?.((version: string) => {
      setUpdateBanner(
        `Update v${version} downloaded — restart to apply`,
      )
    })
    window.sepilot.onNewChat?.(() => onNewChat())
  }, [onNewChat])

  useEffect(() => {
    let cancelled = false

    const checkHealth = () => {
      window.sepilot
        ?.health()
        .then((health) => {
          if (cancelled) {
            return
          }
          setStatus('connected')
          setGatewayWatchHealth(getGatewayWatchHealthFromDaemonHealth(health))
          refreshSessions()
        })
        .catch(() => {
          if (cancelled) {
            return
          }
          setStatus('disconnected')
          setHealthReportSnapshot(null)
          setGatewayWatchHealth(null)
        })
    }
    checkHealth()
    refreshSessions()
    const interval = setInterval(checkHealth, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [refreshSessions])

  useEffect(() => {
    if (status !== 'connected') {
      return
    }

    let cancelled = false

    const refreshHealthReport = async () => {
      try {
        const nextValue = await window.sepilot.healthReport('json')
        if (!cancelled) {
          setHealthReportSnapshot(
            isHealthReportSnapshot(nextValue) ? nextValue : null,
          )
        }
      } catch {
        if (!cancelled) {
          setHealthReportSnapshot(null)
        }
      }
    }

    void refreshHealthReport()
    const intervalId = window.setInterval(() => {
      void refreshHealthReport()
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [status])

  useEffect(() => {
    if (status !== 'connected') {
      return
    }

    let cancelled = false
    let dispose: (() => void) | undefined

    void window.sepilot
      .watchSessions((event: DaemonSessionsWatchPayload) => {
        if (cancelled || event.type !== 'snapshot') {
          return
        }
        setSessions(event.sessions.items.slice(0, 50))
      })
      .then((nextDispose) => {
        if (cancelled) {
          nextDispose()
          return
        }
        dispose = nextDispose
      })
      .catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [status])

  return {
    sessions,
    status,
    healthReportSnapshot,
    gatewayWatchHealth,
    updateBanner,
    refreshSessions,
    deleteAllSessions,
  }
}
