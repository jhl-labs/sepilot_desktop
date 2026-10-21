import type {
  WikiFolderEntry,
  WikiImportPreview,
  WikiImportSource,
  WikiImportStrategy,
  WikiPortableBackup,
} from '@/lib/api/wiki'

const MAX_MARKDOWN_IMPORT_FILES = 100
const MAX_MARKDOWN_FILE_BYTES = 2 * 1024 * 1024
const MAX_MARKDOWN_IMPORT_BYTES = 10 * 1024 * 1024
const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024

export interface ParsedWikiImport {
  source: WikiImportSource
  label: string
  fileNames: string[]
  ignoredPaths?: string[]
  folderSummary?: {
    directoryCount: number
    totalBytes: number
  }
}

export interface WikiFolderImportSelectionLike {
  rootName: string
  entries: WikiFolderEntry[]
  ignoredPaths: string[]
  directoryCount: number
  totalBytes: number
}

export interface PendingWikiImport extends ParsedWikiImport {
  preview: WikiImportPreview
  strategy: WikiImportStrategy
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function parsePortableBackup(content: string): WikiPortableBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('백업 파일이 올바른 JSON 형식이 아닙니다.')
  }
  if (
    !isRecord(parsed)
    || parsed.format !== 'sepilotd.wiki.backup'
    || parsed.formatVersion !== 1
    || typeof parsed.exportedAt !== 'number'
    || !Array.isArray(parsed.nodes)
  ) {
    throw new Error('지원하지 않는 Wiki 백업 파일입니다.')
  }
  const validNodes = parsed.nodes.every((node) =>
    isRecord(node)
    && typeof node.id === 'string'
    && (node.parentId === null || typeof node.parentId === 'string')
    && typeof node.title === 'string'
    && (node.icon === null || typeof node.icon === 'string')
    && (node.group === null || typeof node.group === 'string')
    && typeof node.order === 'number'
    && typeof node.body === 'string'
    && typeof node.updatedAt === 'number')
  if (!validNodes) throw new Error('백업 파일의 문서 데이터가 올바르지 않습니다.')
  return parsed as unknown as WikiPortableBackup
}

export async function parseWikiImportFiles(files: File[]): Promise<ParsedWikiImport> {
  if (files.length === 0) throw new Error('가져올 파일을 선택하세요.')
  if (files.length > MAX_MARKDOWN_IMPORT_FILES) {
    throw new Error(`한 번에 최대 ${MAX_MARKDOWN_IMPORT_FILES}개 파일을 가져올 수 있습니다.`)
  }

  const extensions = files.map((file) => file.name.toLocaleLowerCase())
  const isBackup = files.length === 1 && extensions[0]?.endsWith('.sepilotwiki')
  const isMarkdown = extensions.every(
    (name) => name.endsWith('.md') || name.endsWith('.markdown'),
  )
  if (!isBackup && !isMarkdown) {
    throw new Error('.md, .markdown 파일 또는 단일 .sepilotwiki 백업을 선택하세요.')
  }

  if (isBackup) {
    const file = files[0]!
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      throw new Error('Wiki 백업 파일은 25MB를 넘을 수 없습니다.')
    }
    return {
      source: { type: 'backup', archive: parsePortableBackup(await file.text()) },
      label: file.name,
      fileNames: [file.name],
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_MARKDOWN_IMPORT_BYTES) {
    throw new Error('선택한 Markdown 파일의 전체 크기는 10MB를 넘을 수 없습니다.')
  }
  const oversized = files.find((file) => file.size > MAX_MARKDOWN_FILE_BYTES)
  if (oversized) {
    throw new Error(`'${oversized.name}' 파일은 2MB를 넘을 수 없습니다.`)
  }
  const markdownFiles = await Promise.all(
    files.map(async (file) => ({ name: file.name, content: await file.text() })),
  )
  return {
    source: { type: 'markdown', files: markdownFiles, parentId: null },
    label: files.length === 1 ? files[0]!.name : `Markdown ${files.length}개`,
    fileNames: files.map((file) => file.name),
  }
}

export function parseWikiImportFolder(
  selection: WikiFolderImportSelectionLike,
): ParsedWikiImport {
  const rootName = selection.rootName.trim()
  if (!rootName) throw new Error('선택한 폴더 이름을 확인할 수 없습니다.')
  if (selection.entries.length === 0) {
    throw new Error('선택한 폴더에 가져올 Markdown 문서나 하위 폴더가 없습니다.')
  }

  const markdownPaths = selection.entries
    .filter((entry): entry is Extract<WikiFolderEntry, { kind: 'file' }> =>
      entry.kind === 'file' && entry.relativePath !== '.sepilot-wiki.json')
    .map((entry) => entry.relativePath)

  return {
    source: {
      type: 'folder',
      rootName,
      entries: selection.entries,
      parentId: null,
    },
    label: rootName,
    fileNames: markdownPaths,
    ignoredPaths: selection.ignoredPaths,
    folderSummary: {
      directoryCount: selection.directoryCount,
      totalBytes: selection.totalBytes,
    },
  }
}

export function safeDownloadName(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
  const candidate = sanitized || fallback
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(candidate)
    ? `_${candidate}`
    : candidate
}

export function wikiPageMarkdown(title: string, body: string): string {
  const bodyTitle = body
    .replace(/^\uFEFF/u, '')
    .match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/mu)?.[1]
    ?.trim()
  const content = bodyTitle === title
    ? body
    : body
      ? `# ${title}\n\n${body}`
      : `# ${title}`
  return content.endsWith('\n') ? content : `${content}\n`
}

export function downloadTextFile(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
