'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Globe2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DaemonWebSearchProviderId } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createConfigApi } from '@/lib/api/config'
import { useDirtyTracker } from '@/lib/hooks/use-dirty-tracker'
import { recordSettingsSave } from '@/lib/store/settings-save-store'
import { parseTrustedSearchDomain } from '@/lib/web-search/trusted-domains'
import {
  SETTINGS_CONTROL_CLASS,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStack,
} from './_shared/SettingsLayout'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'web-search',
  section: 'integrations',
  label: 'Web Search',
  search: [
    'web',
    'search',
    'research',
    'trusted',
    'domain',
    'source',
    '웹',
    '검색',
    '리서치',
    '신뢰',
    '도메인',
    '출처',
  ],
  render: () => <WebSearchSettingsTab />,
})

type LoadStatus = 'loading' | 'ready' | 'error'

type SearchBackend = {
  provider: DaemonWebSearchProviderId
  apiKey: string
  endpoint: string
}

const PROVIDER_OPTIONS: Array<{ id: DaemonWebSearchProviderId; label: string; hint: string }> = [
  { id: 'auto', label: '자동', hint: '환경변수에 키가 있으면 그 제공자, 없으면 DuckDuckGo' },
  { id: 'duckduckgo', label: 'DuckDuckGo (키 없음)', hint: '키가 필요 없지만 자동 질의를 자주 차단당합니다' },
  { id: 'brave', label: 'Brave Search', hint: 'API 키 필요 (BRAVE_SEARCH_API_KEY)' },
  { id: 'tavily', label: 'Tavily', hint: 'API 키 필요 (TAVILY_API_KEY)' },
  { id: 'searxng', label: 'SearXNG (자체 호스팅)', hint: '인스턴스 URL 필요 (SEARXNG_URL)' },
  { id: 'ai-search', label: 'AI Search (구조화 검색)', hint: 'POST /v1/search 호환 URL 필요 (AI_SEARCH_URL)' },
]

const EMPTY_BACKEND: SearchBackend = { provider: 'auto', apiKey: '', endpoint: '' }

function sameDomains(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((domain, index) => domain === right[index])
}

function sameBackend(left: SearchBackend, right: SearchBackend): boolean {
  return left.provider === right.provider
    && left.apiKey === right.apiKey
    && left.endpoint === right.endpoint
}

export function WebSearchSettingsTab() {
  const transport = useTransport()
  const [domains, setDomains] = useState<string[]>([])
  const [savedDomains, setSavedDomains] = useState<string[] | null>(null)
  const [backend, setBackend] = useState<SearchBackend>(EMPTY_BACKEND)
  const [savedBackend, setSavedBackend] = useState<SearchBackend | null>(null)
  const [draft, setDraft] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useDirtyTracker(
    'web-search',
    useMemo(() => ({ domains, backend }), [domains, backend]),
    useMemo(
      () => (savedDomains === null || savedBackend === null
        ? null
        : { domains: savedDomains, backend: savedBackend }),
      [savedDomains, savedBackend],
    ),
  )

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setStatus('loading')
      setLoadError(null)
      try {
        const api = await createConfigApi(transport)
        const config = await api.get()
        if (cancelled) return
        const next = [...(config.webSearch?.trustedDomains ?? [])]
        const nextBackend: SearchBackend = {
          provider: config.webSearch?.provider ?? 'auto',
          apiKey: config.webSearch?.apiKey ?? '',
          endpoint: config.webSearch?.endpoint ?? '',
        }
        setDomains(next)
        setSavedDomains(next)
        setBackend(nextBackend)
        setSavedBackend(nextBackend)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.')
        setStatus('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [transport, reloadKey])

  const dirty = useMemo(
    () =>
      (savedDomains !== null && !sameDomains(domains, savedDomains))
      || (savedBackend !== null && !sameBackend(backend, savedBackend)),
    [domains, savedDomains, backend, savedBackend],
  )

  function addDomain(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const parsed = parseTrustedSearchDomain(draft)
    if (!parsed.ok) {
      setValidationError(parsed.message)
      return
    }
    if (domains.includes(parsed.domain)) {
      setValidationError('이미 등록된 도메인입니다.')
      return
    }
    setDomains((current) => [...current, parsed.domain])
    setDraft('')
    setValidationError(null)
  }

  function removeDomain(domain: string): void {
    setDomains((current) => current.filter((candidate) => candidate !== domain))
    setValidationError(null)
  }

  async function save(): Promise<void> {
    if (!dirty || saving) return
    setSaving(true)
    try {
      const api = await createConfigApi(transport)
      await api.update({
        'webSearch.trustedDomains': domains,
        'webSearch.provider': {
          provider: backend.provider,
          apiKey: backend.apiKey.trim() || undefined,
          endpoint: backend.endpoint.trim(),
        },
      })
      setSavedDomains([...domains])
      setSavedBackend({ ...backend })
      recordSettingsSave('web-search')
      toast.success('Web Search 설정을 저장했습니다.')
    } catch (error) {
      toast.error('Web Search 설정을 저장하지 못했습니다.', {
        description: error instanceof Error ? error.message : 'save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <p role="status" className="text-xs text-muted-foreground">Web Search 설정을 불러오는 중…</p>
  }

  if (status === 'error') {
    return (
      <SettingsSection>
        <SettingsSectionHeader
          title="Web Search 설정을 불러오지 못했습니다"
          description={loadError}
          action={(
            <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              다시 시도
            </Button>
          )}
        />
      </SettingsSection>
    )
  }

  const restricted = domains.length > 0

  const selectedProvider = PROVIDER_OPTIONS.find((option) => option.id === backend.provider)
  const needsApiKey = backend.provider === 'brave'
    || backend.provider === 'tavily'
    || backend.provider === 'ai-search'
  const needsEndpoint = backend.provider === 'searxng' || backend.provider === 'ai-search'

  return (
    <SettingsStack>
      <SettingsSection>
        <SettingsSectionHeader
          title="검색 백엔드"
          description="web.search가 실제로 질의할 검색 제공자입니다."
        />

        <div className="space-y-2">
          <label htmlFor="web-search-provider" className="text-[11px] font-medium text-muted-foreground">
            제공자
          </label>
          <select
            id="web-search-provider"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={backend.provider}
            onChange={(event) => setBackend((current) => ({
              ...current,
              provider: event.target.value as DaemonWebSearchProviderId,
            }))}
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <p className="text-[11px] leading-4 text-muted-foreground">{selectedProvider?.hint}</p>

          {needsApiKey ? (
            <div>
              <label htmlFor="web-search-api-key" className="text-[11px] font-medium text-muted-foreground">
                API 키
              </label>
              <Input
                id="web-search-api-key"
                type="password"
                value={backend.apiKey}
                onChange={(event) => setBackend((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder="비워두면 데몬 환경변수의 키를 사용합니다"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={SETTINGS_CONTROL_CLASS}
              />
            </div>
          ) : null}

          {needsEndpoint ? (
            <div>
              <label htmlFor="web-search-endpoint" className="text-[11px] font-medium text-muted-foreground">
                인스턴스 URL
              </label>
              <Input
                id="web-search-endpoint"
                value={backend.endpoint}
                onChange={(event) => setBackend((current) => ({ ...current, endpoint: event.target.value }))}
                placeholder="예: http://127.0.0.1:8080"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={SETTINGS_CONTROL_CLASS}
              />
            </div>
          ) : null}

          <p className="text-[11px] leading-4 text-muted-foreground">
            제공자를 지정하면 실패 시 DuckDuckGo로 조용히 되돌아가지 않습니다. 잘못된 키는
            &quot;검색 결과 없음&quot;이 아니라 오류로 보고됩니다.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title="검색 출처 경계"
          description="에이전트의 web.search 결과를 허용할 신뢰 도메인으로 제한합니다."
          action={(
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {restricted ? `${domains.length}개 허용` : '전체 웹'}
            </span>
          )}
        />

        <div
          role="status"
          className={
            'mb-2.5 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-4 ' +
            (restricted
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200')
          }
        >
          {restricted
            ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            <strong className="font-semibold">
              {restricted ? '등록 도메인으로 검색 제한' : '전체 웹 검색'}
            </strong>
            <span className="block text-muted-foreground">
              {restricted
                ? '검색 결과 URL을 서버에서 다시 검사합니다. 루트 도메인은 모든 하위 도메인을 포함합니다.'
                : '도메인을 하나 이상 등록하면 저장 즉시 제한 모드로 전환됩니다.'}
            </span>
          </span>
        </div>

        <form className="flex min-w-0 gap-1.5" onSubmit={addDomain}>
          <div className="min-w-0 flex-1">
            <label htmlFor="web-search-domain" className="sr-only">신뢰 도메인</label>
            <Input
              id="web-search-domain"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                if (validationError) setValidationError(null)
              }}
              placeholder="예: docs.example.com 또는 https://example.com/docs"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={SETTINGS_CONTROL_CLASS}
              aria-describedby={validationError ? 'web-search-domain-error' : 'web-search-domain-help'}
              aria-invalid={Boolean(validationError)}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 px-2.5 text-xs"
            disabled={!draft.trim()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            추가
          </Button>
        </form>
        {validationError ? (
          <p id="web-search-domain-error" role="alert" className="mt-1 text-[11px] text-red-500">
            {validationError}
          </p>
        ) : (
          <p id="web-search-domain-help" className="mt-1 text-[11px] leading-4 text-muted-foreground">
            URL을 붙여 넣어도 호스트명만 저장합니다. IP·localhost·포트·와일드카드는 허용하지 않습니다.
          </p>
        )}

        <div
          data-testid="trusted-domain-list"
          className="mt-2 max-h-60 space-y-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]"
        >
          {domains.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-2.5 py-3 text-center text-[11px] text-muted-foreground">
              등록된 도메인이 없습니다. 현재 검색 범위는 전체 웹입니다.
            </div>
          ) : (
            domains.map((domain) => (
              <div
                key={domain}
                className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-muted/20 px-2"
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <code className="min-w-0 flex-1 truncate text-[11px]">{domain}</code>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                  aria-label={`${domain} 삭제`}
                  onClick={() => removeDomain(domain)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
          <p className="text-[11px] leading-4 text-muted-foreground">
            이 설정은 Web Search 결과에 적용되며 직접 URL 열기 정책과는 별개입니다.
          </p>
          <Button
            size="sm"
            className="h-8 shrink-0 px-3 text-xs"
            disabled={!dirty || saving}
            aria-busy={saving}
            onClick={() => void save()}
          >
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </SettingsSection>
    </SettingsStack>
  )
}
