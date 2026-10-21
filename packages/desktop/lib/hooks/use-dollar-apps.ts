'use client'
import { useEffect, useState } from 'react'
import type { SepilotReadableAppSummary } from '@sepilotd/api-client'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createAppsApi } from '@/lib/api/apps'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

export function useDollarApps(active: boolean) {
  const transport = useOptionalTransport()
  const [state, setState] = useState({ transport, items: [] as SepilotReadableAppSummary[], loading: false, error: null as string | null })
  useEffect(() => {
    let cancelled = false
    setState({ transport, items: [], loading: active && Boolean(transport), error: null })
    if (!active || !transport) return
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const api = await createAppsApi(transport)
        const items = new Map<string, SepilotReadableAppSummary>()
        for (let offset = 0; !cancelled; offset += 50) {
          const page = await api.list({ limit: 50, offset })
          const previousSize = items.size
          for (const app of page) items.set(app.id, app)
          if (page.length < 50 || items.size === previousSize) break
        }
        if (!cancelled) setState({ transport, items: [...items.values()], loading: false, error: null })
      } catch {
        if (!cancelled) setState({ transport, items: [], loading: false, error: '앱 목록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.' })
      } finally {
        if (!cancelled) setState(previous => ({ ...previous, loading: false }))
      }
    })()
    return () => { cancelled = true }
  }, [active, transport])
  return state.transport === transport && active ? state : { items: [], loading: false, error: null }
}
