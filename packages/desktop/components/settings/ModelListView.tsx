'use client'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { createSettingsApi } from '@/lib/api/settings'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'model-list',
  section: 'models',
  label: 'Models',
  search: ['provider', 'catalog'],
  render: () => <ModelListView />,
})

export function ModelListView() {
  const transport = useTransport()
  const state = useCapabilityResource(
    async () => (await createSettingsApi(transport)).listProviders(),
    [transport],
  )
  if (state.kind === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'unavailable')
    return <UnimplementedBanner what="LLM 모델 카탈로그" />
  if (state.kind === 'error')
    return <p className="text-sm text-red-500">{state.error.message}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1">Provider</th>
          <th>Model</th>
        </tr>
      </thead>
      <tbody>
        {state.data.flatMap((p) =>
          p.models.map((m) => (
            <tr key={`${p.id}:${m.id}`} className="border-t border-border">
              <td className="py-1">{p.label}</td>
              <td>{m.label}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  )
}
