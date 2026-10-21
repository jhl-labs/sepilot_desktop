'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import hljs from 'highlight.js'
import { confirm } from '@/lib/utils/confirm'
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  Github,
  ListFilter,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Unlink,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { createDocClient, type DocDiffPreview } from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { createChatApi } from '@/lib/api/chat'
import { createSnippetsApi, type SnippetsApi } from '@/lib/api/snippets'
import {
  useSnippetsStore,
  type Snippet,
} from '@/lib/store/snippets-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { cn } from '@/lib/utils/cn'

interface EditingState {
  id?: string
  title: string
  language: string
  body: string
  tagsText: string
  gist: Snippet['gist'] | null
}

interface SnippetsGistStatus {
  connected: boolean
  login: string | null
}

const DEFAULT_LANGUAGE = 'plaintext'
const SNIPPET_WRITING_TOOL_NAMES = [
  'doc.get',
  'doc.outline',
  'doc.replace_section',
  'doc.replace_range',
  'doc.insert_after_section',
  'doc.append',
  'doc.rewrite',
  'doc.diff_preview',
] as const
const LANGUAGE_OPTIONS = [
  'plaintext',
  'bash',
  'powershell',
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'python',
  'sql',
  'html',
  'css',
  'yaml',
  'dockerfile',
  'markdown',
]

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string> = {
  dockerfile: 'dockerfile',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  ps1: 'powershell',
  pwsh: 'powershell',
  shell: 'bash',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
  yml: 'yaml',
}

interface SnippetAiAction {
  id: string
  label: string
  description: string
  buildPrompt: () => string
}

const SNIPPET_AI_ACTIONS: readonly SnippetAiAction[] = [
  {
    id: 'refactor',
    label: '리팩터',
    description: '동작을 유지하면서 더 간결하고 안전하게 정리',
    buildPrompt: () =>
      '활성 코드 스니펫을 동작은 유지하면서 더 간결하고 읽기 쉽게 리팩터해. 큰 변경이므로 doc.diff_preview로 먼저 미리보기를 만들어.',
  },
  {
    id: 'explain-comments',
    label: '주석 보강',
    description: '핵심 의도와 위험 지점에 짧은 주석 추가',
    buildPrompt: () =>
      '활성 코드 스니펫에서 이해하기 어려운 핵심 로직과 위험 지점에만 짧은 주석을 추가해. 불필요한 장문 주석은 넣지 말고 doc.diff_preview로 먼저 보여줘.',
  },
  {
    id: 'harden',
    label: '예외 처리',
    description: '입력 검증과 실패 경로를 보강',
    buildPrompt: () =>
      '활성 코드 스니펫의 실패 경로, 입력 검증, edge case를 점검하고 필요한 최소 변경으로 더 견고하게 만들어. 동작 변경이 있으면 이유를 코드 주석이 아니라 변경 요약에 반영하고 doc.diff_preview를 사용해.',
  },
  {
    id: 'test-example',
    label: '테스트 예시',
    description: '스니펫 아래에 간단한 테스트/사용 예시 추가',
    buildPrompt: () =>
      '활성 코드 스니펫 아래에 해당 언어와 맥락에 맞는 짧은 테스트 또는 사용 예시를 추가해. 기존 코드는 유지하고 doc.append 또는 doc.diff_preview를 사용해.',
  },
] as const

function makeNewSnippet(): EditingState {
  return { title: '', language: DEFAULT_LANGUAGE, body: '', tagsText: '', gist: null }
}

function snippetToEditing(snippet: Snippet): EditingState {
  return {
    id: snippet.id,
    title: snippet.title,
    language: snippet.language,
    body: snippet.body,
    tagsText: snippet.tags.join(', '),
    gist: snippet.gist ?? null,
  }
}

function editingToSnippet(editing: EditingState): Snippet {
  return {
    id: editing.id ?? `s-${Date.now()}`,
    title: editing.title.trim(),
    language: normalizeLanguage(editing.language),
    body: editing.body,
    tags: parseTags(editing.tagsText),
  }
}

function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase() || DEFAULT_LANGUAGE
}

function sameEditing(a: EditingState, b: EditingState): boolean {
  return (
    a.id === b.id
    && a.title === b.title
    && normalizeLanguage(a.language) === normalizeLanguage(b.language)
    && a.body === b.body
    && parseTags(a.tagsText).join('\n') === parseTags(b.tagsText).join('\n')
    && JSON.stringify(a.gist ?? null) === JSON.stringify(b.gist ?? null)
  )
}

function draftHasChanges(draft: EditingState | null, items: Snippet[]): boolean {
  if (!draft) return false
  if (draft.id) {
    const item = items.find((snippet) => snippet.id === draft.id)
    if (!item) return true
    return !sameEditing(draft, snippetToEditing(item))
  }
  return !sameEditing(draft, makeNewSnippet())
}

function resolveHighlightLanguage(language: string): string | null {
  const normalized = normalizeLanguage(language)
  if (normalized === DEFAULT_LANGUAGE) return null
  const candidate = HIGHLIGHT_LANGUAGE_ALIASES[normalized] ?? normalized
  return hljs.getLanguage(candidate) ? candidate : null
}

function highlightedHtml(code: string, language: string): string {
  const resolved = resolveHighlightLanguage(language)
  if (!code) return ''
  if (resolved) {
    return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
  }
  return hljs.highlightAuto(code).value
}

function detectSnippetLanguage(code: string, fallback: string): string {
  if (!code.trim()) return normalizeLanguage(fallback)
  const detected = hljs.highlightAuto(code).language
  switch (detected) {
    case 'javascript':
      return 'js'
    case 'typescript':
      return 'ts'
    case 'shell':
      return 'bash'
    default:
      return detected ? detected.toLowerCase() : normalizeLanguage(fallback)
  }
}

function buildSnippetAiPrompt(draft: EditingState, instruction: string): string {
  return [
    '이 작업 대상은 desktop Snippets 모드의 코드 스니펫 본문입니다.',
    `Snippet 제목: ${draft.title.trim() || '(제목 없음)'}`,
    `언어: ${normalizeLanguage(draft.language)}`,
    parseTags(draft.tagsText).length > 0
      ? `태그: ${parseTags(draft.tagsText).join(', ')}`
      : null,
    '',
    '반드시 활성 문서에 대해 doc.* 도구만 사용하세요. 파일 시스템 도구나 snippets REST API를 호출하지 마세요.',
    '변경 결과는 Snippets 편집 화면에 draft로 반영되고, 사용자가 저장 버튼을 눌러 Snippets DB에 저장합니다.',
    '스니펫은 재사용 가능한 코드 조각이므로, 불필요한 설명문보다 실행 가능한 코드와 짧은 주석을 우선하세요.',
    '',
    instruction,
  ].filter(Boolean).join('\n')
}

function normalizeCodeBody(code: string): string {
  return code
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}$/g, '\n\n')
}

function codeStats(code: string) {
  const lines = code.length === 0 ? 0 : code.split('\n').length
  return {
    lines,
    chars: code.length,
    bytes: new Blob([code]).size,
  }
}

function formatSyncTime(value: number | null | undefined): string | null {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return null
  }
}

function commentPrefixForLanguage(language: string): string {
  switch (normalizeLanguage(language)) {
    case 'bash':
    case 'sh':
    case 'shell':
    case 'python':
    case 'powershell':
    case 'pwsh':
    case 'ps1':
    case 'yaml':
    case 'yml':
      return '#'
    case 'sql':
      return '--'
    case 'html':
    case 'xml':
      return '<!--'
    case 'css':
      return '/*'
    default:
      return '//'
  }
}

function buildTitledSnippet(draft: EditingState): string {
  const title = draft.title.trim()
  if (!title) return draft.body
  const prefix = commentPrefixForLanguage(draft.language)
  if (prefix === '<!--') return `<!-- ${title} -->\n${draft.body}`
  if (prefix === '/*') return `/* ${title} */\n${draft.body}`
  return `${prefix} ${title}\n${draft.body}`
}

function detectPlaceholders(code: string): string[] {
  const patterns = [
    /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/g,
    /\$\{[A-Za-z0-9_.-]+\}/g,
    /\$[A-Z][A-Z0-9_]*/g,
    /%[A-Z][A-Z0-9_]*%/g,
    /<[A-Z][A-Z0-9_:-]*>/g,
  ]
  const found = new Set<string>()
  for (const pattern of patterns) {
    const matches = code.match(pattern) ?? []
    matches.forEach((match) => found.add(match.replace(/\s+/g, '')))
  }
  return Array.from(found).slice(0, 24)
}

function isShellLanguage(language: string): boolean {
  return ['bash', 'sh', 'shell', 'zsh', 'fish', 'powershell', 'pwsh', 'ps1', 'bat', 'cmd']
    .includes(normalizeLanguage(language))
}

function extractShellCommands(code: string, language: string): string[] {
  if (!isShellLanguage(language)) return []
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\$\s+/, '').replace(/^PS>\s+/i, ''))
    .filter((line) => {
      const lower = line.toLowerCase()
      return !line.startsWith('#') && !line.startsWith('//') && !lower.startsWith('rem ')
    })
    .slice(0, 8)
}

function extractCodeSymbols(code: string, language: string): string[] {
  if (isShellLanguage(language)) return []
  const normalized = normalizeLanguage(language)
  const symbolPattern = normalized === 'python'
    ? /^\s*(?:async\s+def|def|class)\s+[A-Za-z_][\w]*/i
    : normalized === 'sql'
      ? /^\s*(?:select|insert|update|delete|create|alter|drop)\b/i
      : /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+[A-Za-z_$][\w$]*/i
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => symbolPattern.test(line))
    .map((line) => (line.length > 72 ? `${line.slice(0, 69)}...` : line))
    .slice(0, 8)
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error('clipboard unavailable')
  await navigator.clipboard.writeText(text)
}

export function CodeSnippetGallery() {
  const transport = useTransport()
  const items = useSnippetsStore((state) => state.items)
  const setItems = useSnippetsStore((state) => state.setItems)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [activeTags, setActiveTags] = useState<string[]>([])

  const facets = useMemo(() => {
    const langCounts = new Map<string, number>()
    const tagCounts = new Map<string, number>()
    items.forEach((snippet) => {
      langCounts.set(snippet.language, (langCounts.get(snippet.language) ?? 0) + 1)
      snippet.tags.forEach((tag) =>
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1),
      )
    })
    const languages = Array.from(langCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count }))
    const tags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count }))
    return { languages, tags }
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((snippet) => {
      if (languageFilter !== 'all' && snippet.language !== languageFilter) return false
      if (activeTags.length > 0) {
        const tagSet = new Set(snippet.tags)
        if (!activeTags.every((tag) => tagSet.has(tag))) return false
      }
      return true
    })
  }, [activeTags, items, languageFilter])

  const dirty = draftHasChanges(editing, items)

  useEffect(() => {
    if (editing || items.length === 0) return
    setEditing(snippetToEditing(items[0]))
  }, [editing, items])

  useEffect(() => {
    if (!editing?.id) return
    if (items.some((snippet) => snippet.id === editing.id)) return
    setEditing(items[0] ? snippetToEditing(items[0]) : null)
  }, [editing?.id, items])

  useEffect(() => {
    if (!editing?.id || dirty) return
    if (filteredItems.some((snippet) => snippet.id === editing.id)) return
    if (filteredItems[0]) setEditing(snippetToEditing(filteredItems[0]))
  }, [dirty, editing?.id, filteredItems])

  useEffect(() => {
    if (activeTags.length === 0) return
    const known = new Set(facets.tags.map((tag) => tag.id))
    const stillValid = activeTags.filter((tag) => known.has(tag))
    if (stillValid.length !== activeTags.length) setActiveTags(stillValid)
  }, [activeTags, facets.tags])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await (await createSnippetsApi(transport)).list(q)
        if (!cancelled) setItems(list)
      } catch {
        if (!cancelled) setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [q, transport, setItems])

  async function confirmDiscard(): Promise<boolean> {
    if (!draftHasChanges(editing, items)) return true
    if (typeof window === 'undefined') return true
    return confirm('저장하지 않은 스니펫 변경을 버릴까요?')
  }

  async function openDraft(next: EditingState): Promise<void> {
    if (!(await confirmDiscard())) return
    setEditing(next)
  }

  function toggleTag(tag: string): void {
    setActiveTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    )
  }

  function clearFilters(): void {
    setLanguageFilter('all')
    setActiveTags([])
  }

  async function refresh(query = q): Promise<void> {
    try {
      const list = await (await createSnippetsApi(transport)).list(query)
      setItems(list)
    } catch {
      setItems([])
    }
  }

  async function save(): Promise<void> {
    if (!editing) return
    if (!editing.title.trim() || !editing.body.trim()) {
      toast.warning('제목과 본문을 모두 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const api = await createSnippetsApi(transport)
      const payload = editingToSnippet(editing)
      const saved = await api.upsert(payload)
      const next = snippetToEditing(saved ?? payload)
      toast.success(
        editing.id ? '스니펫을 수정했습니다.' : '스니펫을 만들었습니다.',
      )
      setEditing(next)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function remove(snippet: Snippet): Promise<void> {
    const ok = await confirm(`'${snippet.title}' 스니펫을 삭제하시겠습니까?`, {
      destructive: true,
    })
    if (!ok) return
    setRemovingId(snippet.id)
    try {
      const api = await createSnippetsApi(transport)
      await api.remove(snippet.id)
      toast.success('스니펫을 삭제했습니다.')
      if (editing?.id === snippet.id) setEditing(null)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRemovingId(null)
    }
  }

  function cancelEdit(): void {
    if (!editing) return
    if (editing.id) {
      const original = items.find((snippet) => snippet.id === editing.id)
      setEditing(original ? snippetToEditing(original) : null)
      return
    }
    setEditing(items[0] ? snippetToEditing(items[0]) : null)
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-5rem)] overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col gap-3 border-r border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Snippets</h2>
              <p className="text-[11px] text-muted-foreground">
                {filteredItems.length === items.length
                  ? `${items.length}개 코드 조각`
                  : `${filteredItems.length}/${items.length}개 표시`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void openDraft(makeNewSnippet())}
            aria-label="새 스니펫"
          >
            <Plus className="mr-1 h-4 w-4" />
            새 스니펫
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="검색"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-8 pl-7 text-xs"
            aria-label="스니펫 검색"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="검색어 지우기"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {(facets.languages.length > 1 || facets.tags.length > 0) ? (
          <div className="flex shrink-0 flex-col gap-2">
            {facets.languages.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <ListFilter className="h-3.5 w-3.5" />
                <select
                  value={languageFilter}
                  onChange={(event) => setLanguageFilter(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-xs text-foreground"
                  aria-label="언어 필터"
                >
                  <option value="all">언어: 전체 ({items.length})</option>
                  {facets.languages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.id} ({language.count})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {facets.tags.length > 0 ? (
              <div className="flex max-h-20 flex-wrap gap-1 overflow-auto">
                {facets.tags.slice(0, 24).map((tag) => {
                  const active = activeTags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        active
                          ? 'border-primary/60 bg-primary/10 text-foreground'
                          : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
                      )}
                      aria-pressed={active}
                    >
                      #{tag.id}
                      <span className="ml-1 opacity-60">{tag.count}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            {languageFilter !== 'all' || activeTags.length > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="self-start rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              <p>스니펫 없음</p>
              <button
                type="button"
                onClick={() => void openDraft(makeNewSnippet())}
                className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent"
              >
                첫 스니펫 만들기 →
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-start gap-1 px-2 py-2 text-xs text-muted-foreground">
              <p>일치하는 스니펫이 없습니다.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
              >
                필터 초기화
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filteredItems.map((snippet) => (
                <SnippetListItem
                  key={snippet.id}
                  snippet={snippet}
                  active={editing?.id === snippet.id}
                  removing={removingId === snippet.id}
                  onOpen={() => void openDraft(snippetToEditing(snippet))}
                  onRemove={() => void remove(snippet)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      <SnippetEditorPanel
        draft={editing}
        dirty={dirty}
        saving={saving}
        onChangeDraft={setEditing}
        onSave={() => void save()}
        onCancel={cancelEdit}
        onCreate={() => void openDraft(makeNewSnippet())}
        onRefresh={() => refresh()}
      />
    </div>
  )
}

function SnippetListItem({
  snippet,
  active,
  removing,
  onOpen,
  onRemove,
}: {
  snippet: Snippet
  active: boolean
  removing: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <li>
      <article
        className={cn(
          'rounded-md border border-border bg-background transition-colors',
          active && 'border-primary/50 bg-muted/35',
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="block w-full px-2 py-2 text-left"
          aria-label={`${snippet.title} 열기`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{snippet.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <LanguageBadge language={snippet.language} />
                {snippet.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {codeStats(snippet.body).lines}L
            </span>
          </div>
          <HighlightedCode
            code={snippet.body}
            language={snippet.language}
            compact
            className="mt-2 max-h-24 overflow-hidden rounded border border-border bg-muted/20"
          />
        </button>
        <div className="flex justify-end gap-1 border-t border-border px-1 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onOpen}
            disabled={removing}
            aria-label={`${snippet.title} 편집`}
            title="편집"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            disabled={removing}
            aria-label={`${snippet.title} 삭제`}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </article>
    </li>
  )
}

function SnippetEditorPanel({
  draft,
  dirty,
  saving,
  onChangeDraft,
  onSave,
  onCancel,
  onCreate,
  onRefresh,
}: {
  draft: EditingState | null
  dirty: boolean
  saving: boolean
  onChangeDraft: (next: EditingState | null) => void
  onSave: () => void
  onCancel: () => void
  onCreate: () => void
  onRefresh: () => Promise<void>
}) {
  const transport = useTransport()
  const assistantDocRef = useRef<{
    id: string
    content: string
    client: ReturnType<typeof createDocClient>
  } | null>(null)
  const lastAiBodyRef = useRef<string | null>(null)
  const [copied, setCopied] = useState<'raw' | 'fenced' | 'titled' | string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [gistStatus, setGistStatus] = useState<SnippetsGistStatus | null>(null)
  const [gistBusy, setGistBusy] = useState<'push' | 'pull' | 'unlink' | null>(null)
  const [pendingPreview, setPendingPreview] = useState<DocDiffPreview | null>(null)
  const stats = useMemo(() => codeStats(draft?.body ?? ''), [draft?.body])

  useEffect(() => {
    if (!copied) return
    const handle = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(handle)
  }, [copied])

  useEffect(() => {
    return () => {
      const current = assistantDocRef.current
      assistantDocRef.current = null
      if (current) void current.client.close(current.id).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const current = assistantDocRef.current
    assistantDocRef.current = null
    setPendingPreview(null)
    lastAiBodyRef.current = null
    if (current) void current.client.close(current.id).catch(() => {})
  }, [draft?.id])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await createSnippetsApi(transport)
        const statusFn = (api as Partial<SnippetsApi>).gistStatus
        if (!statusFn) return
        const status = await statusFn()
        if (!cancelled) setGistStatus(status)
      } catch {
        if (!cancelled) setGistStatus({ connected: false, login: null })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  if (!draft) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-background">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <FileCode2 className="h-9 w-9 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">선택된 스니펫이 없습니다</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              왼쪽에서 코드를 선택하거나 새 스니펫을 만드세요.
            </p>
          </div>
          <Button size="sm" onClick={onCreate}>
            <Plus className="mr-1 h-4 w-4" />
            새 스니펫
          </Button>
        </div>
      </section>
    )
  }

  const currentDraft = draft

  async function openAssistantDoc(snippetDraft: EditingState) {
    const existing = assistantDocRef.current
    if (existing) {
      void existing.client.close(existing.id).catch(() => {})
      assistantDocRef.current = null
    }
    const cfg = await transport.getConfig()
    const client = createDocClient({ baseUrl: cfg.daemonOrigin, token: cfg.daemonToken })
    const session = await client.open({ path: null, initialContent: snippetDraft.body })
    assistantDocRef.current = {
      id: session.id,
      content: session.content,
      client,
    }
    return assistantDocRef.current
  }

  async function runSnippetAi(instruction: string): Promise<void> {
    if (aiBusy) return
    if (!currentDraft.title.trim()) {
      toast.warning('AI 편집 전에 제목을 입력하세요.')
      return
    }
    if (!currentDraft.body.trim()) {
      toast.warning('AI 편집 전에 코드를 입력하세요.')
      return
    }
    if (pendingPreview) {
      toast.warning('먼저 변경 미리보기를 수락하거나 취소하세요.')
      return
    }
    setAiBusy(true)
    let keepAssistantDocOpen = false
    try {
      const assistantDoc = await openAssistantDoc(currentDraft)
      const api = await createChatApi(transport)
      let streamError: Error | null = null
      await api.stream(
        undefined,
        buildSnippetAiPrompt(currentDraft, instruction),
        {
          onUpsertMessage: () => {},
          onDone: () => {},
          onError: (error) => {
            streamError = error
          },
        },
        {
          chat: {
            mode: 'writing',
            writingDocId: assistantDoc.id,
            toolNames: [...SNIPPET_WRITING_TOOL_NAMES],
          },
        },
      )
      if (streamError) throw streamError

      const previews = await assistantDoc.client.listPreviews(assistantDoc.id)
      if (previews.length > 0) {
        keepAssistantDocOpen = true
        setPendingPreview(previews[0])
        toast.info('AI 변경 미리보기가 준비되었습니다.')
        return
      }

      const fresh = await assistantDoc.client.get(assistantDoc.id)
      if (fresh.content !== currentDraft.body) {
        lastAiBodyRef.current = currentDraft.body
        onChangeDraft({ ...currentDraft, body: fresh.content })
        assistantDocRef.current = {
          ...assistantDoc,
          content: fresh.content,
        }
        toast.success('AI 편집을 코드에 반영했습니다.')
      } else {
        toast.info('AI가 코드를 변경하지 않았습니다.')
      }
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      if (!keepAssistantDocOpen) {
        const current = assistantDocRef.current
        assistantDocRef.current = null
        if (current) void current.client.close(current.id).catch(() => {})
      }
      setAiBusy(false)
    }
  }

  function runAiAction(actionId: string): void {
    const action = SNIPPET_AI_ACTIONS.find((candidate) => candidate.id === actionId)
    if (!action) return
    void runSnippetAi(action.buildPrompt())
  }

  function improveSnippet(): void {
    void runSnippetAi(
      '활성 코드 스니펫을 재사용 가능한 코드 조각으로 더 안전하고 명료하게 개선해. 동작 변경은 최소화하고 큰 변경이면 doc.diff_preview로 먼저 보여줘.',
    )
  }

  function undoAiEdit(): void {
    if (lastAiBodyRef.current == null) {
      toast.info('되돌릴 AI 편집이 없습니다.')
      return
    }
    const previous = lastAiBodyRef.current
    lastAiBodyRef.current = null
    onChangeDraft({ ...currentDraft, body: previous })
    toast.success('마지막 AI 편집을 되돌렸습니다.')
  }

  async function acceptPreview(): Promise<void> {
    const assistantDoc = assistantDocRef.current
    if (!assistantDoc || !pendingPreview) return
    setAiBusy(true)
    try {
      await assistantDoc.client.acceptPreview(assistantDoc.id, pendingPreview.id)
      const fresh = await assistantDoc.client.get(assistantDoc.id)
      lastAiBodyRef.current = currentDraft.body
      onChangeDraft({ ...currentDraft, body: fresh.content })
      assistantDocRef.current = null
      setPendingPreview(null)
      void assistantDoc.client.close(assistantDoc.id).catch(() => {})
      toast.success('AI 변경 미리보기를 반영했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setAiBusy(false)
    }
  }

  async function cancelPreview(): Promise<void> {
    const assistantDoc = assistantDocRef.current
    if (!assistantDoc || !pendingPreview) return
    setAiBusy(true)
    try {
      await assistantDoc.client.cancelPreview(assistantDoc.id, pendingPreview.id)
      assistantDocRef.current = null
      setPendingPreview(null)
      void assistantDoc.client.close(assistantDoc.id).catch(() => {})
      toast.info('AI 변경 미리보기를 취소했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setAiBusy(false)
    }
  }

  async function copyRaw(): Promise<void> {
    try {
      await copyToClipboard(currentDraft.body)
      setCopied('raw')
      toast.success('코드를 복사했습니다.')
    } catch {
      toast.warning('클립보드에 복사하지 못했습니다.')
    }
  }

  async function copyFenced(): Promise<void> {
    try {
      const language = normalizeLanguage(currentDraft.language)
      await copyToClipboard(
        `\`\`\`${language === DEFAULT_LANGUAGE ? '' : language}\n${currentDraft.body}\n\`\`\``,
      )
      setCopied('fenced')
      toast.success('Markdown 코드 블록을 복사했습니다.')
    } catch {
      toast.warning('클립보드에 복사하지 못했습니다.')
    }
  }

  async function copyTitled(): Promise<void> {
    try {
      await copyToClipboard(buildTitledSnippet(currentDraft))
      setCopied('titled')
      toast.success('제목 주석을 포함해 복사했습니다.')
    } catch {
      toast.warning('클립보드에 복사하지 못했습니다.')
    }
  }

  async function copyCommand(command: string, index: number): Promise<void> {
    try {
      await copyToClipboard(command)
      setCopied(`command-${index}`)
      toast.success('명령을 복사했습니다.')
    } catch {
      toast.warning('클립보드에 복사하지 못했습니다.')
    }
  }

  function detectLanguage(): void {
    const language = detectSnippetLanguage(currentDraft.body, currentDraft.language)
    onChangeDraft({ ...currentDraft, language })
    toast.success(`언어를 ${language}(으)로 설정했습니다.`)
  }

  function normalizeBody(): void {
    const body = normalizeCodeBody(currentDraft.body)
    onChangeDraft({ ...currentDraft, body })
    toast.success('코드 공백을 정리했습니다.')
  }

  async function confirmGistAction(action: 'push' | 'pull' | 'unlink'): Promise<boolean> {
    if (typeof window === 'undefined') return true
    if (action === 'push' && currentDraft.gist) {
      return confirm(
        '현재 로컬 스니펫 내용으로 연결된 GitHub Gist 파일을 업데이트합니다.\n\n로컬 스니펫은 그대로 유지됩니다. 계속할까요?',
      )
    }
    if (action === 'pull') {
      return confirm(
        'GitHub Gist 내용으로 현재 로컬 스니펫의 코드 본문과 언어를 갱신합니다.\n\n로컬 스니펫 항목은 유지되지만, 현재 저장된 본문은 원격 내용으로 바뀝니다. 계속할까요?',
      )
    }
    if (action === 'unlink') {
      return confirm(
        'Gist 연결 정보만 해제합니다.\n\n로컬 스니펫은 유지되고 원격 GitHub Gist는 삭제하지 않습니다. 계속할까요?',
      )
    }
    return true
  }

  async function runGistAction(
    action: 'push' | 'pull' | 'unlink',
    run: (api: SnippetsApi, id: string) => Promise<Snippet>,
  ): Promise<void> {
    if (!currentDraft.id) {
      toast.warning('먼저 스니펫을 저장하세요.')
      return
    }
    if (dirty) {
      toast.warning('Gist 동기화 전에 변경 내용을 저장하세요.')
      return
    }
    if (gistBusy) return
    setGistBusy(action)
    try {
      const api = await createSnippetsApi(transport)
      const saved = await run(api, currentDraft.id)
      onChangeDraft(snippetToEditing(saved))
      await onRefresh()
      toast.success(
        action === 'push'
          ? 'GitHub Gist에 반영했습니다.'
          : action === 'pull'
            ? 'GitHub Gist에서 가져왔습니다.'
            : 'Gist 연결을 해제했습니다. 로컬 스니펫은 유지됩니다.',
      )
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setGistBusy(null)
    }
  }

  async function pushGist(): Promise<void> {
    if (!(await confirmGistAction('push'))) return
    void runGistAction('push', (api, id) => api.pushGist(id))
  }

  async function pullGist(): Promise<void> {
    if (!(await confirmGistAction('pull'))) return
    void runGistAction('pull', (api, id) => api.pullGist(id))
  }

  async function unlinkGist(): Promise<void> {
    if (!(await confirmGistAction('unlink'))) return
    void runGistAction('unlink', (api, id) => api.unlinkGist(id))
  }

  return (
    <section
      role="region"
      aria-label="스니펫 편집"
      className="relative flex min-w-0 flex-1 flex-col bg-background"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background/95 px-2">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 pl-1">
          <div className="truncate font-mono text-xs text-foreground/90">
            {draft.title.trim() || (draft.id ? '제목 없는 스니펫' : '새 스니펫')}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <LanguageBadge language={draft.language} />
            <SnippetStorageBadges
              draft={draft}
              dirty={dirty}
              gistStatus={gistStatus}
            />
            <span>{stats.lines} lines</span>
            <span>{stats.chars} chars</span>
            <span>{stats.bytes} bytes</span>
          </div>
        </div>
        {dirty ? (
          <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            ● 저장 안 됨
          </span>
        ) : draft.id ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3" />
            저장됨
          </span>
        ) : null}

        <Divider />

        <ToolbarGroup>
          <IconButton
            label={copied === 'raw' ? '복사됨' : '코드 복사'}
            onClick={() => void copyRaw()}
            disabled={!draft.body || aiBusy || Boolean(pendingPreview)}
          >
            {copied === 'raw' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton
            label={copied === 'fenced' ? '복사됨' : 'Markdown 코드 블록 복사'}
            onClick={() => void copyFenced()}
            disabled={!draft.body || aiBusy || Boolean(pendingPreview)}
          >
            <Code2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="언어 감지"
            onClick={detectLanguage}
            disabled={!draft.body || saving || aiBusy || Boolean(pendingPreview)}
          >
            <Sparkles className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="공백 정리"
            onClick={normalizeBody}
            disabled={!draft.body || saving || aiBusy || Boolean(pendingPreview)}
          >
            <Wand2 className="h-4 w-4" />
          </IconButton>
        </ToolbarGroup>

        <Divider />

        <ToolbarGroup>
          <Button
            size="sm"
            variant="default"
            onClick={improveSnippet}
            disabled={!draft.body || aiBusy || Boolean(pendingPreview)}
            className="h-8 gap-1.5 px-3 text-xs"
            title="코드 스니펫을 AI로 개선"
          >
            {aiBusy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 개선
          </Button>
          <SnippetAiActionsMenu
            onRun={runAiAction}
            disabled={!draft.body || aiBusy || Boolean(pendingPreview)}
          />
          <IconButton
            label="마지막 AI 편집 되돌리기"
            onClick={undoAiEdit}
            disabled={aiBusy || Boolean(pendingPreview) || lastAiBodyRef.current == null}
          >
            <Undo2 className="h-4 w-4" />
          </IconButton>
        </ToolbarGroup>

        <Divider />

        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={saving || aiBusy || Boolean(pendingPreview) || (!dirty && Boolean(draft.id))}
          className="h-8 gap-1 px-2 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          취소
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || aiBusy || Boolean(pendingPreview) || !draft.title.trim() || !draft.body.trim()}
          className="h-8 gap-1 px-2 text-xs"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </header>

      <div className="grid shrink-0 gap-3 border-b border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_150px_minmax(180px,260px)]">
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          제목
          <Input
            type="text"
            autoFocus={!draft.id}
            value={draft.title}
            onChange={(event) =>
              onChangeDraft({ ...draft, title: event.target.value })
            }
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="제목"
            placeholder="스니펫 제목"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          언어
          <Input
            type="text"
            list="snippet-language-options"
            placeholder="plaintext"
            value={draft.language}
            onChange={(event) =>
              onChangeDraft({ ...draft, language: event.target.value })
            }
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="언어"
          />
          <datalist id="snippet-language-options">
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language} value={language} />
            ))}
          </datalist>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          태그
          <Input
            type="text"
            placeholder="bash, deploy"
            value={draft.tagsText}
            onChange={(event) =>
              onChangeDraft({ ...draft, tagsText: event.target.value })
            }
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="태그"
          />
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-muted/15 px-3 text-[11px] text-muted-foreground">
            <span>Editor</span>
            <span>{normalizeLanguage(draft.language)}</span>
          </div>
          <CodeTextArea
            value={draft.body}
            language={draft.language}
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            onChange={(body) => onChangeDraft({ ...draft, body })}
          />
        </div>
        <SnippetReusePanel
          draft={draft}
          stats={stats}
          copied={copied}
          disabled={saving || aiBusy || Boolean(pendingPreview)}
          onCopyRaw={() => void copyRaw()}
          onCopyFenced={() => void copyFenced()}
          onCopyTitled={() => void copyTitled()}
          onCopyCommand={(command, index) => void copyCommand(command, index)}
          gistStatus={gistStatus}
          gistBusy={gistBusy}
          gistDisabled={dirty || !draft.id}
          onPushGist={pushGist}
          onPullGist={pullGist}
          onUnlinkGist={unlinkGist}
        />
      </div>
      {pendingPreview ? (
        <div className="absolute inset-x-4 bottom-4 z-10 rounded-md border border-border bg-background/95 p-3 shadow-lg">
          <div className="mb-2 flex items-start gap-2">
            <div className="flex-1 text-sm">
              <div className="font-semibold">AI 변경 미리보기</div>
              <div className="text-xs text-muted-foreground">{pendingPreview.summary}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void cancelPreview()}
              disabled={aiBusy}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              취소
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => void acceptPreview()}
              disabled={aiBusy}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              수락
            </Button>
          </div>
          <div className="max-h-40 space-y-2 overflow-auto text-xs">
            {pendingPreview.changes.slice(0, 5).map((change, index) => (
              <div key={index} className="rounded bg-muted/40 p-2 font-mono">
                <div className="mb-1 text-[10px] text-muted-foreground">
                  {change.start}..{change.end} {'->'} +{change.newText.length}자
                </div>
                <HighlightedCode
                  code={change.newText.slice(0, 240)}
                  language={draft.language}
                  compact
                  className="max-h-28 overflow-hidden rounded border border-border bg-background"
                />
              </div>
            ))}
            {pendingPreview.changes.length > 5 ? (
              <div className="text-[11px] text-muted-foreground">
                +{pendingPreview.changes.length - 5} more
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SnippetStorageBadges({
  draft,
  dirty,
  gistStatus,
}: {
  draft: EditingState
  dirty: boolean
  gistStatus: SnippetsGistStatus | null
}) {
  const gistLabel = !draft.gist
    ? null
    : !gistStatus?.connected
      ? 'Gist 보류'
      : dirty
        ? 'Gist 업데이트 필요'
        : 'Gist 연결됨'
  return (
    <>
      <span
        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title="스니펫의 기본 저장소는 로컬 SQLite DB입니다."
      >
        로컬 DB
      </span>
      {gistLabel ? (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            !gistStatus?.connected
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : dirty
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          )}
          title={
            !gistStatus?.connected
              ? 'GitHub이 연결되지 않아 Gist 동기화는 보류되지만 로컬 스니펫은 유지됩니다.'
              : dirty
                ? '로컬 변경을 저장한 뒤 Gist를 업데이트할 수 있습니다.'
                : '이 로컬 스니펫은 GitHub Gist와 연결되어 있습니다.'
          }
        >
          {gistLabel}
        </span>
      ) : null}
    </>
  )
}

function SnippetReusePanel({
  draft,
  stats,
  copied,
  disabled,
  onCopyRaw,
  onCopyFenced,
  onCopyTitled,
  onCopyCommand,
  gistStatus,
  gistBusy,
  gistDisabled,
  onPushGist,
  onPullGist,
  onUnlinkGist,
}: {
  draft: EditingState
  stats: ReturnType<typeof codeStats>
  copied: string | null
  disabled: boolean
  onCopyRaw: () => void
  onCopyFenced: () => void
  onCopyTitled: () => void
  onCopyCommand: (command: string, index: number) => void
  gistStatus: SnippetsGistStatus | null
  gistBusy: 'push' | 'pull' | 'unlink' | null
  gistDisabled: boolean
  onPushGist: () => void
  onPullGist: () => void
  onUnlinkGist: () => void
}) {
  const placeholders = useMemo(() => detectPlaceholders(draft.body), [draft.body])
  const commands = useMemo(
    () => extractShellCommands(draft.body, draft.language),
    [draft.body, draft.language],
  )
  const symbols = useMemo(
    () => extractCodeSymbols(draft.body, draft.language),
    [draft.body, draft.language],
  )
  const tags = useMemo(() => parseTags(draft.tagsText), [draft.tagsText])
  const hasBody = draft.body.trim().length > 0
  const syncedAt = formatSyncTime(draft.gist?.syncedAt)

  return (
    <aside
      aria-label="스니펫 재사용"
      className="flex min-h-0 flex-col overflow-auto bg-muted/10"
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-[11px] text-muted-foreground">
        <span>Reuse</span>
        <span>{isShellLanguage(draft.language) ? 'commands' : 'symbols'}</span>
      </div>

      <div className="flex flex-col divide-y divide-border">
        <ReuseSection title="Clipboard">
          <div className="grid gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onCopyRaw}
              disabled={!hasBody || disabled}
              className="h-8 justify-start gap-2 px-2 text-xs"
            >
              {copied === 'raw' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Raw
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCopyFenced}
              disabled={!hasBody || disabled}
              className="h-8 justify-start gap-2 px-2 text-xs"
            >
              {copied === 'fenced' ? <Check className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
              Markdown
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCopyTitled}
              disabled={!hasBody || disabled}
              className="h-8 justify-start gap-2 px-2 text-xs"
            >
              {copied === 'titled' ? <Check className="h-3.5 w-3.5" /> : <FileCode2 className="h-3.5 w-3.5" />}
              제목 주석
            </Button>
          </div>
        </ReuseSection>

        <ReuseSection title="GitHub Gist">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <Github className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {gistStatus?.connected
                  ? `@${gistStatus.login ?? 'GitHub'}`
                  : 'GitHub 미연결'}
              </span>
            </span>
            {draft.gist?.htmlUrl ? (
              <a
                href={draft.gist.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
              >
                열기
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <div
            className={cn(
              'mb-2 rounded border px-2 py-1.5 text-[11px]',
              draft.gist && !gistStatus?.connected
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {draft.gist
              ? gistStatus?.connected
                ? '로컬 DB 유지 · Gist 연결'
                : '로컬 DB 유지 · Gist 동기화 보류'
              : '로컬 DB에만 저장'}
          </div>
          <div className="grid gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onPushGist}
              disabled={!gistStatus?.connected || disabled || gistDisabled || gistBusy != null}
              className="h-8 justify-start gap-2 px-2 text-xs"
            >
              {gistBusy === 'push' ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Github className="h-3.5 w-3.5" />
              )}
              {draft.gist ? 'Gist 업데이트' : 'Gist 만들기'}
            </Button>
            {draft.gist ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPullGist}
                  disabled={!gistStatus?.connected || disabled || gistDisabled || gistBusy != null}
                  className="h-8 justify-start gap-2 px-2 text-xs"
                >
                  {gistBusy === 'pull' ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Gist에서 가져오기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onUnlinkGist}
                  disabled={disabled || gistBusy != null}
                  className="h-8 justify-start gap-2 px-2 text-xs text-muted-foreground"
                >
                  {gistBusy === 'unlink' ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                  연결 해제
                </Button>
              </>
            ) : null}
          </div>
          {draft.gist ? (
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div className="truncate font-mono">
                {draft.gist.id}/{draft.gist.file}
              </div>
              {syncedAt ? <div>마지막 동기화 {syncedAt}</div> : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">로컬 전용</p>
          )}
        </ReuseSection>

        <ReuseSection title="Placeholders">
          {placeholders.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {placeholders.map((placeholder) => (
                <span
                  key={placeholder}
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {placeholder}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">없음</p>
          )}
        </ReuseSection>

        <ReuseSection title={isShellLanguage(draft.language) ? 'Commands' : 'Symbols'}>
          {commands.length > 0 ? (
            <div className="grid gap-1">
              {commands.map((command, index) => (
                <button
                  key={`${command}-${index}`}
                  type="button"
                  onClick={() => onCopyCommand(command, index)}
                  disabled={disabled}
                  className="flex min-w-0 items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="truncate font-mono">{command}</span>
                  {copied === `command-${index}` ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : symbols.length > 0 ? (
            <div className="grid gap-1">
              {symbols.map((symbol, index) => (
                <div
                  key={`${symbol}-${index}`}
                  className="truncate rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                >
                  {symbol}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">없음</p>
          )}
        </ReuseSection>

        <ReuseSection title="Stats">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Language</dt>
            <dd className="truncate font-mono">{normalizeLanguage(draft.language)}</dd>
            <dt className="text-muted-foreground">Lines</dt>
            <dd>{stats.lines}</dd>
            <dt className="text-muted-foreground">Chars</dt>
            <dd>{stats.chars}</dd>
            <dt className="text-muted-foreground">Bytes</dt>
            <dd>{stats.bytes}</dd>
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="truncate">{tags.length > 0 ? tags.join(', ') : '-'}</dd>
          </dl>
        </ReuseSection>
      </div>
    </aside>
  )
}

function ReuseSection({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="px-3 py-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function CodeTextArea({
  value,
  language,
  disabled,
  onChange,
}: {
  value: string
  language: string
  disabled: boolean
  onChange: (next: string) => void
}) {
  const lineCount = Math.max(1, value.split('\n').length)
  const rows = Math.max(18, Math.min(80, lineCount + 1))

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const insert = '  '
    const next = value.slice(0, start) + insert + value.slice(end)
    onChange(next)
    window.requestAnimationFrame(() => {
      target.selectionStart = start + insert.length
      target.selectionEnd = start + insert.length
    })
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background">
      <div className="grid min-w-full grid-cols-[auto_minmax(0,1fr)] items-start">
        <pre
          aria-hidden
          className="select-none border-r border-border bg-muted/25 px-2 py-3 text-right font-mono text-[11px] leading-5 text-muted-foreground"
        >
          {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
        </pre>
        <textarea
          aria-label="코드 본문"
          className="min-h-full w-full resize-none border-0 bg-transparent px-3 py-3 font-mono text-xs leading-5 outline-none placeholder:text-muted-foreground disabled:opacity-60"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={rows}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          data-language={normalizeLanguage(language)}
          placeholder="코드를 입력하세요."
        />
      </div>
    </div>
  )
}

function HighlightedCode({
  code,
  language,
  compact,
  className,
}: {
  code: string
  language: string
  compact?: boolean
  className?: string
}) {
  const html = useMemo(() => highlightedHtml(code, language), [code, language])
  return (
    <pre
      className={cn(
        'm-0 bg-transparent font-mono text-xs leading-5',
        compact ? 'p-2' : 'p-4',
        className,
      )}
    >
      <code
        className={cn(
          'hljs block bg-transparent p-0',
          resolveHighlightLanguage(language)
            ? `language-${resolveHighlightLanguage(language)}`
            : undefined,
        )}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }}
      />
    </pre>
  )
}

function LanguageBadge({ language }: { language: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
      <Code2 className="h-3 w-3" />
      {normalizeLanguage(language)}
    </span>
  )
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-8 gap-1 px-2"
    >
      {children}
    </Button>
  )
}

function SnippetAiActionsMenu({
  onRun,
  disabled,
}: {
  onRun: (id: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="코드 스니펫 AI 액션"
        className="h-8 gap-1 px-2"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span className="text-xs">AI</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-64 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {SNIPPET_AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onRun(action.id)
              }}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3 w-3 text-primary" />
                {action.label}
              </span>
              <span className="pl-4 text-[11px] text-muted-foreground">
                {action.description}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
