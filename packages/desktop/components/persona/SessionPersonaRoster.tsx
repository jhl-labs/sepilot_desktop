'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Sparkles, Users } from 'lucide-react'
import { PersonaAvatar } from '@/components/persona/PersonaSurface'
import { Button } from '@/components/ui/button'
import {
  mergePersonaCatalog,
  resolveSessionPersonas,
} from '@/lib/chat/session-personas'
import { usePersonaStore, type Persona } from '@/lib/store/persona-store'
import type { SessionSummary } from '@/lib/store/session-store'
import { cn } from '@/lib/utils/cn'
import { SessionPersonaDialog } from './SessionPersonaDialog'

export function PersonaAvatarStack({
  personas,
  limit = 3,
  compact = false,
}: {
  personas: readonly Persona[]
  limit?: number
  compact?: boolean
}) {
  const visible = personas.slice(0, limit)
  const hidden = Math.max(0, personas.length - visible.length)
  return (
    <span
      role="img"
      className="inline-flex shrink-0 items-center"
      aria-label={personas.map((persona) => persona.name).join(', ')}
    >
      {visible.map((persona, index) => (
        <span
          key={persona.id}
          className={cn('relative inline-flex', index > 0 && (compact ? '-ml-1.5' : '-ml-2'))}
          style={{ zIndex: visible.length - index }}
          title={persona.name}
        >
          <PersonaAvatar
            persona={persona}
            size="sm"
            className={cn(
              'rounded-full border-2 border-background shadow-sm',
              compact ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-xs',
            )}
          />
        </span>
      ))}
      {hidden > 0 ? (
        <span
          className={cn(
            'relative flex items-center justify-center rounded-full border-2 border-background bg-muted font-semibold text-muted-foreground',
            compact ? '-ml-1.5 h-5 min-w-5 px-0.5 text-[8px]' : '-ml-2 h-7 min-w-7 px-1 text-[9px]',
          )}
          aria-hidden="true"
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}

export function useResolvedSessionPersonas(session: SessionSummary | null): Persona[] {
  const daemonPersonas = usePersonaStore((state) => state.items)
  return useMemo(
    () => resolveSessionPersonas(session?.personaIds, mergePersonaCatalog(daemonPersonas)),
    [daemonPersonas, session?.personaIds],
  )
}

export function SessionPersonaBar({
  session,
  maxWidth,
}: {
  session: SessionSummary
  maxWidth?: number
}) {
  const personas = useResolvedSessionPersonas(session)
  const [dialogOpen, setDialogOpen] = useState(false)
  if (personas.length === 0) return null

  const isPanel = personas.length > 1
  return (
    <>
      <div className="shrink-0 border-b border-border/60 bg-background/92 px-3 py-1.5 backdrop-blur-sm">
        <div
          className="mx-auto flex w-full items-center gap-2"
          style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
        >
          <PersonaAvatarStack personas={personas} compact />
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5"
            title={
              isPanel
                ? `${personas.map((persona) => persona.name).join(' → ')} 순서로 답변`
                : personas[0]!.description || '이 대화의 전담 페르소나'
            }
          >
            {isPanel ? (
              <Users className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Sparkles className="h-3 w-3 shrink-0 text-primary" />
            )}
            <p className="min-w-0 truncate text-[11px] font-semibold">
              {isPanel ? `${personas.length}명 · 다중 관점` : personas[0]!.name}
            </p>
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              {isPanel ? '순차 협업' : '1:1 페르소나'}
            </span>
            <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground md:inline">
              ·{' '}
              {isPanel
                ? `${personas.map((persona) => persona.name).join(' → ')} 순서`
                : personas[0]!.description || '이 대화의 전담 페르소나'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => setDialogOpen(true)}
            aria-label="페르소나 구성 변경"
          >
            <span className="max-[420px]:sr-only">구성 변경</span>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <SessionPersonaDialog
        open={dialogOpen}
        session={session}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
