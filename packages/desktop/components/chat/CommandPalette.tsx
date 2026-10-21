'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

export type CommandPaletteGroup = 'view' | 'session' | 'settings' | 'action'

export interface CommandPaletteItem {
  id: string
  group: CommandPaletteGroup
  label: string
  description?: string
  keywords?: string[]
  icon?: LucideIcon
  onSelect: () => void
}

const GROUP_LABEL: Record<CommandPaletteGroup, string> = {
  view: '화면',
  session: '대화',
  settings: '설정',
  action: '동작',
}

function matches(item: CommandPaletteItem, query: string): boolean {
  if (!query) return true
  const haystack = [item.label, item.description, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandPaletteItem[]
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => items.filter((item) => matches(item, query)),
    [items, query],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEscapeToClose(open, () => onOpenChange(false))
  useModalViewportLock(open)

  if (!open) return null

  function select(item: CommandPaletteItem): void {
    onOpenChange(false)
    item.onSelect()
  }

  const groups: Array<{ group: CommandPaletteGroup; items: { item: CommandPaletteItem; index: number }[] }> = []
  const byGroup = new Map<CommandPaletteGroup, { item: CommandPaletteItem; index: number }[]>()
  filtered.forEach((item, index) => {
    if (!byGroup.has(item.group)) {
      byGroup.set(item.group, [])
      groups.push({ group: item.group, items: byGroup.get(item.group)! })
    }
    byGroup.get(item.group)!.push({ item, index })
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="명령 팔레트"
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pb-4 pt-[min(12dvh,4rem)]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            aria-label="명령 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((i) =>
                  filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
                )
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                const item = filtered[activeIndex]
                if (item) select(item)
              }
            }}
            placeholder="화면, 대화, 설정, 동작 검색…"
            className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="명령 검색 결과"
          className="min-h-0 max-h-80 flex-1 overflow-y-auto overscroll-contain py-1"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">검색 결과 없음</p>
          ) : (
            groups.map(({ group, items: groupItems }) => (
              <Fragment key={group}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABEL[group]}
                </div>
                <ul>
                  {groupItems.map(({ item, index }) => {
                    const Icon = item.icon
                    const isActive = index === activeIndex
                    return (
                      <li
                        key={item.id}
                        data-index={index}
                        role="option"
                        aria-selected={isActive}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          select(item)
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm',
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/50',
                        )}
                      >
                        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                        <span className="truncate">{item.label}</span>
                        {item.description ? (
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </Fragment>
            ))
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ 탐색 · Enter 선택 · Esc 닫기
        </div>
      </div>
    </div>
  )
}
