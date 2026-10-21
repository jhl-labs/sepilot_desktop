'use client'
import { DocumentsPage } from '@/components/rag/DocumentsPage'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { getJson, makeHttp } from '@/lib/api/_http'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

interface RagFolder {
  id: string
  name: string
  documents: number
}

registerSettingsTab({
  key: 'rag',
  section: 'memory',
  label: 'RAG',
  search: ['rag', 'documents', 'vector'],
  render: () => <RAGSettingsTab />,
})

export function RAGSettingsTab() {
  const transport = useTransport()
  const state = useCapabilityResource(async () => {
    const http = await makeHttp(transport)
    return getJson<RagFolder[]>(http, '/rag/folders', 'rag')
  }, [transport])
  if (state.kind === 'unavailable') return <UnimplementedBanner what="RAG" />
  if (state.kind === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'error')
    return <p className="text-sm text-red-500">{state.error.message}</p>
  return (
    <div className="h-[520px] overflow-hidden rounded-xl border border-border">
        <DocumentsPage />
    </div>
  )
}
