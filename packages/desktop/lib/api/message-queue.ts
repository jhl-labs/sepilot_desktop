import { getJson, makeHttp } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

interface QueueSnapshotEntry {
  topic: string
  pending: number
  inFlight: number
}

export interface MessageQueueApi {
  snapshot: () => Promise<QueueSnapshotEntry[]>
}

export async function createMessageQueueApi(
  transport: Transport,
): Promise<MessageQueueApi> {
  const http = await makeHttp(transport)
  return {
    snapshot: () =>
      getJson<QueueSnapshotEntry[]>(
        http,
        '/message-queue/snapshot',
        'message-queue',
      ),
  }
}
