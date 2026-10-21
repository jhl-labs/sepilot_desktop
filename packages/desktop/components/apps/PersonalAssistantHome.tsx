'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Brain,
  CalendarDays,
  CheckCheck,
  Clock3,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { SepilotReadableAppSummary } from '@sepilotd/api-client'
import { schedulerMissedEvidence } from '@sepilotd/api-client'
import { schedulerStatusLabel } from '@/components/tasks/scheduler-job-state'
import { AssistantConnections } from './AssistantConnections'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/components/providers/transport-provider'
import { createAppsApi } from '@/lib/api/apps'
import { createMemoryApi, type MemoryEntry } from '@/lib/api/memory'
import { createSchedulerApi, type SchedulerJob } from '@/lib/api/scheduler'
import { useSessionStore } from '@/lib/store/session-store'
import {
  ASSISTANT_SCENARIOS,
  ASSISTANT_SESSION_TAG,
  buildAssistantAgenda,
  buildAssistantRequest,
  type AssistantAgendaItem,
  type AssistantDestination,
  type AssistantRequest,
} from '@/lib/apps/assistant'

export interface AssistantNavigationProps {
  onStartAssistant: (request: AssistantRequest) => void
  onOpenResource: (destination: AssistantDestination) => void
  onOpenSession?: (sessionId: string) => void
}

export function PersonalAssistantHome({
  onStartAssistant,
  onOpenResource,
  onOpenSession,
}: AssistantNavigationProps) {
  const transport = useTransport()
  const sessions = useSessionStore((s) => s.sessions)
  const [request, setRequest] = useState('')
  const [apps, setApps] = useState<SepilotReadableAppSummary[]>([])
  const [agenda, setAgenda] = useState<AssistantAgendaItem[]>([])
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [jobs, setJobs] = useState<SchedulerJob[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++generation.current
    setLoading(true)
    const results = await Promise.allSettled([
      (async () => {
        const api = await createAppsApi(transport)
        const list = await api.list()
        const relevant = list.filter((app) => app.kind === 'calendar' || app.kind === 'todo')
        const reads = await Promise.allSettled(relevant.map((app) => api.read(app.id)))
        return { list, reads }
      })(),
      (async () => (await createMemoryApi(transport)).recent(3))(),
      (async () => (await createSchedulerApi(transport)).list())(),
    ])
    if (generation.current !== version) return
    const nextErrors: Record<string, string> = {}
    const [appResult, memoryResult, jobResult] = results
    if (appResult.status === 'fulfilled') {
      setApps(appResult.value.list)
      setAgenda(
        buildAssistantAgenda(
          appResult.value.reads.flatMap((read) =>
            read.status === 'fulfilled' ? [read.value] : [],
          ),
        ),
      )
      if (appResult.value.reads.some((read) => read.status === 'rejected')) {
        nextErrors.apps =
          '일부 앱을 읽지 못했습니다. 표시된 일정과 할 일은 조회에 성공한 앱 기준입니다.'
      }
    } else {
      setApps([])
      setAgenda([])
      nextErrors.apps = 'Apps를 불러오지 못했습니다. 연결과 앱의 AI 읽기 권한을 확인하세요.'
    }
    if (memoryResult.status === 'fulfilled') setMemories(memoryResult.value)
    else {
      setMemories([])
      nextErrors.memory = 'Memory를 불러오지 못했습니다.'
    }
    if (jobResult.status === 'fulfilled') {
      setJobs(
        jobResult.value
          .filter((job) => (job.status !== 'cancelled' && job.status !== 'completed') || schedulerMissedEvidence(job))
          .sort(
            (a, b) =>
              Number(b.status === 'failed' || schedulerMissedEvidence(b)) - Number(a.status === 'failed' || schedulerMissedEvidence(a)) ||
              a.nextRunAt - b.nextRunAt,
          ),
      )
    } else {
      setJobs([])
      nextErrors.tasks = 'Tasks를 불러오지 못했습니다. 예약 기능의 활성화 상태를 확인하세요.'
    }
    setErrors(nextErrors)
    setUpdatedAt(new Date())
    setLoading(false)
  }, [transport])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      generation.current++
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const recentSessions = sessions
    .filter((session) => session.tags?.includes(ASSISTANT_SESSION_TAG))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3)
  const personalApps = apps.filter((app) =>
    ['calendar', 'todo', 'briefing', 'notepad', 'meetings'].includes(app.kind),
  )

  return (
    <div className="h-full overflow-y-auto bg-background" data-testid="personal-assistant-home">
      <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
              <Sparkles className="h-4 w-4" /> 나의 비서
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">오늘, 무엇을 함께 할까요?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              일정과 할 일에 나의 기억을 더하고, 반복할 일은 비서에게 맡기세요.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="비서 홈 새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </header>

        <form
          className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (request.trim())
              onStartAssistant(
                buildAssistantRequest({ title: request.trim().slice(0, 48), prompt: request }),
              )
          }}
        >
          <label htmlFor="assistant-request" className="text-sm font-medium">
            비서에게 부탁하기
          </label>
          <textarea
            id="assistant-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            rows={2}
            className="mt-2 w-full resize-y bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="내일 회의 전에 준비할 일과 관련 메모를 정리해줘"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">대화에서 내용을 확인하고 전송하세요.</p>
            <Button type="submit" disabled={!request.trim()} size="sm">
              대화로 이어가기 <ArrowUpRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </form>

        <AssistantConnections
          calendarId={apps.find(app => app.kind === 'calendar')?.id}
          onOpenCalendar={() => onOpenResource({ view: 'office', appId: apps.find(app => app.kind === 'calendar')?.id })}
        />

        <section
          aria-label="비서 사용 시나리오"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ASSISTANT_SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onStartAssistant(buildAssistantRequest(scenario))}
            >
              <span className="text-sm font-medium">{scenario.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {scenario.description}
              </span>
            </button>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-2" aria-busy={loading}>
          <section className="rounded-xl border p-4" aria-label="오늘의 일정과 할 일">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> 오늘의 일정과 할 일
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              이 기기의 날짜 기준 · 저장된 앱 데이터
            </p>
            {errors.apps ? (
              <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                {errors.apps}
              </p>
            ) : null}
            {!loading && !errors.apps && agenda.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                조회한 앱에 오늘 일정이나 오늘까지의 미완료 할 일이 없습니다.
              </p>
            ) : null}
            <div className="mt-3 space-y-1">
              {agenda.slice(0, 6).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onOpenResource({ view: 'office', appId: item.appId })}
                  className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.kind === 'event' ? (
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.detail} · {item.appTitle}
                    </span>
                  </span>
                </button>
              ))}
              {agenda.length > 6 ? (
                <p className="px-2 text-xs text-muted-foreground">
                  외 {agenda.length - 6}개 · 각 앱에서 전체 보기
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {personalApps.map((app) => (
                <Button
                  key={app.id}
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenResource({ view: 'office', appId: app.id })}
                >
                  {app.title}
                </Button>
              ))}
              {!loading && personalApps.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenResource({ view: 'office' })}
                >
                  앱과 읽기 권한 확인
                </Button>
              ) : null}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border p-4" aria-label="비서의 기억">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Brain className="h-4 w-4 text-primary" /> 최근 기억
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenResource({ view: 'memory' })}
                >
                  Memory 관리
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                선호와 결정은 다음 대화에서도 참고할 수 있습니다.
              </p>
              {errors.memory ? (
                <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  {errors.memory}
                </p>
              ) : memories.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {memories.map((memory) => (
                    <li key={memory.id} className="line-clamp-2">
                      {memory.content}
                    </li>
                  ))}
                </ul>
              ) : !loading ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  아직 조회된 기억이 없습니다. 나의 선호부터 함께 정해보세요.
                </p>
              ) : null}
            </section>
            <section className="rounded-xl border p-4" aria-label="비서의 예약 작업">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Clock3 className="h-4 w-4 text-primary" /> 맡겨 둔 일
                </h2>
                <Button size="sm" variant="ghost" onClick={() => onOpenResource({ view: 'tasks' })}>
                  Tasks 관리
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                예약 시간, 실행 결과, 일시중지를 한곳에서 확인하세요.
              </p>
              {errors.tasks ? (
                <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  {errors.tasks}
                </p>
              ) : jobs.length ? (
                <div className="mt-2 space-y-1">
                  {jobs.slice(0, 3).map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => onOpenResource({ view: 'tasks', jobId: job.id })}
                      className="block w-full rounded-lg p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate text-sm">{job.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {schedulerMissedEvidence(job)
                          ? '실행 시각을 놓침 · 복구 확인 필요'
                          : job.status === 'failed'
                          ? '실행 실패 · 결과 확인 필요'
                          : job.status === 'running'
                            ? '실행 중'
                            : !job.enabled
                              ? '일시중지'
                              : `${schedulerStatusLabel(job)} · 다음 실행 ${new Date(job.nextRunAt).toLocaleString()}`}
                      </span>
                    </button>
                  ))}
                </div>
              ) : !loading ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  예약된 일이 없습니다. 반복 브리핑을 함께 설정해보세요.
                </p>
              ) : null}
              {jobs.some(job => schedulerMissedEvidence(job) || job.status === 'failed') ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => onStartAssistant(buildAssistantRequest({
                  title: '놓친 작업 복구하기',
                  prompt: '예약 목록과 실행 기록을 확인해서 실패하거나 실행 시각을 놓친 작업을 정리해줘. 연결된 앱의 현재 상태도 확인해서 지금 다시 실행할 가치가 있는 작업과 이미 불필요한 작업을 구분해줘. 내가 선택하기 전에는 실행하거나 예약을 바꾸지 마.',
                }))}>비서와 복구 검토</Button>
              ) : null}
            </section>
          </div>
        </div>

        {onOpenSession && recentSessions.length ? (
          <section aria-label="최근 비서 대화">
            <h2 className="mb-2 text-sm font-semibold">이어서 이야기하기</h2>
            <div className="flex flex-wrap gap-2">
              {recentSessions.map((session) => (
                <Button
                  key={session.id}
                  variant="outline"
                  size="sm"
                  className="max-w-full"
                  onClick={() => onOpenSession(session.id)}
                >
                  <span className="truncate">{session.title}</span>
                  <ArrowUpRight className="ml-2 h-3 w-3 shrink-0" />
                </Button>
              ))}
            </div>
          </section>
        ) : null}
        <p role="status" className="text-xs text-muted-foreground">
          {loading
            ? '저장된 정보 확인 중…'
            : updatedAt
              ? `${updatedAt.toLocaleTimeString()}에 확인 · 홈을 여는 것만으로 AI 요청이나 변경을 실행하지 않습니다.`
              : ''}
        </p>
      </div>
    </div>
  )
}
