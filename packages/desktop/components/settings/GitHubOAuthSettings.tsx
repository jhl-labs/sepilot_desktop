'use client'
import { useCallback, useEffect, useState } from 'react'
import { Github, LoaderCircle, RefreshCcw, Unlink } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  CapabilityUnavailableError,
  createGitHubApi,
  type OAuthStatus,
} from '@/lib/api/github'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

registerSettingsTab({
  key: 'github-oauth',
  section: 'integrations',
  label: 'GitHub OAuth',
  search: ['github', 'oauth'],
  buildFeature: 'github-oauth',
  render: () => <GitHubOAuthSettings />,
})

export function GitHubOAuthSettings() {
  const transport = useTransport()
  const [status, setStatus] = useState<OAuthStatus | null>(null)
  const [view, setView] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'oauth' | 'token' | 'disconnect' | 'refresh' | null>(null)
  const [token, setToken] = useState('')

  const refresh = useCallback(async (kind: typeof busy = null): Promise<void> => {
    if (kind) setBusy(kind)
    setView((current) => (current === 'ready' ? current : 'loading'))
    setError(null)
    try {
      const api = await createGitHubApi(transport)
      setStatus(await api.getStatus())
      setView('ready')
    } catch (err) {
      if (err instanceof CapabilityUnavailableError) {
        setView('unavailable')
      } else {
        setError(err instanceof Error ? err.message : 'GitHub status load failed')
        setView('error')
      }
    } finally {
      if (kind) setBusy(null)
    }
  }, [transport])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function start(): Promise<void> {
    setBusy('oauth')
    try {
      const api = await createGitHubApi(transport)
      const { url } = await api.startOAuth()
      if (!url) throw new Error('GitHub OAuth URL was not returned.')
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener')
      }
      toast.info('브라우저에서 GitHub 인증을 완료하세요.')
      const deadline = Date.now() + 120_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500))
        const next = await api.getStatus()
        setStatus(next)
        if (next.connected) {
          toast.success('GitHub 계정을 연결했습니다.')
          return
        }
      }
      toast.info('인증 완료 후 상태 새로고침을 눌러 확인하세요.')
    } catch (err) {
      toast.error('GitHub OAuth를 시작하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'oauth failed',
      })
    } finally {
      setBusy(null)
    }
  }

  async function connectWithToken(): Promise<void> {
    if (!token.trim()) {
      toast.warning('GitHub token을 입력하세요.')
      return
    }
    setBusy('token')
    try {
      const api = await createGitHubApi(transport)
      const next = await api.connectToken(token)
      setStatus(next)
      setToken('')
      toast.success('GitHub token으로 계정을 연결했습니다.')
    } catch (err) {
      toast.error('GitHub token 연결에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'token connect failed',
      })
    } finally {
      setBusy(null)
    }
  }

  async function disconnectAccount(): Promise<void> {
    const ok = await confirm('저장된 GitHub 연결 정보를 삭제하시겠습니까?', { destructive: true })
    if (!ok) return
    setBusy('disconnect')
    try {
      const api = await createGitHubApi(transport)
      setStatus(await api.disconnect())
      toast.success('GitHub 연결을 해제했습니다.')
    } catch (err) {
      toast.error('GitHub 연결 해제에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'disconnect failed',
      })
    } finally {
      setBusy(null)
    }
  }

  if (view === 'unavailable')
    return <UnimplementedBanner what="GitHub OAuth" />
  if (view === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중...</p>
  if (view === 'error')
    return <p className="text-sm text-red-500">{error}</p>

  const connected = Boolean(status?.connected)
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Github className="h-4 w-4" />
              GitHub Account
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {connected ? `@${status?.login ?? 'GitHub'} 연결됨` : '미연결'}
            </div>
            {status?.lastError ? (
              <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-600">
                {status.lastError}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => void refresh('refresh')}
              disabled={busy != null}
              aria-label="GitHub 상태 새로고침"
            >
              {busy === 'refresh'
                ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCcw className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              onClick={() => void start()}
              disabled={busy != null || !status?.configured}
            >
              {busy === 'oauth' ? '대기 중...' : connected ? 'OAuth 재연결' : 'OAuth 연결'}
            </Button>
            {connected ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void disconnectAccount()}
                disabled={busy != null}
              >
                <Unlink className="mr-1 h-3.5 w-3.5" />
                해제
              </Button>
            ) : null}
          </div>
        </div>
        {!status?.configured ? (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            OAuth app 환경변수(GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET)가 없으면 Personal Access Token으로 연결하세요.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Personal Access Token</h4>
          <p className="text-xs text-muted-foreground">
            OAuth 설정이 없는 로컬 개발 환경에서는 repo/gist 권한이 있는 token으로 연결할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="ghp_..."
            className="sm:flex-1"
            disabled={busy != null}
            aria-label="GitHub token"
          />
          <Button
            size="sm"
            onClick={() => void connectWithToken()}
            disabled={busy != null || !token.trim()}
          >
            {busy === 'token' ? '확인 중...' : 'Token 연결'}
          </Button>
        </div>
      </div>
    </div>
  )
}
