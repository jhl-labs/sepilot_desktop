import React, { useEffect, useMemo, useState } from 'react'
import type {
  DaemonArtifact,
  DaemonSessionMeta,
} from '@sepilotd/api-client'
import { artifactLabel, artifactPreview } from '@sepilotd/presentation'
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useLocale } from './useLocale'

type GalleryLocale = 'en' | 'ko'

interface GallerySurfaceCopy {
  recentlyUpdated: string
  filterAll: string
  filterCode: string
  filterDocs: string
  filterVisual: string
  untitled: string
  clipboardUnavailable: string
  copiedToClipboard: string
  clipboardEnvUnavailable: string
  downloadedSuffix: (name: string) => string
  backToChat: string
  artifactWorkspace: string
  galleryTitle: string
  statusLoading: string
  statusReady: string
  statusEmpty: string
  headerSummary: string
  loadingArtifacts: string
  visibleArtifactsSuffix: (n: number) => string
  refresh: string
  galleryFiltersAria: string
  savedArtifacts: string
  artifactBrowser: string
  itemsSuffix: (n: number) => string
  panelCopy: string
  searchAria: string
  searchPlaceholder: string
  loadingInline: string
  noMatch: string
  preview: string
  selectAnArtifact: string
  openChat: string
  copyArtifact: string
  downloadArtifact: string
  artifactProgress: (current: number, total: number) => string
  previewShortcuts: string
  prevArtifactAria: string
  nextArtifactAria: string
  inspectCopy: string
  sessionLabel: string
  updatedLabel: string
  modelLabel: string
  artifactLabel: string
  downloadLabel: string
  selectInline: string
  autoLabel: string
  defaultLabel: string
}

const GALLERY_COPY: Record<GalleryLocale, GallerySurfaceCopy> = {
  en: {
    recentlyUpdated: 'Recently updated',
    filterAll: 'All',
    filterCode: 'Code',
    filterDocs: 'Docs',
    filterVisual: 'Visual',
    untitled: 'Untitled',
    clipboardUnavailable: 'Clipboard unavailable',
    copiedToClipboard: 'Copied artifact to clipboard.',
    clipboardEnvUnavailable: 'Clipboard is unavailable in this environment.',
    downloadedSuffix: (name) => `Downloaded ${name}.`,
    backToChat: 'Back to chat',
    artifactWorkspace: 'Artifact Workspace',
    galleryTitle: 'Gallery',
    statusLoading: 'Loading',
    statusReady: 'Ready',
    statusEmpty: 'Empty',
    headerSummary:
      'Browse saved outputs across recent sessions from a single gallery browser, then jump back into the source chat when you need revisions or follow-up runs.',
    loadingArtifacts: 'Loading artifacts...',
    visibleArtifactsSuffix: (n) => `${n} visible artifacts`,
    refresh: 'Refresh',
    galleryFiltersAria: 'Gallery filters',
    savedArtifacts: 'Saved Artifacts',
    artifactBrowser: 'Artifact browser',
    itemsSuffix: (n) => `${n} items`,
    panelCopy:
      'Filter outputs by type, search across session titles and artifact labels, and pick the exact artifact you want to inspect before jumping back into Chat.',
    searchAria: 'Search artifacts',
    searchPlaceholder: 'Search artifacts',
    loadingInline: 'Loading saved artifacts from recent sessions...',
    noMatch:
      'No matching artifacts yet. Generate structured outputs in Chat to populate this gallery.',
    preview: 'Preview',
    selectAnArtifact: 'Select an artifact',
    openChat: 'Open chat',
    copyArtifact: 'Copy artifact',
    downloadArtifact: 'Download artifact',
    artifactProgress: (current, total) => `Artifact ${current} of ${total}`,
    previewShortcuts: '↑ ↓ browse · Enter open chat · C copy',
    prevArtifactAria: 'Previous artifact',
    nextArtifactAria: 'Next artifact',
    inspectCopy:
      'Inspect the selected artifact in place, then jump back to its source session when you need edits, reruns, or follow-up generation.',
    sessionLabel: 'Session',
    updatedLabel: 'Updated',
    modelLabel: 'Model',
    artifactLabel: 'Artifact',
    downloadLabel: 'Download',
    selectInline: 'Select a saved artifact to inspect it here.',
    autoLabel: 'auto',
    defaultLabel: 'default',
  },
  ko: {
    recentlyUpdated: '최근 업데이트',
    filterAll: '전체',
    filterCode: '코드',
    filterDocs: '문서',
    filterVisual: '비주얼',
    untitled: '제목 없음',
    clipboardUnavailable: '클립보드를 사용할 수 없습니다',
    copiedToClipboard: '아티팩트를 클립보드에 복사했습니다.',
    clipboardEnvUnavailable: '이 환경에서는 클립보드를 사용할 수 없습니다.',
    downloadedSuffix: (name) => `${name}을(를) 다운로드했습니다.`,
    backToChat: '채팅으로 돌아가기',
    artifactWorkspace: '아티팩트 워크스페이스',
    galleryTitle: '갤러리',
    statusLoading: '로딩 중',
    statusReady: '준비됨',
    statusEmpty: '비어 있음',
    headerSummary:
      '최근 세션의 저장된 출력을 단일 갤러리 브라우저에서 살펴보고, 수정이나 후속 실행이 필요할 때 원본 채팅으로 다시 점프하세요.',
    loadingArtifacts: '아티팩트 로딩 중...',
    visibleArtifactsSuffix: (n) => `표시된 아티팩트 ${n}개`,
    refresh: '새로고침',
    galleryFiltersAria: '갤러리 필터',
    savedArtifacts: '저장된 아티팩트',
    artifactBrowser: '아티팩트 브라우저',
    itemsSuffix: (n) => `${n}개 항목`,
    panelCopy:
      '유형별로 출력을 필터링하고, 세션 제목과 아티팩트 라벨에서 검색하여 채팅으로 돌아가기 전에 살펴볼 아티팩트를 정확히 선택하세요.',
    searchAria: '아티팩트 검색',
    searchPlaceholder: '아티팩트 검색',
    loadingInline: '최근 세션에서 저장된 아티팩트 로딩 중...',
    noMatch:
      '일치하는 아티팩트가 아직 없습니다. 채팅에서 구조화된 출력을 생성하면 이 갤러리가 채워집니다.',
    preview: '미리보기',
    selectAnArtifact: '아티팩트를 선택하세요',
    openChat: '채팅 열기',
    copyArtifact: '아티팩트 복사',
    downloadArtifact: '아티팩트 다운로드',
    artifactProgress: (current, total) => `아티팩트 ${current} / ${total}`,
    previewShortcuts: '↑ ↓ 탐색 · Enter 채팅 열기 · C 복사',
    prevArtifactAria: '이전 아티팩트',
    nextArtifactAria: '다음 아티팩트',
    inspectCopy:
      '선택한 아티팩트를 이 자리에서 살펴보고, 편집/재실행/후속 생성이 필요할 때 원본 세션으로 다시 점프하세요.',
    sessionLabel: '세션',
    updatedLabel: '업데이트',
    modelLabel: '모델',
    artifactLabel: '아티팩트',
    downloadLabel: '다운로드',
    selectInline: '여기서 살펴보려면 저장된 아티팩트를 선택하세요.',
    autoLabel: '자동',
    defaultLabel: '기본',
  },
}

interface GallerySurfaceProps {
  sessions: DaemonSessionMeta[]
  onOpenChat: (sessionId: string) => void
  onBackToChat?: () => void
}

interface SessionArtifactBucket {
  session: DaemonSessionMeta
  artifacts: DaemonArtifact[]
}

interface GalleryArtifactCard {
  id: string
  artifact: DaemonArtifact
  session: DaemonSessionMeta
  filter: GalleryFilter
  updatedAtValue: number
}

type GalleryFilter = 'all' | 'code' | 'document' | 'visual'

const MAX_GALLERY_SESSIONS = 12

function buildFilterOptions(copy: GallerySurfaceCopy): Array<{
  key: GalleryFilter
  label: string
  icon: LucideIcon
}> {
  return [
    { key: 'all', label: copy.filterAll, icon: ImageIcon },
    { key: 'code', label: copy.filterCode, icon: FileCode2 },
    { key: 'document', label: copy.filterDocs, icon: FileText },
    { key: 'visual', label: copy.filterVisual, icon: Sparkles },
  ]
}

function formatUpdatedAt(updatedAt: string, copy: GallerySurfaceCopy): string {
  const parsed = Date.parse(updatedAt)
  if (!Number.isFinite(parsed)) {
    return copy.recentlyUpdated
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(parsed))
}

function getGalleryFilterForArtifact(artifact: DaemonArtifact): GalleryFilter {
  if (artifact.type === 'code') {
    return 'code'
  }
  if (artifact.type === 'document') {
    return 'document'
  }
  return 'visual'
}

function getGalleryFilterLabel(filter: GalleryFilter, copy: GallerySurfaceCopy): string {
  if (filter === 'code') return copy.filterCode
  if (filter === 'document') return copy.filterDocs
  if (filter === 'visual') return copy.filterVisual
  return copy.filterAll
}

function getGalleryFilterIcon(filter: GalleryFilter): LucideIcon {
  if (filter === 'code') return FileCode2
  if (filter === 'document') return FileText
  return filter === 'visual' ? Sparkles : ImageIcon
}

function getArtifactMimeType(artifact: DaemonArtifact): string {
  if (artifact.type === 'image') {
    return artifact.content.match(/^data:([^;]+);base64,/i)?.[1] ?? 'image/png'
  }

  switch (artifact.type) {
    case 'html':
      return 'text/html;charset=utf-8'
    case 'svg':
      return 'image/svg+xml;charset=utf-8'
    case 'mermaid':
      return 'text/plain;charset=utf-8'
    case 'document':
      return 'text/markdown;charset=utf-8'
    case 'code':
    default:
      return 'text/plain;charset=utf-8'
  }
}

function getArtifactExtension(artifact: DaemonArtifact): string {
  if (artifact.type === 'code') {
    if (artifact.language === 'typescript') return 'ts'
    if (artifact.language === 'javascript') return 'js'
    if (artifact.language === 'python') return 'py'
    if (artifact.language === 'json') return 'json'
    if (artifact.language) return artifact.language
    return 'txt'
  }
  if (artifact.type === 'html') return 'html'
  if (artifact.type === 'svg') return 'svg'
  if (artifact.type === 'image') {
    const mime = getArtifactMimeType(artifact)
    if (mime === 'image/jpeg') return 'jpg'
    if (mime === 'image/gif') return 'gif'
    if (mime === 'image/webp') return 'webp'
    if (mime === 'image/avif') return 'avif'
    if (mime === 'image/bmp') return 'bmp'
    return 'png'
  }
  if (artifact.type === 'mermaid') return 'mmd'
  if (artifact.type === 'document') return 'md'
  return 'txt'
}

function sanitizeFileStem(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'artifact'
}

function getArtifactDownloadName(artifact: DaemonArtifact): string {
  const stem = sanitizeFileStem(artifact.title || artifactLabel(artifact))
  return `${stem}.${getArtifactExtension(artifact)}`
}

function copyArtifactContent(content: string, errorMessage: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error(errorMessage))
  }
  return navigator.clipboard.writeText(content)
}

function downloadArtifact(artifact: DaemonArtifact) {
  if (artifact.type === 'image' && artifact.content.startsWith('data:')) {
    const anchor = document.createElement('a')
    anchor.href = artifact.content
    anchor.download = getArtifactDownloadName(artifact)
    anchor.click()
    return
  }

  const blob = new Blob([artifact.content], { type: getArtifactMimeType(artifact) })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = getArtifactDownloadName(artifact)
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

function wrapHtmlPreview(content: string): string {
  if (/<html[\s>]/i.test(content)) {
    return content
  }

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif;">
    ${content}
  </body>
</html>`
}

function wrapSvgPreview(content: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:16px;display:grid;place-items:center;background:white;">
    ${content}
  </body>
</html>`
}

function renderArtifactBody(artifact: DaemonArtifact) {
  switch (artifact.type) {
    case 'html':
      return (
        <iframe
          title={artifactLabel(artifact)}
          sandbox=""
          srcDoc={wrapHtmlPreview(artifact.content)}
          className="gallery-preview-frame"
        />
      )
    case 'svg':
      return (
        <iframe
          title={artifactLabel(artifact)}
          sandbox=""
          srcDoc={wrapSvgPreview(artifact.content)}
          className="gallery-preview-frame"
        />
      )
    case 'image':
      return (
        <img
          src={artifact.content}
          alt={artifactLabel(artifact)}
          className="gallery-preview-image"
        />
      )
    case 'document':
      return <div className="gallery-preview-document">{artifact.content}</div>
    case 'mermaid':
    case 'code':
    default:
      return (
        <pre className="gallery-preview-pre">
          <code>{artifact.content}</code>
        </pre>
      )
  }
}

export function GallerySurface({
  sessions,
  onOpenChat,
  onBackToChat,
}: GallerySurfaceProps) {
  const { locale } = useLocale()
  const copy = GALLERY_COPY[locale] ?? GALLERY_COPY.en
  const filterOptions = useMemo(() => buildFilterOptions(copy), [copy])
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [artifactBuckets, setArtifactBuckets] = useState<SessionArtifactBucket[]>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>()
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const recentSessions = useMemo(
    () => sessions.slice(0, MAX_GALLERY_SESSIONS),
    [sessions],
  )

  useEffect(() => {
    let cancelled = false

    const loadArtifacts = async () => {
      if (recentSessions.length === 0) {
        setArtifactBuckets([])
        setSelectedArtifactId(undefined)
        setLoading(false)
        return
      }

      setLoading(true)

      const results = await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const artifacts = await window.sepilot.sessionArtifacts(session.id)
            return { session, artifacts }
          } catch {
            return { session, artifacts: [] }
          }
        }),
      )

      if (cancelled) {
        return
      }

      setArtifactBuckets(results.filter((bucket) => bucket.artifacts.length > 0))
      setLoading(false)
    }

    void loadArtifacts()

    return () => {
      cancelled = true
    }
  }, [recentSessions, reloadToken])

  const artifactCards = useMemo<GalleryArtifactCard[]>(
    () =>
      artifactBuckets
        .flatMap((bucket) =>
          bucket.artifacts.map((artifact) => ({
            id: `${bucket.session.id}:${artifact.id}`,
            artifact,
            session: bucket.session,
            filter: getGalleryFilterForArtifact(artifact),
            updatedAtValue: Date.parse(bucket.session.updatedAt) || 0,
          })),
        )
        .sort((left, right) => right.updatedAtValue - left.updatedAtValue),
    [artifactBuckets],
  )

  const filteredArtifactCards = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return artifactCards.filter((item) => {
      if (filter !== 'all' && item.filter !== filter) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        artifactLabel(item.artifact),
        item.artifact.type,
        item.artifact.language || '',
        item.session.title || copy.untitled,
        item.session.provider || copy.autoLabel,
        item.session.model || copy.defaultLabel,
        artifactPreview(item.artifact, 220),
      ].join(' ').toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [artifactCards, copy.autoLabel, copy.defaultLabel, copy.untitled, filter, searchQuery])

  useEffect(() => {
    const nextSelectedId = filteredArtifactCards[0]?.id
    if (!nextSelectedId) {
      setSelectedArtifactId(undefined)
      return
    }

    setSelectedArtifactId((current) =>
      current && filteredArtifactCards.some((item) => item.id === current)
        ? current
        : nextSelectedId,
    )
  }, [filteredArtifactCards])

  useEffect(() => {
    setActionStatus(null)
  }, [selectedArtifactId])

  const selectedArtifactCard = useMemo(
    () =>
      filteredArtifactCards.find((item) => item.id === selectedArtifactId)
      ?? filteredArtifactCards[0]
      ?? null,
    [filteredArtifactCards, selectedArtifactId],
  )

  const selectedArtifactIndex = selectedArtifactCard
    ? filteredArtifactCards.findIndex((item) => item.id === selectedArtifactCard.id)
    : -1

  const totalArtifacts = artifactCards.length
  const filterCounts = useMemo(
    () => ({
      all: totalArtifacts,
      code: artifactCards.filter((item) => item.filter === 'code').length,
      document: artifactCards.filter((item) => item.filter === 'document').length,
      visual: artifactCards.filter((item) => item.filter === 'visual').length,
    }),
    [artifactCards, totalArtifacts],
  )

  const handleCopySelectedArtifact = React.useCallback(async () => {
    if (!selectedArtifactCard) {
      return
    }

    try {
      await copyArtifactContent(selectedArtifactCard.artifact.content, copy.clipboardUnavailable)
      setActionStatus(copy.copiedToClipboard)
    } catch {
      setActionStatus(copy.clipboardEnvUnavailable)
    }
  }, [
    copy.clipboardEnvUnavailable,
    copy.clipboardUnavailable,
    copy.copiedToClipboard,
    selectedArtifactCard,
  ])

  const handleDownloadSelectedArtifact = () => {
    if (!selectedArtifactCard) {
      return
    }

    downloadArtifact(selectedArtifactCard.artifact)
    setActionStatus(copy.downloadedSuffix(getArtifactDownloadName(selectedArtifactCard.artifact)))
  }

  const selectArtifactByOffset = React.useCallback((offset: -1 | 1) => {
    if (filteredArtifactCards.length === 0) {
      return
    }

    const startIndex = selectedArtifactIndex >= 0 ? selectedArtifactIndex : 0
    const nextIndex = (startIndex + offset + filteredArtifactCards.length) % filteredArtifactCards.length
    setSelectedArtifactId(filteredArtifactCards[nextIndex]?.id)
  }, [filteredArtifactCards, selectedArtifactIndex])

  useEffect(() => {
    if (!selectedArtifactCard) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingTarget = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable
      if (isTypingTarget) {
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault()
        selectArtifactByOffset(1)
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault()
        selectArtifactByOffset(-1)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        onOpenChat(selectedArtifactCard.session.id)
        return
      }

      if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        void handleCopySelectedArtifact()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCopySelectedArtifact, onOpenChat, selectArtifactByOffset, selectedArtifactCard])

  return (
    <div className="page surface-page">
      <div className="gallery-header">
        <div className="gallery-header-copy">
          <div className="gallery-header-title-row">
            {onBackToChat ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={onBackToChat}
              >
                {copy.backToChat}
              </button>
            ) : null}
            <div>
              <span className="surface-page-kicker">{copy.artifactWorkspace}</span>
              <div className="surface-page-title-row">
                <h2 className="page-title" style={{ marginBottom: 0 }}>
                  {copy.galleryTitle}
                </h2>
                <span className={`tag ${artifactCards.length > 0 ? 'tag-blue' : 'tag-yellow'}`}>
                  {loading ? copy.statusLoading : artifactCards.length > 0 ? copy.statusReady : copy.statusEmpty}
                </span>
              </div>
            </div>
          </div>
          <p className="gallery-header-summary">
            {copy.headerSummary}
          </p>
        </div>

        <div className="gallery-header-meta">
          <span className="gallery-header-count">
            {loading ? copy.loadingArtifacts : copy.visibleArtifactsSuffix(filteredArtifactCards.length)}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={loading}
          >
            {copy.refresh}
          </button>
        </div>
      </div>

      <div className="gallery-filter-row" role="tablist" aria-label={copy.galleryFiltersAria}>
        {filterOptions.map((option) => {
          const OptionIcon = option.icon
          return (
            <button
              key={option.key}
              type="button"
              className={`gallery-filter-button ${filter === option.key ? 'active' : ''}`}
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
            >
              <OptionIcon className="shell-icon" />
              <span>{option.label}</span>
              <span className="gallery-filter-count">{filterCounts[option.key]}</span>
            </button>
          )
        })}
      </div>

      <div className="gallery-shell">
        <section className="card surface-panel gallery-browser-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.savedArtifacts}</div>
              <h3 className="surface-panel-title">{copy.artifactBrowser}</h3>
            </div>
            <span className="tag">{copy.itemsSuffix(filteredArtifactCards.length)}</span>
          </div>

          <p className="surface-panel-copy">
            {copy.panelCopy}
          </p>

          <label className="gallery-search" aria-label={copy.searchAria}>
            <Search className="shell-icon" />
            <input
              className="gallery-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchAria}
            />
          </label>

          {loading ? (
            <div className="surface-empty-inline">{copy.loadingInline}</div>
          ) : filteredArtifactCards.length === 0 ? (
            <div className="surface-empty-inline">
              {copy.noMatch}
            </div>
          ) : (
            <div className="gallery-artifact-list" role="list">
              {filteredArtifactCards.map((item) => {
                const active = item.id === selectedArtifactCard?.id
                const ArtifactIcon = getGalleryFilterIcon(item.filter)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className={`surface-list-card gallery-artifact-card ${active ? 'active' : ''}`}
                    onClick={() => setSelectedArtifactId(item.id)}
                  >
                    <div className="gallery-artifact-card-head">
                      <div className="gallery-artifact-card-title">
                        <span className={`gallery-artifact-icon-shell ${item.filter}`} aria-hidden="true">
                          <ArtifactIcon className="shell-icon" />
                        </span>
                        <div className="gallery-artifact-card-copy">
                          <strong>{artifactLabel(item.artifact)}</strong>
                          <span className="gallery-artifact-session">
                            {item.session.title || copy.untitled}
                          </span>
                        </div>
                      </div>
                      <span className="gallery-artifact-type">{getGalleryFilterLabel(item.filter, copy)}</span>
                    </div>
                    <span className="gallery-artifact-snippet">
                      {artifactPreview(item.artifact, 150)}
                    </span>
                    <span className="gallery-artifact-runtime">
                      <span>{item.session.provider || copy.autoLabel} / {item.session.model || copy.defaultLabel}</span>
                      <span>{formatUpdatedAt(item.session.updatedAt, copy)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="card surface-panel gallery-preview-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.preview}</div>
              <h3 className="surface-panel-title">
                {selectedArtifactCard ? artifactLabel(selectedArtifactCard.artifact) : copy.selectAnArtifact}
              </h3>
            </div>
            {selectedArtifactCard ? (
              <div className="gallery-preview-action-row">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenChat(selectedArtifactCard.session.id)}
                >
                  {copy.openChat}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    void handleCopySelectedArtifact()
                  }}
                >
                  {copy.copyArtifact}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownloadSelectedArtifact}
                >
                  {copy.downloadArtifact}
                </button>
              </div>
            ) : null}
          </div>

          {selectedArtifactCard ? (
            <>
              <div className="gallery-preview-toolbar">
                <div className="gallery-preview-toolbar-copy">
                  <span className="gallery-preview-selection">
                    {copy.artifactProgress(selectedArtifactIndex + 1, filteredArtifactCards.length)}
                  </span>
                  <span className="gallery-preview-shortcuts">
                    {copy.previewShortcuts}
                  </span>
                </div>
                <div className="gallery-preview-nav">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm gallery-preview-nav-button"
                    onClick={() => selectArtifactByOffset(-1)}
                    aria-label={copy.prevArtifactAria}
                  >
                    <ChevronLeft className="shell-icon" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm gallery-preview-nav-button"
                    onClick={() => selectArtifactByOffset(1)}
                    aria-label={copy.nextArtifactAria}
                  >
                    <ChevronRight className="shell-icon" />
                  </button>
                </div>
              </div>

              <p className="surface-panel-copy">
                {copy.inspectCopy}
              </p>

              {actionStatus ? (
                <div className="gallery-preview-status" role="status">
                  {actionStatus}
                </div>
              ) : null}

              <div className="surface-data-list gallery-preview-meta">
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.sessionLabel}</span>
                  <span className="surface-data-row-value">
                    {selectedArtifactCard.session.title || copy.untitled}
                  </span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.updatedLabel}</span>
                  <span className="surface-data-row-value">
                    {formatUpdatedAt(selectedArtifactCard.session.updatedAt, copy)}
                  </span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.modelLabel}</span>
                  <span className="surface-data-row-value">
                    {selectedArtifactCard.session.provider || copy.autoLabel}
                    {' / '}
                    {selectedArtifactCard.session.model || copy.defaultLabel}
                  </span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.artifactLabel}</span>
                  <span className="surface-data-row-value">
                    {selectedArtifactCard.artifact.type}
                    {selectedArtifactCard.artifact.language ? ` · ${selectedArtifactCard.artifact.language}` : ''}
                  </span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.downloadLabel}</span>
                  <span className="surface-data-row-value">
                    {getArtifactDownloadName(selectedArtifactCard.artifact)}
                  </span>
                </div>
              </div>

              <div className="gallery-preview-body">
                {renderArtifactBody(selectedArtifactCard.artifact)}
              </div>
            </>
          ) : (
            <div className="surface-empty-inline">
              {copy.selectInline}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
