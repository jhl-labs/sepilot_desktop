import type { Transport } from '@/lib/transport/transport-adapter'
import { createHttpError } from './_http'
import { makeDaemonRequestContext } from './_daemon'

export interface SessionSteeringApi {
  steer(
    sessionId: string,
    message: string,
    kind?: 'instruction' | 'question',
  ): Promise<{ noteId: string; pendingSteeringNoteCount?: number }>
  cancel(
    sessionId: string,
    target: { selector: 'latest' | 'all' } | { noteId: string },
  ): Promise<{
    status: 'cancelled'
    cancelledNoteIds: string[]
    pendingSteeringNoteCount: number
  }>
}

export async function createSessionSteeringApi(
  transport: Transport,
): Promise<SessionSteeringApi> {
  const daemon = await makeDaemonRequestContext(transport)

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(daemon.url(path), {
      method: 'POST',
      headers: daemon.headers(),
      body: JSON.stringify(body),
    })
    if (!response.ok) throw await createHttpError(path, response)
    const envelope = (await response.json()) as { data?: T }
    return (envelope.data ?? envelope) as T
  }

  return {
    steer(sessionId, message, kind = 'instruction') {
      return post(`/sessions/${encodeURIComponent(sessionId)}/steer`, { message, kind })
    },
    cancel(sessionId, target) {
      return post(`/sessions/${encodeURIComponent(sessionId)}/steer/cancel`, target)
    },
  }
}
