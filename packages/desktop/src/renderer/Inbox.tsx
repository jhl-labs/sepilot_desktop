import React, { useEffect, useMemo, useState } from 'react'
import {
  applyGatewayTicketCommentsWatchPayload as applyTicketCommentsEvent,
  applyGatewayTicketsWatchPayload as applyTicketListEvent,
  getGatewayWatchAlertMeta,
  hasGatewayWatchAlert,
} from '@sepilotd/api-client'
import type {
  DaemonTicket,
  GatewayTicketComment,
  GatewayTicketCommentsWatchPayload,
  GatewayTicketWatchRevalidateHealth,
  GatewayTicketsWatchPayload,
} from '@sepilotd/api-client'
import { Clipboard, Search, Sparkles } from 'lucide-react'
import { useLocale, type SupportedLocale } from './useLocale'

const INBOX_COPY = {
  en: {
    kicker: 'Live Intake',
    title: 'Inbox',
    openIssuesSuffix: (n: number) => `${n} open issues`,
    summary: 'Monitor gateway-fed issues, validate comment deltas, and hand work off into chat sessions without leaving the desktop shell.',
    failoverNoted: 'Failover noted',
    liveStream: 'Live stream',
    refresh: 'Refresh',
    gatewayFailover: 'Gateway failover observed',
    gatewayFailoverDetail: 'Recovered from a stale ticket-watch lease takeover. Live inbox updates are still running.',
    loading: 'Loading...',
    noOpenIssues: 'No open issues',
    noOpenIssuesHint: 'Issues with AI task labels will appear here',
    configureHint: 'Configure Gateway with a GitHub, GitLab, or Gitea provider to see issues',
    openQueue: 'Open Queue',
    issueRouting: 'Issue routing',
    routingCopy: 'Select a ticket to inspect its brief and live comment timeline before spawning a task.',
    visibleSuffix: (filtered: number, total: number) => `${filtered} of ${total} visible`,
    queuedSuffix: (n: number) => `${n} queued`,
    searchPlaceholder: 'Filter by title, label, or assignee',
    searchAria: 'Search inbox issues',
    localSearchActive: 'Local search active',
    watchingLive: 'Watching live open issues',
    openIssuesAria: 'Open issues',
    noMatch: (q: string) => `No issues matched ${q}.`,
    issueDetailEyebrow: 'Issue Detail',
    detailIntro: 'Keep the live ticket brief, labels, and execution handoff in one place before opening a task thread.',
    createdPrefix: 'Created',
    updatedPrefix: 'Updated',
    updatedShortPrefix: 'Updated',
    copyBrief: 'Copy brief',
    startTask: 'Start Task',
    brief: 'Brief',
    executionHandoff: 'Execution Handoff',
    liveDetail: 'Live detail',
    priority: 'Priority',
    priorityUnassigned: 'unassigned',
    assignees: 'Assignees',
    assigneesNone: 'none',
    labelsLabel: 'Labels',
    updates: 'Updates',
    taskHandoffPreview: 'Task handoff preview',
    latestLiveUpdate: 'Latest live update',
    commentTimeline: 'Comment Timeline',
    updateSuffix: (n: number) => `${n} update${n === 1 ? '' : 's'}`,
    loadingComments: 'Loading comments...',
    noComments: 'No comments yet.',
    selectIssue: 'Select an issue',
    selectIssueHint: 'Choose an inbox item to inspect the brief, labels, and comment timeline.',
    noDescription: 'No description provided.',
    prioritySuffix: 'priority',
    commentsSuffix: (n: number) => `${n} comment${n === 1 ? '' : 's'}`,
    latestUpdatePrefix: 'Latest update',
    copyToast: 'Copied brief to clipboard.',
    issuePromptPrefix: 'Work on issue',
  },
  ko: {
    kicker: '실시간 인테이크',
    title: '인박스',
    openIssuesSuffix: (n: number) => `열린 이슈 ${n}개`,
    summary: 'gateway가 공급하는 이슈를 모니터링하고, 댓글 변화를 검증한 뒤 desktop을 벗어나지 않고 채팅 세션으로 작업을 넘깁니다.',
    failoverNoted: '페일오버 발생',
    liveStream: '실시간 스트림',
    refresh: '새로 고침',
    gatewayFailover: 'Gateway 페일오버 감지됨',
    gatewayFailoverDetail: '오래된 ticket-watch 임대 인수에서 복구되었습니다. 실시간 인박스 업데이트는 계속 동작합니다.',
    loading: '불러오는 중...',
    noOpenIssues: '열린 이슈 없음',
    noOpenIssuesHint: 'AI 작업 라벨이 붙은 이슈가 여기에 표시됩니다',
    configureHint: '이슈를 보려면 Gateway에 GitHub, GitLab 또는 Gitea provider를 구성하세요',
    openQueue: '열린 큐',
    issueRouting: '이슈 라우팅',
    routingCopy: '티켓을 선택해 brief와 실시간 댓글 타임라인을 확인한 뒤 작업을 시작하세요.',
    visibleSuffix: (filtered: number, total: number) => `${total}개 중 ${filtered}개 표시`,
    queuedSuffix: (n: number) => `${n}개 대기 중`,
    searchPlaceholder: '제목, 라벨, 담당자로 필터',
    searchAria: '인박스 이슈 검색',
    localSearchActive: '로컬 검색 활성',
    watchingLive: '열린 이슈를 실시간으로 보는 중',
    openIssuesAria: '열린 이슈',
    noMatch: (q: string) => `${q}에 일치하는 이슈가 없습니다.`,
    issueDetailEyebrow: '이슈 상세',
    detailIntro: '작업 스레드를 열기 전에 실시간 티켓 brief, 라벨, 실행 인계를 한 곳에서 유지합니다.',
    createdPrefix: '생성',
    updatedPrefix: '업데이트',
    updatedShortPrefix: '업데이트',
    copyBrief: 'Brief 복사',
    startTask: '작업 시작',
    brief: 'Brief',
    executionHandoff: '실행 인계',
    liveDetail: '실시간 상세',
    priority: '우선순위',
    priorityUnassigned: '미지정',
    assignees: '담당자',
    assigneesNone: '없음',
    labelsLabel: '라벨',
    updates: '업데이트',
    taskHandoffPreview: '작업 인계 미리보기',
    latestLiveUpdate: '최근 실시간 업데이트',
    commentTimeline: '댓글 타임라인',
    updateSuffix: (n: number) => `업데이트 ${n}건`,
    loadingComments: '댓글 불러오는 중...',
    noComments: '아직 댓글이 없습니다.',
    selectIssue: '이슈 선택',
    selectIssueHint: '인박스 항목을 선택해 brief, 라벨, 댓글 타임라인을 확인하세요.',
    noDescription: '설명 없음.',
    prioritySuffix: '우선순위',
    commentsSuffix: (n: number) => `댓글 ${n}개`,
    latestUpdatePrefix: '최근 업데이트',
    copyToast: 'Brief를 클립보드에 복사했습니다.',
    issuePromptPrefix: '이슈 작업',
  },
} as const

function buildIssuePrompt(
  ticket: DaemonTicket,
  copy: (typeof INBOX_COPY)[SupportedLocale],
): string {
  return `${copy.issuePromptPrefix} #${ticket.id}: ${ticket.title}\n\n${ticket.body?.slice(0, 500)}`
}

function getPriorityTone(priority?: string): string {
  switch (priority) {
    case 'high':
      return 'tag tag-yellow'
    case 'medium':
      return 'tag tag-green'
    case 'low':
      return 'tag'
    default:
      return 'tag'
  }
}

function filterTickets(tickets: DaemonTicket[], query: string): DaemonTicket[] {
  const term = query.trim().toLowerCase()
  if (!term) {
    return tickets
  }

  return tickets.filter((ticket) => [
    ticket.id,
    ticket.title,
    ticket.body,
    ticket.priority,
    ...ticket.labels,
    ...ticket.assignees,
  ].filter(Boolean).join(' ').toLowerCase().includes(term))
}

function InboxTicketCard({
  ticket,
  selected,
  onSelect,
  onStartChat,
  copy,
}: {
  ticket: DaemonTicket
  selected: boolean
  onSelect: (ticketId: string) => void
  onStartChat: (prompt: string) => void
  copy: (typeof INBOX_COPY)[SupportedLocale]
}) {
  const [latestComment, setLatestComment] = useState<GatewayTicketComment | null>(null)
  const [commentCount, setCommentCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchComments(): Promise<void> {
      try {
        const comments = await window.sepilot.ticketComments(ticket.id)
        if (cancelled) {
          return
        }
        setCommentCount(comments.length)
        setLatestComment(comments.at(-1) ?? null)
      } catch {
        if (!cancelled) {
          setCommentCount(0)
          setLatestComment(null)
        }
      }
    }

    void fetchComments()

    return () => {
      cancelled = true
    }
  }, [ticket.id, ticket.updatedAt])

  return (
    <div
      role="button"
      tabIndex={0}
      className={`card card-interactive inbox-ticket-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(ticket.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(ticket.id)
        }
      }}
    >
      <div className="inbox-ticket-card-header">
        <div className="inbox-ticket-card-badges">
          <span className="tag tag-blue">#{ticket.id}</span>
          <span className="tag tag-green">{ticket.status}</span>
          {ticket.priority ? (
            <span className={getPriorityTone(ticket.priority)}>{ticket.priority} {copy.prioritySuffix}</span>
          ) : null}
          {commentCount > 0 ? (
            <span className="tag">
              {copy.commentsSuffix(commentCount)}
            </span>
          ) : null}
        </div>
        <span className="inbox-ticket-card-date">
          {copy.updatedShortPrefix} {new Date(ticket.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="inbox-ticket-card-body-row">
        <div className="inbox-ticket-card-copy">
          <div className="inbox-ticket-card-title">{ticket.title}</div>
          <p className="text-secondary inbox-ticket-card-body">
            {ticket.body?.slice(0, 160)}
            {ticket.body?.length > 160 ? '...' : ''}
          </p>
          {latestComment ? (
            <div className="inbox-ticket-card-preview text-secondary">
              <strong className="inbox-ticket-card-preview-title">{copy.latestUpdatePrefix}</strong>
              {' · '}
              {latestComment.author}
              {' · '}
              {latestComment.body.slice(0, 110)}
              {latestComment.body.length > 110 ? '...' : ''}
            </div>
          ) : null}
          <div className="inbox-ticket-card-label-row">
            {ticket.labels.map((label) => (
              <span key={label} className="tag tag-blue">
                {label}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm inbox-ticket-card-action"
          onClick={(event) => {
            event.stopPropagation()
            onStartChat(buildIssuePrompt(ticket, copy))
          }}
        >
          {copy.startTask}
        </button>
      </div>
    </div>
  )
}

function InboxTicketDetail({
  ticket,
  onStartChat,
  copy,
}: {
  ticket?: DaemonTicket
  onStartChat: (prompt: string) => void
  copy: (typeof INBOX_COPY)[SupportedLocale]
}) {
  const [comments, setComments] = useState<GatewayTicketComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const ticketId = ticket?.id
  const ticketUpdatedAt = ticket?.updatedAt

  useEffect(() => {
    if (!ticketId) {
      setComments([])
      setLoadingComments(false)
      setCopyStatus(null)
      return
    }

    let cancelled = false
    let dispose: (() => void) | undefined
    let receivedSnapshot = false

    const fetchComments = async (isStale?: () => boolean) => {
      setLoadingComments(true)
      try {
        const nextComments = await window.sepilot.ticketComments(ticketId)
        if (cancelled || isStale?.()) {
          return
        }
        setComments(nextComments)
      } catch {
        if (!cancelled) {
          setComments([])
        }
      } finally {
        if (!cancelled) {
          setLoadingComments(false)
        }
      }
    }

    void fetchComments(() => receivedSnapshot)

    void window.sepilot
      .watchTicketComments(ticketId, (event: GatewayTicketCommentsWatchPayload) => {
        if (cancelled || event.type === 'heartbeat') {
          return
        }
        receivedSnapshot = true
        setComments((prev) => applyTicketCommentsEvent(prev, event))
        setLoadingComments(false)
      })
      .then((nextDispose) => {
        if (cancelled) {
          nextDispose()
          return
        }
        dispose = nextDispose
      })
      .catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [ticketId, ticketUpdatedAt])

  if (!ticket) {
    return (
      <section className="card inbox-detail surface-panel">
        <div className="empty-state" style={{ minHeight: 320 }}>
          <div className="empty-state-title" style={{ fontSize: 'var(--text-lg)' }}>
            {copy.selectIssue}
          </div>
          <p className="empty-state-text">
            {copy.selectIssueHint}
          </p>
        </div>
      </section>
    )
  }

  const handoffPrompt = buildIssuePrompt(ticket, copy)
  const lastComment = comments.at(-1)

  const handleCopyBrief = async () => {
    if (!navigator.clipboard?.writeText) {
      return
    }

    await navigator.clipboard.writeText(handoffPrompt)
    setCopyStatus(copy.copyToast)
    window.setTimeout(() => setCopyStatus(null), 1800)
  }

  return (
    <section className="card inbox-detail surface-panel">
      <div className="inbox-detail-header">
        <div>
          <div className="section-title">{copy.issueDetailEyebrow}</div>
          <h3 className="surface-panel-title inbox-detail-title">
            #{ticket.id} {ticket.title}
          </h3>
          <p className="surface-panel-copy">
            {copy.detailIntro}
          </p>
          <div className="inbox-detail-meta">
            <span>{copy.createdPrefix} {new Date(ticket.createdAt).toLocaleString()}</span>
            <span>{copy.updatedPrefix} {new Date(ticket.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="inbox-detail-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void handleCopyBrief()
            }}
          >
            <Clipboard className="shell-icon" />
            <span>{copy.copyBrief}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onStartChat(handoffPrompt)}
          >
            <Sparkles className="shell-icon" />
            <span>{copy.startTask}</span>
          </button>
        </div>
      </div>

      <div className="inbox-detail-grid">
        <section className="inbox-detail-section inbox-detail-section-card">
          <div className="inbox-detail-section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>
              {copy.brief}
            </div>
            <span className="tag tag-green">{ticket.status}</span>
          </div>
          <div className="inbox-detail-tags">
            {ticket.labels.map((label) => (
              <span key={label} className="tag tag-blue">
                {label}
              </span>
            ))}
          </div>
          <div className="inbox-detail-body">
            {ticket.body?.trim() ? ticket.body : copy.noDescription}
          </div>
        </section>

        <section className="inbox-detail-section inbox-detail-section-card inbox-detail-rail">
          <div className="inbox-detail-section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>
              {copy.executionHandoff}
            </div>
            <span className="tag">{copy.liveDetail}</span>
          </div>
          <div className="inbox-detail-stats-grid">
            <div className="inbox-detail-stat-card">
              <span>{copy.priority}</span>
              <strong>{ticket.priority ?? copy.priorityUnassigned}</strong>
            </div>
            <div className="inbox-detail-stat-card">
              <span>{copy.assignees}</span>
              <strong>{ticket.assignees.length > 0 ? ticket.assignees.join(', ') : copy.assigneesNone}</strong>
            </div>
            <div className="inbox-detail-stat-card">
              <span>{copy.labelsLabel}</span>
              <strong>{ticket.labels.length}</strong>
            </div>
            <div className="inbox-detail-stat-card">
              <span>{copy.updates}</span>
              <strong>{comments.length}</strong>
            </div>
          </div>
          <div className="inbox-detail-handoff-preview">
            <span className="section-title" style={{ marginBottom: 0 }}>
              {copy.taskHandoffPreview}
            </span>
            <p>{handoffPrompt}</p>
            {copyStatus ? <span className="inbox-detail-copy-status">{copyStatus}</span> : null}
          </div>
          {lastComment ? (
            <div className="inbox-detail-latest-card">
              <span className="section-title" style={{ marginBottom: 0 }}>
                {copy.latestLiveUpdate}
              </span>
              <strong>{lastComment.author}</strong>
              <p>{lastComment.body}</p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="inbox-detail-section inbox-detail-section-card">
        <div className="inbox-detail-section-header">
          <div className="section-title" style={{ marginBottom: 0 }}>
            {copy.commentTimeline}
          </div>
          <span className="tag">{copy.updateSuffix(comments.length)}</span>
        </div>
        {loadingComments && comments.length === 0 ? (
          <div className="text-muted">{copy.loadingComments}</div>
        ) : comments.length === 0 ? (
          <div className="text-muted">{copy.noComments}</div>
        ) : (
          <div className="inbox-comment-list">
            {comments.map((comment) => (
              <article key={comment.id} className="inbox-comment-item">
                <div className="inbox-comment-meta">
                  <strong>{comment.author}</strong>
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                <div className="inbox-comment-body">{comment.body}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

export function Inbox({
  onStartChat,
  gatewayWatchHealth = null,
}: {
  onStartChat: (prompt: string) => void
  gatewayWatchHealth?: GatewayTicketWatchRevalidateHealth | null
}) {
  const { locale } = useLocale()
  const copy = INBOX_COPY[locale] ?? INBOX_COPY.en
  const [tickets, setTickets] = useState<DaemonTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicketId, setSelectedTicketId] = useState<string>()
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    let dispose: (() => void) | undefined
    let receivedSnapshot = false

    fetchTickets(() => receivedSnapshot).catch(() => {})

    void window.sepilot
      .watchTickets('open', (event: GatewayTicketsWatchPayload) => {
        if (cancelled || event.type === 'heartbeat') {
          return
        }
        if (event.type === 'snapshot') {
          receivedSnapshot = true
        }
        setTickets((prev) => applyTicketListEvent(prev, event))
        setLoading(false)
      })
      .then((nextDispose) => {
        if (cancelled) {
          nextDispose()
          return
        }
        dispose = nextDispose
      })
      .catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])

  const filteredTickets = useMemo(
    () => filterTickets(tickets, searchQuery),
    [tickets, searchQuery],
  )

  useEffect(() => {
    if (filteredTickets.length === 0) {
      setSelectedTicketId(undefined)
      return
    }

    setSelectedTicketId((current) =>
      current && filteredTickets.some((ticket) => ticket.id === current)
        ? current
        : filteredTickets[0].id,
    )
  }, [filteredTickets])

  async function fetchTickets(isStale?: () => boolean) {
    try {
      const result = await window.sepilot.tickets('open')
      if (isStale?.()) {
        return
      }
      setTickets(result.items ?? [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const selectedTicket = filteredTickets.find((ticket) => ticket.id === selectedTicketId)
  const listStatus = searchQuery.trim()
    ? copy.visibleSuffix(filteredTickets.length, tickets.length)
    : copy.queuedSuffix(tickets.length)

  return (
    <div className="page surface-page">
      <div className="support-header">
        <div className="support-header-copy">
          <span className="surface-page-kicker">{copy.kicker}</span>
          <div className="support-header-title-row">
            <h2 className="page-title" style={{ marginBottom: 0 }}>
              {copy.title}
            </h2>
            <span className="tag">{copy.openIssuesSuffix(tickets.length)}</span>
          </div>
          <p className="support-header-summary">
            {copy.summary}
          </p>
        </div>

        <div className="support-header-meta">
          <span className="support-header-count">
            {hasGatewayWatchAlert(gatewayWatchHealth) ? copy.failoverNoted : copy.liveStream}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              void fetchTickets()
            }}
          >
            {copy.refresh}
          </button>
        </div>
      </div>

      {hasGatewayWatchAlert(gatewayWatchHealth) && (
        <div
          className={`inbox-health-alert ${
            gatewayWatchHealth?.recentStaleHeartbeatTakeover ? 'degraded' : ''
          }`}
        >
          <strong>{copy.gatewayFailover}</strong>
          <p>{copy.gatewayFailoverDetail}</p>
          {getGatewayWatchAlertMeta(gatewayWatchHealth) && (
            <span className="inbox-health-alert-meta">
              {getGatewayWatchAlertMeta(gatewayWatchHealth)}
            </span>
          )}
        </div>
      )}

      {loading && <div className="text-muted">{copy.loading}</div>}

      {!loading && tickets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title" style={{ fontSize: 'var(--text-lg)' }}>
            {copy.noOpenIssues}
          </div>
          <p className="empty-state-text">
            {copy.noOpenIssuesHint}
          </p>
          <p className="empty-state-text" style={{ marginTop: 'var(--space-1)' }}>
            {copy.configureHint}
          </p>
        </div>
      )}

      {!loading && tickets.length > 0 ? (
        <div className="inbox-shell">
          <section className="card surface-panel inbox-list-panel">
            <div className="surface-panel-header">
              <div>
                <div className="section-title">{copy.openQueue}</div>
                <h3 className="surface-panel-title">{copy.issueRouting}</h3>
              </div>
              <span className="tag">{listStatus}</span>
            </div>
            <p className="surface-panel-copy">
              {copy.routingCopy}
            </p>
            <div className="inbox-list-toolbar">
              <label className="inbox-list-search-field">
                <Search className="shell-icon" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchAria}
                />
              </label>
              <span className="inbox-list-toolbar-meta">
                {searchQuery.trim() ? copy.localSearchActive : copy.watchingLive}
              </span>
            </div>
            <div className="inbox-list" role="list" aria-label={copy.openIssuesAria}>
              {filteredTickets.map((ticket) => (
                <InboxTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  selected={ticket.id === selectedTicketId}
                  onSelect={setSelectedTicketId}
                  onStartChat={onStartChat}
                  copy={copy}
                />
              ))}
            </div>
            {filteredTickets.length === 0 ? (
              <div className="inbox-list-empty">
                {copy.noMatch(searchQuery)}
              </div>
            ) : null}
          </section>
          <InboxTicketDetail ticket={selectedTicket} onStartChat={onStartChat} copy={copy} />
        </div>
      ) : null}
    </div>
  )
}
