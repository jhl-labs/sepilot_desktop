'use client'
import { useEffect, useState } from 'react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import {
  ensurePersonaCatalog,
  getPersonaCatalogSync,
} from '@/lib/chat/persona-catalog'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import type { Persona } from '@/lib/store/persona-store'

interface State {
  matches: Persona[]
  loading: boolean
}

const EMPTY: Persona[] = []

export function usePersonaSearch(query: string | null, limit = 8): State {
  const transport = useOptionalTransport()
  const [list, setList] = useState<Persona[]>(
    () => getPersonaCatalogSync() ?? [],
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!transport) return
    if (list.length > 0) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const next = await ensurePersonaCatalog(transport)
        if (!cancelled && next.length > 0) setList(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, list.length])

  if (query == null) return { matches: EMPTY, loading: false }
  const q = query.toLowerCase()
  if (!q) return { matches: list.slice(0, limit), loading }
  const startsWith = list.filter((p) => p.name.toLowerCase().startsWith(q))
  if (startsWith.length > 0) return { matches: startsWith.slice(0, limit), loading }
  return {
    matches: list
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, limit),
    loading,
  }
}
