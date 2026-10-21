'use client'

import { KnowledgePaneLayout } from './KnowledgePaneLayout'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  PersonalKnowledge,
  PersonalKnowledgeWrite,
  PersonalKnowledgeCapture,
  PersonalKnowledgeSuggestion,
  PersonalKnowledgeKind,
  PersonalKnowledgeRelation,
  PersonalKnowledgeReview,
} from '@sepilotd/api-client/daemon/types'
import { useTransport } from '@/components/providers/transport-provider'
import { createKnowledgeApi } from '@/lib/api/knowledge'
import { createWikiApi } from '@/lib/api/wiki'
import { createMemoryApi } from '@/lib/api/memory'
import { createSessionsApi } from '@/lib/api/sessions'
import { useWikiStore } from '@/lib/store/wiki-store'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { useSessionStore } from '@/lib/store/session-store'
import { downloadTextFile } from '@/lib/wiki-file-transfer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KnowledgeLifecyclePanel } from './KnowledgeLifecyclePanel'
import { KnowledgeMaintenancePanel } from './KnowledgeMaintenancePanel'
import { KnowledgeActivityPanel } from './KnowledgeActivityPanel'

const KINDS: Record<PersonalKnowledgeKind, string> = {
  fact: '사실',
  concept: '개념',
  decision: '결정',
  procedure: '절차',
  preference: '선호',
  category: '분류',
}
const STATUS = { candidate: '검토 대기', accepted: '영구 지식', archived: '보관' }
const RELATIONS: Record<PersonalKnowledgeRelation['type'], string> = {
  related: '관련',
  supports: '뒷받침',
  contradicts: '충돌',
  supersedes: '대체',
}
const emptyDraft = (): PersonalKnowledgeWrite => ({
  title: '',
  body: '',
  kind: 'fact',
  status: 'candidate',
  parentId: null,
  tags: [],
  relations: [],
  reason: '사용자가 작성',
})
function toWrite(item: PersonalKnowledge): PersonalKnowledgeWrite {
  return {
    id: item.id,
    expectedRevision: item.revision,
    title: item.title,
    body: item.body,
    kind: item.kind,
    status: item.status,
    parentId: item.parentId,
    tags: item.tags,
    relations: item.relations,
    reason: item.reason,
  }
}
const selectStyle = 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs'

export function PersonalKnowledgePage() {
  const transport = useTransport()
  const [showActivity, setShowActivity] = useState(false)
  const sourcePickerRef = useRef<HTMLSelectElement>(null)
  const activeId = useSessionStore((s) => s.activeId)
  const [records, setRecords] = useState<PersonalKnowledge[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<PersonalKnowledgeWrite>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [filter, setFilter] = useState('accepted')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState<PersonalKnowledge[]>([])
  const [review, setReview] = useState<PersonalKnowledgeReview | null>(null)
  const reviewStamp = useRef(0)
  const [suggestions, setSuggestions] = useState<PersonalKnowledgeSuggestion[]>([])
  const [captureKind, setCaptureKind] = useState<PersonalKnowledgeCapture['kind']>('wiki')
  const [sources, setSources] = useState<Array<{ id: string; title: string; excerpt?: string }>>([])
  const [sourceId, setSourceId] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [relationTarget, setRelationTarget] = useState('')
  const [relationType, setRelationType] = useState<PersonalKnowledgeRelation['type']>('related')
  const current = records.find((r) => r.id === selected)
  const categories = records.filter((r) => r.kind === 'category' && r.status !== 'archived')
  const byId = useMemo(() => new Map(records.map((r) => [r.id, r])), [records])
  function path(id: string): string {
    const names: string[] = []
    const seen = new Set<string>()
    let node = byId.get(id)
    while (node && !seen.has(node.id)) {
      seen.add(node.id)
      names.unshift(node.title)
      node = node.parentId ? byId.get(node.parentId) : undefined
    }
    return names.join(' / ')
  }
  const visible = records.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false
    if (category === 'none' && r.parentId) return false
    if (category !== 'all' && category !== 'none') {
      let parent = r.parentId
      const seen = new Set<string>()
      while (parent && parent !== category && !seen.has(parent)) {
        seen.add(parent)
        parent = byId.get(parent)?.parentId ?? null
      }
      if (parent !== category && r.id !== category) return false
    }
    return `${r.title} ${r.body} ${r.tags.join(' ')}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  })
  useEffect(() => {
    let cancelled = false
    void createKnowledgeApi(transport)
      .then((api) => api.list())
      .then((items) => {
        if (!cancelled) setRecords(items)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [transport])
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refreshReview() {
      try {
        const next = await (await createKnowledgeApi(transport)).review()
        if (cancelled) return
        setReview(next)
        if (next.updatedAt !== reviewStamp.current) {
          reviewStamp.current = next.updatedAt
          setSuggestions(next.suggestions)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) timer = setTimeout(() => void refreshReview(), 3000)
      }
    }
    void refreshReview()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [transport])
  useEffect(() => {
    let cancelled = false
    setSources([])
    setSourceId('')
    setSourceLoading(true)
    void (async () => {
      try {
        let items: typeof sources = []
        if (captureKind === 'conversation')
          items = (await (await createSessionsApi(transport)).list())
            .filter((s) => !s.isDraft)
            .map((s) => ({ id: s.id, title: s.title }))
        if (captureKind === 'wiki')
          items = (await (await createWikiApi(transport)).tree())
            .filter((n) => n.body?.trim())
            .map((n) => ({ id: n.id, title: n.title, excerpt: n.body }))
        if (captureKind === 'memory')
          items = (await (await createMemoryApi(transport)).recent(100)).map((m) => ({
            id: m.id,
            title: m.content.slice(0, 100),
            excerpt: m.content,
          }))
        if (!cancelled) {
          setSources(items)
          setSourceId(items.find((s) => s.id === activeId)?.id ?? items[0]?.id ?? '')
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setSourceLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, captureKind, activeId])
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  function edit<K extends keyof PersonalKnowledgeWrite>(key: K, value: PersonalKnowledgeWrite[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }
  function open(item: PersonalKnowledge) {
    setSelected(item.id)
    setDraft(toWrite(item))
    setEditing(true)
    setHistory([])
    setDirty(false)
  }
  function openDocument(id?: string) {
    if (busy || dirty) return
    useWikiStore.getState().setSelected(id ?? null)
    window.dispatchEvent(new CustomEvent('sepilot:open-view', { detail: 'wiki' }))
  }
  async function save(status = draft.status) {
    const api = await createKnowledgeApi(transport)
    const saved = await api.save({
      ...draft,
      status,
      tags: draft.tags.map((t) => t.trim()).filter(Boolean),
    })
    setRecords(await api.list())
    open(saved)
    setFilter(status)
    setNotice('출처와 변경 이력을 보존해 저장했습니다.')
  }
  async function capture(extract = true) {
    const source = sources.find((s) => s.id === sourceId)
    let input: PersonalKnowledgeCapture
    if (captureKind === 'conversation' || captureKind === 'wiki')
      input = { kind: captureKind, id: sourceId }
    else
      input = {
        kind: captureKind,
        id: source?.id ?? 'manual-excerpt',
        title: source?.title ?? sourceTitle,
        excerpt: source?.excerpt ?? excerpt,
      }
    const api = await createKnowledgeApi(transport)
    const captured = await api.capture(input, extract)
    setRecords(await api.list())
    setFilter(captured[0]?.status ?? 'candidate')
    setCategory('all')
    setQuery('')
    if (captured[0]) open(captured[0])
    setNotice(
      captured.length
        ? `${captured.length}개 후보를 가져왔습니다. 근거를 확인하고 승격하세요. 동일한 원문은 중복 저장하지 않습니다.`
        : '장기적으로 유용한 지식 후보를 찾지 못했습니다.',
    )
  }
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const handleCompact = useCallback(() => {
    setLeftOpen(false)
    setRightOpen(false)
  }, [])

  return (
    <section aria-label="영구 지식 관리" className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold">경험을 지식으로</h2>
          <p className="text-xs text-muted-foreground">
            채팅에서 “$wiki 이 내용을 저장해줘” 또는 “지식으로 남겨줘”라고 요청하세요. “기억해줘”는
            메모리에 저장됩니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={leftOpen}
          onClick={() => setLeftOpen((value) => !value)}
        >
          {leftOpen ? '왼쪽 패널 접기' : '왼쪽 패널 펼치기'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={rightOpen}
          onClick={() => setRightOpen((value) => !value)}
        >
          {rightOpen ? 'Wiki 트리 접기' : 'Wiki 트리 펼치기'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || dirty}
          onClick={() => {
            setCaptureKind('wiki')
            setLeftOpen(true)
            requestAnimationFrame(() => {
              sourcePickerRef.current?.focus()
              sourcePickerRef.current?.scrollIntoView?.({ block: 'nearest' })
            })
          }}
        >
          문서 연결
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || dirty}
          onClick={() =>
            void run(async () => {
              const api = await createKnowledgeApi(transport)
              setRecords(await api.list())
              setSuggestions([])
              setNotice('최신 지식을 불러왔습니다.')
            })
          }
        >
          새로고침
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || dirty || !records.length}
          onClick={() =>
            void run(async () => {
              const items = await (await createKnowledgeApi(transport)).organize()
              setSuggestions(items)
              setNotice(
                items.length
                  ? `${items.length}개 분류·관계 제안을 검토하세요.`
                  : '현재 분류에서 개선할 항목을 찾지 못했습니다.',
              )
            })
          }
        >
          AI 분류 다듬기
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              downloadTextFile(
                JSON.stringify(await (await createKnowledgeApi(transport)).export(), null, 2),
                'sepilot-knowledge.json',
                'application/json',
              )
            })
          }
        >
          이력 포함 내보내기
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={showActivity}
          onClick={() => setShowActivity((value) => !value)}
        >
          {showActivity ? '지식 편집으로' : '활동 · 토큰'}
        </Button>
      </header>
      {error && (
        <p role="alert" className="border-b p-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {(busy || notice) && (
        <p role="status" className="border-b p-3 text-xs">
          {busy ? '처리 중입니다…' : notice}
        </p>
      )}
      {showActivity && <KnowledgeActivityPanel />}
      <div
        style={showActivity ? { display: 'none' } : undefined}
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <KnowledgePaneLayout
          onCompact={handleCompact}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          left={
            <aside className="space-y-4 p-3">
              <h3 className="text-sm font-semibold">문서와 대화에서 지식 추가</h3>
              <p className="text-xs text-muted-foreground">
                내용은 문서 편집기에서 작성하고, 여기서는 원본을 연결해 지식으로 검토·승격합니다.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || dirty}
                onClick={() => openDocument()}
              >
                문서에서 작성하기
              </Button>
              <label className="block text-xs">
                출처 유형
                <select
                  aria-label="출처 유형"
                  className={selectStyle}
                  value={captureKind}
                  disabled={busy}
                  onChange={(e) => setCaptureKind(e.target.value as typeof captureKind)}
                >
                  <option value="conversation">대화 이력</option>
                  <option value="wiki">작성 문서</option>
                  <option value="memory">메모리</option>
                  <option value="manual">직접 발췌</option>
                </select>
              </label>
              {captureKind === 'manual' ? (
                <>
                  <Input
                    aria-label="발췌 제목"
                    placeholder="출처 제목"
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                  />
                  <textarea
                    aria-label="발췌 원문"
                    className={`${selectStyle} min-h-32`}
                    maxLength={24000}
                    placeholder="다시 활용할 질문·답변이나 문서 내용을 넣으세요."
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                  />
                </>
              ) : (
                <select
                  ref={sourcePickerRef}
                  aria-label="수집할 출처"
                  className={selectStyle}
                  value={sourceId}
                  disabled={sourceLoading || busy}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">{sourceLoading ? '불러오는 중…' : '출처 선택'}</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              {captureKind === 'wiki' &&
                !sourceLoading &&
                (sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    연결할 문서가 없습니다. 문서에서 내용을 작성하고 저장한 뒤 돌아오세요.
                  </p>
                ) : (
                  sourceId && (
                    <div className="space-y-2 rounded border p-2">
                      <details>
                        <summary className="cursor-pointer text-xs">선택 문서 미리보기</summary>
                        <div className="max-h-56 overflow-auto">
                          <MarkdownRenderer
                            content={sources.find((item) => item.id === sourceId)?.excerpt ?? ''}
                          />
                        </div>
                      </details>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || dirty}
                        onClick={() => openDocument(sourceId)}
                      >
                        선택 문서 편집
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        원문 전체를 연결하거나 LLM으로 핵심 지식을 추출하세요. 저장 시점의 원문과
                        문서 링크가 함께 보존됩니다.
                      </p>
                    </div>
                  )
                ))}
              <Button
                variant={captureKind === 'wiki' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
                disabled={
                  busy ||
                  dirty ||
                  sourceLoading ||
                  (captureKind === 'manual' ? !sourceTitle.trim() || !excerpt.trim() : !sourceId)
                }
                onClick={() => void run(() => capture(false))}
              >
                {captureKind === 'wiki' ? '이 문서를 지식으로 연결' : '원문을 후보로 보존'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={
                  busy ||
                  dirty ||
                  sourceLoading ||
                  (captureKind === 'manual' ? !sourceTitle.trim() || !excerpt.trim() : !sourceId)
                }
                onClick={() => void run(() => capture())}
              >
                LLM으로 지식 후보 추출
              </Button>
              <p className="text-[11px] text-muted-foreground">
                선택한 원문을 설정된 LLM으로 분석합니다. 대화는 최근 24,000자 안의 완전한 메시지를
                사용합니다. 메모리·발췌는 사용자가 제공한 사본으로 기록합니다.
              </p>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  aria-label="자동 분류 제안"
                  checked={review?.autoOrganize ?? false}
                  disabled={busy || !review}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    void run(async () =>
                      setReview(
                        await (await createKnowledgeApi(transport)).setAutoOrganize(enabled),
                      ),
                    )
                  }}
                />
                <span>지식이 바뀔 때 분류·관계 제안 자동 갱신 (LLM 사용)</span>
              </label>
              {review?.status === 'running' && (
                <p role="status" className="text-xs">
                  새 지식을 반영해 분류를 다듬는 중입니다.
                </p>
              )}
              {review?.status === 'failed' && (
                <p role="alert" className="text-xs text-destructive">
                  분류 제안 실패: {review.error}
                </p>
              )}
              <h3 className="text-sm font-semibold">분류 트리</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || dirty}
                onClick={() => {
                  setSelected(null)
                  setDraft({ ...emptyDraft(), kind: 'category', status: 'accepted' })
                  setEditing(true)
                  setHistory([])
                }}
              >
                분류 만들기
              </Button>
              <nav aria-label="지식 분류" className="space-y-1 text-xs">
                <button
                  className="block w-full rounded p-1 text-left hover:bg-accent"
                  onClick={() => setCategory('all')}
                  aria-pressed={category === 'all'}
                >
                  전체 지식
                </button>
                <button
                  className="block w-full rounded p-1 text-left hover:bg-accent"
                  onClick={() => setCategory('none')}
                  aria-pressed={category === 'none'}
                >
                  미분류
                </button>
                {[...categories]
                  .sort((a, b) => path(a.id).localeCompare(path(b.id)))
                  .map((c) => (
                    <button
                      key={c.id}
                      className="block w-full break-words rounded p-1 text-left hover:bg-accent"
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                    >
                      {path(c.id)}
                    </button>
                  ))}
              </nav>
            </aside>
          }
          right={
            <div className="space-y-3 p-3">
              <Input
                aria-label="지식 검색"
                placeholder="제목·내용·태그 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="지식 상태 필터"
                className={selectStyle}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">모든 상태</option>
                {Object.entries(STATUS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} ({records.filter((r) => r.status === key).length})
                  </option>
                ))}
              </select>
              {visible.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  표시할 지식이 없습니다. 대화에서 후보를 추출하거나 직접 작성하세요.
                </p>
              )}
              <ul aria-label="지식 목록" className="space-y-2">
                {visible.map((r) => (
                  <li key={r.id}>
                    <button
                      disabled={busy || dirty}
                      onClick={() => open(r)}
                      aria-pressed={selected === r.id}
                      className={`w-full rounded-lg border p-3 text-left disabled:opacity-60 ${selected === r.id ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}
                    >
                      <span className="text-[10px] text-muted-foreground">
                        {KINDS[r.kind]} · {STATUS[r.status]} · v{r.revision}
                      </span>
                      <strong className="block break-words text-sm">{r.title}</strong>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{r.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {suggestions.length > 0 && (
                <section aria-label="분류 제안" className="space-y-3">
                  <h3 className="text-sm font-semibold">분류·관계 제안</h3>
                  {suggestions.map((s, index) => (
                    <div key={`${s.id}-${index}`} className="space-y-2 rounded border p-2 text-xs">
                      <strong>{byId.get(s.id)?.title}</strong>
                      <p>{s.reason}</p>
                      <p>분류: {s.parentId ? path(s.parentId) : '미분류'}</p>
                      <p>태그: {s.tags.join(', ') || '없음'}</p>
                      {s.relations.map((r) => (
                        <p key={`${r.type}:${r.targetId}`}>
                          {RELATIONS[r.type]} → {byId.get(r.targetId)?.title}
                        </p>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || dirty}
                        onClick={() =>
                          void run(async () => {
                            const record = byId.get(s.id)
                            if (!record) return
                            const api = await createKnowledgeApi(transport)
                            const saved = await api.save({ ...toWrite(record), ...s })
                            setRecords(await api.list())
                            setSuggestions((items) => items.filter((i) => i !== s))
                            if (selected === saved.id) open(saved)
                            setNotice('검토한 분류·관계를 적용했습니다.')
                          })
                        }
                      >
                        이 변경 적용
                      </Button>{' '}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const next = await (
                              await createKnowledgeApi(transport)
                            ).dismissSuggestion(s.id, s.expectedRevision)
                            setReview(next)
                            setSuggestions(next.suggestions)
                          })
                        }
                      >
                        제안 무시
                      </Button>
                    </div>
                  ))}
                </section>
              )}
            </div>
          }
        >
          <article className="space-y-3 p-4">
            <KnowledgeLifecyclePanel
              records={records}
              selected={current ?? undefined}
              disabled={busy || dirty}
              onSelect={open}
              onChanged={async () => {
                const fresh = await (await createKnowledgeApi(transport)).list()
                setRecords(fresh)
                const updated = fresh.find((item) => item.id === selected)
                if (updated && !dirty) open(updated)
              }}
            />
            <KnowledgeMaintenancePanel
              disabled={busy || dirty}
              onChanged={async () => {
                const fresh = await (await createKnowledgeApi(transport)).list()
                setRecords(fresh)
                const updated = fresh.find((item) => item.id === selected)
                if (updated && !dirty) open(updated)
              }}
            />

            {!editing ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <h3 className="font-semibold text-foreground">
                  대화의 답변이 다음 경험의 근거가 됩니다
                </h3>
                <p>1. 대화·문서·메모리를 선택해 지식 후보를 추출합니다.</p>
                <p>2. 출처와 불확실성을 검토한 뒤 영구 지식으로 승격합니다.</p>
                <p>3. 분류와 관계를 다듬으면 관련 대화에서 자동으로 참조합니다.</p>
                <p>
                  틀리거나 오래된 사실은 수정하거나 보관하세요. 대체·충돌 관계와 이전 버전은
                  남습니다.
                </p>
              </div>
            ) : (
              <fieldset disabled={busy} className="space-y-3">
                <h3 className="text-sm font-semibold">
                  {current ? `지식 검토 · v${current.revision}` : '지식 검토'}
                </h3>
                {dirty && (
                  <p role="status" className="text-xs">
                    저장하지 않은 변경이 있습니다. 저장하거나 편집을 취소하세요.
                  </p>
                )}
                <label className="block text-xs">
                  제목
                  <Input
                    aria-label="지식 제목"
                    maxLength={300}
                    value={draft.title}
                    onChange={(e) => edit('title', e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    유형
                    <select
                      aria-label="지식 유형"
                      className={selectStyle}
                      value={draft.kind}
                      onChange={(e) => edit('kind', e.target.value as PersonalKnowledgeKind)}
                    >
                      {Object.entries(KINDS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    상위 분류
                    <select
                      aria-label="상위 분류"
                      className={selectStyle}
                      value={draft.parentId ?? ''}
                      onChange={(e) => edit('parentId', e.target.value || null)}
                    >
                      <option value="">미분류</option>
                      {categories
                        .filter((c) => c.id !== selected)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {path(c.id)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <section aria-label="지식 내용 검토" className="space-y-2 rounded border p-3">
                  <h4 className="text-xs font-medium">지식 내용 검토</h4>
                  <div className="max-h-96 overflow-auto">
                    <MarkdownRenderer content={draft.body} />
                  </div>
                  {current?.sources.some((source) => source.kind === 'wiki') && (
                    <p className="text-xs text-muted-foreground">
                      연결한 문서의 저장 시점 사본입니다. 원본 편집은 아래 출처의 ‘원본 문서
                      편집’에서 진행하세요. 원본 변경이 지식을 자동으로 덮어쓰지는 않습니다.
                    </p>
                  )}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      지식 사본 내용 보정
                    </summary>
                    <textarea
                      aria-label="지식 내용"
                      className={`${selectStyle} mt-2 min-h-48`}
                      maxLength={24000}
                      value={draft.body}
                      onChange={(e) => edit('body', e.target.value)}
                    />
                  </details>
                </section>
                <label className="block text-xs">
                  태그 (쉼표 구분)
                  <Input
                    aria-label="지식 태그"
                    value={draft.tags.join(',')}
                    onChange={(e) => edit('tags', e.target.value.split(','))}
                  />
                </label>
                <label className="block text-xs">
                  검토·변경 이유
                  <textarea
                    aria-label="변경 이유"
                    className={selectStyle}
                    maxLength={1000}
                    value={draft.reason}
                    onChange={(e) => edit('reason', e.target.value)}
                  />
                </label>
                <section aria-label="지식 관계" className="space-y-2">
                  <h4 className="text-xs font-semibold">관계</h4>
                  {draft.relations.map((r, index) => (
                    <div
                      className="flex items-center gap-2 text-xs"
                      key={`${r.type}:${r.targetId}`}
                    >
                      <span>
                        {RELATIONS[r.type]} → {byId.get(r.targetId)?.title ?? r.targetId}
                      </span>
                      <button
                        onClick={() =>
                          edit(
                            'relations',
                            draft.relations.filter((_, i) => i !== index),
                          )
                        }
                        aria-label={`${byId.get(r.targetId)?.title ?? r.targetId} 관계 제거`}
                      >
                        제거
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <select
                      aria-label="관계 유형"
                      className={selectStyle}
                      value={relationType}
                      onChange={(e) => setRelationType(e.target.value as typeof relationType)}
                    >
                      {Object.entries(RELATIONS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="관계 대상"
                      className={selectStyle}
                      value={relationTarget}
                      onChange={(e) => setRelationTarget(e.target.value)}
                    >
                      <option value="">대상 선택</option>
                      {records
                        .filter((r) => r.id !== selected)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!relationTarget}
                      onClick={() => {
                        edit('relations', [
                          ...draft.relations,
                          { targetId: relationTarget, type: relationType },
                        ])
                        setRelationTarget('')
                      }}
                    >
                      연결
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    ‘대체’는 현재 지식이 이전 사실을 대신함을 뜻합니다. ‘충돌’은 양쪽을 함께
                    검토해야 함을 표시합니다.
                  </p>
                </section>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      busy || !draft.title.trim() || !draft.body.trim() || !draft.reason.trim()
                    }
                    onClick={() => void run(() => save())}
                  >
                    저장
                  </Button>
                  {draft.status !== 'accepted' && (
                    <Button
                      disabled={
                        busy || !draft.title.trim() || !draft.body.trim() || !draft.reason.trim()
                      }
                      onClick={() => void run(() => save('accepted'))}
                    >
                      검토 완료 · 지식으로 승격
                    </Button>
                  )}
                  {current && draft.status !== 'archived' && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(() => save('archived'))}
                    >
                      보관
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (current) open(current)
                      else {
                        setEditing(false)
                        setDirty(false)
                      }
                    }}
                  >
                    편집 취소
                  </Button>
                </div>
                {current && (
                  <>
                    <section aria-label="지식 출처" className="space-y-2 border-t pt-3">
                      <h4 className="text-xs font-semibold">보존된 출처</h4>
                      {!current.sources.length && (
                        <p className="text-xs text-muted-foreground">직접 작성한 지식입니다.</p>
                      )}
                      {current.sources.map((s, index) => (
                        <details key={index} className="rounded border p-2 text-xs">
                          <summary>
                            {s.title} · {s.kind} · {new Date(s.capturedAt).toLocaleDateString()}
                          </summary>
                          <p className="break-all py-1 text-muted-foreground">출처 ID: {s.id}</p>
                          {s.kind === 'wiki' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || dirty}
                              onClick={() => openDocument(s.id)}
                            >
                              원본 문서 편집
                            </Button>
                          )}
                          {s.kind === 'conversation' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                useSessionStore.getState().setActive(s.id)
                                window.dispatchEvent(
                                  new CustomEvent('sepilot:open-view', { detail: 'chat' }),
                                )
                              }}
                            >
                              원본 대화 열기
                            </Button>
                          )}
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap pt-2">
                            {s.excerpt}
                          </pre>
                        </details>
                      ))}
                    </section>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setHistory(
                            await (await createKnowledgeApi(transport)).history(current.id),
                          ),
                        )
                      }
                    >
                      변경 이력 보기
                    </Button>
                    {history.map((r) => (
                      <details key={r.revision} className="rounded border p-2 text-xs">
                        <summary>
                          v{r.revision} · {STATUS[r.status]} ·{' '}
                          {new Date(r.updatedAt).toLocaleString()}
                        </summary>
                        <p>{r.reason}</p>
                        <p>
                          분류: {r.parentId ? path(r.parentId) : '미분류'} · 태그:{' '}
                          {r.tags.join(', ')}
                        </p>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{r.body}</pre>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || dirty}
                          onClick={() => {
                            setDraft({
                              ...toWrite(r),
                              expectedRevision: current.revision,
                              status: 'candidate',
                              reason: `v${r.revision}에서 복원하여 재검토`,
                            })
                            setDirty(true)
                          }}
                        >
                          이 버전으로 복원 초안
                        </Button>
                      </details>
                    ))}
                  </>
                )}
              </fieldset>
            )}
          </article>
        </KnowledgePaneLayout>
      </div>
    </section>
  )
}
