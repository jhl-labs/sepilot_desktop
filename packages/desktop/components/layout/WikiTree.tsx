'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { confirm } from '@/lib/utils/confirm'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderOpen,
  ListTree,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createDocClient,
  type DesktopWikiFolderExportPreview,
  type DocDiffPreview,
} from '@sepilotd/api-client'
import { useTransport } from '@/components/providers/transport-provider'
import { createChatApi } from '@/lib/api/chat'
import {
  createWikiApi,
  type WikiImportSource,
  type WikiImportStrategy,
  type WikiSearchHit,
} from '@/lib/api/wiki'
import { useWikiStore, type WikiNode } from '@/lib/store/wiki-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ViewportActionMenu } from '@/components/ui/ViewportActionMenu'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { getDesktopApi } from '@/lib/electron/bridge'
import { cn } from '@/lib/utils/cn'
import {
  downloadTextFile,
  parseWikiImportFolder,
  parseWikiImportFiles,
  safeDownloadName,
  wikiPageMarkdown,
  type ParsedWikiImport,
  type PendingWikiImport,
} from '@/lib/wiki-file-transfer'
import {
  MarkdownEditorSurface,
  type MarkdownEditorSurfaceRef,
} from '@/components/writing/MarkdownEditorSurface'
import {
  DOC_ACTIONS,
  buildContinueWritingPrompt,
  type DocAction,
} from '@/components/writing/WritingActions'

interface Tree {
  node: WikiNode
  children: Tree[]
}

const AI_MENU_GAP = 4
const AI_MENU_GUTTER = 8

interface AiMenuPosition {
  top: number
  left: number
  maxHeight: number
  ready: boolean
}

export function buildTree(nodes: WikiNode[]): Tree[] {
  const byParent = new Map<string | null, WikiNode[]>()
  nodes.forEach((n) => {
    const arr = byParent.get(n.parentId) ?? []
    arr.push(n)
    byParent.set(n.parentId, arr)
  })
  function build(parentId: string | null): Tree[] {
    return (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((n) => ({ node: n, children: build(n.id) }))
  }
  return build(null)
}

interface EditingState {
  id?: string
  parentId: string | null
  title: string
  icon: string
  group: string
  body: string
}

function emptyEditing(parentId: string | null): EditingState {
  return { parentId, title: '', icon: '', group: '', body: '' }
}

function nodeToEditing(n: WikiNode): EditingState {
  return {
    id: n.id,
    parentId: n.parentId,
    title: n.title,
    icon: n.icon ?? '',
    group: n.group ?? '',
    body: n.body ?? '',
  }
}

function sameEditing(a: EditingState, b: EditingState): boolean {
  return (
    a.id === b.id
    && a.parentId === b.parentId
    && a.title === b.title
    && a.icon === b.icon
    && a.group === b.group
    && a.body === b.body
  )
}

function draftHasChanges(draft: EditingState | null, nodes: WikiNode[]): boolean {
  if (!draft) return false
  if (draft.id) {
    const node = nodes.find((n) => n.id === draft.id)
    if (!node) return true
    return !sameEditing(draft, nodeToEditing(node))
  }
  return !sameEditing(draft, emptyEditing(draft.parentId))
}

function buildWikiAiPrompt(draft: EditingState, instruction: string): string {
  return [
    '이 작업 대상은 desktop Wiki 노드의 Markdown 본문입니다.',
    `Wiki 제목: ${draft.title.trim() || '(제목 없음)'}`,
    draft.group.trim() ? `Wiki 그룹: ${draft.group.trim()}` : null,
    '',
    '반드시 활성 문서에 대해 doc.* 도구만 사용하세요. 파일 시스템 도구나 wiki REST API를 호출하지 마세요.',
    '변경 결과는 desktop Wiki 편집 화면에 draft로 반영되고, 사용자가 저장 버튼을 눌러 Wiki DB에 저장합니다.',
    '',
    instruction,
  ].filter(Boolean).join('\n')
}

interface TreeNodeProps {
  tree: Tree
  depth: number
  onOpen: (n: WikiNode) => void
  onDelete: (n: WikiNode) => void
  onCreateChild: (parentId: string) => void
}

function TreeNode({ tree, depth, onOpen, onDelete, onCreateChild }: TreeNodeProps) {
  const selected = useWikiStore((s) => s.selectedId)
  const isSelected = selected === tree.node.id
  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded px-2 py-1 hover:bg-muted',
          isSelected && 'bg-muted',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          onClick={() => onOpen(tree.node)}
          className="flex-1 truncate text-left text-sm"
        >
          {tree.node.icon ? `${tree.node.icon} ` : ''}
          {tree.node.title}
        </button>
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
            isSelected && 'opacity-100',
          )}
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onCreateChild(tree.node.id)
            }}
            aria-label={`${tree.node.title} 아래 새 노드`}
            title="자식 추가"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(tree.node)
            }}
            aria-label={`${tree.node.title} 편집`}
            title="편집"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(tree.node)
            }}
            aria-label={`${tree.node.title} 삭제`}
            title="삭제"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {tree.children.map((c) => (
        <TreeNode
          key={c.node.id}
          tree={c}
          depth={depth + 1}
          onOpen={onOpen}
          onDelete={onDelete}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  )
}

export function WikiTree() {
  const nodes = useWikiStore((s) => s.nodes)
  const setNodes = useWikiStore((s) => s.setNodes)
  const selectedId = useWikiStore((s) => s.selectedId)
  const setSelected = useWikiStore((s) => s.setSelected)
  const transport = useTransport()
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<WikiSearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingWikiImport | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pendingFolderExport, setPendingFolderExport] =
    useState<DesktopWikiFolderExportPreview | null>(null)
  const [folderExportBusy, setFolderExportBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const importPreviewRequestRef = useRef(0)
  const trees = useMemo(() => buildTree(nodes), [nodes])
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  )
  const dirty = draftHasChanges(editing, nodes)

  useEffect(() => {
    if (editing || !selectedNode) return
    setEditing(nodeToEditing(selectedNode))
  }, [editing, selectedNode])

  useEffect(() => {
    if (!editing?.id) return
    if (nodes.some((node) => node.id === editing.id)) return
    setEditing(null)
  }, [editing?.id, nodes])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchHits(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const api = await createWikiApi(transport)
          const hits = await api.search(q)
          setSearchHits(hits)
        } catch {
          setSearchHits([])
        } finally {
          setSearching(false)
        }
      })()
    }, 200)
    return () => {
      window.clearTimeout(handle)
    }
  }, [query, transport])

  async function confirmDiscard(): Promise<boolean> {
    if (!draftHasChanges(editing, nodes)) return true
    if (typeof window === 'undefined') return true
    return confirm('저장하지 않은 문서 변경을 버릴까요?')
  }

  async function openDraft(next: EditingState): Promise<void> {
    if (!(await confirmDiscard())) return
    setPreviewMode(false)
    setEditing(next)
    setSelected(next.id ?? null)
  }

  function findNodeById(id: string): WikiNode | null {
    return nodes.find((n) => n.id === id) ?? null
  }

  async function refresh(preferredId?: string): Promise<WikiNode[] | null> {
    try {
      const list = await (await createWikiApi(transport)).tree()
      setNodes(list)
      if (preferredId && list.some((node) => node.id === preferredId)) {
        setSelected(preferredId)
      }
      return list
    } catch {
      return null
    }
  }

  async function previewWikiImport(
    parsed: ParsedWikiImport,
    strategy: WikiImportStrategy,
  ): Promise<void> {
    const requestId = ++importPreviewRequestRef.current
    setImportBusy(true)
    try {
      const preview = await (await createWikiApi(transport)).previewImport({
        source: parsed.source,
        strategy,
      })
      if (requestId !== importPreviewRequestRef.current) return
      setPendingImport({ ...parsed, preview, strategy })
    } catch (error) {
      if (requestId !== importPreviewRequestRef.current) return
      const friendly = explainChatStreamError(error)
      toast.error('문서를 미리 볼 수 없습니다.', {
        description: friendly.description,
      })
    } finally {
      if (requestId === importPreviewRequestRef.current) setImportBusy(false)
    }
  }

  function closeWikiImport(): void {
    importPreviewRequestRef.current += 1
    setImportBusy(false)
    setPendingImport(null)
  }

  async function confirmImportCanStart(): Promise<boolean> {
    if (!dirty) return true
    return confirm(
      '저장하지 않은 문서 변경이 있습니다. 가져오기를 완료하면 현재 편집 내용이 사라집니다. 계속할까요?',
      { destructive: true },
    )
  }

  async function selectWikiFiles(files: File[]): Promise<void> {
    if (files.length === 0) return
    if (!(await confirmImportCanStart())) return
    try {
      const parsed = await parseWikiImportFiles(files)
      await previewWikiImport(parsed, 'copy')
    } catch (error) {
      toast.error('문서 파일을 열 수 없습니다.', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function selectWikiFolder(): Promise<void> {
    if (!(await confirmImportCanStart())) return
    const wikiFiles = getDesktopApi()?.wikiFiles
    if (!wikiFiles) {
      toast.warning('폴더 가져오기를 사용하려면 Desktop 앱을 다시 시작하세요.')
      return
    }

    setImportBusy(true)
    try {
      const selection = await wikiFiles.pickImportFolder()
      if (!selection) return
      await previewWikiImport(parseWikiImportFolder(selection), 'copy')
    } catch (error) {
      toast.error('문서 폴더를 열 수 없습니다.', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImportBusy(false)
    }
  }

  async function updateImportPreview(
    source: WikiImportSource,
    strategy: WikiImportStrategy,
  ): Promise<void> {
    if (!pendingImport) return
    await previewWikiImport(
      {
        source,
        label: pendingImport.label,
        fileNames: pendingImport.fileNames,
        ignoredPaths: pendingImport.ignoredPaths,
        folderSummary: pendingImport.folderSummary,
      },
      strategy,
    )
  }

  async function applyWikiImport(): Promise<void> {
    if (!pendingImport) return
    if (pendingImport.strategy === 'replace') {
      const ok = await confirm(
        `현재 작성 문서를 모두 지우고 '${pendingImport.label}' 내용으로 교체할까요? 이 작업은 되돌릴 수 없습니다.`,
        { destructive: true },
      )
      if (!ok) return
    }

    setImportBusy(true)
    try {
      const result = await (await createWikiApi(transport)).importContent({
        source: pendingImport.source,
        strategy: pendingImport.strategy,
        previewToken: pendingImport.preview.previewToken,
        ...(pendingImport.strategy === 'replace' ? { confirmed: true } : {}),
      })
      const preferredId = result.importedNodeIds[0]
      const list = await refresh(preferredId)
      if (!list) {
        closeWikiImport()
        toast.warning('가져오기는 완료됐지만 문서 목록을 새로고침하지 못했습니다.')
        return
      }
      const nextSelected =
        list.find((node) => node.id === preferredId)
        ?? list.find((node) => node.id === selectedId)
        ?? null
      setSelected(nextSelected?.id ?? null)
      setEditing(nextSelected ? nodeToEditing(nextSelected) : null)
      closeWikiImport()
      toast.success(
        result.importedNodeIds.length > 0
          ? `작성 문서 ${result.importedNodeIds.length}개를 가져왔습니다.`
          : '가져올 새 문서가 없습니다.',
      )
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error('문서를 가져오지 못했습니다.', {
        description: friendly.description,
      })
    } finally {
      setImportBusy(false)
    }
  }

  async function exportWikiBackup(): Promise<void> {
    setExporting(true)
    try {
      const backup = await (await createWikiApi(transport)).exportBackup()
      const day = new Date(backup.exportedAt).toISOString().slice(0, 10)
      downloadTextFile(
        `${JSON.stringify(backup, null, 2)}\n`,
        `sepilot-wiki-${day}.sepilotwiki`,
        'application/json;charset=utf-8',
      )
      toast.success('작성 문서 백업을 저장했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error('작성 문서 백업을 만들지 못했습니다.', {
        description: friendly.description,
      })
    } finally {
      setExporting(false)
    }
  }

  async function previewWikiFolderExport(): Promise<void> {
    const wikiFiles = getDesktopApi()?.wikiFiles
    if (!wikiFiles) {
      toast.warning('폴더 내보내기를 사용하려면 Desktop 앱을 다시 시작하세요.')
      return
    }

    setFolderExportBusy(true)
    try {
      const folder = await (await createWikiApi(transport)).exportFolder()
      const preview = await wikiFiles.previewFolderExport(folder)
      if (preview) setPendingFolderExport(preview)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error('문서 폴더 내보내기를 준비하지 못했습니다.', {
        description: friendly.description,
      })
    } finally {
      setFolderExportBusy(false)
    }
  }

  async function applyWikiFolderExport(): Promise<void> {
    if (!pendingFolderExport) return
    const wikiFiles = getDesktopApi()?.wikiFiles
    if (!wikiFiles) {
      setPendingFolderExport(null)
      toast.warning('Desktop 앱을 다시 시작한 뒤 다시 시도하세요.')
      return
    }

    setFolderExportBusy(true)
    try {
      const result = await wikiFiles.applyFolderExport({
        token: pendingFolderExport.token,
        confirmed: pendingFolderExport.overwriteCount > 0,
      })
      setPendingFolderExport(null)
      toast.success(
        result.overwrittenCount > 0
          ? `문서 폴더를 내보냈습니다. 기존 파일 ${result.overwrittenCount}개를 갱신했습니다.`
          : `문서 폴더에 항목 ${result.createdCount}개를 만들었습니다.`,
      )
    } catch (error) {
      setPendingFolderExport(null)
      toast.error('문서 폴더를 내보내지 못했습니다.', {
        description: `${error instanceof Error ? error.message : String(error)} 다시 내보내기를 선택해 최신 상태를 확인하세요.`,
      })
    } finally {
      setFolderExportBusy(false)
    }
  }

  function exportCurrentMarkdown(): void {
    if (!editing) return
    const title = editing.title.trim() || '제목 없는 문서'
    downloadTextFile(
      wikiPageMarkdown(title, editing.body),
      `${safeDownloadName(title, 'wiki-page')}.md`,
      'text/markdown;charset=utf-8',
    )
    toast.success('현재 문서를 Markdown으로 저장했습니다.')
  }

  async function save(): Promise<void> {
    if (!editing) return
    if (!editing.title.trim()) {
      toast.warning('제목을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const api = await createWikiApi(transport)
      const siblings = nodes.filter((n) => n.parentId === editing.parentId)
      const nextOrder = editing.id
        ? (nodes.find((n) => n.id === editing.id)?.order ?? siblings.length)
        : siblings.length
      const saved = await api.upsertNode({
        ...(editing.id ? { id: editing.id } : {}),
        parentId: editing.parentId,
        title: editing.title.trim(),
        icon: editing.icon.trim() ? editing.icon.trim() : null,
        group: editing.group.trim() ? editing.group.trim() : null,
        order: nextOrder,
        body: editing.body,
      })
      const savedId = editing.id ?? saved.id
      const nextDraft = nodeToEditing({
        id: savedId,
        parentId: saved.parentId ?? editing.parentId,
        title: saved.title ?? editing.title.trim(),
        icon: saved.icon ?? (editing.icon.trim() ? editing.icon.trim() : null),
        group: saved.group ?? (editing.group.trim() ? editing.group.trim() : null),
        order: saved.order ?? nextOrder,
        body: saved.body ?? editing.body,
        updatedAt: saved.updatedAt,
      })
      toast.success(editing.id ? '문서를 저장했습니다.' : '문서를 만들었습니다.')
      setEditing(nextDraft)
      setSelected(savedId)
      await refresh(savedId)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function remove(node: WikiNode): Promise<void> {
    const ok = await confirm(
      `'${node.title}' 문서를 삭제하시겠습니까? 하위 문서도 함께 영향을 받을 수 있습니다.`,
      { destructive: true },
    )
    if (!ok) return
    setRemovingId(node.id)
    try {
      const api = await createWikiApi(transport)
      await api.removeNode(node.id)
      toast.success('문서를 삭제했습니다.')
      if (editing?.id === node.id) setEditing(null)
      await refresh(selectedId === node.id ? undefined : selectedId ?? undefined)
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
      const node = findNodeById(editing.id)
      setEditing(node ? nodeToEditing(node) : null)
      return
    }
    setEditing(selectedNode ? nodeToEditing(selectedNode) : null)
    setSelected(selectedNode?.id ?? null)
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col gap-2 border-r border-border bg-background p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">문서 목록</h2>
            <p className="text-[11px] text-muted-foreground">
              {searchHits == null
                ? `직접 작성 · AI 편집 · ${nodes.length}개`
                : `검색 결과 · ${searchHits.length}개`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/25 p-0.5">
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              className="sr-only"
              aria-label="작성 문서 파일 선택"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void selectWikiFiles(files)
              }}
            />
            <input
              ref={backupInputRef}
              type="file"
              accept=".sepilotwiki,application/json"
              className="sr-only"
              aria-label="작성 문서 백업 선택"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void selectWikiFiles(files)
              }}
            />
            <ViewportActionMenu
              ariaLabel="작성 문서 가져오기 메뉴"
              triggerAriaLabel="작성 문서 가져오기"
              align="end"
              triggerClassName="h-7 gap-1 px-2 text-[11px]"
              disabled={importBusy}
              trigger={
                <>
                  {importBusy && !pendingImport ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  가져오기 <ChevronDown className="h-3 w-3" />
                </>
              }
              items={[
                {
                  id: 'markdown-files',
                  label: 'Markdown 파일',
                  description: '한 개 또는 여러 문서를 가져옵니다.',
                  icon: <FileText className="h-4 w-4" />,
                  onSelect: () => importInputRef.current?.click(),
                },
                {
                  id: 'markdown-folder',
                  label: 'Markdown 폴더',
                  description: '하위 폴더 구조를 작성 문서 계층으로 유지합니다.',
                  icon: <FolderOpen className="h-4 w-4" />,
                  onSelect: () => void selectWikiFolder(),
                },
                {
                  id: 'portable-backup',
                  label: '문서 백업',
                  description: '.sepilotwiki 파일을 정확하게 복원합니다.',
                  icon: <Upload className="h-4 w-4" />,
                  onSelect: () => backupInputRef.current?.click(),
                },
              ]}
            />
            <ViewportActionMenu
              ariaLabel="작성 문서 내보내기 메뉴"
              triggerAriaLabel="작성 문서 내보내기"
              align="end"
              triggerClassName="h-7 gap-1 px-2 text-[11px]"
              disabled={exporting || folderExportBusy}
              trigger={
                <>
                  {exporting || folderExportBusy ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  내보내기 <ChevronDown className="h-3 w-3" />
                </>
              }
              items={[
                {
                  id: 'current-markdown',
                  label: '현재 문서',
                  description: '열려 있는 문서를 Markdown 파일로 저장합니다.',
                  icon: <FileText className="h-4 w-4" />,
                  disabled: !editing,
                  onSelect: exportCurrentMarkdown,
                },
                {
                  id: 'wiki-folder',
                  label: '전체 문서 폴더',
                  description: '계층을 유지한 편집 가능한 Markdown 폴더입니다.',
                  icon: <FolderOpen className="h-4 w-4" />,
                  onSelect: () => void previewWikiFolderExport(),
                },
                {
                  id: 'wiki-backup',
                  label: '전체 문서 백업',
                  description: '메타데이터까지 보존하는 단일 복원 파일입니다.',
                  icon: <Download className="h-4 w-4" />,
                  onSelect: () => void exportWikiBackup(),
                },
              ]}
            />
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start border-dashed text-xs"
          onClick={() => void openDraft(emptyEditing(null))}
          aria-label="새 작성 문서"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />새 문서
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 / 본문 검색"
            className="h-8 pl-7 text-xs"
            aria-label="작성 문서 검색"
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

        <div className="min-h-0 flex-1 overflow-auto">
          {searchHits != null ? (
            searching ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">검색 중...</p>
            ) : searchHits.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                일치하는 문서가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {searchHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const node = findNodeById(hit.id) ?? hit
                        void openDraft(nodeToEditing(node))
                      }}
                      className="flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left hover:bg-muted"
                    >
                      <span className="truncate text-sm font-medium">
                        {hit.icon ? `${hit.icon} ` : ''}
                        {hit.title}
                      </span>
                      {hit.snippet ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {hit.snippet}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : trees.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              <p>작성 문서가 없습니다</p>
              <button
                type="button"
                onClick={() => void openDraft(emptyEditing(null))}
                className="rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent"
              >
                첫 문서 만들기 →
              </button>
            </div>
          ) : (
            trees.map((t) => (
              <TreeNode
                key={t.node.id}
                tree={t}
                depth={0}
                onOpen={(node) => void openDraft(nodeToEditing(node))}
                onDelete={(node) => void remove(node)}
                onCreateChild={(parentId) => void openDraft(emptyEditing(parentId))}
              />
            ))
          )}
          {removingId ? (
            <p className="mt-2 text-xs text-muted-foreground">삭제 중...</p>
          ) : null}
        </div>
      </aside>

      <WikiEditorPanel
        draft={editing}
        nodes={nodes}
        dirty={dirty}
        saving={saving}
        previewMode={previewMode}
        outlineVisible={outlineVisible}
        onChangeDraft={setEditing}
        onSave={() => void save()}
        onCancel={cancelEdit}
        onTogglePreview={() => setPreviewMode((value) => !value)}
        onToggleOutline={() => setOutlineVisible((value) => !value)}
        onCreateRoot={() => void openDraft(emptyEditing(null))}
        onExportMarkdown={exportCurrentMarkdown}
      />
      {pendingImport ? (
        <WikiImportDialog
          pending={pendingImport}
          nodes={nodes}
          selectedId={selectedId}
          busy={importBusy}
          onClose={closeWikiImport}
          onChangeStrategy={(strategy) =>
            void updateImportPreview(pendingImport.source, strategy)}
          onChangeParent={(parentId) => {
            if (
              pendingImport.source.type !== 'markdown'
              && pendingImport.source.type !== 'folder'
            ) return
            void updateImportPreview(
              { ...pendingImport.source, parentId },
              pendingImport.strategy,
            )
          }}
          onApply={() => void applyWikiImport()}
        />
      ) : null}
      {pendingFolderExport ? (
        <WikiFolderExportDialog
          preview={pendingFolderExport}
          busy={folderExportBusy}
          onClose={() => {
            if (!folderExportBusy) setPendingFolderExport(null)
          }}
          onApply={() => void applyWikiFolderExport()}
        />
      ) : null}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function WikiFolderExportDialog({
  preview,
  busy,
  onClose,
  onApply,
}: {
  preview: DesktopWikiFolderExportPreview
  busy: boolean
  onClose: () => void
  onApply: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const blocked = preview.blockedConflicts.length > 0

  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-folder-export-title"
        tabIndex={-1}
        className="flex max-h-[min(640px,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FolderOpen className="h-4 w-4" />
              </span>
              <h3 id="wiki-folder-export-title" className="text-sm font-semibold">
                문서 폴더 내보내기
              </h3>
            </div>
            <p className="truncate pl-9 font-mono text-[10px] text-muted-foreground">
              {preview.displayPath}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
            disabled={busy}
            aria-label="폴더 내보내기 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div
          role="region"
          aria-label="문서 폴더 내보내기 미리보기"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]"
        >
          <p className="text-xs leading-5 text-muted-foreground">
            문서 계층을 편집 가능한 Markdown 폴더로 저장합니다. 이 미리보기 단계에서는
            아직 파일을 만들거나 덮어쓰지 않았습니다.
          </p>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-4">
            {[
              ['파일', preview.fileCount, 'text-foreground'],
              ['폴더', preview.directoryCount, 'text-foreground'],
              ['새로 생성', preview.createCount, 'text-emerald-600 dark:text-emerald-400'],
              ['덮어쓰기', preview.overwriteCount, 'text-amber-700 dark:text-amber-300'],
            ].map(([label, count, color]) => (
              <div key={String(label)} className="border-b border-r border-border px-3 py-2 last:border-r-0 sm:border-b-0">
                <div className={cn('font-mono text-lg font-semibold tabular-nums', color)}>
                  {count}
                </div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px]">
            <span className="text-muted-foreground">전체 크기</span>
            <span className="font-mono">{formatFileSize(preview.totalBytes)}</span>
          </div>

          {preview.overwriteCount > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
              같은 이름의 기존 파일 {preview.overwriteCount}개를 갱신합니다. 선택한 폴더의
              다른 파일은 삭제하지 않습니다.
            </div>
          ) : null}

          {blocked ? (
            <section className="rounded-lg border border-destructive/35 bg-destructive/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> 경로 충돌
              </div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                파일과 폴더 종류가 다르거나 심볼릭 링크인 경로는 안전하게 덮어쓸 수 없습니다.
              </p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto font-mono text-[10px] text-muted-foreground">
                {preview.blockedConflicts.map((conflict) => (
                  <li key={`${conflict.kind}:${conflict.relativePath}`} className="break-all">
                    {conflict.relativePath} · {conflict.kind}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3">
          <p className="min-w-0 text-[10px] leading-4 text-muted-foreground">
            적용 직전 경로 상태를 다시 확인합니다.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              취소
            </Button>
            <Button size="sm" onClick={onApply} disabled={busy || blocked}>
              {busy ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {blocked
                ? '충돌 해결 필요'
                : preview.overwriteCount > 0
                  ? `${preview.overwriteCount}개 덮어쓰고 내보내기`
                  : '폴더로 내보내기'}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function WikiImportDialog({
  pending,
  nodes,
  selectedId,
  busy,
  onClose,
  onChangeStrategy,
  onChangeParent,
  onApply,
}: {
  pending: PendingWikiImport
  nodes: WikiNode[]
  selectedId: string | null
  busy: boolean
  onClose: () => void
  onChangeStrategy: (strategy: WikiImportStrategy) => void
  onChangeParent: (parentId: string | null) => void
  onApply: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null
  const skipped = Math.max(
    0,
    pending.preview.incomingCount
      - pending.preview.createCount
      - pending.preview.updateCount,
  )
  const canChooseParent =
    pending.source.type === 'markdown' || pending.source.type === 'folder'
  const importParent =
    pending.source.type === 'markdown' || pending.source.type === 'folder'
      ? pending.source.parentId ?? null
      : null
  const isFolder = pending.source.type === 'folder'

  useEffect(() => {
    dialogRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const strategyOptions: Array<{
    value: WikiImportStrategy
    label: string
    description: string
  }> = [
    { value: 'copy', label: '복사', description: '기존 문서는 그대로 두고 새 문서로 추가' },
    { value: 'merge', label: '병합', description: '같은 ID의 문서만 가져온 내용으로 갱신' },
    { value: 'replace', label: '전체 교체', description: '현재 작성 문서를 지우고 선택 파일로 대체' },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-import-title"
        tabIndex={-1}
        className="flex max-h-[min(720px,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Upload className="h-4 w-4" />
              </span>
              <h3 id="wiki-import-title" className="truncate text-sm font-semibold">
                {isFolder ? '문서 폴더 가져오기' : '문서 파일 가져오기'}
              </h3>
            </div>
            <p className="truncate pl-9 text-[11px] text-muted-foreground">
              {pending.label} · 적용 전 미리보기
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
            disabled={busy}
            aria-label="가져오기 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div
          role="region"
          aria-label="작성 문서 가져오기 설정과 미리보기"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]"
        >
          <section aria-labelledby="wiki-import-files-heading">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 id="wiki-import-files-heading" className="text-xs font-semibold">
                {isFolder ? '선택한 폴더' : '선택한 파일'}
              </h4>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {pending.preview.incomingCount}개 문서
              </span>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              {pending.folderSummary ? (
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-border/70 pb-2 text-[10px] text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{pending.label}</span>
                  </span>
                  <span className="shrink-0 font-mono">
                    폴더 {pending.folderSummary.directoryCount} ·{' '}
                    {formatFileSize(pending.folderSummary.totalBytes)}
                  </span>
                </div>
              ) : null}
              <ul className="space-y-1 text-[11px] text-foreground/85">
                {pending.fileNames.slice(0, 5).map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{name}</span>
                  </li>
                ))}
              </ul>
              {pending.fileNames.length > 5 ? (
                <p className="mt-1 pl-5 text-[10px] text-muted-foreground">
                  외 {pending.fileNames.length - 5}개
                </p>
              ) : null}
              {pending.fileNames.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  빈 폴더 구조만 가져옵니다.
                </p>
              ) : null}
            </div>
          </section>

          {pending.ignoredPaths && pending.ignoredPaths.length > 0 ? (
            <section className="rounded-lg border border-border bg-muted/15 p-3">
              <div className="text-xs font-medium">
                제외한 항목 {pending.ignoredPaths.length}개
              </div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                Markdown이 아니거나 심볼릭 링크인 항목은 읽지 않았습니다.
              </p>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto font-mono text-[10px] text-muted-foreground">
                {pending.ignoredPaths.slice(0, 20).map((path) => (
                  <li key={path} className="break-all">{path}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {canChooseParent ? (
            <section aria-labelledby="wiki-import-parent-heading">
              <h4 id="wiki-import-parent-heading" className="mb-2 text-xs font-semibold">
                추가 위치
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChangeParent(null)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    importParent === null
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className="block text-xs font-medium">작성 문서 최상위</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {isFolder ? '폴더 계층을 최상위에 추가' : '독립 문서로 추가'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy || !selectedNode}
                  onClick={() => selectedNode && onChangeParent(selectedNode.id)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    selectedNode && importParent === selectedNode.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className="block truncate text-xs font-medium">
                    선택 문서 아래
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {selectedNode?.title ?? '먼저 문서를 선택하세요'}
                  </span>
                </button>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="wiki-import-strategy-heading">
            <h4 id="wiki-import-strategy-heading" className="mb-2 text-xs font-semibold">
              적용 방식
            </h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {strategyOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy}
                  aria-pressed={pending.strategy === option.value}
                  onClick={() => onChangeStrategy(option.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    pending.strategy === option.value
                      ? option.value === 'replace'
                        ? 'border-destructive bg-destructive/5'
                        : 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className="block text-xs font-medium">{option.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="wiki-import-preview-heading">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 id="wiki-import-preview-heading" className="text-xs font-semibold">
                변경 미리보기
              </h4>
              {busy ? (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <LoaderCircle className="h-3 w-3 animate-spin" /> 갱신 중
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-4">
              {[
                ['새로 생성', pending.preview.createCount, 'text-emerald-600 dark:text-emerald-400'],
                ['업데이트', pending.preview.updateCount, 'text-sky-600 dark:text-sky-400'],
                ['건너뜀', skipped, 'text-muted-foreground'],
                ['삭제', pending.preview.deleteCount, 'text-destructive'],
              ].map(([label, count, color]) => (
                <div key={String(label)} className="border-b border-r border-border px-3 py-2 last:border-r-0 sm:border-b-0">
                  <div className={cn('font-mono text-lg font-semibold tabular-nums', color)}>
                    {count}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </section>

          {pending.preview.conflicts.length > 0 ? (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                같은 ID의 문서 {pending.preview.conflicts.length}개
              </div>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                {pending.preview.conflicts.map((conflict) => (
                  <li key={conflict.id} className="truncate">
                    {conflict.title} <span className="font-mono text-[10px]">({conflict.id})</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pending.preview.warnings.length > 0 ? (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> 확인할 내용
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-muted-foreground">
                {pending.preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3">
          <p className="min-w-0 text-[10px] leading-4 text-muted-foreground">
            {pending.strategy === 'replace'
              ? '전체 교체는 한 번 더 확인한 뒤 적용됩니다.'
              : '이 단계에서는 아직 작성 문서가 변경되지 않았습니다.'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              취소
            </Button>
            <Button
              size="sm"
              variant={pending.strategy === 'replace' ? 'destructive' : 'default'}
              onClick={onApply}
              disabled={busy}
            >
              {busy ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {pending.strategy === 'replace' ? '전체 교체' : '가져오기'}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function WikiEditorPanel({
  draft,
  nodes,
  dirty,
  saving,
  previewMode,
  outlineVisible,
  onChangeDraft,
  onSave,
  onCancel,
  onTogglePreview,
  onToggleOutline,
  onCreateRoot,
  onExportMarkdown,
}: {
  draft: EditingState | null
  nodes: WikiNode[]
  dirty: boolean
  saving: boolean
  previewMode: boolean
  outlineVisible: boolean
  onChangeDraft: (next: EditingState | null) => void
  onSave: () => void
  onCancel: () => void
  onTogglePreview: () => void
  onToggleOutline: () => void
  onCreateRoot: () => void
  onExportMarkdown: () => void
}) {
  const parent = draft?.parentId ? nodes.find((node) => node.id === draft.parentId) : null
  const transport = useTransport()
  const editorRef = useRef<MarkdownEditorSurfaceRef>(null)
  const assistantDocRef = useRef<{
    id: string
    content: string
    client: ReturnType<typeof createDocClient>
  } | null>(null)
  const lastAiBodyRef = useRef<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<DocDiffPreview | null>(null)

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
  }, [draft?.id, draft?.parentId])

  async function openAssistantDoc(currentDraft: EditingState) {
    const existing = assistantDocRef.current
    if (existing) {
      void existing.client.close(existing.id).catch(() => {})
      assistantDocRef.current = null
    }
    const cfg = await transport.getConfig()
    const client = createDocClient({ baseUrl: cfg.daemonOrigin, token: cfg.daemonToken })
    const session = await client.open({ path: null, initialContent: currentDraft.body })
    assistantDocRef.current = {
      id: session.id,
      content: session.content,
      client,
    }
    return assistantDocRef.current
  }

  async function runWikiAi(instruction: string): Promise<void> {
    if (!draft || aiBusy) return
    if (!draft.title.trim()) {
      toast.warning('AI 편집 전에 제목을 입력하세요.')
      return
    }
    if (pendingPreview) {
      toast.warning('먼저 변경 미리보기를 수락하거나 취소하세요.')
      return
    }
    setAiBusy(true)
    let keepAssistantDocOpen = false
    try {
      const assistantDoc = await openAssistantDoc(draft)
      const api = await createChatApi(transport)
      let streamError: Error | null = null
      await api.stream(
        undefined,
        buildWikiAiPrompt(draft, instruction),
        {
          onUpsertMessage: () => {},
          onDone: () => {},
          onError: (error) => {
            streamError = error
          },
        },
        { chat: { mode: 'writing' } },
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
      if (fresh.content !== draft.body) {
        lastAiBodyRef.current = draft.body
        onChangeDraft({ ...draft, body: fresh.content })
        assistantDocRef.current = {
          ...assistantDoc,
          content: fresh.content,
        }
        toast.success('AI 편집을 본문에 반영했습니다.')
      } else {
        toast.info('AI가 본문을 변경하지 않았습니다.')
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

  function continueWriting(): void {
    if (!draft) return
    const view = editorRef.current?.view
    const cursor = view?.state.selection.main.head ?? draft.body.length
    const doc = view?.state.doc
    const before = doc ? doc.sliceString(0, cursor) : draft.body.slice(0, cursor)
    const after = doc ? doc.sliceString(cursor) : draft.body.slice(cursor)
    void runWikiAi(buildContinueWritingPrompt({
      cursor,
      precedingText: before,
      followingText: after,
    }))
  }

  function runDocAction(actionId: string): void {
    const action = DOC_ACTIONS.find((candidate) => candidate.id === actionId)
    if (!action) return
    void runWikiAi(action.buildPrompt())
  }

  function undoAiEdit(): void {
    if (!draft || lastAiBodyRef.current == null) {
      toast.info('되돌릴 AI 편집이 없습니다.')
      return
    }
    const previous = lastAiBodyRef.current
    lastAiBodyRef.current = null
    onChangeDraft({ ...draft, body: previous })
    toast.success('마지막 AI 편집을 되돌렸습니다.')
  }

  async function acceptPreview(): Promise<void> {
    const assistantDoc = assistantDocRef.current
    if (!draft || !assistantDoc || !pendingPreview) return
    setAiBusy(true)
    try {
      await assistantDoc.client.acceptPreview(assistantDoc.id, pendingPreview.id)
      const fresh = await assistantDoc.client.get(assistantDoc.id)
      lastAiBodyRef.current = draft.body
      onChangeDraft({ ...draft, body: fresh.content })
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

  if (!draft) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-background">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">문서를 선택하세요</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              왼쪽 목록에서 문서를 선택하거나 새 문서를 만드세요.
            </p>
          </div>
          <Button size="sm" onClick={onCreateRoot}>
            <Plus className="mr-1 h-4 w-4" />새 문서
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section
      role="region"
      aria-label="작성 문서 편집"
      className="flex min-w-0 flex-1 flex-col bg-background"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background/95 px-2">
        <FileText className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground xl:block" />
        <div className="hidden min-w-0 flex-1 pl-1 xl:block">
          <div className="truncate font-mono text-xs text-foreground/90">
            {draft.id
              ? draft.title.trim() || '제목 없는 문서'
              : draft.parentId
                ? '하위 문서 만들기'
                : '새 문서'}
          </div>
          {parent ? (
            <div className="truncate text-[11px] text-muted-foreground">
              상위: {parent.title}
            </div>
          ) : null}
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
          <Button
            size="sm"
            variant="default"
            onClick={continueWriting}
            disabled={aiBusy || previewMode || Boolean(pendingPreview)}
            className="h-8 gap-1.5 px-3 text-xs"
            title="cursor 위치에서 LLM이 이어 씁니다"
          >
            {aiBusy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="hidden xl:inline">이어쓰기</span>
          </Button>
          <WikiAiActionsMenu
            onRun={runDocAction}
            disabled={aiBusy || previewMode || Boolean(pendingPreview)}
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

        <ToolbarGroup>
          <IconButton
            label={outlineVisible ? '목차 숨기기' : '목차 표시'}
            onClick={onToggleOutline}
            disabled={aiBusy || Boolean(pendingPreview)}
            pressed={outlineVisible}
          >
            {outlineVisible ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            <ListTree className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label={previewMode ? '편집기로' : '렌더 미리보기'}
            onClick={onTogglePreview}
            disabled={aiBusy || Boolean(pendingPreview)}
            pressed={previewMode}
          >
            <Eye className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="현재 문서를 Markdown으로 내보내기"
            onClick={onExportMarkdown}
            disabled={aiBusy || Boolean(pendingPreview)}
          >
            <Download className="h-4 w-4" />
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
          <X className="h-3.5 w-3.5" />
          취소
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || aiBusy || Boolean(pendingPreview) || !draft.title.trim()}
          className="h-8 gap-1 px-2 text-xs"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </header>

      <div className="grid shrink-0 gap-3 border-b border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_96px_minmax(120px,180px)]">
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          제목
          <Input
            type="text"
            autoFocus={!draft.id}
            value={draft.title}
            onChange={(e) =>
              onChangeDraft({ ...draft, title: e.target.value })
            }
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="제목"
            placeholder="문서 제목"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          아이콘
          <Input
            type="text"
            value={draft.icon}
            onChange={(e) => onChangeDraft({ ...draft, icon: e.target.value })}
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="아이콘"
            placeholder="예: 📘"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs">
          그룹
          <Input
            type="text"
            value={draft.group}
            onChange={(e) => onChangeDraft({ ...draft, group: e.target.value })}
            disabled={saving || aiBusy || Boolean(pendingPreview)}
            aria-label="그룹"
            placeholder="guides"
          />
        </label>
      </div>

      <MarkdownEditorSurface
        ref={editorRef}
        content={draft.body}
        onChange={(body) => onChangeDraft({ ...draft, body })}
        previewMode={previewMode}
        outlineVisible={outlineVisible}
        editorAriaLabel="작성 문서 본문"
        readOnly={saving || aiBusy || Boolean(pendingPreview)}
        placeholder="문서 본문을 Markdown으로 작성하세요."
        emptyPreviewMessage="미리보기할 본문이 없습니다."
      >
        {pendingPreview ? (
          <div
            role="dialog"
            aria-labelledby="wiki-change-preview-title"
            className="absolute inset-x-3 bottom-3 z-10 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-md border border-border bg-background/95 shadow-lg"
          >
            <header className="shrink-0 border-b border-border px-3 py-2">
              <div id="wiki-change-preview-title" className="text-sm font-semibold">
                변경 미리보기
              </div>
            </header>
            <div
              role="region"
              aria-label="변경 내용"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-xs [scrollbar-gutter:stable]"
            >
              <div className="mb-2 text-xs text-muted-foreground">{pendingPreview.summary}</div>
              <div className="space-y-2">
                {pendingPreview.changes.slice(0, 5).map((change, index) => (
                  <div key={index} className="rounded bg-muted/40 p-2 font-mono">
                    <div className="mb-1 text-[10px] text-muted-foreground">
                      {change.start}..{change.end} {'->'} +{change.newText.length}자
                    </div>
                    <div className="whitespace-pre-wrap break-words text-xs [overflow-wrap:anywhere]">
                      {change.newText.slice(0, 200)}
                      {change.newText.length > 200 ? '...' : ''}
                    </div>
                  </div>
                ))}
                {pendingPreview.changes.length > 5 ? (
                  <div className="text-[11px] text-muted-foreground">
                    +{pendingPreview.changes.length - 5} more
                  </div>
                ) : null}
              </div>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-3 py-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void cancelPreview()}
                disabled={aiBusy}
              >
                <X className="mr-1 h-3.5 w-3.5" /> 취소
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => void acceptPreview()}
                disabled={aiBusy}
              >
                <Check className="mr-1 h-3.5 w-3.5" /> 수락
              </Button>
            </footer>
          </div>
        ) : null}
      </MarkdownEditorSurface>
    </section>
  )
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn('h-8 gap-1 px-2', pressed && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  )
}

function WikiAiActionsMenu({
  onRun,
  disabled,
}: {
  onRun: (id: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<AiMenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointer(event: PointerEvent) {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }

    function updateMenuPosition() {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const viewportMenuHeight = Math.max(0, viewportHeight - AI_MENU_GUTTER * 2)
      const naturalMenuHeight = Math.min(
        Math.max(menu.scrollHeight, menuRect.height),
        viewportMenuHeight,
      )
      const availableBelow = Math.max(
        0,
        viewportHeight - AI_MENU_GUTTER - triggerRect.bottom - AI_MENU_GAP,
      )
      const availableAbove = Math.max(0, triggerRect.top - AI_MENU_GAP - AI_MENU_GUTTER)
      const placeBelow =
        naturalMenuHeight <= availableBelow ||
        (naturalMenuHeight > availableAbove && availableBelow >= availableAbove)
      const maxHeight = Math.min(naturalMenuHeight, placeBelow ? availableBelow : availableAbove)
      const top = placeBelow
        ? triggerRect.bottom + AI_MENU_GAP
        : Math.max(AI_MENU_GUTTER, triggerRect.top - AI_MENU_GAP - maxHeight)
      const maxLeft = Math.max(AI_MENU_GUTTER, viewportWidth - menuRect.width - AI_MENU_GUTTER)
      const left = Math.min(Math.max(AI_MENU_GUTTER, triggerRect.right - menuRect.width), maxLeft)

      setMenuPosition({ top, left, maxHeight, ready: true })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        size="sm"
        variant="ghost"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="문서 단위 AI 액션"
        className="h-8 gap-1 px-2"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span className="text-xs">AI</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </Button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="문서 단위 AI 액션"
              className="fixed z-[70] w-max min-w-64 max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-border bg-popover text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
              style={{
                top: menuPosition?.top ?? AI_MENU_GUTTER,
                left: menuPosition?.left ?? AI_MENU_GUTTER,
                maxHeight: menuPosition?.maxHeight,
                visibility: menuPosition?.ready ? 'visible' : 'hidden',
              }}
            >
              {DOC_ACTIONS.map((action: DocAction) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onRun(action.id)
                  }}
                  className="flex w-full min-w-max flex-col items-start gap-0.5 whitespace-nowrap px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
                    <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                    {action.label}
                  </span>
                  <span className="whitespace-nowrap pl-4 text-[11px] text-muted-foreground">
                    {action.description}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
