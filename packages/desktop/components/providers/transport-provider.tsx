'use client'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  createTransport,
  type Transport,
} from '@/lib/transport/transport-adapter'
import { WEB_TRANSPORT_CONFIG_CHANGED_EVENT } from '@/lib/transport/web-transport'
import { TRANSPORT_CONFIG_UPDATED_CHANNEL } from '@/src/shared/transport-events'

const TransportContext = createContext<Transport | null>(null)

export function TransportProvider({ children }: { children: ReactNode }) {
  const [transport, setTransport] = useState<Transport | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribeTransport = () => {}

    async function refreshTransport(): Promise<void> {
      const next = await createTransport()
      if (cancelled) return
      unsubscribeTransport()
      const unsubscribe = next.on(
        TRANSPORT_CONFIG_UPDATED_CHANNEL,
        handleConfigChanged,
      )
      unsubscribeTransport = typeof unsubscribe === 'function' ? unsubscribe : () => {}
      setTransport(next)
    }

    const handleConfigChanged = () => {
      void refreshTransport()
    }

    void refreshTransport()
    if (typeof window !== 'undefined') {
      window.addEventListener(
        WEB_TRANSPORT_CONFIG_CHANGED_EVENT,
        handleConfigChanged,
      )
    }

    return () => {
      cancelled = true
      unsubscribeTransport()
      if (typeof window !== 'undefined') {
        window.removeEventListener(
          WEB_TRANSPORT_CONFIG_CHANGED_EVENT,
          handleConfigChanged,
        )
      }
    }
  }, [])
  if (!transport) return null
  return (
    <TransportContext.Provider value={transport}>
      {children}
    </TransportContext.Provider>
  )
}

export function useTransport(): Transport {
  const ctx = useContext(TransportContext)
  if (!ctx)
    throw new Error('useTransport must be used inside TransportProvider')
  return ctx
}

export function useOptionalTransport(): Transport | null {
  return useContext(TransportContext)
}
