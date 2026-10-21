'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { FloatingPaletteSurface } from './FloatingPaletteSurface'
import type { DollarChoice } from '@/lib/chat/dollar-choices'
import { cn } from '@/lib/utils/cn'

export function DollarPalette({
  anchorRef,
  items,
  activeIndex,
  selectedIds,
  loading,
  error,
  onSelect,
  onActiveIndexChange,
  scope = 'all',
}: {
  anchorRef: RefObject<HTMLElement | null>
  items: DollarChoice[]
  activeIndex: number
  selectedIds: string[]
  loading: boolean
  error: string | null
  onSelect: (item: DollarChoice) => void
  onActiveIndexChange: (index: number) => void
  scope?: 'all' | 'apps'
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])
  return (
    <FloatingPaletteSurface
      anchorRef={anchorRef}
      ariaLabel={scope === 'apps' ? '앱 선택' : '기능 및 스킬'}
      footer={
        <div className="whitespace-normal">
          <div>↑↓ 탐색 · Tab/Enter 선택 · Esc 닫기</div>
          {scope === 'all' && <div>스킬은 다음 새 요청부터 해제할 때까지 적용</div>}
          <div>앱은 대화의 대상을 지정합니다 · 조회·변경할 내용을 이어서 입력하세요</div>
        </div>
      }
    >
      <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
        {loading && (
          <p className="px-3 py-1 text-xs text-muted-foreground">{scope === 'apps' ? '설치된 앱을 불러오는 중…' : '설치된 앱과 스킬을 불러오는 중…'}</p>
        )}
        {error && (
          <p role="status" className="px-3 py-1 text-xs text-muted-foreground">
            {error}
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">{scope === 'apps' ? '일치하는 앱이 없습니다.' : '일치하는 앱 또는 활성 스킬이 없습니다.'}</p>
        )}
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-index={index}
            className={cn(
              'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
              index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onActiveIndexChange(index)}
          >
            <span className="mt-0.5 shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
              {item.kind === 'wiki' ? 'Wiki' : item.kind === 'app' ? 'App' : '스킬'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {item.label}
                {item.skillId && selectedIds.includes(item.skillId) ? ' · 적용 중' : ''}
              </span>
              {item.skillId && (
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  $skill:{item.skillId}
                </span>
              )}
              {item.appReference && (
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {item.appReference}{item.aliases?.length ? ` · ${item.aliases.join(' · ')}` : ''}
                </span>
              )}
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </FloatingPaletteSurface>
  )
}
