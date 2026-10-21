'use client'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTransport } from './transport-provider'
import { useExtensionsStore } from '@/lib/store/extensions-store'
import {
  CapabilityUnavailableError,
  createExtensionsApi,
} from '@/lib/api/extensions'
import { desktopFeatures } from '@/lib/feature-profile'

interface ExtensionRegistry {
  active: ReadonlyArray<{ id: string; mode: string }>
  capabilityAvailable: boolean
}

const ExtensionContext = createContext<ExtensionRegistry>({
  active: [],
  capabilityAvailable: false,
})

const RETRY_BASE_MS = 5000
const RETRY_MAX_MS = 60_000
const RETRY_JITTER_RATIO = 0.2

function extensionRetryDelay(attempt: number): number {
  const exponential = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt)
  const jitter = 1 - RETRY_JITTER_RATIO + Math.random() * RETRY_JITTER_RATIO * 2
  return Math.min(RETRY_MAX_MS, Math.round(exponential * jitter))
}

export function ExtensionProvider({ children }: { children: ReactNode }) {
  const transport = useTransport()
  const items = useExtensionsStore((s) => s.items)
  const setItems = useExtensionsStore((s) => s.setItems)
  const [capabilityAvailable, setCapabilityAvailable] = useState(false)

  useEffect(() => {
    if (!desktopFeatures.extensions) {
      setItems([])
      setCapabilityAvailable(false)
      return
    }

    let cancelled = false
    let connecting = false
    let capabilityUnavailable = false
    let retryAttempt = 0
    let api: Awaited<ReturnType<typeof createExtensionsApi>> | null = null
    let unsub = () => {}
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    setCapabilityAvailable(false)

    const isPageVisible = () => document.visibilityState !== 'hidden'

    const stopRetry = () => {
      if (!retryTimer) return
      clearTimeout(retryTimer)
      retryTimer = null
    }

    const stopStream = () => {
      const dispose = unsub
      unsub = () => {}
      dispose()
    }

    const markCapabilityUnavailable = () => {
      capabilityUnavailable = true
      stopRetry()
      stopStream()
      if (!cancelled) {
        setItems([])
        setCapabilityAvailable(false)
      }
    }

    const scheduleRetry = () => {
      if (
        cancelled ||
        capabilityUnavailable ||
        !isPageVisible() ||
        retryTimer
      ) {
        return
      }
      const delay = extensionRetryDelay(retryAttempt)
      retryAttempt = Math.min(retryAttempt + 1, 30)
      retryTimer = setTimeout(() => {
        retryTimer = null
        void connect()
      }, delay)
    }

    const poll = async (): Promise<'available' | 'unavailable' | 'retry'> => {
      try {
        api ??= await createExtensionsApi(transport)
        const list = await api.list()
        if (!cancelled && isPageVisible()) {
          setItems(list)
          setCapabilityAvailable(true)
        }
        return 'available'
      } catch (error) {
        if (error instanceof CapabilityUnavailableError) {
          markCapabilityUnavailable()
          return 'unavailable'
        }
        return 'retry'
      }
    }

    const handleStreamError = () => {
      stopStream()
      scheduleRetry()
    }

    async function connect(): Promise<void> {
      if (
        cancelled ||
        connecting ||
        capabilityUnavailable ||
        !isPageVisible()
      ) {
        return
      }
      connecting = true
      stopRetry()
      try {
        const result = await poll()
        if (result === 'retry') {
          scheduleRetry()
          return
        }
        if (result === 'unavailable' || cancelled || !isPageVisible()) return

        api ??= await createExtensionsApi(transport)
        let streamFailedSynchronously = false
        const nextUnsub = api.events({
          onSnapshot: (next) => {
            if (!cancelled && isPageVisible()) {
              retryAttempt = 0
              setItems(next)
              setCapabilityAvailable(true)
            }
          },
          onError: () => {
            streamFailedSynchronously = true
            handleStreamError()
          },
        })
        unsub = nextUnsub
        if (streamFailedSynchronously) stopStream()
      } catch {
        scheduleRetry()
      } finally {
        connecting = false
      }
    }

    const handleVisibilityChange = () => {
      if (!isPageVisible()) {
        stopRetry()
        stopStream()
        return
      }
      retryAttempt = 0
      void connect()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void connect()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRetry()
      stopStream()
    }
  }, [transport, setItems])

  const active = useMemo(
    () =>
      desktopFeatures.extensions
        ? items
            .filter((x) => x.enabled && x.status === 'running')
            .map((x) => ({ id: x.id, mode: 'default' }))
        : [],
    [items],
  )
  const value = useMemo(
    () => ({
      active,
      capabilityAvailable: desktopFeatures.extensions && capabilityAvailable,
    }),
    [active, capabilityAvailable],
  )
  return (
    <ExtensionContext.Provider value={value}>
      {children}
    </ExtensionContext.Provider>
  )
}

export function useExtensionRegistry(): ExtensionRegistry {
  return useContext(ExtensionContext)
}
