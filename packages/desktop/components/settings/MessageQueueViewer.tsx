'use client'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { createMessageQueueApi } from '@/lib/api/message-queue'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'message-queue',
  section: 'automation',
  label: 'Message Queue',
  search: ['queue', 'topic'],
  render: () => <MessageQueueViewer />,
})

export function MessageQueueViewer() {
  const transport = useTransport()
  const state = useCapabilityResource(
    async () => (await createMessageQueueApi(transport)).snapshot(),
    [transport],
  )
  if (state.kind === 'unavailable')
    return <UnimplementedBanner what="Message Queue" />
  if (state.kind === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'error')
    return <p className="text-sm text-red-500">{state.error.message}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr>
          <th className="py-1">Topic</th>
          <th>Pending</th>
          <th>In flight</th>
        </tr>
      </thead>
      <tbody>
        {state.data.map((r, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1">{r.topic}</td>
            <td>{r.pending}</td>
            <td>{r.inFlight}</td>
          </tr>
        ))}
        {state.data.length === 0 && (
          <tr>
            <td colSpan={3} className="py-2 text-xs text-muted-foreground">
              활성 토픽 없음
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
