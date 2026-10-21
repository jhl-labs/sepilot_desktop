'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import type { DocOutlineEntry } from '@sepilotd/api-client'
import { WritingPreview } from '@/components/writing/WritingPreview'
import { cn } from '@/lib/utils/cn'

type CodeMirrorProps = ComponentProps<typeof CodeMirror>

export interface MarkdownEditorSurfaceRef {
  readonly editor: ReactCodeMirrorRef['editor']
  readonly state: ReactCodeMirrorRef['state']
  readonly view: ReactCodeMirrorRef['view']
}

interface MarkdownEditorSurfaceProps {
  content: string
  onChange: (next: string) => void
  previewMode: boolean
  outlineVisible: boolean
  placeholder?: string
  editorAriaLabel?: string
  readOnly?: boolean
  className?: string
  outlineTitle?: string
  outlineEmptyMessage?: string
  emptyPreviewMessage?: string
  onUpdate?: CodeMirrorProps['onUpdate']
  onKeyDown?: CodeMirrorProps['onKeyDown']
  children?: ReactNode
}

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const mo = new MutationObserver(update)
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return isDark
}

export function parseMarkdownOutline(content: string): DocOutlineEntry[] {
  const lines = content.split('\n')
  const headings: Array<{ level: number; title: string; lineStart: number }> = []
  let inFence = false
  let offset = 0
  const lineStarts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(offset)
    offset += lines[i].length + 1
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    headings.push({
      level: match[1].length,
      title: match[2],
      lineStart: lineStarts[i],
    })
  }
  return headings.map((heading, index) => {
    let end = content.length
    for (let next = index + 1; next < headings.length; next++) {
      if (headings[next].level <= heading.level) {
        end = headings[next].lineStart
        break
      }
    }
    return {
      level: heading.level,
      title: heading.title,
      start: heading.lineStart,
      end,
      index,
    }
  })
}

export const MarkdownEditorSurface = forwardRef<
  MarkdownEditorSurfaceRef,
  MarkdownEditorSurfaceProps
>(function MarkdownEditorSurface(
  {
    content,
    onChange,
    previewMode,
    outlineVisible,
    placeholder,
    editorAriaLabel,
    readOnly,
    className,
    outlineTitle = 'Outline',
    outlineEmptyMessage = '헤딩(#~######)을 추가하면 여기 표시됩니다.',
    emptyPreviewMessage = '미리보기할 내용이 없습니다. 편집 모드로 돌아가 작성하세요.',
    onUpdate,
    onKeyDown,
    children,
  },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const isDark = useIsDark()
  const outline = useMemo(() => parseMarkdownOutline(content), [content])
  const extensions = useMemo(() => {
    const result = [markdown(), EditorView.lineWrapping]
    if (editorAriaLabel) {
      result.push(EditorView.contentAttributes.of({ 'aria-label': editorAriaLabel }))
    }
    return result
  }, [editorAriaLabel])

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return cmRef.current?.editor
      },
      get state() {
        return cmRef.current?.state
      },
      get view() {
        return cmRef.current?.view
      },
    }),
    [],
  )

  function scrollToSection(entry: DocOutlineEntry): void {
    const view = cmRef.current?.view
    if (!view) return
    view.dispatch({
      selection: { anchor: entry.start, head: entry.start },
      effects: EditorView.scrollIntoView(entry.start, { y: 'start' }),
    })
    view.focus()
  }

  return (
    <div className={cn('flex min-h-0 flex-1', className)}>
      {outlineVisible ? (
        <aside className="hidden w-56 shrink-0 overflow-auto border-r border-border bg-muted/20 p-2 text-xs lg:block">
          <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {outlineTitle}
          </div>
          {outline.length === 0 ? (
            <div className="px-1 py-2 text-[11px] text-muted-foreground">
              {outlineEmptyMessage}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {outline.map((entry) => (
                <li key={entry.index}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(entry)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-muted"
                    style={{ paddingLeft: `${(entry.level - 1) * 12 + 4}px` }}
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {previewMode ? (
          <div className="h-full overflow-auto">
            {content.trim() ? (
              <WritingPreview content={content} />
            ) : (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                {emptyPreviewMessage}
              </p>
            )}
          </div>
        ) : (
          <CodeMirror
            ref={cmRef}
            value={content}
            extensions={extensions}
            theme={isDark ? oneDark : undefined}
            onChange={onChange}
            onUpdate={onUpdate}
            onKeyDown={onKeyDown}
            height="100%"
            readOnly={readOnly}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
              indentOnInput: true,
            }}
            style={{ height: '100%', fontSize: 14 }}
            placeholder={placeholder}
          />
        )}
        {children}
      </div>
    </div>
  )
})
