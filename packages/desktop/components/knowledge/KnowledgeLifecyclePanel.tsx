'use client'
import { useEffect, useState } from 'react'
import type { KnowledgeLifecycleState, PersonalKnowledge } from '@sepilotd/api-client/daemon/types'
import { useTransport } from '@/components/providers/transport-provider'
import { createKnowledgeApi } from '@/lib/api/knowledge'
import { Button } from '@/components/ui/button'

const labels = {
  inactive: '후보·보관됨',
  changed: '검증 후 변경됨',
  due: '재검증 기한 도래',
  verified: '확인됨',
  unverified: '검증 기록 없음',
}
export function KnowledgeLifecyclePanel({
  records,
  selected,
  disabled,
  onChanged,
  onSelect,
}: {
  records: PersonalKnowledge[]
  selected?: PersonalKnowledge
  disabled: boolean
  onChanged: () => Promise<void>
  onSelect: (record: PersonalKnowledge) => void
}) {
  const transport = useTransport()
  const [state, setState] = useState<KnowledgeLifecycleState | null>(null)
  const [limit, setLimit] = useState('')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const [backup, setBackup] = useState<PersonalKnowledge[]>([])
  const [preview, setPreview] = useState<{
    snapshot: PersonalKnowledge
    current: PersonalKnowledge | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await (await createKnowledgeApi(transport)).lifecycle()
        if (!cancelled) setState(next)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 5000)
      }
    }
    void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [transport, busy])
  useEffect(() => {
    setNote('')
  }, [selected?.id, selected?.revision])
  const locked = disabled || busy
  const verification = state?.verifications.find((v) => v.id === selected?.id)
  const due = state?.verifications.filter((v) => v.state === 'due' || v.state === 'changed') ?? []
  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function verify(action: 'schedule' | 'verify') {
    if (!selected) return
    const interval = Number(days)
    if (!Number.isInteger(interval) || interval < 0 || interval > 3650)
      throw new Error('확인 간격은 0~3650일로 입력하세요.')
    await (
      await createKnowledgeApi(transport)
    ).verify({
      id: selected.id,
      expectedRevision: selected.revision,
      action,
      nextReviewAt: interval === 0 ? null : Date.now() + interval * 86400000,
      note,
    })
    setNote('')
  }
  return (
    <section aria-label="Wiki 보존과 운영" className="space-y-3 rounded-md border p-3 text-xs">
      <h3 className="text-sm font-medium">Wiki 보존과 운영</h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer">
          재검증 필요 {due.length}개 · 자동 작업 예산 · 선택 복원
        </summary>
        <div className="mt-3 space-y-4">
          <section className="space-y-2">
            <h4 className="font-medium">재검증 시점</h4>
            <p>
              기한이 지나도 지식은 유지됩니다. 확인은 선택한 버전에만 유효하며, 수정되면 다시 확인이
              필요합니다.
            </p>
            {due.map((v) => (
              <Button
                key={v.id}
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => {
                  const record = records.find((r) => r.id === v.id)
                  if (record) onSelect(record)
                }}
              >
                {v.title} · {labels[v.state]}
              </Button>
            ))}
            {selected && (
              <fieldset disabled={locked || selected.status !== 'accepted'} className="space-y-2">
                <p>
                  {selected.title} · {verification ? labels[verification.state] : '조회 중'}
                  {verification?.verifiedAt
                    ? ` · 확인 ${new Date(verification.verifiedAt).toLocaleString()}`
                    : ''}
                  {verification?.nextReviewAt
                    ? ` · 다음 확인 ${new Date(verification.nextReviewAt).toLocaleString()}`
                    : ''}
                </p>
                {verification?.note && <p>최근 기록: {verification.note}</p>}
                <label className="block">
                  다음 확인까지 일수 (0: 일정 해제){' '}
                  <input
                    aria-label="재검증 간격"
                    type="number"
                    min="0"
                    max="3650"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-24 rounded border bg-background p-1"
                  />
                </label>
                <textarea
                  aria-label="재검증 근거"
                  placeholder="확인한 출처 또는 일정 변경 이유"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded border bg-background p-2"
                  maxLength={1000}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!note.trim()}
                    onClick={() => void run(() => verify('schedule'))}
                  >
                    일정만 저장
                  </Button>
                  <Button
                    size="sm"
                    disabled={!note.trim()}
                    onClick={() => void run(() => verify('verify'))}
                  >
                    현재 버전 확인 완료
                  </Button>
                </div>
              </fieldset>
            )}
          </section>
          <section className="space-y-2">
            <h4 className="font-medium">자동 작업 일일 토큰 예산</h4>
            {state && (
              <p>
                {state.budget.day} UTC · 한도 {state.budget.limit.toLocaleString()} · 측정{' '}
                {state.budget.measuredTokens.toLocaleString()} · 예약·미확인{' '}
                {state.budget.reservedTokens.toLocaleString()} · 잔여{' '}
                {state.budget.remainingTokens.toLocaleString()}
              </p>
            )}
            <p>
              자동 분류·관계 개선에 적용합니다. 호출 전 추정량을 예약하고 응답 사용량으로
              정산합니다. 미확인 호출의 예약은 유지하며, 실제 사용량이 추정을 넘을 수 있습니다.
              채팅과 직접 요청한 작업은 별도입니다.
            </p>
            <label>
              일일 한도 (0: 자동 LLM 호출 중지){' '}
              <input
                aria-label="일일 토큰 한도"
                type="number"
                min="0"
                max="100000000"
                placeholder={String(state?.budget.limit ?? 50000)}
                value={limit}
                disabled={locked}
                onChange={(e) => setLimit(e.target.value)}
                className="w-32 rounded border bg-background p-1"
              />
            </label>
            <Button
              size="sm"
              disabled={locked || !state || limit === ''}
              onClick={() =>
                void run(async () => {
                  const value = Number(limit)
                  if (!Number.isInteger(value) || value < 0 || value > 100000000)
                    throw new Error('유효한 토큰 한도를 입력하세요.')
                  await (await createKnowledgeApi(transport)).setBudget(value)
                  setLimit('')
                })
              }
            >
              예산 저장
            </Button>
          </section>
          <section className="space-y-2">
            <h4 className="font-medium">백업에서 선택 복원</h4>
            <p>
              내보낸 Wiki JSON에서 항목 하나를 선택하세요. 현재 이력을 유지하고 새 후보 버전으로
              복원합니다. 분류·관계 대상은 먼저 존재해야 합니다.
            </p>
            <input
              aria-label="Wiki 백업 파일"
              type="file"
              accept=".json,application/json"
              disabled={locked}
              onChange={(e) => {
                const file = e.target.files?.[0]
                setPreview(null)
                setBackup([])
                if (file)
                  void run(async () => {
                    if (file.size > 20 * 1024 * 1024)
                      throw new Error('20MB 이하의 Wiki 백업을 선택하세요.')
                    const data = JSON.parse(await file.text())
                    if (
                      data.format !== 'sepilotd.personal-knowledge' ||
                      data.version !== 1 ||
                      !Array.isArray(data.records) ||
                      data.records.length > 10000 ||
                      data.records.some(
                        (r: PersonalKnowledge) =>
                          !r ||
                          typeof r.id !== 'string' ||
                          typeof r.title !== 'string' ||
                          typeof r.body !== 'string' ||
                          !Number.isInteger(r.revision),
                      )
                    )
                      throw new Error('지원하는 Wiki 백업 형식이 아닙니다.')
                    setBackup(data.records)
                  })
              }}
            />
            {backup.length > 0 && (
              <select
                aria-label="복원할 지식"
                className="w-full rounded border bg-background p-2"
                disabled={locked}
                value={preview?.snapshot.id ?? ''}
                onChange={(e) => {
                  const snapshot = backup.find((r) => r.id === e.target.value)
                  setPreview(
                    snapshot
                      ? { snapshot, current: records.find((r) => r.id === snapshot.id) ?? null }
                      : null,
                  )
                }}
              >
                <option value="">복원할 항목 선택</option>
                {backup.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · 백업 v{r.revision}
                  </option>
                ))}
              </select>
            )}
            {preview && (
              <div className="space-y-2 rounded border p-2">
                <p>{preview.snapshot.title} · 새 후보로 복원</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    현재 {preview.current ? `v${preview.current.revision}` : '(없음)'}
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                      {preview.current?.body ?? '(새 지식)'}
                    </pre>
                  </div>
                  <div>
                    백업 v{preview.snapshot.revision}
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                      {preview.snapshot.body}
                    </pre>
                  </div>
                </div>
                <details>
                  <summary>분류·관계·출처 확인</summary>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(
                      {
                        parentId: preview.snapshot.parentId,
                        tags: preview.snapshot.tags,
                        relations: preview.snapshot.relations,
                        sources: preview.snapshot.sources,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                <Button
                  size="sm"
                  disabled={locked}
                  onClick={() =>
                    void run(async () => {
                      await (
                        await createKnowledgeApi(transport)
                      ).restore(preview.snapshot, preview.current?.revision ?? null)
                      setPreview(null)
                      await onChanged()
                    })
                  }
                >
                  선택 항목을 후보로 복원
                </Button>
              </div>
            )}
          </section>
        </div>
      </details>
    </section>
  )
}
