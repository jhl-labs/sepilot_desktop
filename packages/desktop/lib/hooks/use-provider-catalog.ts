'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import {
  ensureProviderCatalog,
  getProviderCatalogEpoch,
  getProviderCatalogSync,
  subscribeProviderCatalogInvalidation,
} from '@/lib/chat/provider-catalog'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import type { SlashProviderSummary } from '@/lib/chat/slash-commands'

export function useProviderCatalog(): SlashProviderSummary[] {
  const transport = useOptionalTransport()
  const epoch = useSyncExternalStore(
    subscribeProviderCatalogInvalidation,
    getProviderCatalogEpoch,
    getProviderCatalogEpoch,
  )
  const [list, setList] = useState<SlashProviderSummary[]>(
    () => getProviderCatalogSync(transport) ?? [],
  )

  useEffect(() => {
    if (!transport) {
      setList([])
      return
    }
    const cached = getProviderCatalogSync(transport)
    if (cached) {
      setList(cached)
      return
    }
    setList([])
    let cancelled = false
    void (async () => {
      if (await isBrowserPreviewTransport(transport)) return
      const next = await ensureProviderCatalog(transport)
      if (!cancelled && next.length > 0) setList(next)
    })()
    return () => {
      cancelled = true
    }
  }, [epoch, transport])

  return list
}
