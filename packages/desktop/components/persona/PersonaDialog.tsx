'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { confirm } from '@/lib/utils/confirm'
import { Check, Copy, LoaderCircle, Plus, Search, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useTransport } from '@/components/providers/transport-provider'
import { createPersonaApi } from '@/lib/api/persona'
import { BUILTIN_PERSONAS, usePersonaStore, type Persona } from '@/lib/store/persona-store'
import { mergePersonaCatalog } from '@/lib/chat/session-personas'
import { PERSONA_PANEL_PRESETS, groupPersonasByPreset } from '@/lib/chat/persona-panel-presets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import {
  PersonaAvatar,
  PersonaChoiceRow,
  PersonaDialogFrame,
  PersonaIdentity,
  PersonaSearchField,
} from '@/components/persona/PersonaSurface'
import {
  explainRuntimeFailure,
  isBrowserPreviewTransport,
  type RuntimeFeedback,
} from '@/lib/utils/runtime-feedback'

type EditingState = {
  id?: string
  name: string
  systemPrompt: string
} | null

type PendingMutation =
  | { kind: 'save' }
  | { kind: 'delete'; personaId: string }
  | { kind: 'reset'; personaId: string }
  | null

export function PersonaDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const transport = useTransport()
  const daemonItems = usePersonaStore((s) => s.items)
  const replaceItemsIfUnchanged = usePersonaStore((s) => s.replaceItemsIfUnchanged)
  const upsertPersona = usePersonaStore((s) => s.upsert)
  const [selectedId, setSelectedId] = useState<string | null>('default')
  const [editing, setEditing] = useState<EditingState>(null)
  const [loading, setLoading] = useState(false)
  const [pendingMutation, setPendingMutation] = useState<PendingMutation>(null)
  const mutationLockRef = useRef(false)
  const removePersona = usePersonaStore((s) => s.remove)
  const [notice, setNotice] = useState<RuntimeFeedback | null>(null)
  const [query, setQuery] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [presetFilter, setPresetFilter] = useState<string>('all')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const promptCopiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = pendingMutation !== null

  function clearPromptCopiedResetTimer(): void {
    if (promptCopiedResetTimerRef.current) {
      clearTimeout(promptCopiedResetTimerRef.current)
      promptCopiedResetTimerRef.current = null
    }
  }

  function markPromptCopied(): void {
    clearPromptCopiedResetTimer()
    setPromptCopied(true)
    promptCopiedResetTimerRef.current = setTimeout(() => {
      promptCopiedResetTimerRef.current = null
      setPromptCopied(false)
    }, 1500)
  }

  const items = useMemo(() => mergePersonaCatalog(daemonItems), [daemonItems])

  const overriddenBuiltinIds = useMemo(
    () =>
      new Set(
        daemonItems.filter((p) => BUILTIN_PERSONAS.some((b) => b.id === p.id)).map((p) => p.id),
      ),
    [daemonItems],
  )

  const presetMembership = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const preset of PERSONA_PANEL_PRESETS) {
      for (const personaId of preset.personaIds) {
        if (!map.has(personaId)) map.set(personaId, new Set())
        map.get(personaId)!.add(preset.id)
      }
    }
    return map
  }, [])

  const filteredItems = useMemo(() => {
    let pool = items
    if (presetFilter === 'unassigned') {
      pool = items.filter((p) => !presetMembership.has(p.id))
    } else if (presetFilter !== 'all') {
      pool = items.filter((p) => presetMembership.get(p.id)?.has(presetFilter))
    }
    const q = query.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(
      (item) => item.name.toLowerCase().includes(q) || item.systemPrompt.toLowerCase().includes(q),
    )
  }, [items, query, presetFilter, presetMembership])

  const activePreset = useMemo(
    () =>
      presetFilter === 'all' || presetFilter === 'unassigned'
        ? null
        : (PERSONA_PANEL_PRESETS.find((p) => p.id === presetFilter) ?? null),
    [presetFilter],
  )

  const selectedPersona = useMemo(
    () =>
      items.find((item) => item.id === selectedId) ??
      items.find((item) => item.id === 'default') ??
      items[0] ??
      null,
    [items, selectedId],
  )

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setQuery('')
      clearPromptCopiedResetTimer()
      setPromptCopied(false)
      return
    }

    let cancelled = false
    const startedAtRevision = usePersonaStore.getState().revision
    setLoading(true)
    void (async () => {
      try {
        if (await isBrowserPreviewTransport(transport)) {
          if (cancelled) return
          setSelectedId('default')
          setNotice(
            await explainRuntimeFailure(transport, null, {
              defaultTitle: '페르소나를 불러올 수 없습니다',
            }),
          )
          return
        }
        const list = await (await createPersonaApi(transport)).list()
        if (cancelled) return
        const applied = replaceItemsIfUnchanged(list, startedAtRevision)
        const merged = mergePersonaCatalog(
          applied ? list : usePersonaStore.getState().items,
        )
        setSelectedId((current) =>
          current && merged.some((persona) => persona.id === current)
            ? current
            : (merged.find((persona) => persona.id === 'default')?.id ?? merged[0]?.id ?? null),
        )
        setNotice(null)
      } catch (error) {
        if (cancelled) return
        setSelectedId('default')
        const feedback = await explainRuntimeFailure(transport, error, {
          defaultTitle: '페르소나를 불러올 수 없습니다',
        })
        toast.error(feedback.title, {
          description: feedback.description,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, replaceItemsIfUnchanged, transport])

  useEffect(() => () => clearPromptCopiedResetTimer(), [])

  useEffect(() => {
    if (!editing) return
    requestAnimationFrame(() => nameInputRef.current?.focus())
  }, [editing])

  function startCreate(): void {
    if (busy || loading) return
    setEditing({ name: '', systemPrompt: '' })
  }

  function startEdit(): void {
    if (!selectedPersona || busy || loading) return
    setEditing({
      id: selectedPersona.id,
      name: selectedPersona.name,
      systemPrompt: selectedPersona.systemPrompt,
    })
  }

  async function save(): Promise<void> {
    if (!editing || mutationLockRef.current) return
    if (!editing.name.trim() || !editing.systemPrompt.trim()) {
      toast.warning('이름과 시스템 프롬프트를 모두 입력하세요.')
      return
    }

    mutationLockRef.current = true
    setPendingMutation({ kind: 'save' })
    try {
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createPersonaApi(transport)
      const created = await api.upsert({
        id: editing.id ?? `p-${Date.now()}`,
        name: editing.name.trim(),
        systemPrompt: editing.systemPrompt.trim(),
        isActive: false,
      })
      upsertPersona(created)
      setSelectedId(created.id)
      setEditing(null)
      setNotice(null)
      toast.success('페르소나를 저장했습니다.', {
        description: created.name,
      })
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '페르소나를 저장할 수 없습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      mutationLockRef.current = false
      setPendingMutation(null)
    }
  }

  async function remove(id: string): Promise<void> {
    if (mutationLockRef.current) return
    mutationLockRef.current = true
    setPendingMutation({ kind: 'delete', personaId: id })
    try {
      const ok = await confirm(
        '이 페르소나를 삭제하시겠습니까? 삭제한 내용은 되돌릴 수 없습니다.',
        { destructive: true },
      )
      if (!ok) return
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createPersonaApi(transport)
      await api.remove(id)
      removePersona(id)
      if (selectedId === id) {
        const fallback = items.find((persona) => persona.id !== id) ?? null
        setSelectedId(fallback?.id ?? null)
      }
      toast.success('페르소나를 삭제했습니다.')
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '페르소나를 삭제할 수 없습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      mutationLockRef.current = false
      setPendingMutation(null)
    }
  }

  async function handleCopyPrompt(): Promise<void> {
    if (!selectedPersona?.systemPrompt) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedPersona.systemPrompt)
        markPromptCopied()
        return
      }
    } catch {
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = selectedPersona.systemPrompt
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        markPromptCopied()
      } else {
        toast.error('클립보드에 복사하지 못했습니다.')
      }
    } catch {
      toast.error('클립보드에 복사하지 못했습니다.')
    }
  }

  async function resetBuiltin(id: string): Promise<void> {
    if (mutationLockRef.current) return
    const original = BUILTIN_PERSONAS.find((b) => b.id === id)
    if (!original) return
    mutationLockRef.current = true
    setPendingMutation({ kind: 'reset', personaId: id })
    try {
      const ok = await confirm(
        `'${original.name}' 페르소나를 기본값으로 되돌리시겠습니까? 사용자 편집 내용은 사라집니다.`,
      )
      if (!ok) return
      if (await isBrowserPreviewTransport(transport)) {
        throw null
      }
      const api = await createPersonaApi(transport)
      await api.remove(id)
      removePersona(id)
      setEditing(null)
      toast.success(`'${original.name}'을(를) 기본값으로 되돌렸습니다.`)
    } catch (error) {
      const feedback = await explainRuntimeFailure(transport, error, {
        defaultTitle: '초기화에 실패했습니다',
      })
      toast.error(feedback.title, {
        description: feedback.description,
      })
    } finally {
      mutationLockRef.current = false
      setPendingMutation(null)
    }
  }

  if (!open) return null
  const saving = pendingMutation?.kind === 'save'
  const deletingSelected =
    pendingMutation?.kind === 'delete' && pendingMutation.personaId === selectedPersona?.id
  const resettingSelected =
    pendingMutation?.kind === 'reset' && pendingMutation.personaId === selectedPersona?.id

  return (
    <PersonaDialogFrame
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && busy) return
        onOpenChange(nextOpen)
      }}
      title="페르소나 관리"
      description="페르소나를 만들고 시스템 프롬프트를 편집합니다. 대화 적용은 각 대화의 페르소나 설정에서 선택하세요."
      icon={<User className="h-4 w-4" />}
      dismissDisabled={busy}
      panelClassName="!h-[min(34rem,calc(100dvh-1rem))] !max-w-[46rem] sm:!h-[min(34rem,calc(100dvh-2rem))]"
      headerAction={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={startCreate}
          disabled={busy || loading}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="max-[420px]:sr-only">새로 만들기</span>
        </Button>
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(12rem,42%)_minmax(0,1fr)] min-[620px]:grid-cols-[17rem_minmax(0,1fr)] min-[620px]:grid-rows-1">
        <aside className="flex min-h-0 flex-col border-b border-border bg-muted/10 min-[620px]:border-b-0 min-[620px]:border-r">
          <div className="shrink-0 space-y-2 border-b border-border/70 p-3">
            <PresetFilterDropdown value={presetFilter} onChange={setPresetFilter} items={items} />
            <PersonaSearchField
              value={query}
              onChange={setQuery}
              label="페르소나 검색"
              placeholder="이름 또는 시스템 프롬프트 검색"
            />
            {activePreset ? (
              <p className="line-clamp-2 px-0.5 text-[10px] leading-4 text-muted-foreground">
                {activePreset.description}
              </p>
            ) : null}
          </div>

          <div
            role="region"
            aria-label="페르소나 목록"
            tabIndex={0}
            className="dialog-scroll-region min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [scrollbar-gutter:stable]"
          >
            {notice ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-4 text-center text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                <User className="h-8 w-8 opacity-80" aria-hidden="true" />
                <p className="text-sm font-semibold">{notice.title}</p>
                <p className="text-xs leading-5">{notice.description}</p>
              </div>
            ) : loading ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                페르소나를 불러오는 중…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Search className="h-7 w-7 opacity-50" aria-hidden="true" />
                <p className="text-sm font-medium">검색 결과가 없습니다</p>
                <p className="text-xs">분류 또는 검색어를 조정해 보세요.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setPresetFilter('all')
                  }}
                >
                  검색 조건 초기화
                </Button>
              </div>
            ) : (
              <PersonaList
                items={filteredItems}
                grouped={query.trim().length === 0 && presetFilter === 'all'}
                modifiedBuiltinIds={overriddenBuiltinIds}
                selectedId={selectedPersona?.id ?? null}
                busy={busy}
                pendingMutation={pendingMutation}
                onSelect={(persona) => {
                  setSelectedId(persona.id)
                  setEditing(null)
                }}
              />
            )}
          </div>
        </aside>

        <section
          role="region"
          aria-label="페르소나 상세"
          tabIndex={0}
          className="dialog-scroll-region flex min-h-0 flex-col gap-4 touch-pan-y overflow-y-auto overscroll-contain p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [scrollbar-gutter:stable] sm:p-5"
        >
          {editing ? (
            <>
              <div className="shrink-0">
                <p className="text-[11px] font-medium text-primary">
                  {editing.id ? '페르소나 편집' : '새 페르소나'}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {editing.id ? '설정을 수정합니다' : '새로 만들기'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  이름과 시스템 프롬프트는 페르소나의 역할과 응답 방식을 설명합니다.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="persona-name" className="text-sm font-medium">
                    이름
                  </label>
                  <Input
                    id="persona-name"
                    ref={nameInputRef}
                    type="text"
                    placeholder="예: 코드 검토자"
                    value={editing.name}
                    disabled={busy}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <label htmlFor="persona-system-prompt" className="text-sm font-medium">
                    시스템 프롬프트
                  </label>
                  <textarea
                    id="persona-system-prompt"
                    className="mt-1.5 min-h-40 w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm leading-6 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="페르소나의 역할, 관점, 응답 원칙을 입력하세요."
                    value={editing.systemPrompt}
                    disabled={busy}
                    onChange={(event) =>
                      setEditing((current) =>
                        current ? { ...current, systemPrompt: event.target.value } : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || !editing.name.trim() || !editing.systemPrompt.trim()}
                >
                  {saving ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      저장 중…
                    </span>
                  ) : (
                    '저장'
                  )}
                </Button>
              </div>
            </>
          ) : selectedPersona ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PersonaAvatar persona={selectedPersona} size="lg" />
                  <PersonaIdentity
                    persona={selectedPersona}
                    description={selectedPersona.description || '사용자 정의 페르소나'}
                  />
                </div>
                {selectedPersona.isBuiltin ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    기본 제공
                  </span>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-foreground">시스템 프롬프트</h3>
                  {selectedPersona.systemPrompt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCopyPrompt()}
                      className="h-7 gap-1.5 px-2 text-[11px]"
                      aria-label="시스템 프롬프트 복사"
                    >
                      {promptCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          복사
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {selectedPersona.systemPrompt || '아직 시스템 프롬프트가 없습니다.'}
                </p>
                {selectedPersona.systemPrompt ? (
                  <p className="mt-3 text-[10px] text-muted-foreground">
                    {selectedPersona.systemPrompt.length.toLocaleString()}자
                  </p>
                ) : null}
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                이 화면에서는 페르소나의 내용을 관리합니다. 대화에 적용하려면 해당 대화의 페르소나
                설정에서 선택하세요.
                {selectedPersona.isBuiltin
                  ? ' 기본 제공 페르소나는 편집 후 언제든 기본값으로 초기화할 수 있습니다.'
                  : ''}
              </p>

              <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
                <div>
                  {selectedPersona.isBuiltin ? (
                    overriddenBuiltinIds.has(selectedPersona.id) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void resetBuiltin(selectedPersona.id)}
                        disabled={busy}
                        aria-label={`${selectedPersona.name} 초기화`}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {resettingSelected ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                            초기화 중…
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            기본값으로 초기화
                          </span>
                        )}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">기본 제공 페르소나</span>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(selectedPersona.id)}
                      disabled={busy}
                      aria-label={`${selectedPersona.name} 삭제`}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {deletingSelected ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          삭제 중…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          삭제
                        </span>
                      )}
                    </Button>
                  )}
                </div>
                <Button type="button" variant="outline" onClick={startEdit} disabled={busy}>
                  편집
                </Button>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <User className="mb-3 h-10 w-10 opacity-50" aria-hidden="true" />
              <p className="text-sm font-medium">선택한 페르소나가 없습니다</p>
              <p className="mt-1 text-xs">목록에서 페르소나를 선택하거나 새로 만들어 보세요.</p>
            </div>
          )}
        </section>
      </div>
    </PersonaDialogFrame>
  )
}

function PersonaList({
  items,
  grouped,
  modifiedBuiltinIds,
  selectedId,
  busy,
  pendingMutation,
  onSelect,
}: {
  items: readonly Persona[]
  grouped: boolean
  modifiedBuiltinIds: ReadonlySet<string>
  selectedId: string | null
  busy: boolean
  pendingMutation: PendingMutation
  onSelect: (persona: Persona) => void
}) {
  const pendingPersonaId =
    pendingMutation?.kind === 'delete' || pendingMutation?.kind === 'reset'
      ? pendingMutation.personaId
      : null

  if (!grouped) {
    return (
      <div className="space-y-1">
        {items.map((persona) => (
          <PersonaRow
            key={persona.id}
            persona={persona}
            isModified={modifiedBuiltinIds.has(persona.id)}
            isSelected={persona.id === selectedId}
            disabled={busy}
            loading={pendingPersonaId === persona.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    )
  }

  const groups = groupPersonasByPreset(items)
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.preset?.id ?? '__other__'} className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 px-2 pt-1">
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.preset?.name ?? '프리셋 외'}
            </span>
            <span className="shrink-0 text-[9px] text-muted-foreground/60">
              {group.personas.length}
            </span>
          </div>
          {group.personas.map((persona) => (
            <PersonaRow
              key={persona.id}
              persona={persona}
              isModified={modifiedBuiltinIds.has(persona.id)}
              isSelected={persona.id === selectedId}
              disabled={busy}
              loading={pendingPersonaId === persona.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PersonaRow({
  persona,
  isModified,
  isSelected,
  disabled,
  loading,
  onSelect,
}: {
  persona: Persona
  isModified: boolean
  isSelected: boolean
  disabled: boolean
  loading: boolean
  onSelect: (persona: Persona) => void
}) {
  return (
    <PersonaChoiceRow
      persona={persona}
      selected={isSelected}
      loading={loading}
      disabled={disabled}
      compact
      description={persona.description || persona.systemPrompt || '시스템 프롬프트가 없습니다.'}
      trailing={
        persona.isBuiltin ? (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              isModified
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-muted text-muted-foreground',
            )}
            title={isModified ? '편집됨 — 초기화 가능' : '기본 제공 페르소나'}
          >
            {isModified ? '편집됨' : '기본'}
          </span>
        ) : null
      }
      onClick={() => onSelect(persona)}
    />
  )
}

function PresetFilterDropdown({
  value,
  onChange,
  items,
}: {
  value: string
  onChange: (value: string) => void
  items: readonly Persona[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    return () => window.removeEventListener('mousedown', onPointer)
  }, [open])

  const presetIds = new Set(items.map((p) => p.id))
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    map.set('all', items.length)
    const assigned = new Set<string>()
    for (const preset of PERSONA_PANEL_PRESETS) {
      let n = 0
      for (const personaId of preset.personaIds) {
        if (presetIds.has(personaId)) {
          n++
          assigned.add(personaId)
        }
      }
      map.set(preset.id, n)
    }
    let unassigned = 0
    for (const p of items) if (!assigned.has(p.id)) unassigned++
    map.set('unassigned', unassigned)
    return map
  }, [items, presetIds])

  const activeLabel =
    value === 'all'
      ? '전체'
      : value === 'unassigned'
        ? '프리셋 외'
        : (PERSONA_PANEL_PRESETS.find((p) => p.id === value)?.name ?? '전체')

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent/30',
          open && 'ring-1 ring-ring',
        )}
        title="프리셋 필터"
      >
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">프리셋</span>
          <span className="truncate">{activeLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {counts.get(value) ?? 0}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="프리셋 필터"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[min(18rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
        >
          <PresetFilterOption
            label="전체"
            description="모든 페르소나를 프리셋별 그룹으로 보기"
            count={counts.get('all') ?? 0}
            selected={value === 'all'}
            onSelect={() => {
              onChange('all')
              setOpen(false)
            }}
          />
          <div className="my-1 border-t border-border/60" />
          {PERSONA_PANEL_PRESETS.map((preset) => (
            <PresetFilterOption
              key={preset.id}
              label={preset.name}
              description={preset.description}
              count={counts.get(preset.id) ?? 0}
              selected={value === preset.id}
              onSelect={() => {
                onChange(preset.id)
                setOpen(false)
              }}
            />
          ))}
          <div className="my-1 border-t border-border/60" />
          <PresetFilterOption
            label="프리셋 외"
            description="어떤 프리셋에도 속하지 않은 페르소나"
            count={counts.get('unassigned') ?? 0}
            selected={value === 'unassigned'}
            onSelect={() => {
              onChange('unassigned')
              setOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function PresetFilterOption({
  label,
  description,
  count,
  selected,
  onSelect,
}: {
  label: string
  description: string
  count: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label}</div>
        <div className="truncate text-[10px] text-muted-foreground">{description}</div>
      </div>
      <span
        className={cn(
          'shrink-0 self-center rounded px-1.5 py-0.5 text-[10px]',
          count === 0 ? 'bg-muted/40 text-muted-foreground/50' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}
