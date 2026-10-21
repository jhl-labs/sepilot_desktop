'use client'
import { useEffect, useState } from 'react'
import { createRemoteBrowserApi, type BrowserConnection } from '@/lib/api/browser-remote'
import type { Transport } from '@/lib/transport/transport-adapter'

export function useSessionBrowserConnection(
  transport: Transport,
  sessionId: string | null | undefined,
  enabled: boolean,
): BrowserConnection | undefined {
  const [found, setFound] = useState<BrowserConnection | undefined>()
  useEffect(() => {
    setFound(undefined)
    if (!enabled || !sessionId) return
    let disposed = false
    void createRemoteBrowserApi(transport)
      .then((api) => api.list())
      .then((connections) => {
        if (!disposed) setFound(connections.find((c) => c.sessionId === sessionId))
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [enabled, sessionId, transport])
  return found
}
