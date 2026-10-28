'use client'
import { useEffect, useState } from 'react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createSkillsApi } from '@/lib/api/skills'
import { useSkillsStore } from '@/lib/store/skills-store'
import { useSessionStore } from '@/lib/store/session-store'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

export function useDollarSkills(active: boolean) {
  const transport = useOptionalTransport()
  const workspace = useSessionStore((s) => s.sessions.find((session) => session.id === s.activeId)?.cwd ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!active || !transport) {
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const items = await (await createSkillsApi(transport)).list({ cwd: workspace })
        if (!cancelled) useSkillsStore.getState().setItems(items)
      } catch {
        if (!cancelled) setError('스킬 목록을 새로 불러오지 못했습니다. 기존 목록을 표시합니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, transport, workspace])
  return { loading, error }
}
