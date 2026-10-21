import React, { useState, useEffect } from 'react'
import {
  getDaemonHealthMonitorDetail,
  getDaemonHealthMonitorLabel,
  getDaemonHealthMonitorMeta,
  listDaemonHealthSurfaceItems,
} from '@sepilotd/api-client'
import type {
  DaemonDevice,
  DaemonHealthReportSnapshot,
  DaemonSessionMeta,
  DaemonUsageSummary,
  GatewayTicketWatchRevalidateHealth,
} from '@sepilotd/api-client'
import { useLocale } from './useLocale'

const DASHBOARD_COPY = {
  en: {
    kicker: 'Operational Overview',
    title: 'Dashboard',
    summary: 'Track daemon readiness, gateway lease stability, connected devices, and the sessions that need attention.',
    sessionsDevicesSuffix: (sessions: number, devices: number) => `${sessions} sessions · ${devices} devices`,
    requestsCostSuffix: (requests: number, cost: string) => `${requests} requests · $${cost} cost`,
    gatewayLabel: 'Gateway',
    daemonLabel: 'Daemon',
    requestsLabel: 'Requests',
    inOutSuffix: (inTok: number, outTok: number) => `${inTok.toLocaleString()} in · ${outTok.toLocaleString()} out`,
    devicesLabel: 'Devices',
    devicesHint: 'Runtime peers currently registered with the daemon',
    noRuntimeMeta: 'No additional runtime metadata',
    gatewayWatchTitle: 'Gateway Watch',
    leaseFailoverHeading: 'Lease failover telemetry',
    takeoverSuffix: (n: number) => `${n} takeover${n === 1 ? '' : 's'}`,
    noData: 'No data',
    watcherState: 'Watcher State',
    leaseRetry: 'Lease Retry',
    staleWindow: 'Stale Window',
    lastPrefix: 'Last',
    daemonHealthTitle: 'Daemon Health',
    runtimeHeading: 'Runtime readiness and subsystems',
    recentSessionsTitle: 'Recent Sessions',
    workingThreadsHeading: 'Working threads',
    shownSuffix: (n: number) => `${n} shown`,
    recentSessionsCopy: 'Jump back into active context without leaving the operations view.',
    untitled: 'Untitled',
    statusPrefix: 'Status:',
    messagesSuffix: (n: number) => `${n} messages`,
    noSessions: 'No sessions yet',
    devicesTitle: 'Devices',
    devicesHeading: 'Connected runtime peers',
    onlineSuffix: (n: number) => `${n} online surfaces`,
    devicesCopy: 'Device registrations, roles, and capability coverage across the current workspace.',
    noDevices: 'No devices connected',
    statusDegraded: 'Degraded',
    statusRecovering: 'Recovering',
    statusStable: 'Stable',
    statusUnavailable: 'Unavailable',
    summaryRecovered: 'Recovered from a stale ticket-watch lease takeover.',
    summaryPreviousFailovers: 'Previous failovers were recorded, and the watcher is stable now.',
    summaryNoTakeover: 'No stale lease takeover recorded.',
    summaryUnavailable: 'Gateway health telemetry is unavailable.',
  },
  ko: {
    kicker: '운영 개요',
    title: '대시보드',
    summary: 'daemon 준비 상태, gateway 임대 안정성, 연결된 디바이스, 주의가 필요한 세션을 추적합니다.',
    sessionsDevicesSuffix: (sessions: number, devices: number) => `세션 ${sessions}개 · 디바이스 ${devices}개`,
    requestsCostSuffix: (requests: number, cost: string) => `요청 ${requests}회 · 비용 $${cost}`,
    gatewayLabel: 'Gateway',
    daemonLabel: 'Daemon',
    requestsLabel: '요청',
    inOutSuffix: (inTok: number, outTok: number) => `입력 ${inTok.toLocaleString()} · 출력 ${outTok.toLocaleString()}`,
    devicesLabel: '디바이스',
    devicesHint: '현재 daemon에 등록된 런타임 피어',
    noRuntimeMeta: '추가 런타임 메타데이터 없음',
    gatewayWatchTitle: 'Gateway Watch',
    leaseFailoverHeading: '임대 페일오버 텔레메트리',
    takeoverSuffix: (n: number) => `인수 ${n}회`,
    noData: '데이터 없음',
    watcherState: '워처 상태',
    leaseRetry: '임대 재시도',
    staleWindow: '스테일 윈도우',
    lastPrefix: '최근',
    daemonHealthTitle: 'Daemon 상태',
    runtimeHeading: '런타임 준비도와 서브시스템',
    recentSessionsTitle: '최근 세션',
    workingThreadsHeading: '진행 중인 스레드',
    shownSuffix: (n: number) => `${n}개 표시`,
    recentSessionsCopy: '운영 화면을 벗어나지 않고 활성 컨텍스트로 다시 들어갑니다.',
    untitled: '제목 없음',
    statusPrefix: '상태:',
    messagesSuffix: (n: number) => `메시지 ${n}개`,
    noSessions: '아직 세션이 없습니다',
    devicesTitle: '디바이스',
    devicesHeading: '연결된 런타임 피어',
    onlineSuffix: (n: number) => `surface ${n}개 온라인`,
    devicesCopy: '현재 워크스페이스의 디바이스 등록, 역할, 기능 커버리지.',
    noDevices: '연결된 디바이스 없음',
    statusDegraded: '저하됨',
    statusRecovering: '복구 중',
    statusStable: '안정',
    statusUnavailable: '사용 불가',
    summaryRecovered: '오래된 ticket-watch 임대 인수에서 복구되었습니다.',
    summaryPreviousFailovers: '이전 페일오버가 기록되었지만 watcher는 현재 안정적입니다.',
    summaryNoTakeover: '오래된 임대 인수가 기록되지 않았습니다.',
    summaryUnavailable: 'Gateway 상태 텔레메트리를 사용할 수 없습니다.',
  },
} as const

export function Dashboard({
  sessions,
  onOpenChat,
  healthReportSnapshot,
  gatewayWatchHealth,
}: {
  sessions: DaemonSessionMeta[]
  onOpenChat: (sessionId: string) => void
  healthReportSnapshot: DaemonHealthReportSnapshot | null
  gatewayWatchHealth: GatewayTicketWatchRevalidateHealth | null
}) {
  const { locale } = useLocale()
  const copy = DASHBOARD_COPY[locale] ?? DASHBOARD_COPY.en
  const [usage, setUsage] = useState<DaemonUsageSummary | null>(null)
  const [devices, setDevices] = useState<DaemonDevice[]>([])
  const healthItems = listDaemonHealthSurfaceItems(healthReportSnapshot, 6)
  const healthLabel = getDaemonHealthMonitorLabel(healthReportSnapshot)
  const healthMeta = getDaemonHealthMonitorMeta(healthReportSnapshot)
  const healthDetail = getDaemonHealthMonitorDetail(healthReportSnapshot)
  const gatewayLabel = gatewayWatchHealth
    ? gatewayWatchHealth.recentStaleHeartbeatTakeover
      ? copy.statusDegraded
      : gatewayWatchHealth.status === 'degraded'
        ? copy.statusRecovering
        : copy.statusStable
    : copy.statusUnavailable
  const gatewaySummary = gatewayWatchHealth
    ? gatewayWatchHealth.recentStaleHeartbeatTakeover
      ? copy.summaryRecovered
      : gatewayWatchHealth.staleHeartbeatTakeovers > 0
        ? copy.summaryPreviousFailovers
        : copy.summaryNoTakeover
    : copy.summaryUnavailable

  useEffect(() => {
    window.sepilot
      .usage()
      .then(setUsage)
      .catch(() => {})
    window.sepilot
      .devices()
      .then(setDevices)
      .catch(() => {})
  }, [])

  return (
    <div className="page surface-page">
      <div className="support-header">
        <div className="support-header-copy">
          <span className="surface-page-kicker">{copy.kicker}</span>
          <div className="support-header-title-row">
            <h2 className="page-title" style={{ marginBottom: 0 }}>
              {copy.title}
            </h2>
            <span
              className={`tag ${
                gatewayWatchHealth?.recentStaleHeartbeatTakeover ? 'tag-red' : 'tag-blue'
              }`}
            >
              {gatewayLabel}
            </span>
          </div>
          <p className="support-header-summary">
            {copy.summary}
          </p>
        </div>

        <div className="support-header-meta">
          <span className="support-header-count">
            {copy.sessionsDevicesSuffix(sessions.length, devices.length)}
          </span>
          <span className="support-header-count">
            {copy.requestsCostSuffix(usage?.requestCount ?? 0, (usage?.costUsd ?? 0).toFixed(4))}
          </span>
        </div>
      </div>

      <div className="support-summary-grid">
        <div className="support-summary-card">
          <span className="support-summary-label">{copy.gatewayLabel}</span>
          <strong className="support-summary-value">{gatewayLabel}</strong>
          <span className="support-summary-meta">{gatewaySummary}</span>
        </div>
        <div className="support-summary-card">
          <span className="support-summary-label">{copy.daemonLabel}</span>
          <strong className="support-summary-value">{healthLabel}</strong>
          <span className="support-summary-meta">{healthMeta ?? copy.noRuntimeMeta}</span>
        </div>
        <div className="support-summary-card">
          <span className="support-summary-label">{copy.requestsLabel}</span>
          <strong className="support-summary-value">{(usage?.requestCount ?? 0).toLocaleString()}</strong>
          <span className="support-summary-meta">
            {copy.inOutSuffix(usage?.inputTokens ?? 0, usage?.outputTokens ?? 0)}
          </span>
        </div>
        <div className="support-summary-card">
          <span className="support-summary-label">{copy.devicesLabel}</span>
          <strong className="support-summary-value">{devices.length.toLocaleString()}</strong>
          <span className="support-summary-meta">{copy.devicesHint}</span>
        </div>
      </div>

      <div className="surface-support-grid">
        <section
          className={`card surface-panel gateway-watch-card ${
            gatewayWatchHealth?.recentStaleHeartbeatTakeover ? 'degraded' : ''
          }`}
        >
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.gatewayWatchTitle}</div>
              <h3 className="surface-panel-title">{copy.leaseFailoverHeading}</h3>
            </div>
            {gatewayWatchHealth ? (
              <span
                className={`tag ${
                  gatewayWatchHealth.recentStaleHeartbeatTakeover ? 'tag-red' : 'tag-green'
                }`}
              >
                {copy.takeoverSuffix(gatewayWatchHealth.staleHeartbeatTakeovers)}
              </span>
            ) : (
              <span className="tag">{copy.noData}</span>
            )}
          </div>

          <p className="surface-panel-copy gateway-watch-copy">{gatewaySummary}</p>

          <div className="surface-panel-metrics">
            <div className="surface-panel-metric">
              <span className="surface-panel-metric-label">{copy.watcherState}</span>
              <strong>{gatewayLabel}</strong>
            </div>
            <div className="surface-panel-metric">
              <span className="surface-panel-metric-label">{copy.leaseRetry}</span>
              <strong>{gatewayWatchHealth?.leaseRetryMs ?? 0} ms</strong>
            </div>
            <div className="surface-panel-metric">
              <span className="surface-panel-metric-label">{copy.staleWindow}</span>
              <strong>{gatewayWatchHealth?.staleHeartbeatMs ?? 0} ms</strong>
            </div>
          </div>

          {gatewayWatchHealth?.lastStaleHeartbeatTakeoverAt && (
            <div className="gateway-watch-meta">
              {copy.lastPrefix} {new Date(gatewayWatchHealth.lastStaleHeartbeatTakeoverAt).toLocaleString()}
            </div>
          )}
        </section>

        <section
          className={`card surface-panel gateway-watch-card ${
            healthLabel !== 'Healthy' ? 'degraded' : ''
          }`}
        >
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.daemonHealthTitle}</div>
              <h3 className="surface-panel-title">{copy.runtimeHeading}</h3>
            </div>
            {healthMeta ? <span className="tag">{healthMeta}</span> : <span className="tag">{copy.noData}</span>}
          </div>

          <p className="surface-panel-copy gateway-watch-copy">{healthDetail}</p>

          <div className="surface-data-list">
            {healthItems.map((item) => (
              <div key={item.key} className="surface-data-row">
                <span className="surface-data-row-label">{item.key}</span>
                <span className="surface-data-row-value">
                  {item.status}
                  {item.details ? ` — ${item.details}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card surface-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.recentSessionsTitle}</div>
              <h3 className="surface-panel-title">{copy.workingThreadsHeading}</h3>
            </div>
            <span className="tag">{copy.shownSuffix(Math.min(sessions.length, 10))}</span>
          </div>
          <p className="surface-panel-copy">
            {copy.recentSessionsCopy}
          </p>

          <div className="surface-list">
            {sessions.slice(0, 10).map((s) => (
              <button
                key={s.id}
                type="button"
                className="surface-list-card"
                onClick={() => onOpenChat(s.id)}
              >
                <span className="surface-list-card-copy">
                  <strong>
                    {s.status ? (
                      <span
                        className={`surface-status-dot status-${s.status}`}
                        aria-hidden="true"
                        title={`${copy.statusPrefix} ${s.status}`}
                      />
                    ) : null}
                    {s.title || copy.untitled}
                  </strong>
                  <span>
                    {s.provider}/{s.model} — {copy.messagesSuffix(s.messageCount)}
                  </span>
                </span>
                <span className="surface-list-card-meta">
                  {new Date(s.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="surface-empty-inline">{copy.noSessions}</div>
            )}
          </div>
        </section>

        <section className="card surface-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.devicesTitle}</div>
              <h3 className="surface-panel-title">{copy.devicesHeading}</h3>
            </div>
            <span className="tag">{copy.onlineSuffix(devices.length || 0)}</span>
          </div>
          <p className="surface-panel-copy">
            {copy.devicesCopy}
          </p>

          <div className="surface-list">
            {devices.map((d) => (
              <div key={d.id} className="surface-list-card surface-list-card-static">
                <span className="surface-list-card-copy">
                  <strong>
                    {d.name} ({d.role})
                  </strong>
                  <span>
                    {d.platform}/{d.arch} — {d.capabilities.join(', ')}
                  </span>
                </span>
                <span
                  className={`tag ${d.status === 'online' ? 'tag-green' : 'tag-yellow'}`}
                >
                  {d.status}
                </span>
              </div>
            ))}
            {devices.length === 0 && (
              <div className="surface-empty-inline">{copy.noDevices}</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
