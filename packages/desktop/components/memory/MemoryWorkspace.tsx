'use client'
import { useEffect, useState } from 'react'
import { Plus, RefreshCcw, Search, Trash2, X } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  createMemoryApi,
  type FileMemorySnapshot,
  type MemoryEntry,
  type MemorySearchType,
  type MemorySemanticStatus,
  type MemorySource,
} from '@/lib/api/memory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { CapabilityUnavailableError } from '@/lib/api/_http'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

const SOURCE_OPTIONS: MemorySource[] = ['user', 'conversation', 'document', 'skill']

const SEARCH_DEBOUNCE_MS = 300

const STATUS_CLASS: Record<MemorySemanticStatus['status'], string> = {
  ready: 'text-emerald-600 dark:text-emerald-400',
  disabled: 'text-muted-foreground',
  backfilling: 'text-sky-600 dark:text-sky-400',
  degraded: 'text-amber-600 dark:text-amber-400',
  reindex_required: 'text-amber-600 dark:text-amber-400',
}

function isCapabilityUnavailable(error: unknown): boolean {
  return error instanceof CapabilityUnavailableError
    || (error instanceof Error && error.name === 'CapabilityUnavailableError')
}

function publishMemoryStatus(status: MemorySemanticStatus): void {
  window.dispatchEvent(new CustomEvent('sepilot:memory-status', { detail: status }))
}

function notifyMemoryCreated(status: MemorySemanticStatus | null): void {
  if (status?.status === 'degraded' || status?.status === 'reindex_required') {
    toast.warning('메모리는 저장했지만 의미 검색이 정상 상태가 아닙니다.', {
      description:
        '키워드 검색은 계속 사용할 수 있습니다. Settings → VectorDB에서 embedding provider/model을 확인하세요.',
    })
    return
  }

  if (status?.status === 'disabled') {
    toast.success('메모리 항목을 저장했습니다.', {
      description: '의미 검색은 꺼져 있으며 키워드 검색으로 찾을 수 있습니다.',
    })
    return
  }

  if (status?.status === 'backfilling') {
    toast.success('메모리 항목을 저장했습니다.', {
      description: '의미 검색 인덱싱이 진행 중입니다.',
    })
    return
  }

  toast.success('메모리 항목을 저장했습니다.')
}

export type MemoryWorkspaceSectionId = 'memory-search' | 'memory-index'

export function MemoryWorkspace({
  focusSection,
  focusVersion = 0,
}: {
  focusSection?: MemoryWorkspaceSectionId | null
  focusVersion?: number
}) {
  const transport = useTransport()
  const [status, setStatus] = useState<MemorySemanticStatus | null>(null)
  const [statusError, setStatusError] = useState<'unavailable' | 'error' | null>(
    null,
  )
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchType, setSearchType] = useState<MemorySearchType>('hybrid')
  const [hits, setHits] = useState<MemoryEntry[]>([])
  const [recentEntries, setRecentEntries] = useState<MemoryEntry[]>([])
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [fileMemory, setFileMemory] = useState<FileMemorySnapshot | null>(null)
  const [loadingFileMemory, setLoadingFileMemory] = useState(false)
  const [fileMemoryError, setFileMemoryError] = useState<string | null>(null)
  const [selectedFileSection, setSelectedFileSection] = useState('User Memory')
  const [selectedDailyNote, setSelectedDailyNote] = useState<'today' | 'yesterday'>('today')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createContent, setCreateContent] = useState('')
  const [createSource, setCreateSource] = useState<MemorySource>('user')
  const [createTags, setCreateTags] = useState('')
  const [creating, setCreating] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchBumper, setSearchBumper] = useState(0)
  const semanticDisabled = status?.status === 'disabled' || !status
  const effectiveSearchType: MemorySearchType = semanticDisabled ? 'keyword' : searchType
  useModalViewportLock(createOpen)

  async function refreshRecent(): Promise<void> {
    setLoadingRecent(true)
    setRecentError(null)
    try {
      const api = await createMemoryApi(transport)
      setRecentEntries(await api.recent(20))
    } catch (err) {
      setRecentEntries([])
      setRecentError(err instanceof Error ? err.message : 'recent memory failed')
    } finally {
      setLoadingRecent(false)
    }
  }

  async function refreshFileMemory(): Promise<void> {
    setLoadingFileMemory(true)
    setFileMemoryError(null)
    try {
      const api = await createMemoryApi(transport)
      const snapshot = await api.file()
      setFileMemory(snapshot)
      setSelectedFileSection((current) => {
        if (snapshot.sections.some((section) => section.title === current)) return current
        return snapshot.sections.find((section) => section.title === 'User Memory')?.title
          ?? snapshot.sections[0]?.title
          ?? 'User Memory'
      })
    } catch (err) {
      setFileMemory(null)
      setFileMemoryError(err instanceof Error ? err.message : 'file memory failed')
    } finally {
      setLoadingFileMemory(false)
    }
  }

  async function refreshStatus(): Promise<void> {
    try {
      const api = await createMemoryApi(transport)
      const next = await api.status()
      setStatus(next)
      publishMemoryStatus(next)
    } catch {
    }
  }

  async function handleCreate(): Promise<void> {
    const content = createContent.trim()
    if (!content) return
    setCreating(true)
    try {
      const api = await createMemoryApi(transport)
      const tags = createTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await api.create({
        content,
        source: createSource,
        tags: tags.length > 0 ? tags : undefined,
      })
      let nextStatus = status
      try {
        nextStatus = await api.status()
        setStatus(nextStatus)
        publishMemoryStatus(nextStatus)
      } catch {
      }
      notifyMemoryCreated(nextStatus)
      setCreateContent('')
      setCreateTags('')
      setCreateOpen(false)
      void refreshRecent()
      setSearchBumper((n) => n + 1)
    } catch (err) {
      const friendly = explainChatStreamError(err)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setCreating(false)
    }
  }

  async function handleReindex(): Promise<void> {
    setReindexing(true)
    try {
      const api = await createMemoryApi(transport)
      const result = await api.reindex()
      setStatus(result.status)
      publishMemoryStatus(result.status)
      toast.success(
        result.started
          ? '재인덱스를 시작했습니다.'
          : '재인덱스가 이미 진행 중입니다.',
      )
    } catch (err) {
      const friendly = explainChatStreamError(err)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setReindexing(false)
    }
  }

  async function handleDelete(entry: MemoryEntry): Promise<void> {
    const confirmed = await confirm('이 메모리를 삭제할까요? 이 작업은 되돌릴 수 없습니다.', {
      destructive: true,
    })
    if (!confirmed) return
    setDeletingId(entry.id)
    try {
      const api = await createMemoryApi(transport)
      await api.deleteEntry(entry.id, { reason: 'Deleted from desktop memory workspace' })
      setHits((current) => current.filter((item) => item.id !== entry.id))
      setRecentEntries((current) => current.filter((item) => item.id !== entry.id))
      toast.success('메모리를 삭제했습니다.')
      void refreshStatus()
      void refreshRecent()
      if (debouncedQuery) setSearchBumper((n) => n + 1)
    } catch (err) {
      const friendly = explainChatStreamError(err)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await createMemoryApi(transport)
        const next = await api.status()
        if (!cancelled) {
          setStatus(next)
          setStatusError(null)
          publishMemoryStatus(next)
        }
      } catch (err) {
        if (cancelled) return
        if (isCapabilityUnavailable(err)) {
          setStatusError('unavailable')
        } else {
          setStatusError('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    void refreshRecent()
    void refreshFileMemory()
  }, [transport])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) {
      setHits([])
      setSearchError(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    void (async () => {
      try {
        const api = await createMemoryApi(transport)
        const results = await api.search(debouncedQuery, {
          type: effectiveSearchType,
          limit: 20,
        })
        if (cancelled) return
        setHits(results)
        setSearchError(null)
      } catch (err) {
        if (cancelled) return
        setHits([])
        setSearchError(err instanceof Error ? err.message : 'search failed')
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, effectiveSearchType, transport, searchBumper])

  useEffect(() => {
    if (!focusSection) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(focusSection)?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusSection, focusVersion, status, statusError])

  const canReindex = status !== null
    && !semanticDisabled
    && status.status !== 'backfilling'
  const visibleEntries = debouncedQuery ? hits : recentEntries
  const selectedSection =
    fileMemory?.sections.find((section) => section.title === selectedFileSection)
    ?? fileMemory?.sections[0]
  const dailyNote = selectedDailyNote === 'today'
    ? {
        label: '오늘',
        path: fileMemory?.todayNotePath ?? '',
        content: fileMemory?.todayNote ?? '',
      }
    : {
        label: '어제',
        path: fileMemory?.yesterdayNotePath ?? '',
        content: fileMemory?.yesterdayNote ?? '',
      }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <section id="memory-index" className="scroll-mt-3 rounded-md border border-border p-3">
        {!status ? (
          <div>
            <h3 className="text-sm font-semibold">Semantic Memory</h3>
            <p className={cn(
              'mt-2 text-[11px]',
              statusError ? 'text-red-500' : 'text-muted-foreground',
            )}>
              {statusError === 'unavailable'
                ? '시맨틱 메모리 상태 API를 사용할 수 없습니다. 장기 기억과 활동 저널은 계속 표시됩니다.'
                : statusError === 'error'
                  ? '시맨틱 메모리 상태를 불러오지 못했습니다. 장기 기억과 활동 저널은 계속 표시됩니다.'
                  : '시맨틱 메모리 상태를 불러오는 중…'}
            </p>
          </div>
        ) : (
          <>
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">Semantic Memory</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                STATUS_CLASS[status.status],
              )}
            >
              {status.status}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleReindex()}
            disabled={!canReindex || reindexing}
            className="h-7 text-[11px]"
            aria-label="시맨틱 메모리 재인덱스"
          >
            <RefreshCcw
              className={cn(
                'mr-1 h-3 w-3',
                (reindexing || status.status === 'backfilling')
                  && 'animate-spin',
              )}
            />
            {reindexing
              ? '시작 중…'
              : status.status === 'backfilling'
                ? '진행 중…'
                : '재인덱스'}
          </Button>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Backend</dt>
            <dd className="font-mono">{status.vectorBackend}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="truncate font-mono">
              {status.indexedProviderId ?? status.configuredProviderId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="truncate font-mono">
              {status.indexedModel ?? status.configuredModel ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pending / Failed</dt>
            <dd
              className={cn(
                'font-mono',
                status.failedCount > 0 && 'text-red-600 dark:text-red-400',
              )}
            >
              {status.pendingCount} / {status.failedCount}
            </dd>
          </div>
        </dl>
        {status.lastError ? (
          <p className="mt-2 truncate text-[11px] text-red-500" title={status.lastError}>
            ⚠ {status.lastError}
          </p>
        ) : null}
          </>
        )}
      </section>

      <section className="rounded-md border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Long-term Memory</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              MEMORY.md에 저장된 장기 기억입니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshFileMemory()}
            disabled={loadingFileMemory}
            className="h-7 text-[11px]"
          >
            <RefreshCcw
              className={cn('mr-1 h-3 w-3', loadingFileMemory && 'animate-spin')}
            />
            새로고침
          </Button>
        </div>
        {loadingFileMemory && !fileMemory ? (
          <p className="mt-3 text-[11px] text-muted-foreground">장기 메모리를 불러오는 중…</p>
        ) : fileMemoryError ? (
          <p className="mt-3 text-[11px] text-red-500">{fileMemoryError}</p>
        ) : fileMemory && fileMemory.sections.length > 0 ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <p className="truncate font-mono text-[10px] text-muted-foreground" title={fileMemory.memoryPath}>
                {fileMemory.memoryPath}
              </p>
              <select
                value={selectedSection?.title ?? selectedFileSection}
                onChange={(event) => setSelectedFileSection(event.target.value)}
                className="h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs"
                aria-label="장기 메모리 섹션"
              >
                {fileMemory.sections.map((section) => (
                  <option key={section.title} value={section.title}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 text-[12px] leading-relaxed">
              {selectedSection?.content.trim() || '선택한 섹션에 내용이 없습니다.'}
            </pre>
          </div>
        ) : fileMemory ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            저장된 장기 메모리 항목이 없습니다.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">장기 메모리 파일이 없습니다.</p>
        )}
      </section>

      <section className="rounded-md border border-border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Activity Journal</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              날짜별 활동·질문·미완료 작업을 보존하는 기록입니다. 여기에는 오늘·어제만 표시하며, 오래된 기록도 날짜로 조회할 수 있습니다. 요약·장기 기억 추출이 끝나고 미완료 항목이 없는 기록은 30일 후 압축 보관되며 자동 삭제되지 않습니다.
            </p>
          </div>
          <div className="flex gap-1" role="group" aria-label="활동 저널 날짜">
            {(['today', 'yesterday'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={selectedDailyNote === value ? 'secondary' : 'outline'}
                onClick={() => setSelectedDailyNote(value)}
                className="h-7 text-[11px]"
                aria-pressed={selectedDailyNote === value}
              >
                {value === 'today' ? '오늘' : '어제'}
              </Button>
            ))}
          </div>
        </div>
        {loadingFileMemory && !fileMemory ? (
          <p className="mt-3 text-[11px] text-muted-foreground">활동 저널을 불러오는 중…</p>
        ) : fileMemoryError ? (
          <p className="mt-3 text-[11px] text-red-500">{fileMemoryError}</p>
        ) : fileMemory ? (
          <div className="mt-3 space-y-2">
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={dailyNote.path}>
              {dailyNote.path}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 text-[12px] leading-relaxed">
              {dailyNote.content.trim() || `${dailyNote.label} 활동 기록이 없습니다.`}
            </pre>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">활동 저널이 없습니다.</p>
        )}
      </section>

      <section id="memory-search" className="scroll-mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                semanticDisabled
                  ? 'memory 검색 (keyword; vector index 비활성)'
                  : 'memory 검색 (semantic / keyword / hybrid)'
              }
              className="h-8 pl-7 pr-7 text-xs"
              aria-label="memory 검색"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="검색어 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <select
            value={effectiveSearchType}
            onChange={(e) =>
              setSearchType(e.target.value as MemorySearchType)
            }
            className="h-8 rounded-md border border-border bg-transparent px-2 text-xs"
            aria-label="검색 방식"
          >
            <option value="hybrid" disabled={semanticDisabled}>hybrid</option>
            <option value="semantic" disabled={semanticDisabled}>semantic</option>
            <option value="keyword">keyword</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="h-8 shrink-0 text-[11px]"
            aria-label="메모리 항목 추가"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            추가
          </Button>
        </div>

        {semanticDisabled ? (
          <p className="text-[11px] text-muted-foreground">
            벡터 검색만 비활성 상태입니다. 저장된 메모리 목록과 keyword 검색은 계속 사용할 수 있습니다.
            Semantic 검색을 사용하려면 Settings → VectorDB에서 embedding provider/model을 설정하세요.
          </p>
        ) : null}

        {!debouncedQuery && loadingRecent ? (
          <p className="text-[11px] text-muted-foreground">
            최근 메모리를 불러오는 중…
          </p>
        ) : !debouncedQuery && recentError ? (
          <p className="text-[11px] text-red-500">{recentError}</p>
        ) : searching && hits.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">검색 중…</p>
        ) : searchError ? (
          <p className="text-[11px] text-red-500">{searchError}</p>
        ) : visibleEntries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {debouncedQuery
              ? `'${debouncedQuery}'와 일치하는 메모리가 없습니다.`
              : '저장된 시맨틱 메모리가 없습니다.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleEntries.map((hit) => (
              <li
                key={hit.id}
                className="rounded-md border border-border bg-background/40 p-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {hit.source}
                  </span>
                  <div className="flex items-center gap-2">
                    {typeof hit.score === 'number' ? (
                      <span
                        className="font-mono text-[10px] text-muted-foreground"
                        title={`score: ${hit.score}`}
                      >
                        {hit.score.toFixed(3)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDelete(hit)}
                      disabled={deletingId === hit.id}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="메모리 삭제"
                      title="메모리 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed">
                  {hit.content}
                </p>
                {hit.tags.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hit.tags.map((tag) => (
                      <span
                        key={`${hit.id}:${tag}`}
                        className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="메모리 추가"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (creating ? null : setCreateOpen(false))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">메모리 항목 추가</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                짧은 메모/노트를 daemon의 시맨틱 인덱스에 직접 넣습니다.
                긴 문서 ingest는 별도 흐름이 필요합니다.
              </p>
            </div>
            <div
              role="region"
              aria-label="메모리 항목 입력"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]"
            >
              <label className="flex flex-col gap-1 text-xs">
                내용
                <textarea
                  rows={6}
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder="기억해 둘 내용"
                  disabled={creating}
                  className="rounded border border-border bg-transparent p-2 text-[12px] leading-relaxed"
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  Source
                  <select
                    value={createSource}
                    onChange={(e) =>
                      setCreateSource(e.target.value as MemorySource)
                    }
                    disabled={creating}
                    className="h-8 rounded border border-border bg-transparent px-2 text-xs"
                  >
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Tags (콤마 구분)
                  <Input
                    type="text"
                    value={createTags}
                    onChange={(e) => setCreateTags(e.target.value)}
                    placeholder="ops, runbook"
                    disabled={creating}
                    className="h-8 text-xs"
                  />
                </label>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={creating || !createContent.trim()}
              >
                {creating ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
