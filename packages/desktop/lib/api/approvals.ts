import type { Transport } from '@/lib/transport/transport-adapter'
import { makeDaemonRequestContext } from './_daemon'

class CapabilityUnavailableError extends Error {
  constructor(public capability: string) {
    super(`daemon capability '${capability}' is not available`)
    this.name = 'CapabilityUnavailableError'
  }
}

type ApprovalDecision = 'approved' | 'denied' | 'feedback'
export type ApprovalScope = 'once' | 'session' | 'always'

interface ApprovalRespondInput {
  requestId: string
  decision: ApprovalDecision
  scope?: ApprovalScope
  note?: string
  approvedBy?: string
  sessionId?: string
}

export interface ApprovalsApi {
  respond: (input: ApprovalRespondInput) => Promise<void>
}

export async function createApprovalsApi(
  transport: Transport,
): Promise<ApprovalsApi> {
  const daemon = await makeDaemonRequestContext(transport)
  return {
    respond: async (input) => {
      const body: Record<string, unknown> = {
        requestId: input.requestId,
        decision: input.decision,
      }
      if (input.scope) body.scope = input.scope
      if (input.note) body.note = input.note
      if (input.approvedBy) body.approvedBy = input.approvedBy
      if (input.sessionId) body.sessionId = input.sessionId
      const r = await fetch(daemon.url('/approvals/respond'), {
        method: 'POST',
        headers: daemon.headers(),
        body: JSON.stringify(body),
      })
      if (r.status === 404) throw new CapabilityUnavailableError('approvals')
      if (!r.ok) throw new Error(`/approvals/respond failed (${r.status})`)
    },
  }
}
