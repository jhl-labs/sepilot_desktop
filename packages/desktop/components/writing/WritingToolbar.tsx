'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  FileText,
  FolderOpen,
  ListTree,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { DOC_ACTIONS, type DocAction } from './WritingActions'

interface WritingToolbarProps {
  filePath: string | null
  docId: string | null
  version: number
  dirty: boolean
  busy: boolean
  previewMode: boolean
  outlineVisible: boolean

  onOpen: () => void
  onSave: () => void
  onRunDocAction: (id: string) => void
  onContinueWriting: () => void
  onUndo: () => void
  onTogglePreview: () => void
  onToggleOutline: () => void
}

export function WritingToolbar(props: WritingToolbarProps) {
  return (
    <header className="flex h-11 items-center gap-1 border-b border-border bg-background/95 px-2">
      {}
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span
          className="min-w-0 truncate font-mono text-xs text-foreground/90"
          title={props.filePath ?? '<새 문서>'}
        >
          {props.filePath ?? '<새 문서>'}
        </span>
        <FileStatus
          docId={props.docId}
          version={props.version}
          dirty={props.dirty}
        />
      </div>

      {}
      <ToolbarGroup>
        <IconButton
          label="열기"
          onClick={props.onOpen}
          disabled={props.busy}
        >
          <FolderOpen className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="저장 (Ctrl/Cmd+S)"
          onClick={props.onSave}
          disabled={props.busy || !props.docId}
        >
          <Save className="h-4 w-4" />
        </IconButton>
      </ToolbarGroup>

      <Divider />

      {}
      <ToolbarGroup>
        <Button
          size="sm"
          variant="default"
          onClick={props.onContinueWriting}
          disabled={!props.docId || props.previewMode}
          className="h-8 gap-1.5 px-3 text-xs"
          title="cursor 위치에서 LLM이 이어 씁니다 (Ctrl/Cmd+Enter)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          이어쓰기
        </Button>
        <AiActionsMenu onRun={props.onRunDocAction} disabled={!props.docId} />
        <IconButton
          label="마지막 LLM 편집 되돌리기"
          onClick={props.onUndo}
          disabled={!props.docId}
        >
          <Undo2 className="h-4 w-4" />
        </IconButton>
      </ToolbarGroup>

      <Divider />

      {}
      <ToolbarGroup>
        <IconButton
          label={props.outlineVisible ? 'Outline 숨기기' : 'Outline 표시'}
          onClick={props.onToggleOutline}
          disabled={!props.docId}
          pressed={props.outlineVisible}
        >
          {props.outlineVisible ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          <ListTree className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label={props.previewMode ? '편집기로' : '렌더 미리보기'}
          onClick={props.onTogglePreview}
          disabled={!props.docId}
          pressed={props.previewMode}
        >
          <Eye className="h-4 w-4" />
        </IconButton>
      </ToolbarGroup>
    </header>
  )
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

function FileStatus({
  docId,
  version,
  dirty,
}: {
  docId: string | null
  version: number
  dirty: boolean
}) {
  if (!docId) return null
  if (dirty) {
    return (
      <span className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        ● 저장 안 됨
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3" />
      저장됨
      <span className="opacity-60">· v{version}</span>
    </span>
  )
}

interface IconButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: React.ReactNode
}

function IconButton({ label, onClick, disabled, pressed, children }: IconButtonProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'h-8 gap-1 px-2',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </Button>
  )
}

function AiActionsMenu({
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
    function onDocPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
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
        onClick={() => setOpen((v) => !v)}
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
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-64 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
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
