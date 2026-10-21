'use client'
import { Fragment, useEffect, useRef, type RefObject } from 'react'
import { cn } from '@/lib/utils/cn'
import { FloatingPaletteSurface } from '@/components/chat/FloatingPaletteSurface'
import {
  CATEGORY_LABEL,
  type SlashCommandCategory,
  type SlashCommandPaletteItem,
} from '@/lib/chat/slash-commands'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  items: SlashCommandPaletteItem[]
  activeIndex: number
  onSelect: (item: SlashCommandPaletteItem) => void
  onActiveIndexChange: (index: number) => void
}

function partitionByCategory(items: SlashCommandPaletteItem[]): Array<{
  key: string
  category: SlashCommandCategory | null
  items: { item: SlashCommandPaletteItem; index: number }[]
}> {
  const order: (SlashCommandCategory | null)[] = []
  const byCategory = new Map<
    SlashCommandCategory | null,
    { item: SlashCommandPaletteItem; index: number }[]
  >()
  items.forEach((item, index) => {
    const cat = item.category ?? null
    if (!byCategory.has(cat)) {
      byCategory.set(cat, [])
      order.push(cat)
    }
    byCategory.get(cat)!.push({ item, index })
  })
  return order.map((cat) => ({
    key: cat ?? '_uncategorized',
    category: cat,
    items: byCategory.get(cat) ?? [],
  }))
}

export function SlashCommandPalette({
  anchorRef,
  items,
  activeIndex,
  onSelect,
  onActiveIndexChange,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (items.length === 0) return null

  const groups = partitionByCategory(items)
  const showHeaders = groups.length > 1

  return (
    <FloatingPaletteSurface
      anchorRef={anchorRef}
      ariaLabel="슬래시 명령"
      footer="↑↓ 탐색 · Tab/Enter 선택 · Esc 닫기"
    >
      <div
        ref={listRef}
        data-testid="floating-palette-list"
        className="min-h-0 max-h-72 flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {groups.map((group) => (
          <Fragment key={group.key}>
            {showHeaders && group.category ? (
              <div
                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                aria-hidden
              >
                {CATEGORY_LABEL[group.category]}
              </div>
            ) : null}
            <ul>
              {group.items.map(({ item, index }) => {
                const isActive = index === activeIndex
                return (
                  <li
                    key={item.insertValue}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(item)
                    }}
                    onMouseEnter={() => onActiveIndexChange(index)}
                    className={cn(
                      'flex cursor-pointer items-baseline gap-3 px-3 py-1.5 text-sm',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50',
                    )}
                  >
                    <span className="shrink-0 whitespace-nowrap font-mono text-[13px] tabular-nums">
                      {item.label}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Fragment>
        ))}
      </div>
    </FloatingPaletteSurface>
  )
}
