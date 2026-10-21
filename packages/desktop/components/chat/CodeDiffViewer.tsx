'use client'
import { useMemo, useState } from 'react'
import hljs from 'highlight.js'
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  md: 'markdown',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  xml: 'xml',
}

function resolveLanguageFromFilePath(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return null
  const candidate = EXTENSION_LANGUAGE[ext]
  return candidate && hljs.getLanguage(candidate) ? candidate : null
}

function highlightLine(code: string, language: string | null): string {
  if (!code) return ''
  try {
    if (language) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

export interface CodeDiffViewerProps {
  filePath: string
  oldContent: string
  newContent: string
  onAccept?: () => void
  onReject?: () => void
  defaultExpanded?: boolean
}

interface DiffLine {
  lineNum: number
  old: string | null
  new: string | null
  type: 'unchanged' | 'added' | 'removed' | 'modified'
}

export function CodeDiffViewer({
  filePath,
  oldContent,
  newContent,
  onAccept,
  onReject,
  defaultExpanded = true,
}: CodeDiffViewerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const language = useMemo(() => resolveLanguageFromFilePath(filePath), [filePath])

  const diffLines = useMemo<DiffLine[]>(() => {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')
    const maxLines = Math.max(oldLines.length, newLines.length)

    const lines: DiffLine[] = []
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]

      if (oldLine === newLine) {
        lines.push({
          lineNum: i + 1,
          old: oldLine ?? null,
          new: newLine ?? null,
          type: 'unchanged',
        })
      } else if (oldLine === undefined) {
        lines.push({ lineNum: i + 1, old: null, new: newLine, type: 'added' })
      } else if (newLine === undefined) {
        lines.push({
          lineNum: i + 1,
          old: oldLine,
          new: null,
          type: 'removed',
        })
      } else {
        lines.push({
          lineNum: i + 1,
          old: oldLine,
          new: newLine,
          type: 'modified',
        })
      }
    }
    return lines
  }, [oldContent, newContent])

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    let modified = 0
    for (const line of diffLines) {
      if (line.type === 'added') added++
      else if (line.type === 'removed') removed++
      else if (line.type === 'modified') modified++
    }
    return { added, removed, modified }
  }, [diffLines])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b bg-muted/50">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/70"
          aria-expanded={isExpanded}
          aria-label="파일 변경사항 접기/펼치기"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-mono text-sm font-medium">{filePath}</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            {stats.added > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                +{stats.added}
              </span>
            ) : null}
            {stats.removed > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                -{stats.removed}
              </span>
            ) : null}
            {stats.modified > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                ~{stats.modified}
              </span>
            ) : null}
          </div>
        </button>
      </div>

      {isExpanded ? (
        <>
          <div className="max-h-[400px] overflow-auto bg-muted/20 p-3 font-mono text-xs">
            {diffLines.map((line, idx) => {
              let bgClass = ''
              let textClass = 'text-muted-foreground'
              let prefix = ' '

              switch (line.type) {
                case 'added':
                  bgClass = 'bg-emerald-500/10'
                  textClass = 'text-emerald-700 dark:text-emerald-300'
                  prefix = '+'
                  break
                case 'removed':
                  bgClass = 'bg-red-500/10'
                  textClass = 'text-red-700 dark:text-red-300'
                  prefix = '-'
                  break
                case 'modified':
                  bgClass = 'bg-amber-500/10'
                  textClass = 'text-amber-700 dark:text-amber-300'
                  prefix = '~'
                  break
                default:
                  bgClass = ''
                  textClass = 'text-muted-foreground'
              }

              const displayLine = line.new !== null ? line.new : line.old

              return (
                <div
                  key={idx}
                  className={cn('flex gap-2 px-2 py-0.5', bgClass)}
                >
                  <span className="w-8 select-none text-right text-muted-foreground">
                    {line.lineNum}
                  </span>
                  <span className={cn('select-none', textClass)}>{prefix}</span>
                  <span
                    className="whitespace-pre text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: highlightLine(displayLine ?? '', language) || '&nbsp;',
                    }}
                  />
                </div>
              )
            })}
          </div>

          {onAccept || onReject ? (
            <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-3 py-2">
              {onReject ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onReject}
                  className="gap-1"
                  aria-label="거부"
                >
                  <X className="h-3 w-3" />
                  거부
                </Button>
              ) : null}
              {onAccept ? (
                <Button
                  size="sm"
                  onClick={onAccept}
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  aria-label="수락"
                >
                  <Check className="h-3 w-3" />
                  수락
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
