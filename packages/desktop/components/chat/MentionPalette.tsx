'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { File, Folder, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { FileSearchMatch } from '@/lib/api/files'
import { FloatingPaletteSurface } from '@/components/chat/FloatingPaletteSurface'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  items: FileSearchMatch[]
  loading: boolean
  activeIndex: number
  onSelect: (item: FileSearchMatch) => void
  onActiveIndexChange: (index: number) => void
}

export function MentionPalette({
  anchorRef,
  items,
  loading,
  activeIndex,
  onSelect,
  onActiveIndexChange,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLLIElement>(`li[data-index="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!loading && items.length === 0) return null

  return (
    <FloatingPaletteSurface
      anchorRef={anchorRef}
      ariaLabel="@mention"
      footer="↑↓ 탐색 · Tab/Enter 선택 · Esc 닫기"
    >
      <ul
        ref={listRef}
        data-testid="floating-palette-list"
        className="min-h-0 max-h-72 flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {loading && items.length === 0 ? (
          <li className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            검색 중…
          </li>
        ) : (
          items.map((item, index) => {
            const isActive = index === activeIndex
            const Icon = item.isDirectory ? Folder : File
            return (
              <li
                key={item.path}
                data-index={index}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(item)
                }}
                onMouseEnter={() => onActiveIndexChange(index)}
                className={cn(
                  'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" />
                <span className="shrink-0 whitespace-nowrap font-mono text-[13px]">
                  {item.basename}
                </span>
                <span className="truncate text-xs text-muted-foreground">{item.path}</span>
              </li>
            )
          })
        )}
      </ul>
    </FloatingPaletteSurface>
  )
}
