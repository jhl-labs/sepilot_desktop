import type { EditCheckpointSummary } from '@sepilotd/api-client/daemon/types'
import type { Transport } from '@/lib/transport/transport-adapter'
import { makeDaemonRequestContext } from './_daemon'

export function createCheckpointsApi(transport: Transport) {
  async function request<T>(sessionId: string, suffix: string, body?: unknown): Promise<T> {
    const daemon = await makeDaemonRequestContext(transport)
    let response: Response
    try {
      response = await fetch(daemon.url(`/sessions/${encodeURIComponent(sessionId)}/${suffix}`), {
        method: body ? 'POST' : 'GET', headers: daemon.headers(), signal: AbortSignal.timeout(15_000),
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new Error(body
        ? '복원 응답을 확인하지 못했습니다. 작업이 적용됐을 수 있으므로 재실행하지 말고 기록과 파일을 새로 확인하세요.'
        : '편집 기록에 연결하지 못했습니다. daemon 연결을 확인한 뒤 새로고침하세요.')
    }
    if (!response.ok) {
      if (response.status === 409) throw new Error('파일이 이후에 변경되었거나 검증 가능한 기록이 없어 되돌리지 않았습니다. 현재 파일을 확인하세요.')
      throw new Error(`편집 기록 요청 실패 (${response.status})`)
    }
    return ((await response.json()) as { data: T }).data
  }
  return {
    list: (sessionId: string) => request<{ checkpoints: EditCheckpointSummary[] }>(sessionId, 'checkpoints'),
    preview: (sessionId: string, checkpointId: string) => request<{ checkpointIds: string[]; files: Array<{ path: string; operation: 'restore' | 'remove'; diff?: string; conflict: boolean }>; incompleteHistory: boolean }>(sessionId, `checkpoints/${encodeURIComponent(checkpointId)}/preview`),
    rewind: (sessionId: string, checkpointId: string, expectedCheckpointIds: string[]) => request<{ restoredFiles: string[]; incompleteHistory: boolean }>(sessionId, 'rewind', { checkpointId, expectedCheckpointIds }),
  }
}
