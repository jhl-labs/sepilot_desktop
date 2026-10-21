import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DaemonFileMemorySnapshot,
  DaemonMemoryAuditEntry,
  DaemonMemoryDocument,
  DaemonMemoryDocumentChunk,
  DaemonMemoryEntry,
  DaemonMemoryLifecycleStatus,
  DaemonMemorySearchOptions,
  DaemonMemorySemanticStatus,
} from '@sepilotd/api-client'
import { useLocale } from './useLocale'

const SEARCH_TYPES: Array<NonNullable<DaemonMemorySearchOptions['type']>> = ['hybrid', 'semantic', 'keyword']

const OPEN_LOOP_QUEUE_SECTION = 'Open Loop Queue'
const DAILY_BACKLOG_SECTION = 'Backlog'
const DAILY_REFLECTION_SECTION = 'Reflection Ledger'

const MEMORY_COPY = {
  en: {
    backToChat: 'Back to chat',
    documentWorkspace: 'Document Workspace',
    documentsTitle: 'Documents',
    headerSummary:
      'Curate indexed documents, inspect retrieval quality, and manage citation-ready context with a document-first workspace that stays close to the private desktop flow.',
    headerCount: (docs: number, results: number, backend: string) =>
      `${docs} documents · ${results} results · ${backend}`,
    refreshLibrary: 'Refresh library',
    searchDocuments: 'Search documents',
    addDocument: 'Add document',
    statusLoading: 'Loading',
    statusUnavailable: 'Unavailable',
    docsConfigAria: 'Documents configuration status',
    lifecycleSection: 'Lifecycle',
    memoryMaintenance: 'Memory maintenance',
    refresh: 'Refresh',
    dryRun: 'Dry run',
    checking: 'Checking...',
    runCleanup: 'Run cleanup',
    cleaning: 'Cleaning...',
    lifecycleCopy:
      'Monitor semantic memory growth, stale conversation facts, embedding failures, and the recent audit trail before pruning old low-importance entries.',
    loadingLifecycle: 'Loading memory lifecycle...',
    lifecycleSuffix: (total: number, candidates: number) => `${total} memories · ${candidates} cleanup candidates`,
    lifecycleUnavailable: 'Lifecycle unavailable',
    loadingLifecycleSummary: 'Loading lifecycle',
    totalMemories: 'Total memories',
    cleanupCandidates: 'Cleanup candidates',
    pendingEmbeddings: 'Pending embeddings',
    failedEmbeddings: 'Failed embeddings',
    memoryMix: 'Memory mix',
    conversation: 'Conversation',
    documentsLabel: 'Documents',
    skills: 'Skills',
    userFacts: 'User facts',
    lastAudit: 'Last audit',
    never: 'never',
    unknown: 'unknown',
    recentAuditTrail: 'Recent audit trail',
    noAuditEntries: 'No audit entries yet.',
    memoryLifecycleUnavailable: 'Memory lifecycle is unavailable.',
    markdownMemory: 'Markdown Memory',
    longTermMemoryFile: 'Long-term memory file',
    loadingMarkdownMemory: 'Loading markdown memory...',
    memoryFile: 'Memory file',
    todayNote: 'Today note',
    sectionLabel: 'Section',
    markdownSectionAria: 'Markdown memory section',
    userMemory: 'User Memory',
    sectionTitle: 'Section title',
    markdownSectionTitleAria: 'Markdown memory section title',
    save: 'Save',
    saving: 'Saving...',
    deleteSection: 'Delete section',
    markdownContentAria: 'Markdown memory section content',
    markdownPlaceholder: '- Durable user facts, preferences, and reusable instructions.',
    sectionsLabel: 'Sections',
    yesterdayNote: 'Yesterday note',
    todayNotePreview: 'Today note preview',
    yesterdayNotePreview: 'Yesterday note preview',
    emptyParens: '(empty)',
    markdownMemoryUnavailable: 'Markdown memory is unavailable.',
    failedToLoadFile: 'Failed to load file memory.',
    failedToIndex: 'Failed to index document.',
    savedMarkdown: 'Saved markdown memory.',
    failedToSaveFile: 'Failed to save file memory.',
    deletedMarkdown: 'Deleted markdown memory section.',
    failedToDeleteFile: 'Failed to delete file memory.',
    addedToBacklog: 'Added to open-loop backlog.',
    failedBacklogUpdate: 'Failed to update backlog.',
    failedBacklogResolve: 'Failed to resolve backlog item.',
    memoryMaintenanceFailedPrefix: 'Memory maintenance failed',
    backlogSection: 'Backlog',
    openLoopsAndReflections: 'Open loops and reflections',
    backlogCopy:
      "Review durable open loops from MEMORY.md and today's backlog/reflection entries before starting a new session.",
    loadingBacklog: 'Loading backlog...',
    openLoops: 'Open loops',
    todayBacklog: 'Today backlog',
    reflections: 'Reflections',
    newBacklogAria: 'New backlog item',
    followUpPlaceholder: 'Follow up on an unresolved request',
    add: 'Add',
    openLoopQueueHeader: 'Open Loop Queue',
    noOpenLoops: 'No open-loop items.',
    resolve: 'Resolve',
    todayBacklogHeader: 'Today Backlog',
    noDailyBacklog: 'No daily backlog entries.',
    reflectionLedgerHeader: 'Reflection Ledger',
    noReflections: 'No reflection entries.',
    documentLibrary: 'Document Library',
    indexedCorpus: 'Indexed corpus',
    libraryCopy:
      'Filter the library by title, path, or tag, then drill into a single document before testing its retrieval coverage.',
    libraryFilterAria: 'Document library filter',
    filterDocsPlaceholder: 'Filter documents by title, path, or tag',
    filter: 'Filter',
    loadingDocs: 'Loading indexed documents...',
    noIndexedDocs: 'No indexed documents yet.',
    chunksSuffix: (n: number) => `${n} chunks`,
    updatedPrefix: 'Updated',
    searchChunks: 'Search chunks',
    deleting: 'Deleting...',
    delete: 'Delete',
    focusedDocument: 'Focused Document',
    selectAnIndexedDoc: 'Select an indexed document',
    addAnother: 'Add another',
    docFocusedCopy:
      'Review path, chunk coverage, and tagging before checking how this document surfaces inside semantic retrieval.',
    path: 'Path',
    none: 'none',
    chunks: 'Chunks',
    updated: 'Updated',
    docFocusedNote:
      'Run a document-focused search to inspect chunk snippets, citations, and scoring for this source without leaving the workspace.',
    selectFromLibrary: 'Select a document from the library to inspect its retrieval surface and metadata.',
    semanticIndex: 'Semantic Index',
    vectorBackendReadiness: 'Vector backend readiness',
    reindexing: 'Reindexing...',
    reindex: 'Reindex',
    retrievalHealthCopy:
      'Track retrieval health before relying on cited context in chat, memory evaluation, or document answers.',
    loadingSemanticStatus: 'Loading semantic memory status...',
    pending: 'Pending',
    failed: 'Failed',
    sqliteVec: 'sqlite-vec',
    available: 'available',
    unavailable: 'unavailable',
    indexedModel: 'Indexed model',
    dimensions: 'Dimensions',
    backend: 'Backend',
    lastErrorPrefix: 'Last error:',
    semanticUnavailable: 'Semantic memory status is unavailable.',
    searchSection: 'Search',
    queryEntries: 'Query entries and indexed documents',
    recentEntries: 'Recent memories',
    scopeDocuments: 'documents',
    scopeEntries: 'entries',
    searchPanelCopy:
      'Inspect raw memory entries or document chunks without leaving the workspace. Use a focused document search from the library when you need citation-specific checks.',
    recentEntriesCopy: 'Recently saved memories appear here automatically. Search to inspect an older or related memory.',
    searchDocsPlaceholder: 'Search indexed documents...',
    searchMemoryPlaceholder: 'Search memory...',
    searchDocsAria: 'Search documents',
    searchMemoryAria: 'Search memory',
    searchScopeAria: 'Search scope',
    searchTypeAria: 'Search type',
    searchAction: 'Search',
    scorePrefix: 'score:',
    chunkSuffix: (current: number, total: number) => `chunk ${current}/${total}`,
    noDocResults: 'No document results',
    noResults: 'No results',
    queryHint: 'Start with a query to inspect retrieval quality and citation coverage.',
    resultInspector: 'Result Inspector',
    selectAResult: 'Select a result',
    focused: 'Focused',
    inspectorDocCopy:
      'Inspect the selected chunk, then jump back to the focused document or copy the snippet for a handoff.',
    inspectorEntryCopy: 'Inspect the selected note, then copy it directly into the next chat run or project brief.',
    documentLabel: 'Document',
    chunk: 'Chunk',
    nA: 'n/a',
    source: 'Source',
    tags: 'Tags',
    score: 'Score',
    copySnippet: 'Copy snippet',
    copyNote: 'Copy note',
    openDocument: 'Open document',
    selectAResultHint: 'Select a retrieval result to inspect its snippet, metadata, and handoff actions.',
    indexDocument: 'Index Document',
    addSourceMaterial: 'Add durable source material',
    citationReady: 'citation-ready',
    indexDocCopy: 'Ingest a document into the indexed corpus so retrieval can cite exact snippets and chunk metadata.',
    docTitleAria: 'Document title',
    docTitlePlaceholder: 'Document title',
    docPathAria: 'Document path',
    docPathPlaceholder: 'Optional document path',
    docContentAria: 'Document content',
    docContentPlaceholder: 'Paste document content to index...',
    docTagsAria: 'Document tags',
    tagsPlaceholder: 'Tags (comma separated)',
    indexing: 'Indexing...',
    index: 'Index',
    addToMemory: 'Add to Memory',
    quickNotes: 'Quick notes and snippets',
    entryStore: 'entry store',
    addToMemoryCopy: 'Save lightweight notes directly into memory without indexing a full document.',
    contentPlaceholder: 'Content to remember...',
    failedPrefix: 'Failed',
    copiedChunkSnippet: 'Copied chunk snippet.',
    copiedMemoryNote: 'Copied memory note.',
  },
  ko: {
    backToChat: '채팅으로 돌아가기',
    documentWorkspace: '문서 워크스페이스',
    documentsTitle: '문서',
    headerSummary:
      '인덱싱된 문서를 큐레이팅하고, 검색 품질을 살펴보고, 인용 가능한 컨텍스트를 관리하는 문서 중심 워크스페이스입니다.',
    headerCount: (docs: number, results: number, backend: string) => `문서 ${docs}개 · 결과 ${results}개 · ${backend}`,
    refreshLibrary: '라이브러리 새로고침',
    searchDocuments: '문서 검색',
    addDocument: '문서 추가',
    statusLoading: '로딩 중',
    statusUnavailable: '사용 불가',
    docsConfigAria: '문서 구성 상태',
    lifecycleSection: '라이프사이클',
    memoryMaintenance: '메모리 유지보수',
    refresh: '새로고침',
    dryRun: '드라이런',
    checking: '확인 중...',
    runCleanup: '정리 실행',
    cleaning: '정리 중...',
    lifecycleCopy:
      '의미 메모리 증가, 오래된 대화 사실, 임베딩 실패, 최근 감사 추적을 모니터링한 후 중요도가 낮은 오래된 항목을 정리하세요.',
    loadingLifecycle: '메모리 라이프사이클 로딩 중...',
    lifecycleSuffix: (total: number, candidates: number) => `메모리 ${total}개 · 정리 후보 ${candidates}개`,
    lifecycleUnavailable: '라이프사이클 사용 불가',
    loadingLifecycleSummary: '라이프사이클 로딩 중',
    totalMemories: '전체 메모리',
    cleanupCandidates: '정리 후보',
    pendingEmbeddings: '대기 중 임베딩',
    failedEmbeddings: '실패한 임베딩',
    memoryMix: '메모리 구성',
    conversation: '대화',
    documentsLabel: '문서',
    skills: '스킬',
    userFacts: '사용자 사실',
    lastAudit: '마지막 감사',
    never: '없음',
    unknown: '알 수 없음',
    recentAuditTrail: '최근 감사 추적',
    noAuditEntries: '아직 감사 기록이 없습니다.',
    memoryLifecycleUnavailable: '메모리 라이프사이클을 사용할 수 없습니다.',
    markdownMemory: 'Markdown 메모리',
    longTermMemoryFile: '장기 메모리 파일',
    loadingMarkdownMemory: 'Markdown 메모리 로딩 중...',
    memoryFile: '메모리 파일',
    todayNote: '오늘 노트',
    sectionLabel: '섹션',
    markdownSectionAria: 'Markdown 메모리 섹션',
    userMemory: '사용자 메모리',
    sectionTitle: '섹션 제목',
    markdownSectionTitleAria: 'Markdown 메모리 섹션 제목',
    save: '저장',
    saving: '저장 중...',
    deleteSection: '섹션 삭제',
    markdownContentAria: 'Markdown 메모리 섹션 내용',
    markdownPlaceholder: '- 지속되는 사용자 사실, 환경 설정, 재사용 가능한 지침.',
    sectionsLabel: '섹션',
    yesterdayNote: '어제 노트',
    todayNotePreview: '오늘 노트 미리보기',
    yesterdayNotePreview: '어제 노트 미리보기',
    emptyParens: '(비어 있음)',
    markdownMemoryUnavailable: 'Markdown 메모리를 사용할 수 없습니다.',
    failedToLoadFile: '파일 메모리 로드에 실패했습니다.',
    failedToIndex: '문서 인덱싱에 실패했습니다.',
    savedMarkdown: 'Markdown 메모리를 저장했습니다.',
    failedToSaveFile: '파일 메모리 저장에 실패했습니다.',
    deletedMarkdown: 'Markdown 메모리 섹션을 삭제했습니다.',
    failedToDeleteFile: '파일 메모리 삭제에 실패했습니다.',
    addedToBacklog: '오픈 루프 백로그에 추가했습니다.',
    failedBacklogUpdate: '백로그 업데이트에 실패했습니다.',
    failedBacklogResolve: '백로그 항목 해결에 실패했습니다.',
    memoryMaintenanceFailedPrefix: '메모리 유지보수 실패',
    backlogSection: '백로그',
    openLoopsAndReflections: '오픈 루프와 회고',
    backlogCopy: '새 세션을 시작하기 전에 MEMORY.md의 지속적인 오픈 루프와 오늘의 백로그/회고 항목을 검토하세요.',
    loadingBacklog: '백로그 로딩 중...',
    openLoops: '오픈 루프',
    todayBacklog: '오늘 백로그',
    reflections: '회고',
    newBacklogAria: '새 백로그 항목',
    followUpPlaceholder: '미해결 요청에 대한 후속 작업',
    add: '추가',
    openLoopQueueHeader: '오픈 루프 큐',
    noOpenLoops: '오픈 루프 항목이 없습니다.',
    resolve: '해결',
    todayBacklogHeader: '오늘 백로그',
    noDailyBacklog: '오늘의 백로그 항목이 없습니다.',
    reflectionLedgerHeader: '회고 레저',
    noReflections: '회고 항목이 없습니다.',
    documentLibrary: '문서 라이브러리',
    indexedCorpus: '인덱싱된 코퍼스',
    libraryCopy: '제목, 경로, 태그로 라이브러리를 필터링한 후 단일 문서로 들어가 검색 커버리지를 테스트하세요.',
    libraryFilterAria: '문서 라이브러리 필터',
    filterDocsPlaceholder: '제목, 경로 또는 태그로 문서 필터링',
    filter: '필터',
    loadingDocs: '인덱싱된 문서 로딩 중...',
    noIndexedDocs: '아직 인덱싱된 문서가 없습니다.',
    chunksSuffix: (n: number) => `청크 ${n}개`,
    updatedPrefix: '업데이트',
    searchChunks: '청크 검색',
    deleting: '삭제 중...',
    delete: '삭제',
    focusedDocument: '집중 문서',
    selectAnIndexedDoc: '인덱싱된 문서를 선택하세요',
    addAnother: '추가 등록',
    docFocusedCopy: '경로, 청크 커버리지, 태그를 검토한 후 이 문서가 의미 검색에서 어떻게 표시되는지 확인하세요.',
    path: '경로',
    none: '없음',
    chunks: '청크',
    updated: '업데이트',
    docFocusedNote:
      '워크스페이스를 떠나지 않고 이 소스의 청크 스니펫, 인용, 점수를 살펴보려면 문서 중심 검색을 실행하세요.',
    selectFromLibrary: '라이브러리에서 문서를 선택하여 검색 표면과 메타데이터를 확인하세요.',
    semanticIndex: '의미 인덱스',
    vectorBackendReadiness: '벡터 백엔드 준비 상태',
    reindexing: '재인덱싱 중...',
    reindex: '재인덱싱',
    retrievalHealthCopy: '채팅, 메모리 평가, 문서 답변에서 인용된 컨텍스트에 의존하기 전에 검색 상태를 추적하세요.',
    loadingSemanticStatus: '의미 메모리 상태 로딩 중...',
    pending: '대기 중',
    failed: '실패',
    sqliteVec: 'sqlite-vec',
    available: '사용 가능',
    unavailable: '사용 불가',
    indexedModel: '인덱싱된 모델',
    dimensions: '차원',
    backend: '백엔드',
    lastErrorPrefix: '마지막 오류:',
    semanticUnavailable: '의미 메모리 상태를 사용할 수 없습니다.',
    searchSection: '검색',
    queryEntries: '항목 및 인덱싱된 문서 쿼리',
    recentEntries: '최근 기억',
    scopeDocuments: '문서',
    scopeEntries: '항목',
    searchPanelCopy:
      '워크스페이스를 떠나지 않고 원시 메모리 항목이나 문서 청크를 살펴봅니다. 인용 특정 확인이 필요하면 라이브러리에서 문서 중심 검색을 사용하세요.',
    recentEntriesCopy: '방금 저장한 기억을 포함한 최근 메모리가 자동으로 표시됩니다. 오래된 기억이나 관련 기억은 검색으로 확인하세요.',
    searchDocsPlaceholder: '인덱싱된 문서 검색...',
    searchMemoryPlaceholder: '메모리 검색...',
    searchDocsAria: '문서 검색',
    searchMemoryAria: '메모리 검색',
    searchScopeAria: '검색 범위',
    searchTypeAria: '검색 유형',
    searchAction: '검색',
    scorePrefix: '점수:',
    chunkSuffix: (current: number, total: number) => `청크 ${current}/${total}`,
    noDocResults: '문서 결과 없음',
    noResults: '결과 없음',
    queryHint: '검색 품질과 인용 커버리지를 살펴보려면 쿼리부터 시작하세요.',
    resultInspector: '결과 검사기',
    selectAResult: '결과를 선택하세요',
    focused: '집중',
    inspectorDocCopy: '선택한 청크를 살펴본 후 집중 문서로 다시 점프하거나 인계용 스니펫을 복사하세요.',
    inspectorEntryCopy: '선택한 노트를 살펴본 후 다음 채팅 실행이나 프로젝트 브리프에 직접 복사하세요.',
    documentLabel: '문서',
    chunk: '청크',
    nA: 'n/a',
    source: '소스',
    tags: '태그',
    score: '점수',
    copySnippet: '스니펫 복사',
    copyNote: '노트 복사',
    openDocument: '문서 열기',
    selectAResultHint: '스니펫, 메타데이터, 인계 작업을 살펴보려면 검색 결과를 선택하세요.',
    indexDocument: '문서 인덱싱',
    addSourceMaterial: '지속 가능한 소스 자료 추가',
    citationReady: '인용 준비됨',
    indexDocCopy:
      '인덱싱된 코퍼스에 문서를 수집하여 검색에서 정확한 스니펫과 청크 메타데이터를 인용할 수 있도록 합니다.',
    docTitleAria: '문서 제목',
    docTitlePlaceholder: '문서 제목',
    docPathAria: '문서 경로',
    docPathPlaceholder: '선택적 문서 경로',
    docContentAria: '문서 내용',
    docContentPlaceholder: '인덱싱할 문서 내용 붙여넣기...',
    docTagsAria: '문서 태그',
    tagsPlaceholder: '태그 (쉼표로 구분)',
    indexing: '인덱싱 중...',
    index: '인덱싱',
    addToMemory: '메모리에 추가',
    quickNotes: '빠른 노트와 스니펫',
    entryStore: '항목 저장소',
    addToMemoryCopy: '전체 문서를 인덱싱하지 않고 가벼운 노트를 메모리에 직접 저장합니다.',
    contentPlaceholder: '기억할 내용...',
    failedPrefix: '실패',
    copiedChunkSnippet: '청크 스니펫을 복사했습니다.',
    copiedMemoryNote: '메모리 노트를 복사했습니다.',
  },
} as const

interface MemorySearchProps {
  onBackToChat?: () => void
  shortcutQuery?: string | null
}

export function MemorySearch({ onBackToChat, shortcutQuery }: MemorySearchProps) {
  const { locale } = useLocale()
  const copy = MEMORY_COPY[locale] ?? MEMORY_COPY.en
  const [query, setQuery] = useState('')
  const [resultScope, setResultScope] = useState<'entries' | 'documents'>('entries')
  const [results, setResults] = useState<DaemonMemoryEntry[]>([])
  const [documentResults, setDocumentResults] = useState<DaemonMemoryDocumentChunk[]>([])
  const [documentLibrary, setDocumentLibrary] = useState<DaemonMemoryDocument[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const [documentQuery, setDocumentQuery] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addTags, setAddTags] = useState('')
  const [documentTitle, setDocumentTitle] = useState('')
  const [documentContent, setDocumentContent] = useState('')
  const [documentPath, setDocumentPath] = useState('')
  const [documentTags, setDocumentTags] = useState('')
  const [searchType, setSearchType] = useState<NonNullable<DaemonMemorySearchOptions['type']>>('hybrid')
  const [searching, setSearching] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [ingestingDocument, setIngestingDocument] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null)
  const [semanticStatus, setSemanticStatus] = useState<DaemonMemorySemanticStatus | null>(null)
  const [documentFeedback, setDocumentFeedback] = useState<string | null>(null)
  const [selectedResultId, setSelectedResultId] = useState<string>()
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)
  const [fileMemory, setFileMemory] = useState<DaemonFileMemorySnapshot | null>(null)
  const [loadingFileMemory, setLoadingFileMemory] = useState(true)
  const [fileMemorySection, setFileMemorySection] = useState('User Memory')
  const [fileMemoryContent, setFileMemoryContent] = useState('')
  const [savingFileMemory, setSavingFileMemory] = useState(false)
  const [fileMemoryFeedback, setFileMemoryFeedback] = useState<string | null>(null)
  const [backlogDraft, setBacklogDraft] = useState('')
  const [backlogBusy, setBacklogBusy] = useState(false)
  const [backlogFeedback, setBacklogFeedback] = useState<string | null>(null)
  const [lifecycleStatus, setLifecycleStatus] = useState<DaemonMemoryLifecycleStatus | null>(null)
  const [auditEntries, setAuditEntries] = useState<DaemonMemoryAuditEntry[]>([])
  const [loadingLifecycle, setLoadingLifecycle] = useState(true)
  const [maintenanceBusy, setMaintenanceBusy] = useState<'dry-run' | 'run' | null>(null)
  const [lifecycleFeedback, setLifecycleFeedback] = useState<string | null>(null)
  const documentComposerRef = useRef<HTMLElement | null>(null)
  const documentTitleInputRef = useRef<HTMLInputElement | null>(null)
  const searchPanelRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  async function refreshStatus() {
    setLoadingStatus(true)
    try {
      setSemanticStatus(await window.sepilot.memoryStatus())
    } catch {
      setSemanticStatus(null)
    } finally {
      setLoadingStatus(false)
    }
  }

  async function refreshLifecycle() {
    setLoadingLifecycle(true)
    try {
      const [lifecycle, audit] = await Promise.all([
        window.sepilot.memoryLifecycle(),
        window.sepilot.memoryAudit({ limit: 6 }),
      ])
      setLifecycleStatus(lifecycle)
      setAuditEntries(audit)
    } catch {
      setLifecycleStatus(null)
      setAuditEntries([])
    } finally {
      setLoadingLifecycle(false)
    }
  }

  const refreshDocuments = useCallback(async (nextQuery: string) => {
    setLoadingDocuments(true)
    try {
      setDocumentLibrary(
        await window.sepilot.listMemoryDocuments({
          query: nextQuery.trim() || undefined,
          limit: 12,
        }),
      )
    } catch {
      setDocumentLibrary([])
    } finally {
      setLoadingDocuments(false)
    }
  }, [])

  const refreshRecentEntries = useCallback(async () => {
    try {
      setResults(await window.sepilot.listRecentMemory({ limit: 12 }))
    } catch {
      setResults([])
    }
  }, [])

  const refreshFileMemory = useCallback(
    async (selectedTitle: string) => {
      setLoadingFileMemory(true)
      try {
        const snapshot = await window.sepilot.fileMemory()
        const fallbackTitle = selectedTitle.trim() || 'User Memory'
        const selected = snapshot.sections.find((section) => section.title === fallbackTitle) ?? snapshot.sections[0]
        setFileMemory(snapshot)
        setFileMemorySection(selected?.title ?? fallbackTitle)
        setFileMemoryContent(selected?.content ?? '')
      } catch (error) {
        setFileMemory(null)
        setFileMemoryFeedback(error instanceof Error ? error.message : copy.failedToLoadFile)
      } finally {
        setLoadingFileMemory(false)
      }
    },
    [copy.failedToLoadFile],
  )

  const runSearch = useCallback(
    async (nextQuery = query, nextScope = resultScope, nextDocumentId?: string) => {
      const normalizedQuery = nextQuery.trim()
      if (!normalizedQuery) {
        if (nextScope === 'entries') {
          await refreshRecentEntries()
          setDocumentResults([])
        } else {
          setResults([])
          setDocumentResults([])
        }
        return
      }

      setSearching(true)
      try {
        if (nextScope === 'documents') {
          setDocumentResults(
            await window.sepilot.memoryDocumentSearch(normalizedQuery, {
              type: searchType,
              documentId: nextDocumentId,
            }),
          )
          setResults([])
        } else {
          setResults(await window.sepilot.memorySearch(normalizedQuery, { type: searchType }))
          setDocumentResults([])
        }
      } catch {
        setResults([])
        setDocumentResults([])
      } finally {
        setSearching(false)
      }
    },
    [query, refreshRecentEntries, resultScope, searchType],
  )

  useEffect(() => {
    void refreshStatus()
    void refreshLifecycle()
    void refreshDocuments('')
    void refreshFileMemory('User Memory')
  }, [refreshDocuments, refreshFileMemory])

  useEffect(() => {
    if (resultScope === 'entries' && !query.trim()) {
      void refreshRecentEntries()
    }
  }, [query, refreshRecentEntries, resultScope])

  useEffect(() => {
    setSelectedDocumentId((current) => {
      if (documentLibrary.length === 0) {
        return undefined
      }

      return current && documentLibrary.some((document) => document.id === current) ? current : documentLibrary[0].id
    })
  }, [documentLibrary])

  const activeResults = resultScope === 'documents' ? documentResults : results

  useEffect(() => {
    const nextSelectedId = activeResults[0]?.id
    if (!nextSelectedId) {
      setSelectedResultId(undefined)
      return
    }

    setSelectedResultId((current) =>
      current && activeResults.some((result) => result.id === current) ? current : nextSelectedId,
    )
  }, [activeResults])

  useEffect(() => {
    setSearchFeedback(null)
  }, [selectedResultId, resultScope])

  const addMemory = async () => {
    if (!addContent.trim()) return
    try {
      const tags = splitTags(addTags)
      await window.sepilot.addMemory(addContent, tags)
      setAddContent('')
      setAddTags('')
      if (query.trim() && resultScope === 'entries') {
        await runSearch(query, 'entries')
      } else {
        await refreshRecentEntries()
      }
    } catch {
    } finally {
      void refreshStatus()
      void refreshLifecycle()
    }
  }

  const ingestDocument = async () => {
    if (!documentTitle.trim() || !documentContent.trim()) return
    setIngestingDocument(true)
    setDocumentFeedback(null)
    try {
      const document = await window.sepilot.ingestMemoryDocument({
        title: documentTitle.trim(),
        content: documentContent.trim(),
        path: documentPath.trim() || undefined,
        tags: splitTags(documentTags),
      })
      setDocumentTitle('')
      setDocumentContent('')
      setDocumentPath('')
      setDocumentTags('')
      setDocumentFeedback(`Indexed document: ${document.title}`)
      await refreshDocuments('')
      if (query.trim() && resultScope === 'documents') {
        await runSearch(query, 'documents')
      }
    } catch {
      setDocumentFeedback(copy.failedToIndex)
    } finally {
      setIngestingDocument(false)
      void refreshStatus()
      void refreshLifecycle()
    }
  }

  const deleteDocument = async (id: string) => {
    setDeletingDocumentId(id)
    setDocumentFeedback(null)
    try {
      await window.sepilot.deleteMemoryDocument(id)
      setDocumentFeedback(`Deleted document: ${id}`)
      await refreshDocuments(documentQuery)
      setDocumentResults((current) => current.filter((result) => result.documentId !== id))
    } catch {
      setDocumentFeedback(`Failed to delete document: ${id}`)
    } finally {
      setDeletingDocumentId(null)
      void refreshStatus()
      void refreshLifecycle()
    }
  }

  const reindexMemory = async () => {
    setReindexing(true)
    try {
      const result = await window.sepilot.reindexMemory()
      setSemanticStatus(result.status)
    } catch {
    } finally {
      setReindexing(false)
      void refreshStatus()
      void refreshLifecycle()
    }
  }

  const runMemoryMaintenance = async (dryRun: boolean) => {
    setMaintenanceBusy(dryRun ? 'dry-run' : 'run')
    setLifecycleFeedback(null)
    try {
      const result = await window.sepilot.runMemoryMaintenance({
        dryRun,
        reason: dryRun
          ? 'Inspect memory lifecycle from desktop UI'
          : 'Run memory lifecycle maintenance from desktop UI',
      })
      setLifecycleStatus(result.status)
      setAuditEntries(await window.sepilot.memoryAudit({ limit: 6 }))
      setLifecycleFeedback(
        dryRun
          ? `Dry run found ${result.wouldPrune} cleanup candidates.`
          : `Cleanup pruned ${result.pruned} memory entries.`,
      )
    } catch (error) {
      setLifecycleFeedback(`Memory maintenance failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setMaintenanceBusy(null)
    }
  }

  const selectFileMemorySection = (title: string) => {
    setFileMemorySection(title)
    const section = fileMemory?.sections.find((entry) => entry.title === title)
    setFileMemoryContent(section?.content ?? '')
    setFileMemoryFeedback(null)
  }

  const saveFileMemorySection = async () => {
    const title = fileMemorySection.trim()
    if (!title) return

    setSavingFileMemory(true)
    setFileMemoryFeedback(null)
    try {
      await window.sepilot.updateFileMemorySection(title, fileMemoryContent)
      setFileMemoryFeedback(copy.savedMarkdown)
      await refreshFileMemory(title)
    } catch (error) {
      setFileMemoryFeedback(error instanceof Error ? error.message : copy.failedToSaveFile)
    } finally {
      setSavingFileMemory(false)
    }
  }

  const deleteFileMemorySection = async () => {
    const title = fileMemorySection.trim()
    if (!title) return

    setSavingFileMemory(true)
    setFileMemoryFeedback(null)
    try {
      await window.sepilot.deleteFileMemorySection(title)
      setFileMemoryFeedback(copy.deletedMarkdown)
      setFileMemoryContent('')
      await refreshFileMemory('User Memory')
    } catch (error) {
      setFileMemoryFeedback(error instanceof Error ? error.message : copy.failedToDeleteFile)
    } finally {
      setSavingFileMemory(false)
    }
  }

  const backlogSnapshot = useMemo(() => (fileMemory ? buildBacklogSnapshot(fileMemory) : null), [fileMemory])

  const addBacklogItem = async () => {
    const text = backlogDraft.trim()
    if (!text || !fileMemory) return

    setBacklogBusy(true)
    setBacklogFeedback(null)
    try {
      const next = appendUniqueLine(
        findMemorySection(fileMemory, OPEN_LOOP_QUEUE_SECTION),
        formatManualBacklogLine(text),
      )
      await window.sepilot.updateFileMemorySection(OPEN_LOOP_QUEUE_SECTION, next)
      setBacklogDraft('')
      setBacklogFeedback(copy.addedToBacklog)
      await refreshFileMemory(fileMemorySection)
    } catch (error) {
      setBacklogFeedback(error instanceof Error ? error.message : copy.failedBacklogUpdate)
    } finally {
      setBacklogBusy(false)
    }
  }

  const resolveBacklogItem = async (item: string) => {
    if (!fileMemory) return

    setBacklogBusy(true)
    setBacklogFeedback(null)
    try {
      const current = findMemorySection(fileMemory, OPEN_LOOP_QUEUE_SECTION)
      const next = splitDisplayLines(current)
        .filter((line) => line !== item)
        .join('\n')
      await window.sepilot.updateFileMemorySection(OPEN_LOOP_QUEUE_SECTION, next)
      setBacklogFeedback('Resolved open-loop backlog item.')
      await refreshFileMemory(fileMemorySection)
    } catch (error) {
      setBacklogFeedback(error instanceof Error ? error.message : copy.failedBacklogResolve)
    } finally {
      setBacklogBusy(false)
    }
  }

  const focusDocumentComposer = () => {
    documentComposerRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    window.setTimeout(() => {
      documentTitleInputRef.current?.focus()
    }, 0)
  }

  const focusSearchWorkspace = useCallback(
    (
      nextScope: 'entries' | 'documents' = 'documents',
      nextQuery = query,
      nextDocumentId?: string,
      shouldRun = false,
    ) => {
      setResultScope(nextScope)
      setQuery(nextQuery)
      if (nextDocumentId) {
        setSelectedDocumentId(nextDocumentId)
      }
      searchPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      window.setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 0)
      if (shouldRun && nextQuery.trim()) {
        void runSearch(nextQuery, nextScope, nextDocumentId)
      }
    },
    [query, runSearch],
  )

  const openDocumentSearch = (document: DaemonMemoryDocument) => {
    focusSearchWorkspace('documents', document.title, document.id, true)
  }

  const handleHeaderDocumentSearch = () => {
    if (selectedDocument) {
      openDocumentSearch(selectedDocument)
      return
    }
    focusSearchWorkspace('documents')
  }

  useEffect(() => {
    const nextQuery = shortcutQuery?.trim()
    if (!nextQuery) return
    focusSearchWorkspace('entries', nextQuery, undefined, true)
  }, [focusSearchWorkspace, shortcutQuery])

  const selectedDocument =
    documentLibrary.find((document) => document.id === selectedDocumentId) ?? documentLibrary[0] ?? null
  const selectedSearchResult = useMemo(
    () => activeResults.find((result) => result.id === selectedResultId) ?? activeResults[0] ?? null,
    [activeResults, selectedResultId],
  )
  const selectedDocumentResult =
    resultScope === 'documents' ? (selectedSearchResult as DaemonMemoryDocumentChunk | null) : null
  const selectedEntryResult = resultScope === 'entries' ? (selectedSearchResult as DaemonMemoryEntry | null) : null
  const canReindex =
    semanticStatus && semanticStatus.status !== 'disabled' && semanticStatus.status !== 'backfilling' && !reindexing
  const summaryStatus = loadingStatus ? copy.statusLoading : (semanticStatus?.status ?? copy.statusUnavailable)
  const summaryBackend = semanticStatus?.vectorBackend ?? 'offline'
  const configurationState = getMemoryConfigurationState(semanticStatus, loadingStatus)
  const lifecycleSummary = loadingLifecycle
    ? copy.loadingLifecycleSummary
    : lifecycleStatus
      ? copy.lifecycleSuffix(lifecycleStatus.totalMemories, lifecycleStatus.pruneCandidateMemories)
      : copy.lifecycleUnavailable

  const copySelectedResult = async () => {
    if (!selectedSearchResult || !navigator.clipboard?.writeText) {
      return
    }

    const copyValue =
      resultScope === 'documents'
        ? (selectedDocumentResult?.snippet ?? selectedDocumentResult?.content ?? '')
        : (selectedEntryResult?.content ?? '')

    if (!copyValue.trim()) {
      return
    }

    await navigator.clipboard.writeText(copyValue)
    setSearchFeedback(resultScope === 'documents' ? copy.copiedChunkSnippet : copy.copiedMemoryNote)
  }

  const focusSelectedResultDocument = () => {
    if (!selectedDocumentResult?.documentId) {
      return
    }

    const matchingDocument = documentLibrary.find((document) => document.id === selectedDocumentResult.documentId)
    setSelectedDocumentId(selectedDocumentResult.documentId)
    if (matchingDocument) {
      openDocumentSearch(matchingDocument)
      return
    }
    focusSearchWorkspace('documents', selectedDocumentResult.documentTitle, selectedDocumentResult.documentId)
  }

  return (
    <div className="page surface-page">
      <div className="documents-header">
        <div className="documents-header-copy">
          <div className="documents-header-title-row">
            {onBackToChat ? (
              <button className="btn btn-ghost btn-sm" onClick={onBackToChat}>
                {copy.backToChat}
              </button>
            ) : null}
            <div>
              <span className="surface-page-kicker">{copy.documentWorkspace}</span>
              <div className="surface-page-title-row">
                <h2 className="page-title" style={{ marginBottom: 0 }}>
                  {copy.documentsTitle}
                </h2>
                <span className={`tag ${semanticStatus ? statusClassName(semanticStatus.status) : 'tag-yellow'}`}>
                  {summaryStatus}
                </span>
              </div>
            </div>
          </div>
          <p className="documents-header-summary">{copy.headerSummary}</p>
        </div>

        <div className="documents-header-actions">
          <span className="documents-header-count">
            {copy.headerCount(documentLibrary.length, activeResults.length, summaryBackend)}
          </span>
          <div className="documents-header-action-row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void refreshDocuments('')
              }}
              disabled={loadingDocuments}
            >
              {copy.refreshLibrary}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleHeaderDocumentSearch}>
              {copy.searchDocuments}
            </button>
            <button className="btn btn-primary btn-sm" onClick={focusDocumentComposer}>
              {copy.addDocument}
            </button>
          </div>
        </div>
      </div>

      <section className={`memory-status-banner ${configurationState.tone}`} aria-label={copy.docsConfigAria}>
        <div className="memory-status-banner-copy">
          <strong className="memory-status-banner-title">{configurationState.title}</strong>
          <span className="memory-status-banner-detail">{configurationState.detail}</span>
        </div>
        <div className="memory-status-banner-meta">
          <span className={`tag ${semanticStatus ? statusClassName(semanticStatus.status) : 'tag-yellow'}`}>
            {summaryStatus}
          </span>
          <span className="memory-status-model">{summaryBackend}</span>
        </div>
      </section>

      <section className="card surface-panel memory-lifecycle-panel">
        <div className="surface-panel-header">
          <div>
            <div className="section-title">{copy.lifecycleSection}</div>
            <h3 className="surface-panel-title">{copy.memoryMaintenance}</h3>
          </div>
          <div className="settings-action-row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void refreshLifecycle()
              }}
              disabled={loadingLifecycle || maintenanceBusy !== null}
            >
              {copy.refresh}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void runMemoryMaintenance(true)
              }}
              disabled={loadingLifecycle || maintenanceBusy !== null}
            >
              {maintenanceBusy === 'dry-run' ? copy.checking : copy.dryRun}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                void runMemoryMaintenance(false)
              }}
              disabled={loadingLifecycle || maintenanceBusy !== null}
            >
              {maintenanceBusy === 'run' ? copy.cleaning : copy.runCleanup}
            </button>
          </div>
        </div>

        <p className="surface-panel-copy">{copy.lifecycleCopy}</p>

        {loadingLifecycle ? (
          <div className="surface-empty-inline">{copy.loadingLifecycle}</div>
        ) : lifecycleStatus ? (
          <>
            <div className="surface-panel-metrics">
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.totalMemories}</span>
                <strong>{lifecycleStatus.totalMemories}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.cleanupCandidates}</span>
                <strong>{lifecycleStatus.pruneCandidateMemories}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.pendingEmbeddings}</span>
                <strong>{lifecycleStatus.pendingEmbeddings}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.failedEmbeddings}</span>
                <strong>{lifecycleStatus.failedEmbeddings}</strong>
              </div>
            </div>

            <div className="memory-lifecycle-grid">
              <article className="memory-lifecycle-card">
                <div className="memory-library-card-header">
                  <strong>{copy.memoryMix}</strong>
                  <span className="tag tag-blue">{lifecycleSummary}</span>
                </div>
                <div className="surface-data-list">
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.conversation}</span>
                    <span className="surface-data-row-value">{lifecycleStatus.conversationMemories}</span>
                  </div>
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.documentsLabel}</span>
                    <span className="surface-data-row-value">{lifecycleStatus.documentMemories}</span>
                  </div>
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.skills}</span>
                    <span className="surface-data-row-value">{lifecycleStatus.skillMemories}</span>
                  </div>
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.userFacts}</span>
                    <span className="surface-data-row-value">{lifecycleStatus.userMemories}</span>
                  </div>
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.lastAudit}</span>
                    <span className="surface-data-row-value">
                      {formatMemoryDateTime(lifecycleStatus.lastAuditAt, copy.never)}
                    </span>
                  </div>
                </div>
              </article>

              <article className="memory-lifecycle-card">
                <div className="memory-library-card-header">
                  <strong>{copy.recentAuditTrail}</strong>
                  <span className="tag tag-green">{auditEntries.length}</span>
                </div>
                <div className="memory-audit-list">
                  {auditEntries.length === 0 ? (
                    <div className="surface-empty-inline">{copy.noAuditEntries}</div>
                  ) : (
                    auditEntries.map((entry) => (
                      <div key={entry.id} className="memory-audit-row">
                        <div className="memory-audit-row-heading">
                          <strong>{entry.action}</strong>
                          <span>{entry.actor}</span>
                        </div>
                        <span>{formatMemoryDateTime(entry.createdAt, copy.unknown)}</span>
                        {entry.reason ? <p>{entry.reason}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </>
        ) : (
          <div className="surface-empty-inline">{copy.memoryLifecycleUnavailable}</div>
        )}

        {lifecycleFeedback ? (
          <div
            className={`memory-feedback ${
              lifecycleFeedback.startsWith('Memory maintenance failed') ||
              lifecycleFeedback.startsWith(copy.memoryMaintenanceFailedPrefix)
                ? 'memory-feedback-warning'
                : ''
            }`}
          >
            {lifecycleFeedback}
          </div>
        ) : null}
      </section>

      <section className="card surface-panel memory-file-panel">
        <div className="surface-panel-header">
          <div>
            <div className="section-title">{copy.markdownMemory}</div>
            <h3 className="surface-panel-title">{copy.longTermMemoryFile}</h3>
          </div>
          <div className="settings-action-row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void refreshFileMemory(fileMemorySection)
              }}
              disabled={loadingFileMemory}
            >
              {copy.refresh}
            </button>
          </div>
        </div>

        {loadingFileMemory ? (
          <div className="surface-empty-inline">{copy.loadingMarkdownMemory}</div>
        ) : fileMemory ? (
          <>
            <div className="surface-data-list memory-file-paths">
              <div className="surface-data-row">
                <span className="surface-data-row-label">{copy.memoryFile}</span>
                <span className="surface-data-row-value">{fileMemory.memoryPath}</span>
              </div>
              <div className="surface-data-row">
                <span className="surface-data-row-label">{copy.todayNote}</span>
                <span className="surface-data-row-value">{fileMemory.todayNotePath}</span>
              </div>
            </div>

            <div className="memory-file-controls">
              <label className="memory-file-field">
                <span className="surface-data-row-label">{copy.sectionLabel}</span>
                <select
                  className="input"
                  value={fileMemorySection}
                  onChange={(event) => selectFileMemorySection(event.target.value)}
                  aria-label={copy.markdownSectionAria}
                >
                  {fileMemory.sections.map((section) => (
                    <option key={section.title} value={section.title}>
                      {section.title}
                    </option>
                  ))}
                  {!fileMemory.sections.some((section) => section.title === 'User Memory') ? (
                    <option value="User Memory">{copy.userMemory}</option>
                  ) : null}
                </select>
              </label>
              <label className="memory-file-field">
                <span className="surface-data-row-label">{copy.sectionTitle}</span>
                <input
                  className="input"
                  value={fileMemorySection}
                  onChange={(event) => setFileMemorySection(event.target.value)}
                  aria-label={copy.markdownSectionTitleAria}
                  placeholder="User Memory"
                />
              </label>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void saveFileMemorySection()
                }}
                disabled={!fileMemorySection.trim() || savingFileMemory}
              >
                {savingFileMemory ? copy.saving : copy.save}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  void deleteFileMemorySection()
                }}
                disabled={!fileMemorySection.trim() || savingFileMemory}
              >
                {copy.deleteSection}
              </button>
            </div>

            <textarea
              className="input memory-textarea memory-file-textarea"
              value={fileMemoryContent}
              onChange={(event) => setFileMemoryContent(event.target.value)}
              aria-label={copy.markdownContentAria}
              placeholder={copy.markdownPlaceholder}
            />

            <div className="surface-panel-metrics">
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.sectionsLabel}</span>
                <strong>{fileMemory.sections.length}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.todayNote}</span>
                <strong>{lineCountLabel(fileMemory.todayNote)}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.yesterdayNote}</span>
                <strong>{lineCountLabel(fileMemory.yesterdayNote)}</strong>
              </div>
            </div>

            <div className="memory-file-preview-grid">
              <article className="memory-file-preview">
                <div className="section-title">{copy.todayNotePreview}</div>
                <pre className="memory-file-preview-body">{fileMemory.todayNote.trim() || copy.emptyParens}</pre>
              </article>
              <article className="memory-file-preview">
                <div className="section-title">{copy.yesterdayNotePreview}</div>
                <pre className="memory-file-preview-body">{fileMemory.yesterdayNote.trim() || copy.emptyParens}</pre>
              </article>
            </div>
          </>
        ) : (
          <div className="surface-empty-inline">{copy.markdownMemoryUnavailable}</div>
        )}

        {fileMemoryFeedback ? (
          <div
            className={`memory-feedback ${
              fileMemoryFeedback.startsWith('Failed') || fileMemoryFeedback.startsWith(copy.failedPrefix)
                ? 'memory-feedback-warning'
                : ''
            }`}
          >
            {fileMemoryFeedback}
          </div>
        ) : null}
      </section>

      <section className="card surface-panel memory-backlog-panel">
        <div className="surface-panel-header">
          <div>
            <div className="section-title">{copy.backlogSection}</div>
            <h3 className="surface-panel-title">{copy.openLoopsAndReflections}</h3>
          </div>
          <div className="settings-action-row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void refreshFileMemory(fileMemorySection)
              }}
              disabled={loadingFileMemory || backlogBusy}
            >
              {copy.refresh}
            </button>
          </div>
        </div>

        <p className="surface-panel-copy">{copy.backlogCopy}</p>

        {loadingFileMemory ? (
          <div className="surface-empty-inline">{copy.loadingBacklog}</div>
        ) : backlogSnapshot ? (
          <>
            <div className="surface-panel-metrics">
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.openLoops}</span>
                <strong>{backlogSnapshot.openLoopQueue.length}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.todayBacklog}</span>
                <strong>{backlogSnapshot.todayBacklog.length}</strong>
              </div>
              <div className="surface-panel-metric">
                <span className="surface-panel-metric-label">{copy.reflections}</span>
                <strong>{backlogSnapshot.todayReflections.length}</strong>
              </div>
            </div>

            <div className="memory-backlog-compose">
              <input
                className="input"
                value={backlogDraft}
                onChange={(event) => setBacklogDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void addBacklogItem()
                  }
                }}
                aria-label={copy.newBacklogAria}
                placeholder={copy.followUpPlaceholder}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  void addBacklogItem()
                }}
                disabled={!backlogDraft.trim() || backlogBusy}
              >
                {backlogBusy ? copy.saving : copy.add}
              </button>
            </div>

            <div className="memory-backlog-grid">
              <article className="memory-backlog-column">
                <div className="memory-library-card-header">
                  <strong>{copy.openLoopQueueHeader}</strong>
                  <span className="tag tag-blue">{backlogSnapshot.openLoopQueue.length}</span>
                </div>
                <div className="memory-backlog-list">
                  {backlogSnapshot.openLoopQueue.length === 0 ? (
                    <div className="surface-empty-inline">{copy.noOpenLoops}</div>
                  ) : (
                    backlogSnapshot.openLoopQueue.map((item) => (
                      <div key={item} className="memory-backlog-row">
                        <span>{item}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            void resolveBacklogItem(item)
                          }}
                          disabled={backlogBusy}
                        >
                          {copy.resolve}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="memory-backlog-column">
                <div className="memory-library-card-header">
                  <strong>{copy.todayBacklogHeader}</strong>
                  <span className="tag tag-green">{backlogSnapshot.todayBacklog.length}</span>
                </div>
                <div className="memory-backlog-list">
                  {backlogSnapshot.todayBacklog.length === 0 ? (
                    <div className="surface-empty-inline">{copy.noDailyBacklog}</div>
                  ) : (
                    backlogSnapshot.todayBacklog.map((item) => <span key={item}>{item}</span>)
                  )}
                </div>
              </article>

              <article className="memory-backlog-column">
                <div className="memory-library-card-header">
                  <strong>{copy.reflectionLedgerHeader}</strong>
                  <span className="tag tag-yellow">{backlogSnapshot.todayReflections.length}</span>
                </div>
                <div className="memory-backlog-list">
                  {backlogSnapshot.todayReflections.length === 0 ? (
                    <div className="surface-empty-inline">{copy.noReflections}</div>
                  ) : (
                    backlogSnapshot.todayReflections.map((item) => <span key={item}>{item}</span>)
                  )}
                </div>
              </article>
            </div>
          </>
        ) : (
          <div className="surface-empty-inline">{copy.markdownMemoryUnavailable}</div>
        )}

        {backlogFeedback ? (
          <div
            className={`memory-feedback ${
              backlogFeedback.startsWith('Failed') || backlogFeedback.startsWith(copy.failedPrefix)
                ? 'memory-feedback-warning'
                : ''
            }`}
          >
            {backlogFeedback}
          </div>
        ) : null}
      </section>

      <div className="memory-document-shell">
        <section className="card surface-panel memory-library-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.documentLibrary}</div>
              <h3 className="surface-panel-title">{copy.indexedCorpus}</h3>
            </div>
            <div className="settings-action-row">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void refreshDocuments(documentQuery)
                }}
                disabled={loadingDocuments}
              >
                {copy.refresh}
              </button>
            </div>
          </div>

          <p className="surface-panel-copy">{copy.libraryCopy}</p>

          <div className="memory-library-filter">
            <input
              className="input flex-1"
              value={documentQuery}
              onChange={(e) => setDocumentQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void refreshDocuments(e.currentTarget.value)
                }
              }}
              aria-label={copy.libraryFilterAria}
              placeholder={copy.filterDocsPlaceholder}
            />
            <button
              className="btn btn-secondary"
              onClick={() => {
                void refreshDocuments(documentQuery)
              }}
              disabled={loadingDocuments}
            >
              {copy.filter}
            </button>
          </div>

          <div className="memory-library-list">
            {loadingDocuments ? (
              <div className="surface-empty-inline">{copy.loadingDocs}</div>
            ) : documentLibrary.length === 0 ? (
              <div className="surface-empty-inline">{copy.noIndexedDocs}</div>
            ) : (
              documentLibrary.map((document) => {
                const active = document.id === selectedDocument?.id
                return (
                  <article key={document.id} className={`memory-library-card ${active ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="memory-library-select"
                      onClick={() => setSelectedDocumentId(document.id)}
                      aria-pressed={active}
                    >
                      <div className="memory-library-card-copy">
                        <strong>{document.title}</strong>
                        <span>{document.path ?? document.id}</span>
                      </div>
                      <div className="memory-result-meta">
                        <span>{copy.chunksSuffix(document.chunkCount)}</span>
                        <span>
                          {copy.updatedPrefix} {formatDocumentUpdatedLabel(document.updatedAt)}
                        </span>
                      </div>
                      {document.tags.length > 0 ? (
                        <div className="memory-result-meta">
                          {document.tags.map((tag) => (
                            <span key={tag} className="tag tag-green">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>

                    <div className="memory-library-card-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          openDocumentSearch(document)
                        }}
                      >
                        {copy.searchChunks}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          void deleteDocument(document.id)
                        }}
                        disabled={deletingDocumentId === document.id}
                      >
                        {deletingDocumentId === document.id ? copy.deleting : copy.delete}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="card surface-panel memory-detail-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.focusedDocument}</div>
              <h3 className="surface-panel-title">{selectedDocument?.title ?? copy.selectAnIndexedDoc}</h3>
            </div>
            {selectedDocument ? (
              <div className="settings-action-row">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    openDocumentSearch(selectedDocument)
                  }}
                >
                  {copy.searchChunks}
                </button>
                <button className="btn btn-primary btn-sm" onClick={focusDocumentComposer}>
                  {copy.addAnother}
                </button>
              </div>
            ) : null}
          </div>

          {selectedDocument ? (
            <>
              <p className="surface-panel-copy">{copy.docFocusedCopy}</p>

              <div className="surface-data-list gallery-preview-meta">
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.path}</span>
                  <span className="surface-data-row-value">{selectedDocument.path ?? copy.none}</span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.chunks}</span>
                  <span className="surface-data-row-value">{selectedDocument.chunkCount}</span>
                </div>
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.updated}</span>
                  <span className="surface-data-row-value">
                    {formatDocumentUpdatedLabel(selectedDocument.updatedAt)}
                  </span>
                </div>
              </div>

              {selectedDocument.tags.length > 0 ? (
                <div className="memory-detail-tags">
                  {selectedDocument.tags.map((tag) => (
                    <span key={tag} className="tag tag-green">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="memory-detail-note">{copy.docFocusedNote}</div>
            </>
          ) : (
            <div className="surface-empty-inline">{copy.selectFromLibrary}</div>
          )}
        </section>
      </div>

      <div className="memory-support-grid">
        <section className="card surface-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.semanticIndex}</div>
              <h3 className="surface-panel-title">{copy.vectorBackendReadiness}</h3>
            </div>
            <div className="settings-action-row">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void refreshStatus()
                }}
                disabled={loadingStatus}
              >
                {copy.refresh}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  void reindexMemory()
                }}
                disabled={!canReindex}
              >
                {reindexing ? copy.reindexing : copy.reindex}
              </button>
            </div>
          </div>

          <p className="surface-panel-copy">{copy.retrievalHealthCopy}</p>

          {loadingStatus ? (
            <div className="surface-empty-inline">{copy.loadingSemanticStatus}</div>
          ) : semanticStatus ? (
            <>
              <div className="memory-status-summary">
                <span className={`tag ${statusClassName(semanticStatus.status)}`}>{semanticStatus.status}</span>
                {semanticStatus.configuredProviderId && semanticStatus.configuredModel && (
                  <span className="memory-status-model">
                    {semanticStatus.configuredProviderId}/{semanticStatus.configuredModel}
                  </span>
                )}
              </div>

              <div className="surface-panel-metrics">
                <div className="surface-panel-metric">
                  <span className="surface-panel-metric-label">{copy.pending}</span>
                  <strong>{semanticStatus.pendingCount}</strong>
                </div>
                <div className="surface-panel-metric">
                  <span className="surface-panel-metric-label">{copy.failed}</span>
                  <strong>{semanticStatus.failedCount}</strong>
                </div>
                <div className="surface-panel-metric">
                  <span className="surface-panel-metric-label">{copy.sqliteVec}</span>
                  <strong>{semanticStatus.vecAvailable ? copy.available : copy.unavailable}</strong>
                </div>
              </div>

              <div className="surface-data-list">
                {semanticStatus.indexedProviderId && semanticStatus.indexedModel ? (
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.indexedModel}</span>
                    <span className="surface-data-row-value">
                      {semanticStatus.indexedProviderId}/{semanticStatus.indexedModel}
                    </span>
                  </div>
                ) : null}
                {semanticStatus.dimensions ? (
                  <div className="surface-data-row">
                    <span className="surface-data-row-label">{copy.dimensions}</span>
                    <span className="surface-data-row-value">{semanticStatus.dimensions}</span>
                  </div>
                ) : null}
                <div className="surface-data-row">
                  <span className="surface-data-row-label">{copy.backend}</span>
                  <span className="surface-data-row-value">{semanticStatus.vectorBackend}</span>
                </div>
              </div>

              {semanticStatus.lastError ? (
                <div className="memory-feedback memory-feedback-warning">
                  {copy.lastErrorPrefix} {semanticStatus.lastError}
                </div>
              ) : null}
            </>
          ) : (
            <div className="surface-empty-inline">{copy.semanticUnavailable}</div>
          )}
        </section>

        <section ref={searchPanelRef} className="card surface-panel memory-search-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.searchSection}</div>
              <h3 className="surface-panel-title">
                {resultScope === 'entries' && !query ? copy.recentEntries : copy.queryEntries}
              </h3>
            </div>
            <span className="tag">{resultScope === 'documents' ? copy.scopeDocuments : copy.scopeEntries}</span>
          </div>

          <p className="surface-panel-copy">
            {resultScope === 'entries' && !query ? copy.recentEntriesCopy : copy.searchPanelCopy}
          </p>

          <div className="memory-search-controls">
            <input
              ref={searchInputRef}
              className="input flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder={resultScope === 'documents' ? copy.searchDocsPlaceholder : copy.searchMemoryPlaceholder}
              aria-label={resultScope === 'documents' ? copy.searchDocsAria : copy.searchMemoryAria}
            />
            <select
              className="input"
              value={resultScope}
              onChange={(e) => setResultScope(e.target.value as 'entries' | 'documents')}
              aria-label={copy.searchScopeAria}
            >
              <option value="entries">{copy.scopeEntries}</option>
              <option value="documents">{copy.scopeDocuments}</option>
            </select>
            <select
              className="input"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as NonNullable<DaemonMemorySearchOptions['type']>)}
              aria-label={copy.searchTypeAria}
            >
              {SEARCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={() => {
                void runSearch()
              }}
              disabled={searching}
            >
              {searching ? '...' : copy.searchAction}
            </button>
          </div>

          <div className="memory-search-results-shell">
            <div className="memory-result-list">
              {resultScope === 'entries' &&
                results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={`memory-result-card ${selectedEntryResult?.id === result.id ? 'active' : ''}`}
                    onClick={() => setSelectedResultId(result.id)}
                    aria-pressed={selectedEntryResult?.id === result.id}
                  >
                    <div className="memory-result-copy">
                      <p>{result.content}</p>
                      <div className="memory-result-meta">
                        <span>{result.source}</span>
                        {result.tags.map((tag) => (
                          <span key={tag} className="tag tag-green">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    {result.score != null ? (
                      <span className="memory-result-score">
                        {copy.scorePrefix} {result.score.toFixed(2)}
                      </span>
                    ) : null}
                  </button>
                ))}

              {resultScope === 'documents' &&
                documentResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={`memory-result-card ${selectedDocumentResult?.id === result.id ? 'active' : ''}`}
                    onClick={() => setSelectedResultId(result.id)}
                    aria-pressed={selectedDocumentResult?.id === result.id}
                  >
                    <div className="memory-result-copy">
                      <div className="memory-result-heading">
                        <span className="tag tag-blue">{result.citationLabel ?? result.documentTitle}</span>
                        {result.chunkTitle ? <span className="tag tag-green">{result.chunkTitle}</span> : null}
                      </div>
                      <p>{result.snippet ?? result.content}</p>
                      <div className="memory-result-meta">
                        {result.documentPath ? <span>{result.documentPath}</span> : null}
                        <span>{copy.chunkSuffix(result.chunkIndex + 1, result.chunkCount)}</span>
                      </div>
                    </div>
                    {result.score != null ? (
                      <span className="memory-result-score">
                        {copy.scorePrefix} {result.score.toFixed(2)}
                      </span>
                    ) : null}
                  </button>
                ))}

              {!searching && query && activeResults.length === 0 ? (
                <div className="surface-empty-inline">
                  {resultScope === 'documents' ? copy.noDocResults : copy.noResults}
                </div>
              ) : null}

              {!query && activeResults.length === 0 ? (
                <div className="surface-empty-inline">{copy.queryHint}</div>
              ) : null}
            </div>

            <aside className="memory-result-inspector">
              <div className="surface-panel-header">
                <div>
                  <div className="section-title">{copy.resultInspector}</div>
                  <h3 className="surface-panel-title">
                    {selectedDocumentResult?.citationLabel ??
                      selectedDocumentResult?.documentTitle ??
                      selectedEntryResult?.source ??
                      copy.selectAResult}
                  </h3>
                </div>
                {selectedSearchResult ? <span className="tag">{copy.focused}</span> : null}
              </div>

              {selectedSearchResult ? (
                <>
                  <p className="surface-panel-copy">
                    {resultScope === 'documents' ? copy.inspectorDocCopy : copy.inspectorEntryCopy}
                  </p>

                  <div className="memory-result-inspector-body">
                    <div className="surface-data-list">
                      {resultScope === 'documents' ? (
                        <>
                          <div className="surface-data-row">
                            <span className="surface-data-row-label">{copy.documentLabel}</span>
                            <span className="surface-data-row-value">{selectedDocumentResult?.documentTitle}</span>
                          </div>
                          <div className="surface-data-row">
                            <span className="surface-data-row-label">{copy.path}</span>
                            <span className="surface-data-row-value">
                              {selectedDocumentResult?.documentPath ?? copy.none}
                            </span>
                          </div>
                          <div className="surface-data-row">
                            <span className="surface-data-row-label">{copy.chunk}</span>
                            <span className="surface-data-row-value">
                              {selectedDocumentResult
                                ? copy.chunkSuffix(
                                    selectedDocumentResult.chunkIndex + 1,
                                    selectedDocumentResult.chunkCount,
                                  )
                                : copy.nA}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="surface-data-row">
                            <span className="surface-data-row-label">{copy.source}</span>
                            <span className="surface-data-row-value">{selectedEntryResult?.source}</span>
                          </div>
                          <div className="surface-data-row">
                            <span className="surface-data-row-label">{copy.tags}</span>
                            <span className="surface-data-row-value">
                              {selectedEntryResult?.tags.length ? selectedEntryResult.tags.join(', ') : copy.none}
                            </span>
                          </div>
                        </>
                      )}
                      {selectedSearchResult.score != null ? (
                        <div className="surface-data-row">
                          <span className="surface-data-row-label">{copy.score}</span>
                          <span className="surface-data-row-value">{selectedSearchResult.score.toFixed(2)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="memory-result-inspector-snippet">
                      {resultScope === 'documents'
                        ? (selectedDocumentResult?.snippet ?? selectedDocumentResult?.content)
                        : selectedEntryResult?.content}
                    </div>

                    <div className="memory-result-inspector-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          void copySelectedResult()
                        }}
                      >
                        {resultScope === 'documents' ? copy.copySnippet : copy.copyNote}
                      </button>
                      {resultScope === 'documents' ? (
                        <button className="btn btn-primary btn-sm" onClick={focusSelectedResultDocument}>
                          {copy.openDocument}
                        </button>
                      ) : null}
                    </div>

                    {searchFeedback ? <div className="memory-feedback">{searchFeedback}</div> : null}
                  </div>
                </>
              ) : (
                <div className="surface-empty-inline">{copy.selectAResultHint}</div>
              )}
            </aside>
          </div>
        </section>
      </div>

      <div className="memory-bottom-grid">
        <section ref={documentComposerRef} className="card surface-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.indexDocument}</div>
              <h3 className="surface-panel-title">{copy.addSourceMaterial}</h3>
            </div>
            <span className="tag">{copy.citationReady}</span>
          </div>

          <p className="surface-panel-copy">{copy.indexDocCopy}</p>

          <div className="memory-form-grid">
            <input
              ref={documentTitleInputRef}
              className="input"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              aria-label={copy.docTitleAria}
              placeholder={copy.docTitlePlaceholder}
            />
            <input
              className="input"
              value={documentPath}
              onChange={(e) => setDocumentPath(e.target.value)}
              aria-label={copy.docPathAria}
              placeholder={copy.docPathPlaceholder}
            />
          </div>

          <textarea
            className="input memory-textarea"
            value={documentContent}
            onChange={(e) => setDocumentContent(e.target.value)}
            aria-label={copy.docContentAria}
            placeholder={copy.docContentPlaceholder}
          />

          <div className="memory-form-grid">
            <input
              className="input"
              value={documentTags}
              onChange={(e) => setDocumentTags(e.target.value)}
              aria-label={copy.docTagsAria}
              placeholder={copy.tagsPlaceholder}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                void ingestDocument()
              }}
              disabled={!documentTitle.trim() || !documentContent.trim() || ingestingDocument}
            >
              {ingestingDocument ? copy.indexing : copy.index}
            </button>
          </div>

          {documentFeedback ? (
            <div
              className={`memory-feedback ${
                documentFeedback.startsWith('Failed') || documentFeedback.startsWith(copy.failedPrefix)
                  ? 'memory-feedback-warning'
                  : ''
              }`}
            >
              {documentFeedback}
            </div>
          ) : null}
        </section>

        <section className="card surface-panel">
          <div className="surface-panel-header">
            <div>
              <div className="section-title">{copy.addToMemory}</div>
              <h3 className="surface-panel-title">{copy.quickNotes}</h3>
            </div>
            <span className="tag">{copy.entryStore}</span>
          </div>

          <p className="surface-panel-copy">{copy.addToMemoryCopy}</p>

          <textarea
            className="input memory-textarea memory-textarea-compact"
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            placeholder={copy.contentPlaceholder}
          />

          <div className="memory-form-grid">
            <input
              className="input"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
              placeholder={copy.tagsPlaceholder}
            />
            <button className="btn btn-success" onClick={addMemory} disabled={!addContent.trim()}>
              {copy.save}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function statusClassName(status: DaemonMemorySemanticStatus['status']): string {
  switch (status) {
    case 'ready':
      return 'tag-green'
    case 'backfilling':
      return 'tag-blue'
    case 'disabled':
      return 'tag-yellow'
    case 'degraded':
    case 'reindex_required':
      return 'tag-red'
  }
}

function formatDocumentUpdatedLabel(updatedAt: string): string {
  const parsed = Date.parse(updatedAt)
  if (!Number.isFinite(parsed)) {
    return 'unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(parsed))
}

function lineCountLabel(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) {
    return 'empty'
  }
  const count = trimmed.split('\n').length
  return `${count} line${count === 1 ? '' : 's'}`
}

function formatMemoryDateTime(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed))
}

function buildBacklogSnapshot(fileMemory: DaemonFileMemorySnapshot) {
  return {
    openLoopQueue: splitDisplayLines(findMemorySection(fileMemory, OPEN_LOOP_QUEUE_SECTION)),
    todayBacklog: splitDisplayLines(extractMarkdownSection(fileMemory.todayNote, DAILY_BACKLOG_SECTION)),
    todayReflections: splitDisplayLines(extractMarkdownSection(fileMemory.todayNote, DAILY_REFLECTION_SECTION)),
  }
}

function findMemorySection(fileMemory: DaemonFileMemorySnapshot, title: string): string {
  return fileMemory.sections.find((section) => section.title === title)?.content ?? ''
}

function extractMarkdownSection(markdown: string, title: string): string {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === `## ${title}`)
  if (start < 0) return ''
  const sectionLines: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+\S/.test(line)) break
    sectionLines.push(line)
  }
  return sectionLines.join('\n').trim()
}

function splitDisplayLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function appendUniqueLine(content: string, line: string): string {
  const lines = splitDisplayLines(content)
  if (lines.includes(line)) return lines.join('\n')
  return [...lines, line].join('\n')
}

function formatManualBacklogLine(content: string): string {
  return `- ${new Date().toISOString()} source=manual: ${content} | status=needs_follow_up | next=Resume this backlog item when relevant.`
}

function getMemoryConfigurationState(
  semanticStatus: DaemonMemorySemanticStatus | null,
  loadingStatus: boolean,
): {
  tone: 'success' | 'warning'
  title: string
  detail: string
} {
  if (loadingStatus) {
    return {
      tone: 'warning',
      title: 'Loading semantic memory status',
      detail: 'Checking vector backend readiness and document indexing health.',
    }
  }

  if (!semanticStatus) {
    return {
      tone: 'warning',
      title: 'Semantic memory unavailable',
      detail: 'The daemon did not return memory health. Retrieval and document actions may be incomplete.',
    }
  }

  if (semanticStatus.status === 'disabled') {
    return {
      tone: 'warning',
      title: 'Semantic memory is disabled',
      detail: 'Enable indexing before expecting cited document retrieval across chat surfaces.',
    }
  }

  if (semanticStatus.status === 'ready') {
    return {
      tone: 'success',
      title: 'Document setup ready',
      detail: 'Vector indexing is configured, and this workspace can manage citation-ready documents.',
    }
  }

  return {
    tone: 'warning',
    title: 'Document setup needs attention',
    detail: 'Indexing is available, but the current backend needs reindexing or operational follow-up.',
  }
}
