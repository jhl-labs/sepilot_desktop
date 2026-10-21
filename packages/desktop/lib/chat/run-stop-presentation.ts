import type { DaemonChatStreamPayload } from '@sepilotd/api-client/daemon/types'

export type RunStopReason = NonNullable<Extract<DaemonChatStreamPayload, { type: 'done' }>['stopReason']>

const CAUSES: Record<RunStopReason['code'], string> = {
  completed: '작업이 완료되었습니다.',
  iteration_budget: '실행 단계 한도에 도달했습니다.',
  node_budget: '그래프 실행 한도에 도달했습니다.',
  observation_budget: '관측 한도에 도달했습니다.',
  no_progress: '추가 진전을 확인하지 못해 종료했습니다.',
  stuck_repeat: '같은 동작의 반복을 감지해 종료했습니다.',
  completion_gate: '요청한 완료 조건을 검증하지 못했습니다.',
  cost_gate: '비용 제한에 도달했습니다.',
  spend_budget: '사용량 예산에 도달했습니다.',
  approval_denied: '실행 승인이 거절되었습니다.',
  approval_timeout: '승인 대기 시간이 초과되었습니다.',
  user_action_required: '사용자의 조치가 필요합니다.',
  policy_blocked: '현재 권한 정책에서 실행이 차단되었습니다.',
  wall_clock: '전체 실행 시간 한도에 도달했습니다.',
  inactivity: '진행 신호가 오랫동안 도착하지 않아 종료했습니다.',
  user_abort: '사용자 요청으로 작업을 중단했습니다.',
  provider_error: '모델 서비스 오류로 작업이 종료되었습니다.',
  agent_incomplete: '에이전트가 현재 워크플로로는 작업을 끝낼 수 없다고 보고했습니다.',
}

function describeDetail(reason: RunStopReason): string | undefined {
  const detail = reason.detail
  if (!detail) return undefined

  if (reason.code === 'completion_gate' && detail.criteria && detail.criteria.length > 0) {
    return `미충족 기준: ${detail.criteria.join(', ')}`
  }
  if (
    (reason.code === 'approval_denied' || reason.code === 'policy_blocked')
    && detail.tool
  ) {
    return `도구: ${detail.tool}`
  }
  if (
    (reason.code === 'iteration_budget'
      || reason.code === 'node_budget'
      || reason.code === 'observation_budget'
      || reason.code === 'cost_gate'
      || reason.code === 'spend_budget')
    && typeof detail.budget === 'number'
    && typeof detail.used === 'number'
  ) {
    return `사용량: ${detail.used}/${detail.budget}`
  }
  return undefined
}

export function presentRunStop(reason: RunStopReason): string {
  const cause = CAUSES[reason.code] ?? '작업이 완료되지 않았습니다.'
  const detail = describeDetail(reason)
  const escalateTo = reason.detail?.escalateBot ?? reason.detail?.escalateMode
  const guidance = reason.nextActions.includes('escalate') && escalateTo
    ? `더 깊은 워크플로(${escalateTo})로 같은 요청을 다시 시도할 수 있습니다. 모드 선택에서 '딥 코딩'을 고르거나 봇을 ${escalateTo}로 지정한 뒤 같은 요청을 보내 주세요. 시간은 더 걸립니다.`
    : reason.nextActions.includes('approve_pending')
    ? '대기 중인 승인 요청을 확인해 주세요.'
    : reason.resumable && reason.nextActions.includes('resume')
      ? '지금까지의 작업 기록을 확인하고 아래 입력창에서 이어서 진행할 수 있습니다.'
      : reason.nextActions.includes('retry')
        ? '실행 기록과 이미 반영된 변경을 확인한 뒤 다시 요청해 주세요.'
        : '실행 기록과 이미 반영된 변경을 확인해 주세요.'
  return detail ? `${cause} (${detail}) ${guidance}` : `${cause} ${guidance}`
}
