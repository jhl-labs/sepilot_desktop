import React, { useCallback, useEffect, useState } from 'react'
import type {
  DaemonSkill,
  InstallSkillPreviewResponse,
  MarketplaceSkillSearchResult,
} from '@sepilotd/api-client'
import { useLocale } from './useLocale'

const SKILLS_COPY = {
  en: {
    kicker: 'Installed Capabilities',
    title: 'Skills',
    loadedSuffix: (n: number) => `${n} loaded`,
    summary: 'Browse installed daemon skills or search installable skills from configured catalog sources.',
    viewAria: 'Skills view',
    installedTab: 'Installed',
    catalogTab: 'Catalog',
    catalogSearchPlaceholder: 'Search catalog sources...',
    skillsSearchPlaceholder: 'Search skills...',
    searchAria: 'Search skills',
    searching: 'Searching...',
    searchCatalog: 'Search Catalog',
    catalogFailed: 'Catalog search failed.',
    installFailed: 'Skill install failed.',
    noneInstalled: 'No skills installed',
    addHint: 'Add skills to ~/.sepilotd/skills/',
    noMatches: 'No matching catalog skills',
    searchHint: 'Search configured skill sources',
    searchPrompt: 'Type a query and press Enter to find installable skills from configured sources.',
    sourcePrefix: 'source:',
    installed: 'Installed',
    installing: 'Installing...',
    install: 'Review',
    reviewTitle: 'Review skill access',
    acknowledge: 'I have reviewed these skills and their declared permissions.',
    confirmInstall: 'Install reviewed digest',
    cancel: 'Cancel',
    emptyPreview: 'No installable skills were found.',
  },
  ko: {
    kicker: '설치된 기능',
    title: '스킬',
    loadedSuffix: (n: number) => `${n}개 로드됨`,
    summary: '설치된 daemon 스킬을 살펴보거나 구성된 카탈로그 소스에서 설치 가능한 스킬을 검색합니다.',
    viewAria: '스킬 보기',
    installedTab: '설치됨',
    catalogTab: '카탈로그',
    catalogSearchPlaceholder: '카탈로그 소스 검색...',
    skillsSearchPlaceholder: '스킬 검색...',
    searchAria: '스킬 검색',
    searching: '검색 중...',
    searchCatalog: '카탈로그 검색',
    catalogFailed: '카탈로그 검색에 실패했습니다.',
    installFailed: '스킬 설치에 실패했습니다.',
    noneInstalled: '설치된 스킬 없음',
    addHint: '~/.sepilotd/skills/ 경로에 스킬을 추가하세요',
    noMatches: '일치하는 카탈로그 스킬 없음',
    searchHint: '구성된 스킬 소스 검색',
    searchPrompt: '쿼리를 입력하고 Enter를 눌러 구성된 소스에서 설치 가능한 스킬을 찾으세요.',
    sourcePrefix: '소스:',
    installed: '설치됨',
    installing: '설치 중...',
    install: '검토',
    reviewTitle: '스킬 접근 권한 검토',
    acknowledge: '스킬과 선언된 권한을 확인했습니다.',
    confirmInstall: '검토한 스킬 설치',
    cancel: '취소',
    emptyPreview: '설치 가능한 스킬이 없습니다.',
  },
} as const

export function Skills() {
  const { locale } = useLocale()
  const copy = SKILLS_COPY[locale] ?? SKILLS_COPY.en
  const [skills, setSkills] = useState<DaemonSkill[]>([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'installed' | 'store'>('installed')
  const [storeResults, setStoreResults] = useState<MarketplaceSkillSearchResult[]>([])
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [storeSearchedQuery, setStoreSearchedQuery] = useState('')
  const [installingSource, setInstallingSource] = useState<string | null>(null)
  const [review, setReview] = useState<{ source: string; preview: InstallSkillPreviewResponse } | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  const loadInstalledSkills = useCallback(() => {
    const query = search.trim()
    const request = query
      ? window.sepilot.skillSearch(query)
      : window.sepilot.skills()
    request.then(setSkills).catch(() => {})
  }, [search])

  useEffect(() => {
    if (viewMode === 'installed') {
      loadInstalledSkills()
    }
  }, [loadInstalledSkills, viewMode])

  async function searchStore() {
    const query = search.trim()
    if (!query) return
    setStoreLoading(true)
    setStoreError(null)
    try {
      const results = await window.sepilot.skillMarketplaceSearch(query, { limit: 20 })
      setStoreResults(results)
      setStoreSearchedQuery(query)
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : copy.catalogFailed)
    } finally {
      setStoreLoading(false)
    }
  }

  async function previewStoreSkill(source: string) {
    setInstallingSource(source)
    setStoreError(null)
    setReview(null)
    setAcknowledged(false)
    try {
      const preview = await window.sepilot.skillInstallPreview(source)
      if (!preview.digest || preview.candidates.length === 0) {
        throw new Error(copy.emptyPreview)
      }
      setReview({ source, preview })
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : copy.installFailed)
    } finally {
      setInstallingSource(null)
    }
  }

  async function installStoreSkill() {
    if (!review || !acknowledged || installingSource) return
    const { source, preview } = review
    setInstallingSource(source)
    setStoreError(null)
    try {
      await window.sepilot.skillInstall(source, { expectedDigest: preview.digest })
      setReview(null)
      setStoreResults((results) =>
        results.map((result) =>
          result.source === source ? { ...result, installed: true } : result,
        ),
      )
      loadInstalledSkills()
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : copy.installFailed)
    } finally {
      setInstallingSource(null)
    }
  }

  return (
    <div className="page surface-page">
      <div className="support-header">
        <div className="support-header-copy">
          <span className="surface-page-kicker">{copy.kicker}</span>
          <div className="support-header-title-row">
            <h2 className="page-title" style={{ marginBottom: 0 }}>
              {copy.title}
            </h2>
            <span className="tag">{copy.loadedSuffix(skills.length)}</span>
          </div>
          <p className="support-header-summary">
            {copy.summary}
          </p>
        </div>
        <div className="skills-header-actions">
          <div className="skills-view-toggle" role="tablist" aria-label={copy.viewAria}>
            <button
              type="button"
              className={viewMode === 'installed' ? 'active' : ''}
              onClick={() => setViewMode('installed')}
              role="tab"
              aria-selected={viewMode === 'installed'}
            >
              {copy.installedTab}
            </button>
            <button
              type="button"
              className={viewMode === 'store' ? 'active' : ''}
              onClick={() => setViewMode('store')}
              role="tab"
              aria-selected={viewMode === 'store'}
            >
              {copy.catalogTab}
            </button>
          </div>
          <input
            className="input skills-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && viewMode === 'store') {
                void searchStore()
              }
            }}
            placeholder={viewMode === 'store' ? copy.catalogSearchPlaceholder : copy.skillsSearchPlaceholder}
            aria-label={copy.searchAria}
          />
          {viewMode === 'store' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void searchStore()}
              disabled={storeLoading || !search.trim()}
            >
              {storeLoading ? copy.searching : copy.searchCatalog}
            </button>
          ) : null}
        </div>
      </div>

      {viewMode === 'installed' && skills.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title" style={{ fontSize: 'var(--text-lg)' }}>
            {copy.noneInstalled}
          </div>
          <p className="empty-state-text">
            {copy.addHint}
          </p>
        </div>
      )}

      {viewMode === 'store' && storeError ? (
        <div className="empty-state">
          <p className="empty-state-text">{storeError}</p>
        </div>
      ) : null}

      {viewMode === 'store' && storeResults.length === 0 && !storeLoading ? (
        <div className="empty-state">
          <div className="empty-state-title" style={{ fontSize: 'var(--text-lg)' }}>
            {storeSearchedQuery ? copy.noMatches : copy.searchHint}
          </div>
          <p className="empty-state-text">
            {copy.searchPrompt}
          </p>
        </div>
      ) : null}

      {review ? (
        <section className="card" role="dialog" aria-label={copy.reviewTitle}>
          <h3>{copy.reviewTitle}</h3>
          {review.preview.candidates.map(({ metadata }, index) => (
            <article key={`${metadata.name}:${index}`}>
              <strong>{metadata.name}</strong>
              <p>{metadata.description}</p>
              <ul>
                {Object.entries(metadata.permissions ?? {}).flatMap(([kind, values]) =>
                  (values ?? []).map((value: string) => <li key={`${kind}:${value}`}>{kind}: <span>{value}</span></li>),
                )}
              </ul>
            </article>
          ))}
          <label>
            <input type="checkbox" checked={acknowledged} disabled={installingSource !== null}
              onChange={(event) => setAcknowledged(event.target.checked)} />
            {copy.acknowledge}
          </label>
          <button type="button" className="btn btn-primary"
            disabled={!acknowledged || installingSource !== null}
            onClick={() => void installStoreSkill()}>{copy.confirmInstall}</button>
          <button type="button" className="btn btn-secondary" disabled={installingSource !== null}
            onClick={() => { setReview(null); setAcknowledged(false) }}>{copy.cancel}</button>
        </section>
      ) : null}

      <div className="skills-shell">
        {viewMode === 'installed' ? skills.map((s) => (
          <article key={s.id} className="card skills-card">
            <div className="skills-card-head">
              <div className="skills-card-copy">
                <strong>{s.name}</strong>
                <span>{s.description}</span>
              </div>
              <span className="font-mono text-muted skills-card-version">
                v{s.version}
              </span>
            </div>

            <div className="skills-card-tools">
              {s.tools.map((t) => (
                <span key={t} className="tag tag-blue">
                  {t}
                </span>
              ))}
              {s.tags?.map((t) => (
                <span key={t} className="tag tag-green">
                  #{t}
                </span>
              ))}
            </div>
          </article>
        )) : null}
        {viewMode === 'store' ? storeResults.map((result) => {
          const metadata = result.metadata
          const isInstalling = installingSource === result.source
          return (
            <article key={`${result.marketplace}:${result.source}`} className="card skills-card">
              <div className="skills-card-head">
                <div className="skills-card-copy">
                  <strong>{metadata.name}</strong>
                  <span>{metadata.description}</span>
                </div>
                <div className="skills-card-store-actions">
                  {metadata.version ? (
                    <span className="font-mono text-muted skills-card-version">
                      v{metadata.version}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void previewStoreSkill(result.source)}
                    disabled={result.installed || installingSource !== null || review !== null}
                  >
                    {result.installed
                      ? copy.installed
                      : isInstalling
                        ? copy.installing
                        : copy.install}
                  </button>
                </div>
              </div>

              <div className="skills-card-tools">
                <span className="tag">{copy.sourcePrefix} {result.marketplace}</span>
                {metadata.tools?.map((t) => (
                  <span key={t} className="tag tag-blue">
                    {t}
                  </span>
                ))}
                {metadata.tags?.map((t) => (
                  <span key={t} className="tag tag-green">
                    #{t}
                  </span>
                ))}
              </div>
              <p className="skills-card-source">{result.source}</p>
            </article>
          )
        }) : null}
      </div>
    </div>
  )
}
