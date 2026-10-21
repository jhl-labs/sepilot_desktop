'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CapabilityUnavailableError,
  createTeamDocsApi,
  type TeamDocsApi,
  type TeamDocsConfig,
  type TeamDocsConfigInput,
  type TeamDocsDocument,
  type TeamDocsDocumentContent,
  type TeamDocsWatchSnapshot,
} from '@/lib/api/team-docs'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'

const EMPTY_FORM: TeamDocsConfigInput = {
  name: '',
  description: '',
  serverType: 'github.com',
  ghesUrl: '',
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
  docsPath: 'sepilot/documents',
  enabled: true,
  autoSync: false,
  syncInterval: 60,
}
const REDACTED_TOKEN = '***redacted***'

function toForm(item: TeamDocsConfig): TeamDocsConfigInput {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    serverType: item.serverType,
    ghesUrl: item.ghesUrl,
    token: item.token,
    owner: item.owner,
    repo: item.repo,
    branch: item.branch,
    docsPath: item.docsPath,
    enabled: item.enabled,
    autoSync: item.autoSync,
    syncInterval: item.syncInterval,
  }
}

function serializeTeamDocsForm(value: TeamDocsConfigInput): string {
  return JSON.stringify({
    id: value.id ?? null,
    name: value.name,
    description: value.description ?? '',
    serverType: value.serverType ?? 'github.com',
    ghesUrl: value.ghesUrl ?? '',
    token: value.token,
    owner: value.owner,
    repo: value.repo,
    branch: value.branch ?? 'main',
    docsPath: value.docsPath ?? 'sepilot/documents',
    enabled: value.enabled ?? true,
    autoSync: value.autoSync ?? false,
    syncInterval: value.syncInterval ?? 60,
  })
}

export function TeamDocsSettingsTab() {
  const transport = useTransport()
  const [items, setItems] = useState<TeamDocsConfig[]>([])
  const [documents, setDocuments] = useState<TeamDocsDocument[]>([])
  const [selectedId, setSelectedId] = useState<string>('new')
  const [form, setForm] = useState<TeamDocsConfigInput>(EMPTY_FORM)
  const [documentQuery, setDocumentQuery] = useState('')
  const [activeDocumentPath, setActiveDocumentPath] = useState<string | null>(null)
  const [activeDocument, setActiveDocument] =
    useState<TeamDocsDocumentContent | null>(null)
  const [documentStatus, setDocumentStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [repoQuery, setRepoQuery] = useState('')
  const selectedIdRef = useRef(selectedId)
  const activeDocumentPathRef = useRef(activeDocumentPath)
  const hasPendingFormChangesRef = useRef(false)

  async function loadDocument(id: string, path: string): Promise<void> {
    setDocumentStatus('loading')
    try {
      const api = await createTeamDocsApi(transport)
      const next = await api.getDocument(id, path)
      setActiveDocument(next)
      setActiveDocumentPath(path)
      setDocumentStatus('ready')
    } catch {
      setActiveDocument(null)
      setDocumentStatus('error')
    }
  }

  async function syncDocumentSelection(
    id: string,
    nextDocuments: TeamDocsDocument[],
    preferredPath?: string | null,
  ): Promise<void> {
    const resolvedPath =
      preferredPath && nextDocuments.some((document) => document.path === preferredPath)
        ? preferredPath
        : nextDocuments[0]?.path ?? null
    setActiveDocumentPath(resolvedPath)
    if (!resolvedPath) {
      setActiveDocument(null)
      setDocumentStatus('idle')
      return
    }
    await loadDocument(id, resolvedPath)
  }

  async function refreshList(
    preferredId?: string,
    options?: { syncForm?: boolean },
  ): Promise<void> {
    const api = await createTeamDocsApi(transport)
    const nextItems = await api.list()
    setItems(nextItems)

    const resolvedId =
      preferredId && nextItems.some((item) => item.id === preferredId)
        ? preferredId
        : nextItems[0]?.id ?? 'new'

    if (resolvedId === 'new') {
      setSelectedId('new')
      if (options?.syncForm !== false || preferredId !== 'new') {
        setForm(EMPTY_FORM)
      }
      setDocuments([])
      setDocumentQuery('')
      setActiveDocumentPath(null)
      setActiveDocument(null)
      setDocumentStatus('idle')
      return
    }

    const selected = nextItems.find((item) => item.id === resolvedId)
    if (!selected) {
      setSelectedId('new')
      setForm(EMPTY_FORM)
      setDocuments([])
      setDocumentQuery('')
      setActiveDocumentPath(null)
      setActiveDocument(null)
      setDocumentStatus('idle')
      return
    }

    setSelectedId(selected.id)
    if (options?.syncForm !== false) {
      setForm(toForm(selected))
    }
    const nextDocuments = await api.listDocuments(selected.id)
    setDocuments(nextDocuments)
    await syncDocumentSelection(selected.id, nextDocuments, activeDocumentPath)
  }

  async function applyWatchSnapshot(
    snapshot: TeamDocsWatchSnapshot,
    options?: { syncForm?: boolean },
  ): Promise<void> {
    setItems(snapshot.items)

    const currentSelectedId = selectedIdRef.current
    if (currentSelectedId === 'new') {
      if (snapshot.items.length === 0) {
        setDocuments([])
        setActiveDocumentPath(null)
        setActiveDocument(null)
        setDocumentStatus('idle')
      }
      return
    }

    const selected =
      snapshot.items.find((item) => item.id === currentSelectedId)
      ?? snapshot.items[0]
      ?? null

    if (!selected) {
      setSelectedId('new')
      setForm(EMPTY_FORM)
      setDocuments([])
      setDocumentQuery('')
      setActiveDocumentPath(null)
      setActiveDocument(null)
      setDocumentStatus('idle')
      return
    }

    setSelectedId(selected.id)
    if (options?.syncForm !== false) {
      setForm(toForm(selected))
    }
    const nextDocuments = snapshot.documentsByConfigId[selected.id] ?? []
    setDocuments(nextDocuments)
    await syncDocumentSelection(
      selected.id,
      nextDocuments,
      activeDocumentPathRef.current,
    )
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createTeamDocsApi(transport)
        const nextItems = await api.list()
        if (cancelled) return
        setItems(nextItems)
        setStatus('ready')
        if (nextItems[0]) {
          setSelectedId(nextItems[0].id)
          setForm(toForm(nextItems[0]))
          const nextDocuments = await api.listDocuments(nextItems[0].id)
          setDocuments(nextDocuments)
          await syncDocumentSelection(nextItems[0].id, nextDocuments)
        } else {
          setSelectedId('new')
          setForm(EMPTY_FORM)
          setDocuments([])
          setActiveDocument(null)
          setActiveDocumentPath(null)
          setDocumentStatus('idle')
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'team docs load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    activeDocumentPathRef.current = activeDocumentPath
  }, [activeDocumentPath])

  const selectedConfig =
    selectedId === 'new'
      ? null
      : items.find((item) => item.id === selectedId) ?? null
  const hasPendingFormChanges =
    selectedId === 'new'
      ? serializeTeamDocsForm(form) !== serializeTeamDocsForm(EMPTY_FORM)
      : selectedConfig
        ? serializeTeamDocsForm(form) !== serializeTeamDocsForm(toForm(selectedConfig))
        : false

  useEffect(() => {
    hasPendingFormChangesRef.current = hasPendingFormChanges
  }, [hasPendingFormChanges])

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    let watcher: ReturnType<TeamDocsApi['watch']> | null = null

    void (async () => {
      try {
        const api = await createTeamDocsApi(transport)
        if (cancelled) return
        watcher = api.watch(async (event) => {
          if (event.type === 'heartbeat') return
          await applyWatchSnapshot(event, {
            syncForm: !hasPendingFormChangesRef.current,
          })
        })
        watcher.done.catch(() => {})
      } catch {
      }
    })()

    return () => {
      cancelled = true
      watcher?.close()
    }
  }, [status, transport])

  async function selectConfig(item: TeamDocsConfig): Promise<void> {
    setSelectedId(item.id)
    setForm(toForm(item))
    setDocumentQuery('')
    try {
      const api = await createTeamDocsApi(transport)
      const nextDocuments = await api.listDocuments(item.id)
      setDocuments(nextDocuments)
      await syncDocumentSelection(item.id, nextDocuments)
    } catch {
      setDocuments([])
      setActiveDocument(null)
      setActiveDocumentPath(null)
      setDocumentStatus('error')
    }
  }

  function resetToNew(): void {
    setSelectedId('new')
    setForm(EMPTY_FORM)
    setDocuments([])
    setDocumentQuery('')
    setActiveDocumentPath(null)
    setActiveDocument(null)
    setDocumentStatus('idle')
  }

  async function save(): Promise<void> {
    setBusyKey('save')
    try {
      const api = await createTeamDocsApi(transport)
      const saved = await api.upsert({
        ...form,
        description: form.description ?? '',
        serverType: form.serverType ?? 'github.com',
        ghesUrl: form.ghesUrl ?? '',
        branch: form.branch ?? 'main',
        docsPath: form.docsPath ?? 'sepilot/documents',
        enabled: form.enabled ?? true,
        autoSync: form.autoSync ?? false,
        syncInterval: form.syncInterval ?? 60,
      })
      await refreshList(saved.id)
      toast.success('Team Docs 구성을 저장했습니다.')
    } catch (err) {
      toast.error('Team Docs 구성을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function testConnection(id: string): Promise<void> {
    setBusyKey(`test:${id}`)
    try {
      const api = await createTeamDocsApi(transport)
      const result = await api.testConnection(id)
      await refreshList(id)
      if (result.success) {
        toast.success('GitHub 연결을 확인했습니다.', {
          description: result.message,
        })
      } else {
        toast.error('GitHub 연결 확인에 실패했습니다.', {
          description: result.message,
        })
      }
    } catch (err) {
      toast.error('GitHub 연결 확인에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'test failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function syncConfig(id: string): Promise<void> {
    setBusyKey(`sync:${id}`)
    try {
      const api = await createTeamDocsApi(transport)
      const result = await api.sync(id)
      await refreshList(id)
      if (result.success) {
        toast.success('Team Docs 문서를 동기화했습니다.', {
          description: result.message,
        })
      } else {
        toast.error('Team Docs 동기화에 실패했습니다.', {
          description: result.message,
        })
      }
    } catch (err) {
      toast.error('Team Docs 동기화에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'sync failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function syncAll(): Promise<void> {
    setBusyKey('sync-all')
    try {
      const api = await createTeamDocsApi(transport)
      const result = await api.syncAll()
      await refreshList(selectedId !== 'new' ? selectedId : undefined)
      toast.success('활성 Team Docs를 일괄 동기화했습니다.', {
        description: `${result.succeeded}/${result.total} 성공`,
      })
    } catch (err) {
      toast.error('일괄 동기화에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'sync all failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function removeConfig(id: string): Promise<void> {
    const target = items.find((item) => item.id === id)
    const label = target ? `${target.name} (${target.owner}/${target.repo})` : id
    const ok = await confirm(
      `'${label}' Team Docs 구성을 삭제하시겠습니까? 동기화된 문서 캐시도 함께 정리됩니다.`,
      { destructive: true },
    )
    if (!ok) return
    setBusyKey(`remove:${id}`)
    try {
      const api = await createTeamDocsApi(transport)
      await api.remove(id)
      await refreshList(selectedId === id ? undefined : selectedId)
      toast.success('Team Docs 구성을 삭제했습니다.')
    } catch (err) {
      toast.error('Team Docs 구성을 삭제하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'remove failed',
      })
    } finally {
      setBusyKey(null)
    }
  }

  const filteredItems = useMemo(() => {
    const q = repoQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.description ?? '',
        item.owner,
        item.repo,
        item.branch ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [items, repoQuery])

  if (status === 'unavailable') return <UnimplementedBanner what="Team Docs" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>

  const filteredDocuments = documents.filter((document) =>
    document.path.toLowerCase().includes(documentQuery.trim().toLowerCase()),
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Configured Repositories</h4>
            <p className="text-xs text-muted-foreground">
              GitHub Sync 계정과 별개로, 저장소별 PAT/GHES 연결을 daemon에서 관리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={resetToNew}>
              새 구성
            </Button>
            <Button
              size="sm"
              onClick={() => void syncAll()}
              disabled={busyKey === 'sync-all'}
            >
              {busyKey === 'sync-all' ? '동기화 중…' : '전체 동기화'}
            </Button>
          </div>
        </div>
        {items.length > 0 ? (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={repoQuery}
              onChange={(event) => setRepoQuery(event.target.value)}
              placeholder="이름, 설명, owner/repo로 검색"
              className="h-8 pl-7 pr-7 text-xs"
              aria-label="team docs 저장소 검색"
            />
            {repoQuery ? (
              <button
                type="button"
                onClick={() => setRepoQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="검색어 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => void selectConfig(item)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                void selectConfig(item)
              }}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                selectedId === item.id
                  ? 'border-primary bg-accent/40'
                  : 'border-border hover:bg-accent/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.owner}/{item.repo} · {item.branch}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    item.enabled
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-zinc-500/15 text-zinc-500'
                  }`}
                >
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{item.syncedDocuments} docs</span>
                <span>
                  최근 동기화:{' '}
                  {item.lastSyncAt
                    ? new Date(item.lastSyncAt).toLocaleString()
                    : '없음'}
                </span>
              </div>
              {item.lastSyncStatus === 'error' && item.lastSyncError ? (
                <div className="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-600">
                  {item.lastSyncError}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    void testConnection(item.id)
                  }}
                  disabled={busyKey === `test:${item.id}`}
                >
                  연결 확인
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    void syncConfig(item.id)
                  }}
                  disabled={busyKey === `sync:${item.id}`}
                >
                  동기화
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeConfig(item.id)
                  }}
                  disabled={busyKey === `remove:${item.id}`}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              아직 등록된 Team Docs 저장소가 없습니다.
            </p>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
              <Search className="h-5 w-5 opacity-50" />
              <p>'{repoQuery}'와 일치하는 저장소가 없습니다.</p>
              <button
                type="button"
                onClick={() => setRepoQuery('')}
                className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
              >
                검색어 지우기
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <div className="mb-4">
            <h4 className="text-sm font-semibold">
              {selectedId === 'new' ? 'New Team Docs' : 'Edit Team Docs'}
            </h4>
            <p className="text-xs text-muted-foreground">
              브라우저에서도 동일하게 저장/연결 확인/동기화가 가능한 daemon surface입니다.
            </p>
          </div>
          {selectedConfig ? (
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border px-3 py-3">
                <div className="text-[11px] text-muted-foreground">Last Tested</div>
                <div className="mt-1 text-sm font-medium">
                  {selectedConfig.lastTestedAt
                    ? new Date(selectedConfig.lastTestedAt).toLocaleString()
                    : '없음'}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                <div className="text-[11px] text-muted-foreground">Last Sync</div>
                <div className="mt-1 text-sm font-medium">
                  {selectedConfig.lastSyncAt
                    ? new Date(selectedConfig.lastSyncAt).toLocaleString()
                    : '없음'}
                </div>
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                <div className="text-[11px] text-muted-foreground">Synced Docs</div>
                <div className="mt-1 text-sm font-medium">
                  {selectedConfig.syncedDocuments}
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Frontend Team"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={form.description ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="팀 위키 / 운영 문서"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Server</label>
              <select
                value={form.serverType ?? 'github.com'}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    serverType: event.target.value as 'github.com' | 'ghes',
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="github.com">GitHub.com</option>
                <option value="ghes">GitHub Enterprise Server</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">GHES URL</label>
              <Input
                value={form.ghesUrl ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ghesUrl: event.target.value }))
                }
                placeholder="https://github.company.com"
                disabled={(form.serverType ?? 'github.com') !== 'ghes'}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Personal Access Token</label>
              <Input
                type="password"
                value={form.token}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, token: event.target.value }))
                }
                placeholder="ghp_... 또는 저장된 token 유지"
              />
              {form.token === REDACTED_TOKEN ? (
                <p className="text-xs text-muted-foreground">
                  저장된 token은 화면/API 응답에서 숨겨집니다. 변경할 때만 새 token을 입력하세요.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Owner</label>
              <Input
                value={form.owner}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, owner: event.target.value }))
                }
                placeholder="jhl-labs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Repository</label>
              <Input
                value={form.repo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, repo: event.target.value }))
                }
                placeholder="sepilot_desktop-private"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Branch</label>
              <Input
                value={form.branch ?? 'main'}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, branch: event.target.value }))
                }
                placeholder="main"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Documents Path</label>
              <Input
                value={form.docsPath ?? 'sepilot/documents'}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, docsPath: event.target.value }))
                }
                placeholder="sepilot/documents"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={form.enabled ?? true}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Auto Sync</span>
              <input
                type="checkbox"
                checked={form.autoSync ?? false}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    autoSync: event.target.checked,
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>Sync Interval</span>
              <Input
                className="h-7 w-20 text-right"
                type="number"
                value={form.syncInterval ?? 60}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    syncInterval: Number.parseInt(event.target.value || '60', 10),
                  }))
                }
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busyKey === 'save'}>
              {busyKey === 'save' ? '저장 중…' : '구성 저장'}
            </Button>
            {selectedId !== 'new' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void testConnection(selectedId)}
                  disabled={busyKey === `test:${selectedId}`}
                >
                  연결 확인
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void syncConfig(selectedId)}
                  disabled={busyKey === `sync:${selectedId}`}
                >
                  문서 동기화
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Synced Documents</h4>
              <p className="text-xs text-muted-foreground">
                선택한 Team Docs 구성에서 내려받은 문서를 검색하고 본문을 바로 확인합니다.
              </p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={documentQuery}
                onChange={(event) => setDocumentQuery(event.target.value)}
                placeholder="문서 경로 검색"
                className="h-8 pl-7 pr-7 text-xs"
                aria-label="문서 경로 검색"
              />
              {documentQuery ? (
                <button
                  type="button"
                  onClick={() => setDocumentQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              {filteredDocuments.map((document) => (
                <button
                  key={document.path}
                  type="button"
                  onClick={() => void loadDocument(selectedId, document.path)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    activeDocumentPath === document.path
                      ? 'border-primary bg-accent/40'
                      : 'border-border hover:bg-accent/20'
                  }`}
                >
                  <div className="font-medium">{document.path}</div>
                  <div className="text-xs text-muted-foreground">
                    {document.size} bytes ·{' '}
                    {new Date(document.syncedAt).toLocaleString()}
                  </div>
                </button>
              ))}
              {filteredDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {documents.length === 0
                    ? '동기화된 문서가 없습니다.'
                    : '검색 결과가 없습니다.'}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-3">
                <div className="text-sm font-medium">
                  {activeDocument?.path ?? '문서를 선택하세요'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeDocument
                    ? `${activeDocument.size} bytes · ${new Date(
                        activeDocument.syncedAt,
                      ).toLocaleString()}`
                    : '선택된 문서의 본문 미리보기를 제공합니다.'}
                </div>
              </div>
              <div className="max-h-[480px] overflow-auto px-4 py-3">
                {documentStatus === 'loading' ? (
                  <p className="text-sm text-muted-foreground">문서 로딩 중…</p>
                ) : documentStatus === 'error' ? (
                  <p className="text-sm text-red-500">
                    문서를 불러오지 못했습니다.
                  </p>
                ) : activeDocument ? (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {activeDocument.content}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    좌측 목록에서 문서를 선택하세요.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
