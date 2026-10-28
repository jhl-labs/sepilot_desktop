'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Eye,
  FilePlus,
  Fingerprint,
  Globe,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  createSkillsApi,
  type MarketplaceSkillSearchResult,
  type SkillCreateInput,
  type SkillDetail,
  type SkillInstallPreview,
} from '@/lib/api/skills'
import { createMarketplacesApi, type MarketplaceEntry } from '@/lib/api/marketplaces'
import { useSkillsStore } from '@/lib/store/skills-store'
import { useSessionStore } from '@/lib/store/session-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

function autonomyLabel(level: string | undefined): string {
  switch (level) {
    case 'readonly': return '읽기 전용'
    case 'accept-edits': return '편집 승인 필요'
    case 'workspace-write': return '워크스페이스 쓰기'
    case 'supervised': return '감독 실행'
    case 'autonomous': return '자율 실행'
    default: return '별도 요구 없음'
  }
}

function riskLabel(risk: string | undefined): string {
  switch (risk) {
    case 'high': return '높음'
    case 'medium': return '보통'
    case 'low': return '낮음'
    default: return '미분류'
  }
}

interface SkillManagerProps {
  density?: 'default' | 'compact'
}

export function SkillManager({ density = 'default' }: SkillManagerProps) {
  const transport = useTransport()
  const activeWorkspace = useSessionStore((s) => s.sessions.find((session) => session.id === s.activeId)?.cwd ?? null)
  const activeWorkspaceRef = useRef(activeWorkspace)
  activeWorkspaceRef.current = activeWorkspace
  const items = useSkillsStore((s) => s.items)
  const setItems = useSkillsStore((s) => s.setItems)
  const setEnabled = useSkillsStore((s) => s.setEnabled)
  const selectedIds = useSkillsStore((s) => s.selectedIds)
  const toggleSelected = useSkillsStore((s) => s.toggleSelected)
  const [installOpen, setInstallOpen] = useState(false)
  const [installSource, setInstallSource] = useState('')
  const [installForce, setInstallForce] = useState(false)
  const [installPreview, setInstallPreview] = useState<SkillInstallPreview | null>(null)
  const [installReviewConfirmed, setInstallReviewConfirmed] = useState(false)
  const [installOrigin, setInstallOrigin] = useState<'direct' | 'catalog'>('direct')
  const [installPreviewing, setInstallPreviewing] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [removingName, setRemovingName] = useState<string | null>(null)
  const [preview, setPreview] = useState<SkillDetail | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    id: '',
    name: '',
    version: '1.0.0',
    description: '',
    author: '',
    tagsText: '',
    content: '',
  })
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'installed' | 'store'>('installed')
  const [marketplaceResults, setMarketplaceResults] = useState<MarketplaceSkillSearchResult[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null)
  const [marketplaceSearchedQuery, setMarketplaceSearchedQuery] = useState('')
  const [installingSource, setInstallingSource] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sources, setSources] = useState<MarketplaceEntry[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesBusy, setSourcesBusy] = useState<string | null>(null)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceUrl, setNewSourceUrl] = useState('')
  useModalViewportLock(
    installOpen || Boolean(preview) || createOpen || sourcesOpen,
  )

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((skill) => {
      if (enabledOnly && !skill.enabled) return false
      if (!q) return true
      const haystack = [
        skill.name,
        skill.description ?? '',
        skill.id ?? '',
        skill.path ?? '',
        skill.source?.ref ?? '',
        ...(skill.tags ?? []),
        ...(skill.tools ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [items, query, enabledOnly])
  const enabledCount = items.filter((skill) => skill.enabled).length

  function resetInstallDialog(): void {
    setInstallOpen(false)
    setInstallSource('')
    setInstallForce(false)
    setInstallPreview(null)
    setInstallReviewConfirmed(false)
    setInstallOrigin('direct')
  }

  function openInstallDialog(): void {
    resetInstallDialog()
    setInstallOpen(true)
  }

  function closeInstallDialog(): void {
    if (installPreviewing || installing) return
    resetInstallDialog()
  }

  function resetCreateForm(): void {
    setCreateForm({
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      author: '',
      tagsText: '',
      content: '',
    })
  }

  async function createSkill(): Promise<void> {
    if (!createForm.id.trim() || !createForm.name.trim() || !createForm.content.trim()) {
      toast.warning('id, name, 본문은 필수입니다.')
      return
    }
    setCreating(true)
    try {
      const api = await createSkillsApi(transport)
      const input: SkillCreateInput = {
        metadata: {
          id: createForm.id.trim(),
          name: createForm.name.trim(),
          version: createForm.version.trim() || '1.0.0',
          description: createForm.description.trim(),
          author: createForm.author.trim() || undefined,
          tags: createForm.tagsText
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          tools: [],
        },
        content: createForm.content,
      }
      const result = await api.create(input)
      toast.success(`스킬을 만들었습니다: ${result.id} v${result.version}`)
      setCreateOpen(false)
      resetCreateForm()
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setCreating(false)
    }
  }

  async function refresh(): Promise<void> {
    try {
      const list = await (await createSkillsApi(transport)).list({ cwd: activeWorkspaceRef.current })
      setItems(list)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await (await createSkillsApi(transport)).list({ cwd: activeWorkspaceRef.current })
        if (!cancelled) setItems(list)
      } catch {
        if (!cancelled) setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport, setItems])

  async function toggle(name: string, enabled: boolean): Promise<void> {
    try {
      const api = await createSkillsApi(transport)
      await api.setEnabled(name, enabled)
      setEnabled(name, enabled)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    }
  }

  async function prepareInstall(
    sourceValue = installSource,
    origin: 'direct' | 'catalog' = 'direct',
    force = installForce,
  ): Promise<void> {
    const source = sourceValue.trim()
    if (!source) {
      toast.warning('설치할 GitHub 또는 HTTPS source를 입력하세요.')
      return
    }
    setInstallPreviewing(true)
    if (origin === 'catalog') setInstallingSource(source)
    try {
      const api = await createSkillsApi(transport)
      const nextPreview = await api.previewInstall(source)
      if (nextPreview.candidates.length === 0) {
        toast.warning('설치할 스킬을 찾지 못했습니다.', {
          description: 'source의 SKILL.md 또는 catalog 항목을 확인하세요.',
        })
        return
      }
      setInstallSource(source)
      setInstallForce(force)
      setInstallOrigin(origin)
      setInstallPreview(nextPreview)
      setInstallReviewConfirmed(false)
      setInstallOpen(true)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setInstallPreviewing(false)
      if (origin === 'catalog') setInstallingSource(null)
    }
  }

  async function install(): Promise<void> {
    const source = installSource.trim()
    if (!installPreview || !installReviewConfirmed) {
      toast.warning('출처와 요청 권한을 확인한 뒤 설치를 승인하세요.')
      return
    }
    setInstalling(true)
    try {
      const api = await createSkillsApi(transport)
      const result = await api.install(source, {
        expectedDigest: installPreview.digest,
        ...(installForce ? { force: true } : {}),
      })
      if (result.installed.length === 0) {
        toast.warning('설치된 스킬이 없습니다.', {
          description: '응답에 새 스킬이 포함되지 않았습니다.',
        })
      } else if (installOrigin === 'catalog') {
        toast.success('catalog skill을 설치했습니다.', {
          description: result.installed.map((skill) => `${skill.name} v${skill.version}`).join(', '),
        })
      } else {
        toast.success(`${result.installed.length}개 스킬을 설치했습니다.`, {
          description: result.installed.map((s) => `${s.name} v${s.version}`).join(', '),
        })
      }
      if (installOrigin === 'catalog') {
        setMarketplaceResults((results) =>
          results.map((item) => (item.source === source ? { ...item, installed: true } : item)),
        )
      }
      resetInstallDialog()
      await refresh()
    } catch (error) {
      setInstallReviewConfirmed(false)
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setInstalling(false)
    }
  }

  async function searchMarketplace(): Promise<void> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      toast.warning('catalog source에서 검색할 키워드를 입력하세요.')
      return
    }
    setMarketplaceLoading(true)
    setMarketplaceError(null)
    try {
      const api = await createSkillsApi(transport)
      const results = await api.searchMarketplace(normalizedQuery, { limit: 20 })
      setMarketplaceResults(results)
      setMarketplaceSearchedQuery(normalizedQuery)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      setMarketplaceError(friendly.description ?? friendly.title)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setMarketplaceLoading(false)
    }
  }

  async function installMarketplaceSkill(source: string): Promise<void> {
    await prepareInstall(source, 'catalog', false)
  }

  async function uninstall(name: string): Promise<void> {
    const ok = await confirm(`'${name}' 스킬을 삭제하시겠습니까?`, { destructive: true })
    if (!ok) return
    setRemovingName(name)
    try {
      const api = await createSkillsApi(transport)
      await api.uninstall(name)
      toast.success(`스킬 '${name}'을 삭제했습니다.`)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRemovingName(null)
    }
  }

  async function refreshSources(): Promise<void> {
    setSourcesLoading(true)
    try {
      const api = await createMarketplacesApi(transport)
      setSources(await api.list())
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSourcesLoading(false)
    }
  }

  async function openSourcesDialog(): Promise<void> {
    setSourcesOpen(true)
    setNewSourceName('')
    setNewSourceUrl('')
    await refreshSources()
  }

  async function addSource(): Promise<void> {
    const name = newSourceName.trim()
    const url = newSourceUrl.trim()
    if (!name || !url) {
      toast.warning('source 이름과 URL을 모두 입력하세요.')
      return
    }
    if (!/^https:\/\//i.test(url)) {
      toast.warning('URL은 https:// 로 시작해야 합니다.')
      return
    }
    setSourcesBusy('__add__')
    try {
      const api = await createMarketplacesApi(transport)
      await api.add(name, url)
      toast.success(`source '${name}' 추가됨`)
      setNewSourceName('')
      setNewSourceUrl('')
      await refreshSources()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSourcesBusy(null)
    }
  }

  async function removeSource(name: string): Promise<void> {
    const ok = await confirm(`source '${name}'을 제거할까요?`, { destructive: true })
    if (!ok) return
    setSourcesBusy(name)
    try {
      const api = await createMarketplacesApi(transport)
      const removed = await api.remove(name)
      if (removed) {
        toast.success(`source '${name}' 제거됨`)
      } else {
        toast.warning(`source '${name}'을 찾을 수 없습니다.`)
      }
      await refreshSources()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSourcesBusy(null)
    }
  }

  async function openPreview(idOrName: string): Promise<void> {
    setPreviewLoading(true)
    try {
      const api = await createSkillsApi(transport)
      const detail = await api.get(idOrName)
      setPreview(detail)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setPreviewLoading(false)
    }
  }

  function skillIdentifier(skill: { id?: string; name: string }): string {
    return skill.id ?? skill.name
  }

  return (
    <div
      data-skill-density={density}
      className={
        density === 'compact'
          ? 'flex flex-col gap-2 text-[13px]'
          : 'flex flex-col gap-3 text-sm'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Skills</h2>
          <p className="text-[11px] text-muted-foreground">
            {items.length}개 설치 · {enabledCount}개 활성
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void openSourcesDialog()}
            aria-label="catalog source 관리"
            title="catalog source 관리"
          >
            <Globe className="mr-1 h-4 w-4" />
            Source
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            aria-label="자체 스킬 만들기"
          >
            <FilePlus className="mr-1 h-4 w-4" />
            자체 만들기
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openInstallDialog}
            aria-label="스킬 설치"
          >
            <Plus className="mr-1 h-4 w-4" />
            설치
          </Button>
        </div>
      </div>

      <div className="flex w-fit rounded-md border border-border p-0.5">
        <Button
          size="sm"
          variant={viewMode === 'installed' ? 'default' : 'ghost'}
          className="h-7 px-2 text-xs"
          onClick={() => setViewMode('installed')}
        >
          설치됨 {items.length}
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'store' ? 'default' : 'ghost'}
          className="h-7 px-2 text-xs"
          onClick={() => setViewMode('store')}
        >
          Catalog
        </Button>
      </div>

      {viewMode === 'installed' && items.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 설명, 태그로 검색"
              className="h-8 pl-7 text-xs"
              aria-label="skill 검색"
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
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={enabledOnly}
              onChange={(e) => setEnabledOnly(e.target.checked)}
              className="h-3 w-3"
            />
            활성만
          </label>
        </div>
      ) : null}

      {viewMode === 'store' ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchMarketplace()
              }}
              placeholder="등록된 source에서 skill 검색"
              className="h-8 pl-7 text-xs"
              aria-label="skill catalog 검색"
              disabled={marketplaceLoading}
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => void searchMarketplace()}
            disabled={marketplaceLoading || !query.trim()}
          >
            {marketplaceLoading ? '검색 중…' : '검색'}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {viewMode === 'store' ? (
          <>
            {marketplaceError ? (
              <p className="text-xs text-destructive">{marketplaceError}</p>
            ) : null}
            {marketplaceLoading ? (
              <p className="text-xs text-muted-foreground">등록된 source 검색 중…</p>
            ) : null}
            {!marketplaceLoading && marketplaceResults.length === 0 ? (
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <p>
                  {marketplaceSearchedQuery
                    ? '일치하는 catalog skill이 없습니다.'
                    : '검색어를 입력하면 등록된 source에서 설치 가능한 skill을 찾습니다.'}
                </p>
                <button
                  type="button"
                  onClick={() => void openSourcesDialog()}
                  className="self-start rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
                >
                  Source 관리 →
                </button>
              </div>
            ) : null}
            {marketplaceResults.map((result) => {
              const metadata = result.metadata
              const isInstalling = installingSource === result.source
              return (
                <div
                  key={`${result.marketplace}:${result.source}`}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{metadata.name}</span>
                      {metadata.version ? (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                          v{metadata.version}
                        </span>
                      ) : null}
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        source: {result.marketplace}
                      </span>
                    </div>
                    {metadata.description ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {metadata.description}
                      </div>
                    ) : null}
                    {metadata.tags && metadata.tags.length > 0 ? (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {metadata.tags.slice(0, 6).map((tag) => (
                          <span
                            key={`${result.source}:${tag}`}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="truncate text-[11px] text-muted-foreground">
                      {result.source}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={result.installed ? 'outline' : 'default'}
                    onClick={() => void installMarketplaceSkill(result.source)}
                    disabled={result.installed || isInstalling}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {result.installed ? '설치됨' : isInstalling ? '설치 중…' : '설치'}
                  </Button>
                </div>
              )
            })}
          </>
        ) : null}
        {viewMode === 'installed' ? (
          <>
            {filteredItems.map((s) => {
              const id = skillIdentifier(s)
              const isRemoving = removingName === id || removingName === s.name
              const isSelected = selectedIds.includes(id)
              const sourceLabel = s.path ?? s.source?.ref
              return (
                <div
                  key={id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.id && s.id !== s.name ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {s.id}
                        </span>
                      ) : null}
                      {s.version ? (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                          v{s.version}
                        </span>
                      ) : null}
                      {s.source ? (
                        <span
                          className="rounded bg-sky-500/10 px-1 py-0.5 text-[10px] text-sky-700 dark:text-sky-300"
                          title={s.source.ref}
                        >
                          {s.source.type}
                        </span>
                      ) : null}
                    </div>
                    {s.description ? (
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        {s.description}
                      </div>
                    ) : null}
                    {s.tools?.length || s.tags?.length ? (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {s.tools?.slice(0, 6).map((tool) => (
                          <span
                            key={`${id}:tool:${tool}`}
                            className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300"
                          >
                            {tool}
                          </span>
                        ))}
                        {s.tags?.slice(0, 6).map((tag) => (
                          <span
                            key={`${id}:tag:${tag}`}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {sourceLabel ? (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">
                        {sourceLabel}
                      </div>
                    ) : null}
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => void openPreview(id)}
                      disabled={isRemoving || previewLoading}
                      aria-label={`${s.name} 미리보기`}
                      title="SKILL.md 미리보기"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={isSelected ? 'secondary' : 'ghost'}
                      className="h-8 px-2 text-xs"
                      onClick={() => toggleSelected(id)}
                      disabled={!s.enabled || isRemoving}
                      aria-label={`${s.name} ${isSelected ? '채팅 적용 해제' : '채팅에 적용'}`}
                      title={s.enabled ? '다음 채팅 요청에 이 스킬을 명시적으로 적용' : '활성화 후 적용할 수 있습니다'}
                    >
                      <WandSparkles className="mr-1 h-3.5 w-3.5" />
                      {isSelected ? '적용됨' : '채팅 적용'}
                    </Button>
                    <Button
                      size="sm"
                      variant={s.enabled ? 'outline' : 'default'}
                      onClick={() => void toggle(id, !s.enabled)}
                      disabled={isRemoving}
                    >
                      {s.enabled ? '비활성' : '활성'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => void uninstall(id)}
                      disabled={isRemoving}
                      aria-label={`${s.name} 삭제`}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                <Wrench className="h-5 w-5 opacity-50" />
                <p>스킬 없음</p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setViewMode('store')}>
                    Catalog 둘러보기
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                    자체 만들기
                  </Button>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-4 text-center text-xs text-muted-foreground">
                <Search className="h-5 w-5 opacity-50" />
                <p>일치하는 스킬이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setEnabledOnly(false)
                  }}
                  className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
                >
                  필터 초기화
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.metadata.name} 스킬 미리보기`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{preview.metadata.name}</h3>
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                    v{preview.metadata.version}
                  </span>
                </div>
                {preview.metadata.description ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {preview.metadata.description}
                  </p>
                ) : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setPreview(null)}
                aria-label="닫기"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            {preview.metadata.tags && preview.metadata.tags.length > 0 ? (
              <div className="flex max-h-[min(8rem,20dvh)] shrink-0 flex-wrap gap-1 overflow-y-auto overscroll-contain border-b border-border/40 px-3 py-2 [scrollbar-gutter:stable]">
                {preview.metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]">
              <MarkdownRenderer content={preview.content} />
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="자체 스킬 만들기"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (creating ? null : setCreateOpen(false))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-border px-6 py-4">
              <h3 className="text-sm font-semibold">자체 스킬 만들기</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                SKILL.md 본문은 마크다운으로 작성하세요. id는 영숫자/대시 권장.
              </p>
            </header>
            <div
              role="region"
              aria-label="스킬 입력"
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]"
            >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                ID
                <Input
                  type="text"
                  value={createForm.id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="my-skill"
                  disabled={creating}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Name
                <Input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Skill"
                  disabled={creating}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Version
                <Input
                  type="text"
                  value={createForm.version}
                  onChange={(e) => setCreateForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.0.0"
                  disabled={creating}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Author (선택)
                <Input
                  type="text"
                  value={createForm.author}
                  onChange={(e) => setCreateForm((f) => ({ ...f, author: e.target.value }))}
                  disabled={creating}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              Description
              <Input
                type="text"
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                disabled={creating}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Tags (콤마로 구분)
              <Input
                type="text"
                value={createForm.tagsText}
                onChange={(e) => setCreateForm((f) => ({ ...f, tagsText: e.target.value }))}
                placeholder="coding, python"
                disabled={creating}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              본문 (SKILL.md content)
              <textarea
                rows={12}
                value={createForm.content}
                onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
                placeholder={'# My Skill\n\n사용 방법…'}
                spellCheck={false}
                className="rounded border border-border bg-transparent p-2 font-mono text-[11px]"
                disabled={creating}
              />
            </label>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
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
                onClick={() => void createSkill()}
                disabled={
                  creating ||
                  !createForm.id.trim() ||
                  !createForm.name.trim() ||
                  !createForm.content.trim()
                }
              >
                {creating ? '만드는 중…' : '만들기'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {sourcesOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Catalog source 관리"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (sourcesBusy ? null : setSourcesOpen(false))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">Catalog source 관리</h3>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setSourcesOpen(false)}
                aria-label="닫기"
                disabled={sourcesBusy != null}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </header>
            <div
              role="region"
              aria-label="Catalog source 설정"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]"
            >
              <p className="text-xs text-muted-foreground">
                skill catalog source는 https URL의 marketplace 매니페스트입니다. 여기에 등록한
                source가 Catalog 검색의 대상이 됩니다.
              </p>
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="text-[11px] font-medium text-muted-foreground">새 source 추가</div>
                <Input
                  type="text"
                  placeholder="이름 (예: official)"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  disabled={sourcesBusy != null}
                  className="h-8 text-xs"
                />
                <Input
                  type="url"
                  placeholder="https://example.com/marketplace.json"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  disabled={sourcesBusy != null}
                  className="h-8 text-xs"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => void addSource()}
                    disabled={sourcesBusy != null || !newSourceName.trim() || !newSourceUrl.trim()}
                  >
                    {sourcesBusy === '__add__' ? '추가 중…' : '추가'}
                  </Button>
                </div>
              </div>
              {sourcesLoading ? (
                <p className="text-xs text-muted-foreground">불러오는 중…</p>
              ) : sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">등록된 source가 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {sources.map((s) => {
                    const busy = sourcesBusy === s.name
                    return (
                      <li
                        key={s.name}
                        className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{s.url}</div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void removeSource(s.name)}
                          disabled={busy || sourcesBusy != null}
                          aria-label={`${s.name} 제거`}
                          title="제거"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {installOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={installPreview ? '스킬 설치 전 보안 검토' : '스킬 설치'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeInstallDialog}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {installPreview ? (
              <>
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">설치 전 보안 검토</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        가져온 내용과 요청 권한을 확인해야 설치할 수 있습니다.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={closeInstallDialog}
                    disabled={installing}
                    aria-label="닫기"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </header>

                <div
                  role="region"
                  aria-label="스킬 설치 검토"
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]"
                >
                  <section className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" />
                      출처
                    </div>
                    <p className="mt-1 break-all font-mono text-xs">{installSource}</p>
                    {installForce ? (
                      <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                        동일한 ID가 이미 있으면 기존 스킬을 덮어씁니다.
                      </p>
                    ) : null}
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold">감지된 스킬</h4>
                      <span className="text-[11px] text-muted-foreground">
                        {installPreview.candidates.length}개
                      </span>
                    </div>
                    {installPreview.candidates.map((candidate) => {
                      const tools = Array.from(new Set([
                        ...(candidate.metadata.tools ?? []),
                        ...(candidate.metadata.permissions?.tools ?? []),
                      ]))
                      const networks = candidate.metadata.permissions?.network ?? []
                      const files = candidate.metadata.permissions?.files ?? []
                      return (
                        <article
                          key={`${candidate.metadata.id}:${candidate.source.ref}`}
                          className="rounded-md border border-border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{candidate.metadata.name}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {candidate.metadata.id}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              v{candidate.metadata.version}
                            </span>
                          </div>
                          {candidate.metadata.description ? (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {candidate.metadata.description}
                            </p>
                          ) : null}
                          <p className="mt-1 break-all text-[10px] text-muted-foreground">
                            {candidate.source.type} · {candidate.source.ref}
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded bg-muted/50 px-2 py-1.5">
                              <span className="text-muted-foreground">실행 수준</span>
                              <div className="mt-0.5 font-medium">
                                {autonomyLabel(candidate.metadata.autonomy_required)}
                              </div>
                            </div>
                            <div className="rounded bg-muted/50 px-2 py-1.5">
                              <span className="text-muted-foreground">위험 분류</span>
                              <div className="mt-0.5 font-medium">
                                {riskLabel(candidate.metadata.risk_tier)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                            <div>
                              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                <Wrench className="h-3 w-3" />
                                요청 도구
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tools.length > 0 ? tools.map((tool) => (
                                  <span
                                    key={`${candidate.metadata.id}:tool:${tool}`}
                                    className="rounded-full bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 dark:text-sky-300"
                                  >
                                    {tool}
                                  </span>
                                )) : (
                                  <span className="text-[11px] text-muted-foreground">선언된 도구 없음</span>
                                )}
                              </div>
                            </div>
                            {networks.length > 0 || files.length > 0 ? (
                              <div className="grid gap-1 text-[11px] sm:grid-cols-2">
                                <div>
                                  <span className="text-muted-foreground">네트워크</span>
                                  <p className="break-all font-mono">{networks.join(', ') || '없음'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">파일 범위</span>
                                  <p className="break-all font-mono">{files.join(', ') || '없음'}</p>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                추가 네트워크·파일 범위 선언 없음
                              </p>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </section>

                  <section className="rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Fingerprint className="h-3.5 w-3.5" />
                      콘텐츠 지문
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px]">{installPreview.digest}</p>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                      설치 시 이 지문과 같은 내용만 허용됩니다. source가 바뀌면 설치가 중단됩니다.
                    </p>
                  </section>

                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={installReviewConfirmed}
                      onChange={(event) => setInstallReviewConfirmed(event.target.checked)}
                      disabled={installing}
                      className="mt-0.5 h-3.5 w-3.5"
                      aria-label="설치 검토 확인"
                    />
                    <span>
                      <span className="block font-medium">출처와 요청 권한을 확인했습니다.</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        확인 후 설치를 누르면 위 콘텐츠 지문을 고정해 설치합니다.
                      </span>
                    </span>
                  </label>
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-auto"
                    onClick={closeInstallDialog}
                    disabled={installing}
                  >
                    취소
                  </Button>
                  {installOrigin === 'direct' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInstallPreview(null)
                        setInstallReviewConfirmed(false)
                      }}
                      disabled={installing}
                    >
                      출처 수정
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => void install()}
                    disabled={installing || !installReviewConfirmed}
                  >
                    {installing ? '설치 중…' : '확인 후 설치'}
                  </Button>
                </footer>
              </>
            ) : (
              <>
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">스킬 설치</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      GitHub 저장소, HTTPS SKILL.md URL 또는 catalog 식별자를 입력하세요.
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={closeInstallDialog}
                    disabled={installPreviewing}
                    aria-label="닫기"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </header>
                <div
                  role="region"
                  aria-label="스킬 설치 입력"
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]"
                >
                  <Input
                    type="text"
                    autoFocus
                    placeholder="https://github.com/owner/repository"
                    value={installSource}
                    onChange={(e) => setInstallSource(e.target.value)}
                    disabled={installPreviewing}
                    aria-label="설치 source"
                  />
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={installForce}
                      onChange={(e) => setInstallForce(e.target.checked)}
                      disabled={installPreviewing}
                      className="mt-0.5 h-3.5 w-3.5"
                      aria-label="동일 ID의 기존 스킬 덮어쓰기"
                    />
                    <span>
                      <span className="block font-medium">동일 ID의 기존 스킬 덮어쓰기</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        검증 규칙은 그대로 적용되며, 기존 스킬이 있을 때만 교체합니다.
                      </span>
                    </span>
                  </label>
                </div>
                <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={closeInstallDialog}
                    disabled={installPreviewing}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void prepareInstall()}
                    disabled={installPreviewing || !installSource.trim()}
                  >
                    {installPreviewing ? '검토 준비 중…' : '설치 검토'}
                  </Button>
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
