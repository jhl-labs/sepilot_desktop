'use client'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Database,
  FileText,
  FolderPlus,
  FilePenLine,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import {
  createRagApi,
  type RagDocumentContent,
  type RagSyncResult,
  type RagSearchMode,
  type RagVectorDbInfo,
  type SearchHit,
} from '@/lib/api/rag'
import { useRagStore } from '@/lib/store/rag-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const SEARCH_DEBOUNCE_MS = 300

function isSemanticSearchLimited(info: RagVectorDbInfo | null): boolean {
  if (!info) return true
  if (info.backendAvailable === false) return true
  return (
    info.status === 'disabled' || info.status === 'degraded' || info.status === 'reindex_required'
  )
}

function semanticStatusCopy(info: RagVectorDbInfo | null): string {
  if (!info) return '벡터 인덱스 상태를 확인하지 못했습니다.'
  if (info.status === 'disabled') {
    return '임베딩 제공자와 모델을 설정하지 않아 의미 검색을 사용할 수 없습니다.'
  }
  if (info.status === 'reindex_required') {
    return '임베딩 설정이 바뀌었습니다. 다시 색인하면 의미 검색을 사용할 수 있습니다.'
  }
  if (info.status === 'degraded') {
    return info.lastError
      ? `의미 검색이 불안정합니다: ${info.lastError}`
      : '의미 검색이 불안정해 일부 결과가 누락될 수 있습니다.'
  }
  if (info.backendAvailable === false) {
    return `${info.engine} 검색 엔진을 사용할 수 없어 의미 검색을 사용할 수 없습니다.`
  }
  return ''
}

function semanticModeLabel(loaded: boolean, info: RagVectorDbInfo | null): string {
  if (!loaded) return '상태 확인 중'
  if (!info) return '상태 미확인'
  if (info.status === 'ready') return '의미 + 키워드'
  if (info.status === 'backfilling') return '의미 + 키워드 · 색인 중'
  if (info.status === 'disabled') return '키워드 검색'
  if (info.status === 'reindex_required') return '재색인 필요'
  if (info.status === 'degraded') return '검색 제한'
  return '상태 미확인'
}

function searchModeLabel(mode: RagSearchMode | undefined): string {
  switch (mode) {
    case 'hybrid':
      return '의미 + 키워드'
    case 'hybrid-backfilling':
      return '의미 + 키워드 · 색인 중'
    case 'keyword-fallback':
      return '키워드'
    case 'degraded':
      return '제한 검색'
    case 'memory-vector':
      return '로컬 의미 검색'
    default:
      return '검색'
  }
}

export function DocumentsPage() {
  const transport = useTransport()
  const [sourceType, setSourceType] = useState<'git' | 'web'>('git')
  const [tlsVerify, setTlsVerify] = useState(true)
  const [caCert, setCaCert] = useState('')
  const folders = useRagStore((s) => s.folders)
  const documents = useRagStore((s) => s.documents)
  const setFolders = useRagStore((s) => s.setFolders)
  const setDocuments = useRagStore((s) => s.setDocuments)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null)
  const [sourcePath, setSourcePath] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [syncSummary, setSyncSummary] = useState<RagSyncResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [vectorInfo, setVectorInfo] = useState<RagVectorDbInfo | null>(null)
  const [vectorInfoLoaded, setVectorInfoLoaded] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<RagDocumentContent | null>(null)
  const [selectedDocumentLoading, setSelectedDocumentLoading] = useState(false)
  const [selectedDocumentError, setSelectedDocumentError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const docListRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await (await createRagApi(transport)).listFolders()
        if (!cancelled) {
          setFolders(list)
          setErr(null)
        }
      } catch (e) {
        if (!cancelled) {
          setFolders([])
          setErr((e as Error).message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, setFolders, reloadKey])

  useEffect(() => {
    let cancelled = false
    setVectorInfoLoaded(false)
    void (async () => {
      try {
        const info = await (await createRagApi(transport)).vectorDbInfo()
        if (!cancelled) setVectorInfo(info)
      } catch {
        if (!cancelled) setVectorInfo(null)
      } finally {
        if (!cancelled) setVectorInfoLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, reloadKey])

  useEffect(() => {
    if (!folderId) {
      setDocuments([])
      setSelectedDocumentId(null)
      setSelectedDocument(null)
      setSelectedDocumentError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await (await createRagApi(transport)).listDocuments(folderId)
        if (!cancelled) setDocuments(list)
      } catch {
        if (!cancelled) setDocuments([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderId, transport, setDocuments])

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
        const api = await createRagApi(transport)
        const results = await api.search(debouncedQuery)
        if (cancelled) return
        setHits(results)
        setSearchError(null)
      } catch (e) {
        if (cancelled) return
        setHits([])
        setSearchError((e as Error).message)
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, transport])

  useEffect(() => {
    if (!highlightedDocId) return
    const t = window.setTimeout(() => setHighlightedDocId(null), 2000)
    return () => window.clearTimeout(t)
  }, [highlightedDocId])

  const folderNameById = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name] as const)),
    [folders],
  )
  const semanticSearchLimited = vectorInfoLoaded && isSemanticSearchLimited(vectorInfo)
  const semanticWarning = semanticStatusCopy(vectorInfo)
  const currentSearchMode = semanticModeLabel(vectorInfoLoaded, vectorInfo)

  async function sync(): Promise<void> {
    setSyncing(true)
    try {
      const api = await createRagApi(transport)
      const result = await api.sync()
      setSyncSummary(result)
      setErr(null)
      setReloadKey((v) => v + 1)
    } catch (e) {
      setSyncSummary(null)
      setErr((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  function selectFolder(id: string): void {
    setFolderId(id)
    setSelectedDocumentId(null)
    setSelectedDocument(null)
    setSelectedDocumentError(null)
  }

  async function openDocument(id: string): Promise<void> {
    setSelectedDocumentId(id)
    setSelectedDocumentLoading(true)
    setSelectedDocumentError(null)
    try {
      const api = await createRagApi(transport)
      const document = await api.getDocument(id)
      setSelectedDocument(document)
    } catch (e) {
      setSelectedDocument(null)
      setSelectedDocumentError((e as Error).message)
    } finally {
      setSelectedDocumentLoading(false)
    }
  }

  async function addSource(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const path = sourcePath.trim()
    if (!path) return
    const name = sourceName.trim() || path.split(/[\\/]/).filter(Boolean).pop() || path
    setSyncing(true)
    try {
      const api = await createRagApi(transport)
      const folder = await api.upsertFolder({
        name,
        path,
        sourceType,
        ...(sourceType === 'web' ? { tlsVerify, caCert: caCert.trim() || undefined } : {}),
      })
      setFolderId(folder.id)
      setSelectedDocumentId(null)
      setSelectedDocument(null)
      setSelectedDocumentError(null)
      setSourcePath('')
      setSourceName('')
      setTlsVerify(true)
      setCaCert('')
      setErr(null)
      setReloadKey((v) => v + 1)
      const result = await api.sync()
      setSyncSummary(result)
      setReloadKey((v) => v + 1)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  function jumpToHit(hit: SearchHit): void {
    setFolderId(hit.folderId)
    setHighlightedDocId(hit.documentId)
    setQuery('')
    void openDocument(hit.documentId)
    requestAnimationFrame(() => {
      const node = docListRef.current?.querySelector(`[data-doc-id="${hit.documentId}"]`)
      if (node && 'scrollIntoView' in node) {
        ;(node as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    })
  }

  const isSearchActive = debouncedQuery.length > 0

  return (
    <div
      role="region"
      aria-labelledby="local-reference-title"
      className="flex h-full min-h-0 flex-col"
    >
      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="local-reference-title" className="text-sm font-semibold">
                참조 자료
              </h2>
              <span className="rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                읽기 전용
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              폴더와 웹 자료를 동기화해 검색하고 Chat 답변의 근거로 사용합니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('sepilot:open-view', { detail: 'wiki' }))
            }
            aria-label="문서 편집기로 이동"
          >
            <FilePenLine className="mr-1 h-3.5 w-3.5" />
            문서 편집기로 이동
          </Button>
        </div>
        {semanticSearchLimited ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              {semanticWarning} 지금은 키워드로 검색합니다. 설정의 임베딩·벡터 DB에서 모델을 선택한
              뒤 다시 동기화하세요.
            </p>
            <button
              type="button"
              onClick={() => void sync()}
              disabled={syncing}
              className="ml-auto shrink-0 rounded border border-amber-500/40 px-2 py-0.5 font-medium hover:bg-amber-500/10 disabled:opacity-60"
            >
              {syncing ? '동기화 중' : '동기화'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1">
        <aside
          aria-labelledby="local-sources-title"
          className="min-h-0 overflow-auto border-b border-border p-2 md:border-b-0 md:border-r"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 id="local-sources-title" className="text-xs font-semibold">
              연결된 원본
            </h3>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => void sync()}
              disabled={syncing}
              aria-label="모든 자료 동기화"
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {syncing ? '동기화 중' : '모두 동기화'}
            </Button>
          </div>
          <form
            className="mb-3 flex flex-col gap-1.5"
            aria-label={sourceType === 'web' ? '웹 자료 추가' : '로컬 원본 추가'}
            onSubmit={(e) => void addSource(e)}
          >
            <label className="text-xs">
              연결 유형
              <select
                aria-label="자료 연결 유형"
                value={sourceType}
                disabled={syncing}
                onChange={(event) => {
                  setSourceType(event.target.value as 'git' | 'web')
                  setSourcePath('')
                  setTlsVerify(true)
                  setCaCert('')
                }}
                className="mt-1 w-full rounded border bg-background p-1.5"
              >
                <option value="git">로컬 폴더</option>
                <option value="web">웹 URL (HTTPS)</option>
              </select>
            </label>
            <Input
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder={
                sourceType === 'web'
                  ? 'https://docs.example.internal/page'
                  : '로컬 Git / 작업 폴더 경로'
              }
              className="h-8 text-xs"
              aria-label={sourceType === 'web' ? '웹 자료 URL' : '로컬 원본 경로'}
            />
            {sourceType === 'web' && (
              <div className="space-y-2 rounded border p-2 text-xs">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    aria-label="웹 자료 TLS 인증서 검증"
                    checked={tlsVerify}
                    disabled={syncing}
                    onChange={(event) => setTlsVerify(event.target.checked)}
                  />
                  TLS 인증서 검증
                </label>
                {!tlsVerify && (
                  <p>이 연결만 verify=false로 요청합니다. 서버 인증서를 확인하지 않습니다.</p>
                )}
                <label>
                  사설 CA 인증서 (PEM, 선택)
                  <textarea
                    aria-label="웹 자료 CA 인증서"
                    value={caCert}
                    disabled={syncing}
                    maxLength={100000}
                    onChange={(event) => setCaCert(event.target.value)}
                    className="mt-1 min-h-20 w-full rounded border bg-background p-1"
                    placeholder="-----BEGIN CERTIFICATE-----"
                  />
                </label>
                <p>
                  지정한 URL 한 개를 수집합니다. HTML·텍스트·Markdown·JSON 지원, 최대 1MB.
                  로그인이나 JavaScript 실행이 필요한 페이지는 지원하지 않습니다.
                </p>
              </div>
            )}
            <div className="flex gap-1.5">
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="표시 이름 (선택)"
                className="h-8 min-w-0 text-xs"
                aria-label="참조 자료 표시 이름"
              />
              <Button
                size="sm"
                type="submit"
                className="h-8 px-2 text-xs"
                disabled={!sourcePath.trim() || syncing}
                aria-label={sourceType === 'web' ? '웹 자료 추가' : '로컬 원본 추가'}
              >
                <FolderPlus className="mr-1 h-3.5 w-3.5" />
                추가
              </Button>
            </div>
          </form>
          <ul className="text-sm" aria-label="동기화할 자료">
            {folders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => selectFolder(f.id)}
                  aria-pressed={folderId === f.id}
                  className={`block w-full rounded px-2 py-1 text-left hover:bg-muted ${
                    folderId === f.id ? 'bg-muted' : ''
                  }`}
                >
                  <span className="block truncate">{f.name}</span>
                  {f.sourceType === 'web' && (
                    <span className="block text-[10px] text-muted-foreground">
                      웹 URL ·{' '}
                      {f.tlsVerify === false
                        ? 'TLS 검증 해제'
                        : f.caCert
                          ? '사설 CA 검증'
                          : 'TLS 검증'}
                    </span>
                  )}
                  {f.path ? (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {f.path}
                    </span>
                  ) : null}
                  {f.lastSyncStatus ? (
                    <span className="block text-[10px] text-muted-foreground">
                      {f.lastSyncStatus === 'success' ? '동기화됨' : '동기화 실패'}
                      {' · '}
                      문서 {f.documents}개
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {folders.length === 0 && (
              <li
                role={err ? 'alert' : undefined}
                className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground"
              >
                <p>{err ? '자료 원본을 불러오지 못했습니다.' : '등록한 자료가 없습니다.'}</p>
                {err ? <p className="mt-1 break-words text-[10px]">{err}</p> : null}
              </li>
            )}
          </ul>
        </aside>
        <section
          className="flex min-h-0 min-w-0 flex-col"
          aria-labelledby="reference-content-title"
        >
          <header className="flex flex-col gap-2 border-b border-border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="reference-content-title" className="truncate text-sm font-semibold">
                {isSearchActive ? '검색 결과' : folderId ? '참조 자료' : '자료 원본을 선택하세요'}
              </h3>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-[10px] text-muted-foreground">
                {vectorInfo ? (
                  <span className="inline-flex items-center gap-1 truncate" title="검색 엔진">
                    <Database className="h-3 w-3" />
                    {vectorInfo.engine}
                  </span>
                ) : null}
                <span className="rounded bg-muted px-1.5 py-0.5">{currentSearchMode}</span>
                {vectorInfo?.configuredModel ? (
                  <span className="truncate">
                    {vectorInfo.configuredProviderId ?? 'provider'} / {vectorInfo.configuredModel}
                  </span>
                ) : null}
                {typeof vectorInfo?.pendingCount === 'number' && vectorInfo.pendingCount > 0 ? (
                  <span>대기 {vectorInfo.pendingCount}</span>
                ) : null}
                {typeof vectorInfo?.failedCount === 'number' && vectorInfo.failedCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-300">
                    실패 {vectorInfo.failedCount}
                  </span>
                ) : null}
                {syncSummary ? (
                  <span className="truncate" role="status" aria-live="polite">
                    색인 {syncSummary.indexed} · 정리 {syncSummary.deleted}
                  </span>
                ) : null}
              </div>
              <div className="relative w-72 max-w-full">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    semanticSearchLimited ? '키워드로 참조 자료 검색' : '참조 자료 전체 검색'
                  }
                  className="h-8 pl-7 pr-7 text-xs"
                  aria-label="참조 자료 검색"
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
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 text-sm xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-auto p-2">
              {isSearchActive ? (
                searching && hits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">검색 중…</p>
                ) : searchError ? (
                  <p role="alert" className="text-xs text-red-500">
                    {searchError}
                  </p>
                ) : hits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    '{debouncedQuery}'와 일치하는 참조 자료가 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2" aria-label="참조 자료 검색 결과">
                    {hits.map((hit) => (
                      <li key={`${hit.folderId}:${hit.documentId}`}>
                        <button
                          type="button"
                          onClick={() => jumpToHit(hit)}
                          className="flex w-full flex-col gap-1 rounded-md border border-border bg-background/40 p-2 text-left hover:bg-muted/50"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium">{hit.title}</span>
                            <span
                              className="shrink-0 font-mono text-[10px] text-muted-foreground"
                              title={`score: ${hit.score}`}
                            >
                              {hit.score.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {hit.snippet}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {searchModeLabel(hit.searchMode)}
                            </span>
                          </div>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {hit.path ?? folderNameById.get(hit.folderId) ?? hit.folderId}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : folderId ? (
                documents.length > 0 ? (
                  <ul ref={docListRef} aria-label="동기화된 참조 자료">
                    {documents.map((d) => {
                      const isHighlighted = d.id === highlightedDocId
                      const isSelected = d.id === selectedDocumentId
                      return (
                        <li
                          key={d.id}
                          data-doc-id={d.id}
                          className={`border-b border-border transition-colors ${
                            isHighlighted ? 'bg-amber-500/10' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void openDocument(d.id)}
                            aria-pressed={isSelected}
                            className={`flex w-full justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted/50 ${
                              isSelected ? 'bg-muted' : ''
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate">{d.title}</span>
                              {d.path ? (
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {d.path}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {new Date(d.updatedAt).toLocaleString()}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    동기화된 참조 자료가 없습니다. 자료 원본을 다시 동기화하세요.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  왼쪽에서 검색할 자료 원본을 선택하세요.
                </p>
              )}
            </div>
            <aside
              className="min-h-0 overflow-auto border-t border-border p-3 xl:border-l xl:border-t-0"
              aria-labelledby="source-preview-title"
            >
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <h3 id="source-preview-title">원문 미리보기</h3>
                <span className="ml-auto rounded border border-border px-1.5 py-0.5 text-[9px] font-medium">
                  읽기 전용
                </span>
              </div>
              {selectedDocumentLoading ? (
                <p className="text-xs text-muted-foreground">원문 불러오는 중…</p>
              ) : selectedDocumentError ? (
                <p role="alert" className="text-xs text-red-500">
                  {selectedDocumentError}
                </p>
              ) : selectedDocument ? (
                <article className="flex flex-col gap-2">
                  <div>
                    <h3 className="truncate text-sm font-semibold">{selectedDocument.title}</h3>
                    {selectedDocument.path ? (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {selectedDocument.path}
                      </p>
                    ) : null}
                  </div>
                  <pre
                    role="region"
                    tabIndex={0}
                    aria-label={`${selectedDocument.title} 원문`}
                    className="max-h-[calc(100vh-260px)] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {selectedDocument.body || '(원문이 비어 있습니다.)'}
                  </pre>
                </article>
              ) : (
                <p className="text-xs text-muted-foreground">
                  자료를 선택하면 동기화한 원문을 읽기 전용으로 확인합니다.
                </p>
              )}
            </aside>
          </div>
        </section>
      </div>
    </div>
  )
}
