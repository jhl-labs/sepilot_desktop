'use client'
import { useEffect, useRef, useState } from 'react'
import type {
  KnowledgeMaintenanceState,
  KnowledgeChatUpdateMode,
} from '@sepilotd/api-client/daemon/types'
import { useTransport } from '@/components/providers/transport-provider'
import { createKnowledgeApi } from '@/lib/api/knowledge'
import { Button } from '@/components/ui/button'

export function KnowledgeMaintenancePanel({
  onChanged,
  disabled = false,
}: {
  onChanged: () => Promise<void>
  disabled?: boolean
}) {
  const transport = useTransport()
  const changedRef = useRef(onChanged)
  const disabledRef = useRef(disabled)
  const recordsVersion = useRef<number | null>(null)
  changedRef.current = onChanged
  disabledRef.current = disabled
  const [state, setState] = useState<KnowledgeMaintenanceState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      try {
        const next = await (await createKnowledgeApi(transport)).maintenance()
        if (!cancelled) {
          setState(next)
          if (!disabledRef.current) {
            if (recordsVersion.current !== null && recordsVersion.current !== next.recordsVersion)
              await changedRef.current()
            recordsVersion.current = next.recordsVersion
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 3000)
      }
    }
    if (!busy) void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [transport, busy])
  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      setState(await (await createKnowledgeApi(transport)).maintenance())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="대화 중 Wiki 갱신" className="space-y-3 rounded-md border p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
        대화 중 Wiki 갱신
        <select
          aria-label="대화 중 Wiki 갱신 방식"
          className="rounded border bg-background px-2 py-1 text-xs"
          value={state?.mode ?? 'suggest'}
          disabled={!state || busy || disabled}
          onChange={(e) => {
            const mode = e.target.value as KnowledgeChatUpdateMode
            void run(async () => {
              await (await createKnowledgeApi(transport)).setChatUpdateMode(mode)
            })
          }}
        >
          <option value="off">끄기 · 명시적 요청만</option>
          <option value="suggest">제안 후 반영</option>
          <option value="automatic">근거가 있는 내용 자동 반영</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        진행 중인 대화에서 재사용할 지식이나 정정 사항을 발견하면 갱신합니다. 자동 반영은 사용자
        발언 근거가 있는 내용에 적용하며, 삭제는 자동으로 하지 않습니다. 별도 대화를 백그라운드로
        순회하지 않습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        제안·작성 토큰은 해당 채팅에, 추가 자동 분류 작업은 활동 · 토큰에 기록됩니다.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {state?.proposals.map((proposal) => (
        <article key={proposal.id} className="space-y-2 rounded border p-3">
          <h4 className="text-sm font-medium">
            {proposal.proposed.title} ·{' '}
            {proposal.before ? `v${proposal.before.revision} 수정 제안` : '새 지식 제안'}
          </h4>
          <p className="text-xs">{proposal.proposed.reason}</p>
          {proposal.reviewReason && (
            <p className="text-xs text-muted-foreground">자동 반영 보류: {proposal.reviewReason}</p>
          )}
          <details>
            <summary className="cursor-pointer text-xs">변경 전·후 및 원문 근거 확인</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <h5 className="text-xs font-medium">
                  변경 전 · {proposal.before?.title ?? '새 지식'}
                </h5>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {proposal.before?.body ?? '(없음)'}
                </pre>
              </div>
              <div>
                <h5 className="text-xs font-medium">변경 후 · {proposal.proposed.title}</h5>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {proposal.proposed.body}
                </pre>
              </div>
            </div>
            <p className="mt-2 text-xs">
              출처: {proposal.source.title} · {proposal.source.id}
            </p>
            <blockquote className="max-h-32 overflow-auto whitespace-pre-wrap border-l pl-2 text-xs">
              {proposal.source.excerpt}
            </blockquote>
          </details>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  await (
                    await createKnowledgeApi(transport)
                  ).decideContentProposal(proposal.id, 'accept')
                  await onChanged()
                })
              }
            >
              갱신 반영
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  await (
                    await createKnowledgeApi(transport)
                  ).decideContentProposal(proposal.id, 'reject')
                })
              }
            >
              거절
            </Button>
          </div>
        </article>
      ))}
      {state?.proposals.length === 0 && (
        <p className="text-xs text-muted-foreground">대기 중인 내용 갱신 제안이 없습니다.</p>
      )}
    </section>
  )
}
