'use client'

import { useEffect, useRef } from 'react'
import { Sparkles, Zap } from 'lucide-react'
import {
  describeSlashCommand,
  slashCategoryLabel,
  type SlashCategory,
  type SlashCommand,
} from './WritingActions'
import { cn } from '@/lib/utils/cn'

interface WritingSlashMenuProps {
  x: number
  y: number
  commands: readonly SlashCommand[]
  highlightIndex: number
  setHighlightIndex: (next: number) => void
  onPick: (command: SlashCommand) => void
}

const CATEGORY_ORDER: readonly SlashCategory[] = ['insert', 'ai-generate', 'ai-transform']
const MENU_WIDTH = 288
const MENU_MAX_HEIGHT = 288
const VIEWPORT_GUTTER = 8
const PREFERRED_BELOW_HEIGHT = 144

export function WritingSlashMenu({
  x,
  y,
  commands,
  highlightIndex,
  setHighlightIndex,
  onPick,
}: WritingSlashMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-slash-index="${highlightIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_GUTTER * 2)
  const renderedWidth = Math.min(MENU_WIDTH, availableWidth)
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(x, window.innerWidth - renderedWidth - VIEWPORT_GUTTER),
  )
  const availableBelow = Math.max(0, window.innerHeight - y - VIEWPORT_GUTTER)
  const availableAbove = Math.max(0, y - VIEWPORT_GUTTER - 4)
  const placeAbove = availableBelow < PREFERRED_BELOW_HEIGHT && availableAbove > availableBelow
  const maxHeight = Math.min(
    MENU_MAX_HEIGHT,
    placeAbove ? availableAbove : availableBelow,
  )
  const verticalStyle = placeAbove
    ? { bottom: Math.max(VIEWPORT_GUTTER, window.innerHeight - y + 4) }
    : { top: Math.max(VIEWPORT_GUTTER, y) }

  return (
    <div
      ref={rootRef}
      onMouseDown={(e) => e.preventDefault()}
      role="listbox"
      aria-label="AI 명령"
      className="fixed z-50 w-72 max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-md border border-border bg-popover text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
      style={{ left, maxHeight, ...verticalStyle }}
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        AI 명령 · ↑↓ 선택 · Enter 실행 · Esc 닫기
      </div>
      {commands.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          일치하는 명령이 없습니다. <kbd className="rounded border px-1">Esc</kbd>로
          닫고 일반 텍스트로 계속 입력하세요.
        </div>
      ) : (
        renderGrouped(commands, highlightIndex, setHighlightIndex, onPick)
      )}
    </div>
  )
}

function renderGrouped(
  commands: readonly SlashCommand[],
  highlightIndex: number,
  setHighlightIndex: (next: number) => void,
  onPick: (command: SlashCommand) => void,
) {
  const grouped = new Map<SlashCategory, Array<{ cmd: SlashCommand; index: number }>>()
  commands.forEach((cmd, index) => {
    const list = grouped.get(cmd.category) ?? []
    list.push({ cmd, index })
    grouped.set(cmd.category, list)
  })

  const sections: React.ReactNode[] = []
  for (const category of CATEGORY_ORDER) {
    const entries = grouped.get(category)
    if (!entries || entries.length === 0) continue
    sections.push(
      <div
        key={`header-${category}`}
        className="border-t border-border/40 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:border-t-0"
      >
        {slashCategoryLabel(category)}
      </div>,
    )
    for (const { cmd, index } of entries) {
      sections.push(
        <button
          key={cmd.id}
          data-slash-index={index}
          role="option"
          aria-selected={index === highlightIndex}
          type="button"
          onMouseEnter={() => setHighlightIndex(index)}
          onClick={() => onPick(cmd)}
          className={cn(
            'flex w-full items-start gap-2 px-3 py-2 text-left text-xs',
            index === highlightIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/60',
          )}
        >
          {cmd.kind === 'insert' ? (
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          ) : (
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{cmd.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {describeSlashCommand(cmd)}
            </span>
          </span>
        </button>,
      )
    }
  }
  return sections
}
