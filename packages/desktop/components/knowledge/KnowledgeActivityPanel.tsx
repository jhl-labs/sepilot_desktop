'use client'

import { useEffect, useState } from 'react'
import type {
  KnowledgeActivityPage,
  KnowledgeActivityDetail,
} from '@sepilotd/api-client/daemon/types'
import { useTransport } from '@/components/providers/transport-provider'
import { createKnowledgeApi } from '@/lib/api/knowledge'
import { Button } from '@/components/ui/button'

const STATES: Record<string, string> = {
  queued: '대기',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  interrupted: '중단',
}
const KINDS: Record<string, string> = {
  capture: '정보 수집',
  organize: '분류·관계 개선',
  write: '지식 변경',
  settings: '설정 변경',
  retrieve: '대화 지식 검색',
  export: '지식 내보내기',
  review: '제안 검토',
  'wiki-write': 'Wiki 문서 편집',
  'wiki-delete': 'Wiki 문서 삭제',
  'wiki-move': 'Wiki 이동',
  'wiki-import': 'Wiki 가져오기',
  'wiki-export': 'Wiki 내보내기',
}
const count = (value: number | null | undefined) =>
  value == null ? '미확인' : value.toLocaleString()
const time = (value: number | null) => (value === null ? '—' : new Date(value).toLocaleString())

export function KnowledgeActivityPanel() {
  const transport = useTransport()
  const [page, setPage] = useState<KnowledgeActivityPage | null>(null)
  const [cursor, setCursor] = useState<number | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KnowledgeActivityDetail | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setDetail(null)
    async function refresh() {
      try {
        const api = await createKnowledgeApi(transport)
        const [nextPage, nextDetail] = await Promise.all([
          api.activity(cursor),
          selectedId ? api.activityDetail(selectedId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setPage(nextPage)
        setDetail(nextDetail)
        setError('')
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 2000)
      }
    }
    void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [transport, cursor, selectedId])
  const totals = page?.totals
  const rows =
    page?.items.filter(
      (item) =>
        filter === 'all' ||
        (filter === 'automatic' ? item.trigger === 'automatic' : item.kind === filter),
    ) ?? []
  return (
    <section aria-label="지식 활동과 토큰" className="min-h-0 flex-1 overflow-auto p-4">
      <h2 className="text-sm font-semibold">지식 활동 · LLM 사용량</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        2초마다 갱신합니다. 토큰은 제공자 응답 기준이며, 응답 실패·사용량 미제공 호출은
        미확인입니다. 과거 실행을 소급 집계하지 않습니다.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {totals && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded border p-3">
              실행 중 <strong>{totals.running}</strong> · 대기 <strong>{totals.queued}</strong>
            </div>
            <div className="rounded border p-3">
              누적 입력 <strong>{count(totals.inputTokens)}</strong> · 출력{' '}
              <strong>{count(totals.outputTokens)}</strong>
            </div>
            <div className="rounded border p-3">
              오늘 (UTC) 입력 <strong>{count(totals.todayInputTokens)}</strong> · 출력{' '}
              <strong>{count(totals.todayOutputTokens)}</strong>
            </div>
            <div className="rounded border p-3">
              LLM 호출 {totals.calls}회 · 사용량 미확인{' '}
              <strong>{totals.unknownUsageCalls}회</strong>
            </div>
          </div>
          <p className="my-2 text-[11px] text-muted-foreground">
            누적치는 페이지·필터와 무관하게 기록된 전체 실행을 합산합니다. 미확인 호출이 있으면 실제
            소비량보다 적을 수 있습니다. 추론·캐시 토큰은 입력/출력의 별도 세부 항목이며 중복
            합산하지 않습니다.
          </p>
          <details className="mb-3 text-xs">
            <summary>제공자·모델별 사용량</summary>
            <ul>
              {totals.byModel.map((m) => (
                <li key={`${m.provider}:${m.model}`}>
                  {m.provider} / {m.model}: 입력 {count(m.inputTokens)}, 출력{' '}
                  {count(m.outputTokens)} · {m.calls}회 · 미확인 {m.unknownUsageCalls}회
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs">
              활동 필터{' '}
              <select
                aria-label="활동 필터"
                className="rounded border bg-background p-1"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">전체</option>
                <option value="automatic">자동 작업</option>
                <option value="capture">정보 수집</option>
                <option value="organize">분류 개선</option>
                <option value="write">지식 변경</option>
                <option value="retrieve">검색·활용</option>
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCursor(undefined)
                setSelectedId(null)
              }}
            >
              최신 실행
            </Button>
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            필터는 현재 페이지에 적용됩니다. 이전 실행은 다음 페이지에서 볼 수 있습니다.
          </p>
          <ul aria-label="지식 실행 이력" className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  aria-pressed={selectedId === r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded border p-3 text-left text-xs ${selectedId === r.id ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                >
                  <strong>
                    {KINDS[r.kind] ?? r.kind} · {STATES[r.status]}
                  </strong>
                  <span className="ml-2">
                    {r.trigger === 'automatic' ? '백그라운드' : '사용자 요청'}
                  </span>
                  <p>{r.summary}</p>
                  <p className="text-muted-foreground">{time(r.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
          {!rows.length && (
            <p className="p-3 text-xs text-muted-foreground">표시할 실행 이력이 없습니다.</p>
          )}
          {page?.nextCursor && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => {
                setCursor(page.nextCursor!)
                setSelectedId(null)
              }}
            >
              이전 실행
            </Button>
          )}
        </div>
        <article aria-label="지식 실행 상세" className="space-y-3 rounded border p-3 text-xs">
          {!detail ? (
            <p>실행을 선택하면 처리 대상, 진행 단계, 결과와 LLM 호출을 확인할 수 있습니다.</p>
          ) : (
            <>
              <h3 className="font-semibold">
                {KINDS[detail.activity.kind] ?? detail.activity.kind} ·{' '}
                {STATES[detail.activity.status]}
              </h3>
              <p className="break-all">실행 ID: {detail.activity.id}</p>
              {detail.activity.parentId && (
                <button
                  className="text-primary underline"
                  onClick={() => setSelectedId(detail.activity.parentId)}
                >
                  이 작업을 시작한 변경 보기
                </button>
              )}
              <p>
                시작: {time(detail.activity.startedAt)} · 종료: {time(detail.activity.finishedAt)}
              </p>
              {detail.activity.startedAt !== null && (
                <p>
                  경과:{' '}
                  {Math.max(
                    0,
                    ((detail.activity.finishedAt ?? Date.now()) - detail.activity.startedAt) / 1000,
                  ).toFixed(1)}
                  초
                </p>
              )}
              {detail.activity.error && (
                <p role="alert" className="text-destructive">
                  {detail.activity.error}
                </p>
              )}
              <details>
                <summary>처리 대상 ({detail.activity.targets.length})</summary>
                <ul>
                  {detail.activity.targets.map((t, i) => (
                    <li key={`${t.id}:${i}`} className="break-all">
                      {t.title ?? t.id} · {t.id}
                      {t.revision ? ` · v${t.revision}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
              <ol aria-label="작업 진행 단계" className="space-y-1">
                {detail.activity.events.map((e, i) => (
                  <li key={i}>
                    {time(e.at)} — {e.message}
                  </li>
                ))}
              </ol>
              {detail.activity.resultIds.length > 0 && (
                <p className="break-all">결과 ID: {detail.activity.resultIds.join(', ')}</p>
              )}
              {detail.activity.resultPreview && (
                <details>
                  <summary>결과·변경 내용 (최대 12,000자)</summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
                    {detail.activity.resultPreview}
                  </pre>
                </details>
              )}
              <h4 className="font-semibold">LLM 호출 {detail.calls.length}회</h4>
              {!detail.calls.length && <p>LLM 호출 없음 · 소비 토큰 0</p>}
              {detail.calls.map((c, index) => (
                <section
                  key={c.id}
                  aria-label={`LLM 호출 ${index + 1}`}
                  className="space-y-2 rounded border p-2"
                >
                  <strong>
                    {index + 1}. {c.provider} / {c.model} · {STATES[c.status]}
                  </strong>
                  <p>
                    입력 {count(c.inputTokens)} · 출력 {count(c.outputTokens)} 토큰
                  </p>
                  <p>
                    추론 {count(c.thinkingTokens)} · 캐시 읽기 {count(c.cacheReadTokens)} · 캐시
                    생성 {count(c.cacheCreationTokens)}
                  </p>
                  <p>
                    {time(c.startedAt)} ·{' '}
                    {(((c.finishedAt ?? Date.now()) - c.startedAt) / 1000).toFixed(1)}초
                  </p>
                  {c.error && <p className="text-destructive">{c.error}</p>}
                  <details>
                    <summary>
                      요청 내용 · 민감정보 필터 적용{c.requestChars > 12000 ? ' · 일부 표시' : ''}
                    </summary>
                    <p className="break-all">요청 지문: {c.requestSha256}</p>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
                      {c.requestPreview}
                    </pre>
                  </details>
                  {c.responsePreview !== null && (
                    <details>
                      <summary>응답 내용 · 최대 12,000자</summary>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
                        {c.responsePreview}
                      </pre>
                    </details>
                  )}
                </section>
              ))}
            </>
          )}
        </article>
      </div>
    </section>
  )
}
