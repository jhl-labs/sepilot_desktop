'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bot, LoaderCircle, Search, Sparkles, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  PersonaAvatar,
  PersonaChoiceRow,
  PersonaDialogFrame,
  PersonaIdentity,
  PersonaSearchField,
} from '@/components/persona/PersonaSurface'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { createSessionsApi } from '@/lib/api/sessions'
import { PERSONA_PANEL_PRESETS } from '@/lib/chat/persona-panel-presets'
import {
  MAX_SESSION_PERSONAS,
  mergePersonaCatalog,
  normalizeSessionPersonaIds,
  resolveSessionPersonas,
} from '@/lib/chat/session-personas'
import { usePersonaStore } from '@/lib/store/persona-store'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useSessionStore, type SessionSummary } from '@/lib/store/session-store'
import { cn } from '@/lib/utils/cn'

export function SessionPersonaDialog({
  open,
  session,
  onOpenChange,
}: {
  open: boolean
  session: SessionSummary | null
  onOpenChange: (open: boolean) => void
}) {
  const transport = useTransport()
  const daemonPersonas = usePersonaStore((state) => state.items)
  const upsertSession = useSessionStore((state) => state.upsertSession)
  const catalog = useMemo(() => mergePersonaCatalog(daemonPersonas), [daemonPersonas])
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (!open) return
    setDraftIds(normalizeSessionPersonaIds(sessionRef.current?.personaIds))
    setQuery('')
  }, [open, session?.id])

  const selected = useMemo(() => resolveSessionPersonas(draftIds, catalog), [catalog, draftIds])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => {
    if (!normalizedQuery) return catalog
    return catalog.filter((persona) =>
      [persona.name, persona.description, persona.id]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    )
  }, [catalog, normalizedQuery])

  function togglePersona(id: string): void {
    setDraftIds((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id)
      if (current.length >= MAX_SESSION_PERSONAS) {
        toast.warning(`페르소나는 최대 ${MAX_SESSION_PERSONAS}명까지 초대할 수 있습니다.`)
        return current
      }
      return [...current, id]
    })
  }

  function movePersona(id: string, direction: -1 | 1): void {
    setDraftIds((current) => {
      const index = current.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = current.slice()
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  function applyPreset(personaIds: readonly string[]): void {
    const available = new Set(catalog.map((persona) => persona.id))
    setDraftIds(
      normalizeSessionPersonaIds(personaIds.filter((personaId) => available.has(personaId))),
    )
  }

  async function save(): Promise<void> {
    if (!session || saving) return
    const personaIds = normalizeSessionPersonaIds(draftIds)
    const current =
      useSessionStore.getState().sessions.find((item) => item.id === session.id) ?? session
    setSaving(true)
    try {
      if (current.isDraft) {
        upsertSession({ ...current, personaIds })
      } else {
        const updated = await (
          await createSessionsApi(transport)
        ).updatePersonas(current.id, personaIds)
        upsertSession({ ...updated, personaIds })
      }
      if (personaIds.length < 2 && useChatModeStore.getState().mode === 'persona-panel') {
        useChatModeStore.getState().setMode('instant')
      }
      toast.success(
        personaIds.length === 0
          ? '기본 어시스턴트로 전환했습니다.'
          : personaIds.length === 1
            ? '이 대화의 페르소나를 적용했습니다.'
            : `${personaIds.length}명의 다중 관점 구성을 저장했습니다.`,
      )
      onOpenChange(false)
    } catch (error) {
      toast.error('페르소나 구성을 저장하지 못했습니다.', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  if (!session) return null

  const modeLabel =
    draftIds.length === 0 ? '기본 어시스턴트' : draftIds.length === 1 ? '1:1 페르소나' : '다중 관점'
  const modeDescription =
    draftIds.length === 0
      ? 'SEPilot의 기본 응답 방식으로 대화합니다.'
      : draftIds.length === 1
        ? '선택한 페르소나가 이 세션의 모든 응답을 담당합니다.'
        : '선택한 순서대로 전원이 답하며, 뒤의 페르소나는 앞선 답변을 읽습니다.'

  return (
    <PersonaDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="이 대화의 페르소나"
      description="이 대화에만 적용 · 선택 순서대로 응답"
      icon={<Sparkles className="h-4 w-4" />}
      dismissDisabled={saving}
      panelClassName="h-[min(32rem,calc(100dvh-1rem))] max-w-[35rem] sm:h-[min(32rem,calc(100dvh-2rem))]"
    >
      <section className="shrink-0 border-b border-border/60 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                draftIds.length > 1
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              {draftIds.length > 1 ? (
                <Users className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">{modeLabel}</p>
              <p className="line-clamp-1 text-[10px] text-muted-foreground">{modeDescription}</p>
            </div>
          </div>
          {draftIds.length > 0 ? (
            <button
              type="button"
              className="shrink-0 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => setDraftIds([])}
            >
              선택 해제
            </button>
          ) : null}
        </div>

        {selected.length > 0 ? (
          <div
            className="mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5"
            aria-label="초대 순서"
          >
            {selected.map((persona, index) => (
              <div
                key={persona.id}
                className="flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background pl-1 pr-0.5"
              >
                <span className="flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <PersonaAvatar
                  persona={persona}
                  size="sm"
                  selected
                  className="h-6 w-6 rounded-md border-0"
                />
                <PersonaIdentity
                  persona={persona}
                  description={null}
                  compact
                  className="max-w-24 flex-none"
                />
                {selected.length > 1 ? (
                  <span className="flex gap-0.5">
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      onClick={() => movePersona(persona.id, -1)}
                      disabled={index === 0}
                      aria-label={`${persona.name} 순서를 앞으로`}
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      onClick={() => movePersona(persona.id, 1)}
                      disabled={index === selected.length - 1}
                      aria-label={`${persona.name} 순서를 뒤로`}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => togglePersona(persona.id)}
                  aria-label={`${persona.name} 초대 해제`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div
        className="flex shrink-0 flex-wrap gap-2 border-b border-border/60 px-3 py-2"
        data-testid="session-persona-picker-tools"
      >
        <select
          value=""
          onChange={(event) => {
            const preset = PERSONA_PANEL_PRESETS.find((item) => item.id === event.target.value)
            if (preset) applyPreset(preset.personaIds)
          }}
          aria-label="추천 페르소나 구성"
          className="h-9 min-w-0 flex-1 basis-36 rounded-md border border-input bg-background px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-40"
        >
          <option value="">추천 구성</option>
          {PERSONA_PANEL_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <PersonaSearchField
          value={query}
          onChange={setQuery}
          label="페르소나 검색"
          placeholder="페르소나 검색"
          clearLabel="페르소나 검색어 지우기"
          className="min-w-0 flex-[2_1_12rem]"
        />
      </div>

      <div
        role="region"
        aria-label="페르소나 선택"
        tabIndex={0}
        className="dialog-scroll-region min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [scrollbar-gutter:stable]"
      >
        <div className="space-y-1">
          {filtered.map((persona) => {
            const order = draftIds.indexOf(persona.id)
            const isSelected = order >= 0
            return (
              <PersonaChoiceRow
                key={persona.id}
                persona={persona}
                selected={isSelected}
                compact
                description={persona.description || '사용자 정의 페르소나'}
                onClick={() => togglePersona(persona.id)}
                trailing={
                  isSelected ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {order + 1}
                    </span>
                  ) : null
                }
              />
            )
          })}
        </div>
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Search className="h-5 w-5 opacity-40" />
            일치하는 페르소나가 없습니다.
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          {draftIds.length > 1 ? `${draftIds.length}명 순차 응답` : '이 대화에만 적용'}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button size="sm" className="h-8" onClick={() => void save()} disabled={saving}>
            {saving ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            적용
          </Button>
        </div>
      </footer>
    </PersonaDialogFrame>
  )
}
