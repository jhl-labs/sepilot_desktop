'use client'
import { useEffect, useState } from 'react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createPromptTemplatesApi } from '@/lib/api/prompt-templates'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import type { SlashPromptTemplate } from '@/lib/chat/slash-commands'

export function usePromptTemplates(): SlashPromptTemplate[] {
  const transport = useOptionalTransport()
  const [templates, setTemplates] = useState<SlashPromptTemplate[]>([])

  useEffect(() => {
    if (!transport) {
      setTemplates([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) return
        const api = await createPromptTemplatesApi(transport)
        const list = await api.list()
        if (!cancelled) setTemplates(list)
      } catch {
        if (!cancelled) setTemplates([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  return templates
}
