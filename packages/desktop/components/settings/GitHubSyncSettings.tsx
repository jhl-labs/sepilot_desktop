'use client'
import { useEffect, useMemo, useState } from 'react'
import { Github, LoaderCircle, Plus, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  CapabilityUnavailableError,
  createGitHubApi,
  type DiscoveredGitHubRepo,
  type GitHubSyncResult,
  type OAuthStatus,
  type SyncPolicy,
  type SyncRepo,
} from '@/lib/api/github'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'github-sync',
  section: 'integrations',
  label: 'GitHub Sync',
  search: ['github', 'sync', 'repo'],
  buildFeature: 'github-sync',
  render: () => <GitHubSyncSettings />,
})

function makeRepo(fullName: string): SyncRepo {
  return {
    fullName,
    enabled: true,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    pullRequests: 0,
    issues: 0,
    releases: 0,
  }
}

function repoLabel(repo: DiscoveredGitHubRepo): string {
  const visibility = repo.private ? 'private' : 'public'
  return repo.defaultBranch ? `${visibility} · ${repo.defaultBranch}` : visibility
}

export function GitHubSyncSettings() {
  const transport = useTransport()
  const [account, setAccount] = useState<OAuthStatus | null>(null)
  const [repos, setRepos] = useState<SyncRepo[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredGitHubRepo[]>([])
  const [repoInput, setRepoInput] = useState('')
  const [policy, setPolicy] = useState<SyncPolicy>({
    intervalMin: 30,
    pullRequests: true,
    issues: true,
    releases: false,
  })
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [busy, setBusy] = useState<
    'load' | 'policy' | 'repos' | 'discover' | 'sync' | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<GitHubSyncResult | null>(null)

  const configuredNames = useMemo(
    () => new Set(repos.map((repo) => repo.fullName)),
    [repos],
  )
  const enabledCount = repos.filter((repo) => repo.enabled).length

  async function load(): Promise<void> {
    setBusy('load')
    setStatus('loading')
    setError(null)
    try {
      const api = await createGitHubApi(transport)
      const [nextAccount, nextRepos, nextPolicy] = await Promise.all([
        api.getStatus(),
        api.listRepos(),
        api.getPolicy(),
      ])
      setAccount(nextAccount)
      setRepos(nextRepos)
      setPolicy(nextPolicy)
      setStatus('ready')
    } catch (err) {
      if (err instanceof CapabilityUnavailableError) {
        setStatus('unavailable')
      } else {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'github sync load failed')
      }
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void load()
  }, [transport])

  function addRepo(fullName: string): void {
    const normalized = fullName.trim()
    if (!/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
      toast.warning('owner/repo 형식으로 입력하세요.')
      return
    }
    setRepos((prev) =>
      prev.some((repo) => repo.fullName === normalized)
        ? prev
        : [...prev, makeRepo(normalized)],
    )
    setRepoInput('')
  }

  async function saveRepos(): Promise<void> {
    setBusy('repos')
    try {
      const api = await createGitHubApi(transport)
      setRepos(await api.setRepos(repos))
      toast.success('GitHub sync repository 목록을 저장했습니다.')
    } catch (err) {
      toast.error('GitHub sync repository 저장에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusy(null)
    }
  }

  async function savePolicy(): Promise<void> {
    setBusy('policy')
    try {
      const api = await createGitHubApi(transport)
      const next = {
        ...policy,
        intervalMin: Math.max(1, Number.isFinite(policy.intervalMin) ? policy.intervalMin : 1),
      }
      setPolicy(await api.setPolicy(next))
      toast.success('GitHub sync policy를 저장했습니다.')
    } catch (err) {
      toast.error('GitHub sync policy 저장에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusy(null)
    }
  }

  async function discover(): Promise<void> {
    setBusy('discover')
    try {
      const api = await createGitHubApi(transport)
      const list = await api.discoverRepos()
      setDiscovered(list)
      toast.success('GitHub repository 목록을 가져왔습니다.', {
        description: `${list.length} repositories`,
      })
    } catch (err) {
      toast.error('GitHub repository 조회에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'discover failed',
      })
    } finally {
      setBusy(null)
    }
  }

  async function syncNow(): Promise<void> {
    if (enabledCount === 0) {
      toast.warning('동기화할 repository를 하나 이상 켜세요.')
      return
    }
    setBusy('sync')
    try {
      const api = await createGitHubApi(transport)
      const result = await api.syncNow()
      setLastResult(result)
      setRepos(result.repos)
      toast.success('GitHub sync를 실행했습니다.', {
        description: `${result.succeeded}/${result.total} 성공`,
      })
    } catch (err) {
      toast.error('GitHub sync 실행에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'sync failed',
      })
    } finally {
      setBusy(null)
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="GitHub Sync" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <Github className="h-4 w-4" />
            {account?.connected ? `@${account.login ?? 'GitHub'}` : 'GitHub 미연결'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {account?.connected
              ? `${enabledCount}/${repos.length} repos enabled`
              : 'GitHub OAuth 또는 token 연결 후 repository 조회와 sync를 실행할 수 있습니다.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy != null}>
            {busy === 'load' ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />}
            새로고침
          </Button>
          <Button size="sm" onClick={() => void syncNow()} disabled={busy != null || !account?.connected}>
            {busy === 'sync' ? '동기화 중...' : '지금 동기화'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Sync Policy</h4>
          <p className="text-xs text-muted-foreground">
            GitHub 동기화 주기와 저장할 리소스를 조정합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Interval (minutes)</label>
            <Input
              type="number"
              min={1}
              value={policy.intervalMin}
              onChange={(event) =>
                setPolicy((prev) => ({
                  ...prev,
                  intervalMin: Math.max(1, Number.parseInt(event.target.value || '1', 10)),
                }))
              }
            />
          </div>
          <div className="space-y-2">
            {[
              ['pullRequests', 'Pull Requests'],
              ['issues', 'Issues'],
              ['releases', 'Releases'],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(policy[key as keyof SyncPolicy])}
                  onChange={(event) =>
                    setPolicy((prev) => ({
                      ...prev,
                      [key]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Button size="sm" onClick={() => void savePolicy()} disabled={busy != null}>
            {busy === 'policy' ? '저장 중...' : '정책 저장'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Repositories</h4>
            <p className="text-xs text-muted-foreground">
              owner/repo를 직접 추가하거나 연결된 GitHub 계정에서 가져옵니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void discover()}
            disabled={busy != null || !account?.connected}
          >
            {busy === 'discover' ? '조회 중...' : 'GitHub에서 찾기'}
          </Button>
        </div>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="owner/repo"
            className="sm:flex-1"
            aria-label="repository 직접 추가"
          />
          <Button size="sm" variant="outline" onClick={() => addRepo(repoInput)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            추가
          </Button>
        </div>

        {discovered.length > 0 ? (
          <div className="mb-3 max-h-44 space-y-1 overflow-auto rounded-md border border-border p-2">
            {discovered.slice(0, 100).map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => addRepo(repo.fullName)}
                disabled={configuredNames.has(repo.fullName)}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-default disabled:opacity-50"
              >
                <span className="truncate font-medium">{repo.fullName}</span>
                <span className="shrink-0 text-muted-foreground">{configuredNames.has(repo.fullName) ? '추가됨' : repoLabel(repo)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {repos.map((repo) => (
            <label
              key={repo.fullName}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="truncate font-medium">{repo.fullName}</span>
                <span className="block text-xs text-muted-foreground">
                  마지막 동기화:{' '}
                  {repo.lastSyncedAt
                    ? new Date(repo.lastSyncedAt).toLocaleString()
                    : '없음'}
                  {repo.lastSyncStatus === 'success'
                    ? ` · PR ${repo.pullRequests ?? 0} · Issues ${repo.issues ?? 0} · Releases ${repo.releases ?? 0}`
                    : ''}
                </span>
                {repo.lastSyncStatus === 'error' && repo.lastSyncError ? (
                  <span className="mt-1 block text-xs text-red-600">
                    {repo.lastSyncError}
                  </span>
                ) : null}
              </span>
              <input
                type="checkbox"
                checked={repo.enabled}
                onChange={(event) =>
                  setRepos((prev) =>
                    prev.map((candidate) =>
                      candidate.fullName === repo.fullName
                        ? { ...candidate, enabled: event.target.checked }
                        : candidate,
                    ),
                  )
                }
              />
            </label>
          ))}
          {repos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              동기화 대상 repo가 없습니다.
            </p>
          ) : null}
        </div>

        {lastResult ? (
          <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            마지막 실행: {lastResult.succeeded}/{lastResult.total} 성공, 실패 {lastResult.failed}
          </p>
        ) : null}

        <div className="mt-4">
          <Button size="sm" onClick={() => void saveRepos()} disabled={busy != null}>
            {busy === 'repos' ? '저장 중...' : 'Repository 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
