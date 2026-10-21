import React from 'react'
import {
  buildSessionEvidenceSurfaceModel,
  delegationHealthDetail,
  delegationHealthLabel,
  formatAcceptanceCriteriaCount,
  getDaemonHealthMonitorDetail,
  getDaemonHealthMonitorLabel,
  getDaemonHealthMonitorMeta,
  listDaemonHealthSurfaceItems,
} from '@sepilotd/api-client'
import type { DesktopActivityMonitorModel } from './desktop-chat'
import { ArtifactGallery } from './ArtifactGallery'
import { useLocale } from './useLocale'

const MONITOR_COPY = {
  en: {
    monitorAria: 'Activity monitor',
    operatorRail: 'Operator Rail',
    telemetry: 'Session telemetry',
    telemetryMeta: 'Runtime health, delegation, activity, and artifacts in one sidecar.',
    runStatus: 'Run Status',
    messages: 'Messages',
    toolCalls: 'Tool Calls',
    approvals: 'Approvals',
    questions: 'Questions',
    tokens: 'Tokens',
    providerFallbacks: 'Fallbacks',
    providerFallbackDetail: (attempts: number) => `${attempts} attempt${attempts === 1 ? '' : 's'}`,
    approvalQueue: 'Approval Queue',
    approvalCopy: (n: number) =>
      n > 1
        ? `${n} tool actions are waiting for approval.`
        : `${n} tool action is waiting for approval.`,
    questionQueue: 'Question Queue',
    questionCopy: (n: number) =>
      n > 1
        ? `${n} questions are waiting for your answer.`
        : `${n} question is waiting for your answer.`,
    delegationLease: 'Delegation Lease',
    worker: 'Worker',
    lease: 'Lease',
    lastError: 'Last error',
    daemonHealth: 'Daemon Health',
    recentActivity: 'Recent Activity',
    noActivity: 'No tool or state activity yet.',
    artifacts: 'Artifacts',
    noArtifacts: 'No saved artifacts yet.',
    sessionSnapshot: 'Session Snapshot',
    mode: 'Mode',
    project: 'Project',
    none: 'none',
    provider: 'Provider',
    model: 'Model',
    cost: 'Cost',
    updated: 'Updated',
    context: 'Context',
    delegation: 'Delegation',
    runContract: 'Run Contract',
    evidence: 'Evidence',
    evidenceStates: {
      in_progress: 'In progress',
      ready: 'Evidence ready',
      passed: 'Passed',
      attention_needed: 'Needs attention',
    },
    evidenceCriteria: (supported: number, total: number) => `${supported}/${total} supported`,
    evidenceDetail: (artifacts: number, validations: number, risks: number) =>
      `${artifacts} artifact${artifacts === 1 ? '' : 's'} · ${validations} validation${validations === 1 ? '' : 's'} · ${risks} risk${risks === 1 ? '' : 's'}`,
    documentReadBacks: 'Document read-backs',
    evaluation: 'Evaluation Gate',
    evaluationVerdict: (approved: boolean) => approved ? 'approved' : 'not approved',
  },
  ko: {
    monitorAria: '활동 모니터',
    operatorRail: '운영자 레일',
    telemetry: '세션 텔레메트리',
    telemetryMeta: '런타임 상태, 위임, 활동, 아티팩트를 한 사이드카에서 확인.',
    runStatus: '실행 상태',
    messages: '메시지',
    toolCalls: '도구 호출',
    approvals: '승인',
    questions: '질문',
    tokens: '토큰',
    providerFallbacks: '대체 실행',
    providerFallbackDetail: (attempts: number) => `${attempts}회 시도`,
    approvalQueue: '승인 대기열',
    approvalCopy: (n: number) => `${n}개 도구 동작이 승인을 기다리고 있습니다.`,
    questionQueue: '질문 대기열',
    questionCopy: (n: number) => `${n}개 질문이 답변을 기다리고 있습니다.`,
    delegationLease: '위임 리스',
    worker: '워커',
    lease: '리스',
    lastError: '마지막 오류',
    daemonHealth: 'Daemon 상태',
    recentActivity: '최근 활동',
    noActivity: '아직 도구 또는 상태 활동이 없습니다.',
    artifacts: '아티팩트',
    noArtifacts: '저장된 아티팩트가 아직 없습니다.',
    sessionSnapshot: '세션 스냅샷',
    mode: '모드',
    project: '프로젝트',
    none: '없음',
    provider: 'Provider',
    model: '모델',
    cost: '비용',
    updated: '업데이트',
    context: '컨텍스트',
    delegation: '위임',
    runContract: '실행 계약',
    evidence: '근거',
    evidenceStates: {
      in_progress: '진행 중',
      ready: '근거 준비됨',
      passed: '통과',
      attention_needed: '확인 필요',
    },
    evidenceCriteria: (supported: number, total: number) => `${supported}/${total}건 지원됨`,
    evidenceDetail: (artifacts: number, validations: number, risks: number) =>
      `근거 ${artifacts}건 · 검증 ${validations}건 · 리스크 ${risks}건`,
    documentReadBacks: '문서 재확인',
    evaluation: '평가 게이트',
    evaluationVerdict: (approved: boolean) => approved ? '승인됨' : '미승인',
  },
} as const

export function ActivityMonitor({
  model,
}: {
  model: DesktopActivityMonitorModel
}) {
  const { locale } = useLocale()
  const copy = MONITOR_COPY[locale] ?? MONITOR_COPY.en
  const healthItems = listDaemonHealthSurfaceItems(model.healthReportSnapshot ?? null, 5)
  const healthLabel = getDaemonHealthMonitorLabel(model.healthReportSnapshot ?? null)
  const healthMeta = getDaemonHealthMonitorMeta(model.healthReportSnapshot ?? null)
  const healthDetail = getDaemonHealthMonitorDetail(model.healthReportSnapshot ?? null)
  const evidenceSurface = buildSessionEvidenceSurfaceModel({
    evidenceManifest: model.evidenceManifest ?? undefined,
    evaluationGate: model.evaluationGate ?? undefined,
  })

  return (
    <aside className="chat-monitor" aria-label={copy.monitorAria}>
      <div className="monitor-shell-header">
        <div className="monitor-shell-copy">
          <span className="section-title">{copy.operatorRail}</span>
          <strong className="monitor-shell-title">{copy.telemetry}</strong>
          <span className="monitor-shell-meta">
            {copy.telemetryMeta}
          </span>
        </div>
        <span className={`monitor-state ${model.agentState}`}>{model.agentState}</span>
      </div>

      <section className="monitor-card">
        <div className="monitor-card-header">
          <span className="section-title">{copy.runStatus}</span>
          <span className="tag tag-blue">{model.selectedMode}</span>
        </div>
        <div className="monitor-metric-grid">
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.messages}</span>
            <strong>{model.messageCount}</strong>
          </div>
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.toolCalls}</span>
            <strong>{model.toolCallCount}</strong>
          </div>
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.approvals}</span>
            <strong>{model.pendingApprovals}</strong>
          </div>
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.questions}</span>
            <strong>{model.pendingQuestions}</strong>
          </div>
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.tokens}</span>
            <strong>{model.sessionTokenCount}</strong>
          </div>
          <div className="monitor-metric-card">
            <span className="monitor-metric-label">{copy.providerFallbacks}</span>
            <strong>{model.providerFallbackCount ?? 0}</strong>
            {(model.providerAttemptCount ?? 0) > 0 ? (
              <span className="monitor-metric-detail">
                {copy.providerFallbackDetail(model.providerAttemptCount ?? 0)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {model.pendingApprovals > 0 && (
        <section className="monitor-card monitor-alert-card">
          <span className="section-title">{copy.approvalQueue}</span>
          <p className="monitor-alert-copy">
            {copy.approvalCopy(model.pendingApprovals)}
          </p>
        </section>
      )}

      {model.pendingQuestions > 0 && (
        <section className="monitor-card monitor-alert-card">
          <span className="section-title">{copy.questionQueue}</span>
          <p className="monitor-alert-copy">
            {copy.questionCopy(model.pendingQuestions)}
          </p>
        </section>
      )}

      {model.delegation && (
        <section className={`monitor-card ${model.delegation.claimHealth !== 'healthy' ? 'monitor-alert-card' : ''}`}>
          <div className="monitor-card-header">
            <span className="section-title">{copy.delegationLease}</span>
            <span
              className={`tag ${
                model.delegation.claimHealth === 'healthy'
                  ? 'tag-green'
                  : model.delegation.claimHealth === 'degraded'
                    ? 'tag-yellow'
                    : 'tag-red'
              }`}
            >
              {delegationHealthLabel(model.delegation)}
            </span>
          </div>
          <p className="monitor-alert-copy">
            {delegationHealthDetail(model.delegation)}
          </p>
          <div className="info-row">
            <span className="info-row-label">{copy.worker}</span>
            <span className="info-row-value">{model.delegation.targetDevice}</span>
          </div>
          {model.delegationMeta && (
            <div className="info-row">
              <span className="info-row-label">{copy.lease}</span>
              <span className="info-row-value">{model.delegationMeta}</span>
            </div>
          )}
          {model.delegation.lastError && (
            <div className="info-row">
              <span className="info-row-label">{copy.lastError}</span>
              <span className="info-row-value">{model.delegation.lastError}</span>
            </div>
          )}
        </section>
      )}

      <section className={`monitor-card ${healthLabel !== 'Healthy' ? 'monitor-alert-card' : ''}`}>
        <div className="monitor-card-header">
          <span className="section-title">{copy.daemonHealth}</span>
          <span className={`tag ${
            healthLabel === 'Healthy'
              ? 'tag-green'
              : healthLabel === 'Unavailable'
                ? 'tag-red'
                : 'tag-yellow'
          }`}
          >
            {healthLabel}
          </span>
        </div>
        {healthMeta && (
          <div className="monitor-health-meta">{healthMeta}</div>
        )}
        <p className="monitor-alert-copy">{healthDetail}</p>
        {healthItems.length > 0 ? (
          <div className="monitor-health-list">
            {healthItems.map((item) => (
              <div key={item.key} className="monitor-health-item">
                <div className="monitor-health-copy">
                  <strong>{item.key}</strong>
                  {item.details ? <span>{item.details}</span> : null}
                </div>
                <span className="monitor-health-status">{item.status}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="monitor-card">
        <div className="monitor-card-header">
          <span className="section-title">{copy.recentActivity}</span>
          <span className="tag tag-blue">{model.activityCount}</span>
        </div>
        {model.recentActivities.length === 0 ? (
          <div className="monitor-empty">{copy.noActivity}</div>
        ) : (
          <div className="monitor-activity-list">
            {model.recentActivities.map((activity) => (
              <div key={activity.id} className="monitor-activity-item">
                <span className={`monitor-activity-dot ${activity.status}`} />
                <div className="monitor-activity-copy">
                  <strong>{activity.label}</strong>
                  <span>{activity.detail}</span>
                </div>
                {activity.meta && (
                  <span className="monitor-activity-meta">{activity.meta}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {model.runContract && (
        <section className="monitor-card">
          <div className="monitor-card-header">
            <span className="section-title">{copy.runContract}</span>
            <span className="tag tag-blue">
              {formatAcceptanceCriteriaCount(model.runContract.acceptanceCriteria.length)}
            </span>
          </div>
          <p className="monitor-alert-copy">{model.runContract.summary}</p>
          {model.runContract.acceptanceCriteria.length > 0 ? (
            <ul className="monitor-contract-list">
              {model.runContract.acceptanceCriteria.slice(0, 4).map((criterion) => (
                <li key={criterion.id}>{criterion.text}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {evidenceSurface && (
        <section className={`monitor-card ${evidenceSurface.state === 'attention_needed' ? 'monitor-alert-card' : ''}`}>
          <div className="monitor-card-header">
            <span className="section-title">{copy.evidence}</span>
            <span className={`tag ${evidenceSurface.state === 'attention_needed' ? 'tag-yellow' : evidenceSurface.state === 'in_progress' ? 'tag-blue' : 'tag-green'}`}>
              {copy.evidenceStates[evidenceSurface.state]}
            </span>
          </div>
          <p className="monitor-alert-copy">
            {copy.evidenceCriteria(
              evidenceSurface.summary.supportedAcceptanceCriteria,
              evidenceSurface.summary.acceptanceCriteria,
            )}
            {' · '}
            {copy.evidenceDetail(
              evidenceSurface.summary.artifacts,
              evidenceSurface.summary.validationRuns,
              model.evidenceManifest?.summary.risks ?? 0,
            )}
          </p>
          {evidenceSurface.readbacks.length > 0 ? (
            <>
              <span className="section-title">{copy.documentReadBacks}</span>
              <ul className="monitor-contract-list">
                {evidenceSurface.readbacks.slice(-3).reverse().map((readback) => (
                  <li key={readback.id}>
                    {[readback.path ?? readback.label, readback.status, readback.tool, readback.hash]
                      .filter(Boolean)
                      .join(' · ')}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {(model.evidenceManifest?.risks.length ?? 0) > 0 ? (
            <ul className="monitor-contract-list">
              {model.evidenceManifest?.risks.slice(0, 3).map((risk) => (
                <li key={risk.code}>{risk.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {model.evaluationGate && (
        <section className={`monitor-card ${evidenceSurface?.state === 'attention_needed' ? 'monitor-alert-card' : ''}`}>
          <div className="monitor-card-header">
            <span className="section-title">{copy.evaluation}</span>
            <span className={`tag ${evidenceSurface?.state === 'attention_needed' ? 'tag-yellow' : evidenceSurface?.state === 'in_progress' ? 'tag-blue' : 'tag-green'}`}>
              {evidenceSurface
                ? copy.evidenceStates[evidenceSurface.state]
                : copy.evaluationVerdict(model.evaluationGate.verdict.approved)}
            </span>
          </div>
          {evidenceSurface?.verdictReason ? (
            <p className="monitor-alert-copy">{evidenceSurface.verdictReason}</p>
          ) : null}
          <ul className="monitor-contract-list">
            <li>{model.evaluationGate.stages.mechanical.summary}</li>
            <li>{model.evaluationGate.stages.semantic.summary}</li>
            <li>{model.evaluationGate.stages.consensus.summary}</li>
          </ul>
        </section>
      )}

      <section className="monitor-card">
        <div className="monitor-card-header">
          <span className="section-title">{copy.artifacts}</span>
          <span className="tag tag-blue">{model.artifacts.length}</span>
        </div>
        <ArtifactGallery
          artifacts={model.artifacts}
          emptyState={copy.noArtifacts}
        />
      </section>

      <section className="monitor-card">
        <span className="section-title">{copy.sessionSnapshot}</span>
        <div className="info-row">
          <span className="info-row-label">{copy.mode}</span>
          <span className="info-row-value">{model.selectedMode}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.project}</span>
          <span className="info-row-value">
            {model.selectedProjectName ?? copy.none}
          </span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.provider}</span>
          <span className="info-row-value">{model.providerLabel}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.model}</span>
          <span className="info-row-value">{model.modelLabel}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.cost}</span>
          <span className="info-row-value">{model.costLabel}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.updated}</span>
          <span className="info-row-value">{model.updatedLabel}</span>
        </div>
        {model.contextEngine && (
          <div className="info-row">
            <span className="info-row-label">{copy.context}</span>
            <span className="info-row-value">{model.contextEngine.revision}</span>
          </div>
        )}
        {model.delegation && (
          <>
            <div className="info-row">
              <span className="info-row-label">{copy.delegation}</span>
              <span className="info-row-value">{delegationHealthLabel(model.delegation)}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">{copy.worker}</span>
              <span className="info-row-value">{model.delegation.targetDevice}</span>
            </div>
          </>
        )}
      </section>
    </aside>
  )
}
