'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Persona } from '@/lib/store/persona-store'
import { FloatingPaletteSurface } from '@/components/chat/FloatingPaletteSurface'
import { PersonaAvatar, PersonaIdentity } from '@/components/persona/PersonaSurface'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  items: Persona[]
  loading: boolean
  activeIndex: number
  onSelect: (persona: Persona) => void
  onActiveIndexChange: (index: number) => void
}

export function PersonaPalette({
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
      ariaLabel="페르소나"
      footer="↑↓ 탐색 · Tab/Enter 이름 삽입 · Esc 닫기"
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
          items.map((persona, index) => {
            const isActive = index === activeIndex
            return (
              <li
                key={persona.id}
                data-index={index}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(persona)
                }}
                onMouseEnter={() => onActiveIndexChange(index)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-accent/50',
                )}
              >
                <PersonaAvatar persona={persona} size="sm" selected={isActive} />
                <PersonaIdentity
                  persona={persona}
                  compact
                  description={
                    persona.description || persona.systemPrompt.slice(0, 80) || '설명이 없습니다.'
                  }
                />
              </li>
            )
          })
        )}
      </ul>
    </FloatingPaletteSurface>
  )
}
