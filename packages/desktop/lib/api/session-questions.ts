import type { Transport } from '@/lib/transport/transport-adapter'
import { makeDaemonRequestContext } from './_daemon'

export interface PendingSessionQuestion {
  id: string
  sessionId: string
  prompt: string
  choices?: string[]
}

export async function createSessionQuestionsApi(transport: Transport) {
  const daemon = await makeDaemonRequestContext(transport)

  return {
    async list(sessionId: string): Promise<PendingSessionQuestion[]> {
      const r = await fetch(
        daemon.url(`/sessions/${encodeURIComponent(sessionId)}/questions`),
        { headers: daemon.headers() },
      )
      if (!r.ok) throw new Error(`questions.list failed (${r.status})`)
      const body = (await r.json()) as { data?: PendingSessionQuestion[] }
      return Array.isArray(body.data) ? body.data : []
    },

    async answer(sessionId: string, questionId: string, answer: string): Promise<void> {
      const r = await fetch(
        daemon.url(
          `/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}`,
        ),
        {
          method: 'POST',
          headers: daemon.headers(),
          body: JSON.stringify({ answer }),
        },
      )
      if (!r.ok) throw new Error(`questions.answer failed (${r.status})`)
    },
  }
}
