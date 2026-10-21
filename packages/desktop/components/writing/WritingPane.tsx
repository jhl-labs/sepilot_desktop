'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { confirm } from '@/lib/utils/confirm'
import { Check, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { createDocClient, type DocDiffPreview } from '@sepilotd/api-client'
import { Button } from '@/components/ui/button'
import { hasDesktopBridge, requireDesktopBridge } from '@/lib/electron/bridge'
import { useTransport } from '@/components/providers/transport-provider'
import {
  MarkdownEditorSurface,
  type MarkdownEditorSurfaceRef,
} from '@/components/writing/MarkdownEditorSurface'
import { WritingToolbar } from '@/components/writing/WritingToolbar'
import { WritingSlashMenu } from '@/components/writing/WritingSlashMenu'
import { useWritingDocStore } from '@/lib/store/writing-mode-store'
import {
  DOC_ACTIONS,
  SELECTION_ACTIONS,
  buildContinueWritingPrompt,
  filterSlashCommands,
  sendAiAssistant,
  type SlashCommand,
} from './WritingActions'

interface DocUpdateEvent {
  type: 'doc.updated'
  sessionId: string
  version: number
  author: 'user' | 'llm' | 'external'
  toolName?: string
  label?: string
}
interface DocDiffPendingEvent {
  type: 'doc.diff_pending'
  sessionId: string
  preview: DocDiffPreview
}
interface DocDiffResolvedEvent {
  type: 'doc.diff_resolved'
  sessionId: string
  previewId: string
  resolution: 'accepted' | 'cancelled' | 'expired'
}
interface DocClosedEvent { type: 'doc.closed'; sessionId: string }

function getInvoke():
  | (<T = unknown>(channel: string, ...args: unknown[]) => Promise<T>)
  | null {
  if (!hasDesktopBridge()) return null
  return requireDesktopBridge().invoke ?? null
}

function diffSuffix(baseline: string, next: string): string {
  let i = 0
  const max = Math.min(baseline.length, next.length)
  while (i < max && baseline.charCodeAt(i) === next.charCodeAt(i)) i++
  return next.slice(i)
}

function singleTextChange(
  baseline: string,
  next: string,
): { start: number; end: number; newText: string } | null {
  if (baseline === next) return null
  let start = 0
  const maxStart = Math.min(baseline.length, next.length)
  while (start < maxStart && baseline.charCodeAt(start) === next.charCodeAt(start)) {
    start += 1
  }

  let baselineEnd = baseline.length
  let nextEnd = next.length
  while (
    baselineEnd > start
    && nextEnd > start
    && baseline.charCodeAt(baselineEnd - 1) === next.charCodeAt(nextEnd - 1)
  ) {
    baselineEnd -= 1
    nextEnd -= 1
  }

  return {
    start,
    end: baselineEnd,
    newText: next.slice(start, nextEnd),
  }
}

function truncatePreview(text: string, max = 140): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? collapsed.slice(0, max) + '…' : collapsed
}


interface SelectionState {
  from: number
  to: number
  text: string
  anchor: { x: number; y: number } | null
}

interface SlashMenuState {
  slashPos: number
  query: string
  anchor: { x: number; y: number }
  highlightIndex: number
}

const SLASH_QUERY_RE = /^\/([\p{L}\p{N} _-]*)$/u

export function WritingEditorPane() {
  const docId = useWritingDocStore((s) => s.docId)
  const filePath = useWritingDocStore((s) => s.filePath)
  const content = useWritingDocStore((s) => s.content)
  const version = useWritingDocStore((s) => s.version)
  const dirty = useWritingDocStore((s) => s.dirty)
  const setSession = useWritingDocStore((s) => s.setSession)
  const setContent = useWritingDocStore((s) => s.setContent)
  const setVersion = useWritingDocStore((s) => s.setVersion)
  const markSaved = useWritingDocStore((s) => s.markSaved)
  const pendingPreview = useWritingDocStore((s) => s.pendingPreview)
  const setPendingPreview = useWritingDocStore((s) => s.setPendingPreview)

  const transport = useTransport()
  const [busy, setBusy] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [outlineVisible, setOutlineVisible] = useState(true)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null)
  const [docClient, setDocClient] = useState<ReturnType<typeof createDocClient> | null>(null)

  const cmRef = useRef<MarkdownEditorSurfaceRef>(null)
  const debounceTimer = useRef<number | null>(null)
  const lastSentContent = useRef<string | null>(null)
  const ownVersionsRef = useRef<Set<number>>(new Set())

  const dismissedSlashRef = useRef<Set<number>>(new Set())
  const slashMenuRef = useRef<SlashMenuState | null>(null)
  useEffect(() => { slashMenuRef.current = slashMenu }, [slashMenu])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cfg = await transport.getConfig()
      if (cancelled) return
      setDocClient(createDocClient({ baseUrl: cfg.daemonOrigin, token: cfg.daemonToken }))
    })()
    return () => { cancelled = true }
  }, [transport])

  useEffect(() => {
    if (!docClient || docId) return
    let cancelled = false
    void (async () => {
      try {
        const session = await docClient.open({ path: null })
        if (cancelled) return
        setSession(session)
        lastSentContent.current = session.content
      } catch (err) {
        console.warn('auto-open empty doc failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [docClient, docId, setSession])

  useEffect(() => {
    return () => {
      if (debounceTimer.current != null) {
        window.clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!docClient || !docId) return
    const es = new EventSource(docClient.eventsUrl())

    const handleUpdated = async (raw: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(raw.data) as DocUpdateEvent
        if (ev.sessionId !== docId) return
        if (ev.author === 'user' && ownVersionsRef.current.has(ev.version)) {
          ownVersionsRef.current.delete(ev.version)
          setVersion(ev.version)
          return
        }
        const fresh = await docClient.get(docId)
        lastSentContent.current = fresh.content
        setSession(fresh)
        if (ev.author === 'llm') {
          toast.info(`LLM 편집: ${ev.label ?? ev.toolName ?? 'update'}`)
        } else if (ev.author === 'external') {
          toast.warning('외부 변경 — 디스크 reload')
        }
      } catch (err) {
        console.error('doc.updated handle error', err)
      }
    }
    const handleDiffPending = (raw: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(raw.data) as DocDiffPendingEvent
        if (ev.sessionId !== docId) return
        setPendingPreview(ev.preview)
      } catch (err) { console.error(err) }
    }
    const handleDiffResolved = (raw: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(raw.data) as DocDiffResolvedEvent
        if (ev.sessionId !== docId) return
        setPendingPreview(null)
        if (ev.resolution === 'expired') toast.info('diff preview 만료')
      } catch (err) { console.error(err) }
    }
    const handleClosed = (raw: MessageEvent<string>) => {
      try {
        const ev = JSON.parse(raw.data) as DocClosedEvent
        if (ev.sessionId !== docId) return
        useWritingDocStore.getState().closeSession()
      } catch (err) { console.error(err) }
    }

    es.addEventListener('doc.updated', handleUpdated as unknown as EventListener)
    es.addEventListener('doc.diff_pending', handleDiffPending as unknown as EventListener)
    es.addEventListener('doc.diff_resolved', handleDiffResolved as unknown as EventListener)
    es.addEventListener('doc.closed', handleClosed as unknown as EventListener)
    es.onerror = (err) => console.warn('doc events SSE error', err)

    return () => { es.close() }
  }, [docClient, docId, setSession, setVersion, setPendingPreview])

  const handleOpen = useCallback(async () => {
    const invoke = getInvoke()
    if (!invoke || !docClient) return
    if (useWritingDocStore.getState().dirty) {
      const ok = await confirm('저장하지 않은 글쓰기 문서가 있습니다. 닫고 다른 파일을 열까요?')
      if (!ok) return
    }
    setBusy(true)
    try {
      const picked = await invoke<{ path: string } | null>('sepilot:writing/pick-open')
      if (!picked) return
      if (docId) {
        await docClient.close(docId).catch(() => {})
      }
      const session = await docClient.open({ path: picked.path })
      setSession(session)
      lastSentContent.current = session.content
      toast.success(`열기: ${session.path}`)
    } catch (err) {
      toast.error(`열기 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [docClient, docId, setSession])

  const handleSave = useCallback(async () => {
    const invoke = getInvoke()
    if (!invoke || !docClient || !docId) return
    setBusy(true)
    try {
      let targetPath: string | undefined
      if (!filePath) {
        const picked = await invoke<{ path: string } | null>('sepilot:writing/pick-save-as')
        if (!picked) return
        targetPath = picked.path
      }
      const result = await docClient.save(docId, targetPath)
      markSaved(result.path, result.mtimeMs)
      toast.success(`저장: ${result.path}`)
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [docClient, docId, filePath, markSaved])

  const handleUndo = useCallback(async () => {
    if (!docClient || !docId) return
    try {
      const result = await docClient.undo(docId)
      if (!result) {
        toast.info('되돌릴 LLM 편집이 없습니다')
        return
      }
      toast.success('LLM 편집 되돌림')
    } catch (err) {
      toast.error(`undo 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [docClient, docId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleChange = useCallback(
    (next: string) => {
      setContent(next)
      if (!docClient || !docId) return
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current)
      debounceTimer.current = window.setTimeout(async () => {
        const baseline = lastSentContent.current ?? ''
        if (next === baseline) return
        try {
          const change = singleTextChange(baseline, next)
          if (!change) return
          const result = await docClient.userEdit(
            docId,
            [change],
            version,
          )
          ownVersionsRef.current.add(result.version)
          lastSentContent.current = next
          setVersion(result.version)
        } catch {
          const droppedText = diffSuffix(baseline, next)
          try {
            const fresh = await docClient.get(docId)
            lastSentContent.current = fresh.content
            setSession(fresh)
            if (droppedText) {
              toast.warning('편집 충돌 — daemon 최신 내용으로 동기화', {
                description: `직전 입력: ${truncatePreview(droppedText)}`,
                action: {
                  label: '입력 복사',
                  onClick: () => {
                    void navigator.clipboard?.writeText(droppedText)
                  },
                },
                duration: 12000,
              })
            } else {
              toast.warning('편집 충돌 — daemon 최신 내용으로 동기화')
            }
          } catch {}
        }
      }, 400)
    },
    [docClient, docId, version, setContent, setVersion, setSession],
  )

  const handleUpdate = useCallback(
    (vu: {
      view: EditorView
      state: {
        selection: { main: { from: number; to: number } }
        doc: {
          sliceString: (a: number, b: number) => string
          lineAt: (pos: number) => { from: number; to: number; text: string }
        }
      }
    }) => {
      const { from, to } = vu.state.selection.main

      if (from === to) {
        setSelection(null)
        const line = vu.state.doc.lineAt(from)
        const textBeforeCursor = vu.state.doc.sliceString(line.from, from)
        const match = SLASH_QUERY_RE.exec(textBeforeCursor)
        const current = slashMenuRef.current
        if (match) {
          const slashPos = line.from
          if (dismissedSlashRef.current.has(slashPos)) {
            if (current) setSlashMenu(null)
          } else {
            const coords = vu.view.coordsAtPos(slashPos)
            const anchor = coords
              ? { x: coords.left, y: coords.bottom + 4 }
              : { x: 0, y: 0 }
            const query = match[1] ?? ''
            const filtered = filterSlashCommands(query)
            const nextHighlight =
              current && current.slashPos === slashPos
                ? Math.min(current.highlightIndex, Math.max(0, filtered.length - 1))
                : 0
            if (
              current &&
              current.slashPos === slashPos &&
              current.query === query &&
              current.anchor.x === anchor.x &&
              current.anchor.y === anchor.y &&
              current.highlightIndex === nextHighlight
            ) {
            } else {
              setSlashMenu({ slashPos, query, anchor, highlightIndex: nextHighlight })
            }
          }
        } else {
          dismissedSlashRef.current.delete(line.from)
          if (current) {
            dismissedSlashRef.current.delete(current.slashPos)
            setSlashMenu(null)
          }
        }
        return
      }

      if (slashMenuRef.current) setSlashMenu(null)
      const text = vu.state.doc.sliceString(from, to)
      const coords = vu.view.coordsAtPos(from)
      const anchor = coords ? { x: coords.left, y: coords.top - 8 } : null
      setSelection((prev) => {
        if (
          prev &&
          prev.from === from &&
          prev.to === to &&
          prev.text === text &&
          ((prev.anchor === null && anchor === null) ||
            (prev.anchor != null &&
              anchor != null &&
              prev.anchor.x === anchor.x &&
              prev.anchor.y === anchor.y))
        ) {
          return prev
        }
        return { from, to, text, anchor }
      })
    },
    [],
  )

  const slashCommands: readonly SlashCommand[] = slashMenu
    ? filterSlashCommands(slashMenu.query)
    : []

  const dismissSlashMenu = useCallback(() => {
    setSlashMenu((current) => {
      if (current) dismissedSlashRef.current.add(current.slashPos)
      return null
    })
  }, [])

  const pickSlashCommand = useCallback(
    (command: SlashCommand) => {
      const view = cmRef.current?.view
      if (!view) return
      const slashPos = slashMenu ? slashMenu.slashPos : view.state.selection.main.head
      const queryEnd = view.state.selection.main.head
      const docAfterDelete =
        queryEnd > slashPos
          ? view.state.doc.sliceString(0, slashPos) +
            view.state.doc.sliceString(queryEnd)
          : view.state.doc.toString()
      const before = docAfterDelete.slice(0, slashPos)
      const after = docAfterDelete.slice(slashPos)
      const newCursor = slashPos

      if (command.kind === 'insert') {
        const { text, cursorOffset } = command.buildSnippet({
          cursor: newCursor,
          precedingText: before,
          followingText: after,
        })
        const changes =
          queryEnd > slashPos
            ? [
                { from: slashPos, to: queryEnd, insert: '' },
                { from: queryEnd, to: queryEnd, insert: text },
              ]
            : [{ from: slashPos, to: slashPos, insert: text }]
        const anchor = slashPos + (cursorOffset ?? text.length)
        view.dispatch({
          changes,
          selection: { anchor },
          scrollIntoView: true,
        })
        view.focus()
        toast.success(`삽입: ${command.label}`)
      } else {
        if (queryEnd > slashPos) {
          view.dispatch({
            changes: { from: slashPos, to: queryEnd, insert: '' },
            selection: { anchor: slashPos },
          })
        }
        sendAiAssistant(
          command.buildPrompt({
            cursor: newCursor,
            precedingText: before,
            followingText: after,
          }),
        )
        toast.success(`AI에 요청: ${command.label}`)
      }

      dismissedSlashRef.current.delete(slashPos)
      setSlashMenu(null)
    },
    [slashMenu],
  )

  const openSlashMenuAtCursor = useCallback(() => {
    const view = cmRef.current?.view
    if (!view) return
    const cursor = view.state.selection.main.head
    const coords = view.coordsAtPos(cursor)
    const anchor = coords ? { x: coords.left, y: coords.bottom + 4 } : { x: 0, y: 0 }
    dismissedSlashRef.current.delete(cursor)
    setSlashMenu({
      slashPos: cursor,
      query: '',
      anchor,
      highlightIndex: 0,
    })
  }, [])

  useEffect(() => {
    if (!slashMenu) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target?.closest('[role="listbox"][aria-label="AI 명령"]')) return
      if (target?.closest('.cm-editor')) return
      dismissSlashMenu()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [slashMenu, dismissSlashMenu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key !== '/') return
      if (!document.activeElement?.closest('.cm-editor')) return
      e.preventDefault()
      openSlashMenuAtCursor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSlashMenuAtCursor])

  const handleContinueWriting = useCallback(() => {
    const view = cmRef.current?.view
    if (!view) return
    const cursor = view.state.selection.main.head
    const doc = view.state.doc
    const before = doc.sliceString(0, cursor)
    const after = doc.sliceString(cursor)
    sendAiAssistant(
      buildContinueWritingPrompt({ cursor, precedingText: before, followingText: after }),
    )
    toast.success('이어쓰기 요청 — chat을 확인하세요')
  }, [])

  const runSelectionAction = useCallback(
    (actionId: string) => {
      if (!selection) return
      const action = SELECTION_ACTIONS.find((a) => a.id === actionId)
      if (!action) return
      sendAiAssistant(
        action.buildPrompt({
          selection: selection.text,
          start: selection.from,
          end: selection.to,
        }),
      )
      setSelection(null)
      toast.success(`AI에 요청: ${action.label}`)
    },
    [selection],
  )

  const runDocAction = useCallback((actionId: string) => {
    const action = DOC_ACTIONS.find((a) => a.id === actionId)
    if (!action) return
    sendAiAssistant(action.buildPrompt())
    toast.success(`AI에 요청: ${action.label}`)
  }, [])

  const acceptPreview = useCallback(async () => {
    if (!docClient || !docId || !pendingPreview) return
    try {
      await docClient.acceptPreview(docId, pendingPreview.id)
      setPendingPreview(null)
    } catch (err) {
      toast.error(`수락 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [docClient, docId, pendingPreview, setPendingPreview])
  const cancelPreview = useCallback(async () => {
    if (!docClient || !docId || !pendingPreview) return
    try {
      await docClient.cancelPreview(docId, pendingPreview.id)
      setPendingPreview(null)
    } catch (err) {
      toast.error(`취소 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [docClient, docId, pendingPreview, setPendingPreview])

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <WritingToolbar
        filePath={filePath}
        docId={docId}
        version={version}
        dirty={dirty}
        busy={busy}
        previewMode={previewMode}
        outlineVisible={outlineVisible}
        onOpen={handleOpen}
        onSave={handleSave}
        onRunDocAction={runDocAction}
        onContinueWriting={handleContinueWriting}
        onUndo={handleUndo}
        onTogglePreview={() => setPreviewMode((v) => !v)}
        onToggleOutline={() => setOutlineVisible((v) => !v)}
      />

      <MarkdownEditorSurface
        ref={cmRef}
        content={content}
        onChange={handleChange}
        previewMode={previewMode}
        outlineVisible={outlineVisible}
        onUpdate={handleUpdate}
        onKeyDown={(e) => {
          if (slashMenu) {
            if (e.key === 'Escape') {
              e.preventDefault()
              dismissSlashMenu()
              return
            }
            if (slashCommands.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashMenu({
                  ...slashMenu,
                  highlightIndex:
                    (slashMenu.highlightIndex + 1) % slashCommands.length,
                })
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashMenu({
                  ...slashMenu,
                  highlightIndex:
                    (slashMenu.highlightIndex - 1 + slashCommands.length) %
                    slashCommands.length,
                })
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                pickSlashCommand(
                  slashCommands[Math.min(slashMenu.highlightIndex, slashCommands.length - 1)],
                )
                return
              }
            }
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handleContinueWriting()
          }
        }}
        placeholder={
          docId
            ? '여기에 마크다운을 작성하세요. 텍스트를 선택하면 AI 액션, 줄 시작에 `/`를 입력하면 슬래시 메뉴가 떠오릅니다.'
            : '파일을 열거나 바로 쓰기 시작하세요.'
        }
      >

          {}
          {!previewMode && selection && selection.anchor ? (
            <SelectionFloatingMenu
              x={selection.anchor.x}
              y={selection.anchor.y}
              onAction={runSelectionAction}
              onDismiss={() => setSelection(null)}
            />
          ) : null}

          {}
          {!previewMode && slashMenu ? (
            <WritingSlashMenu
              x={slashMenu.anchor.x}
              y={slashMenu.anchor.y}
              commands={slashCommands}
              highlightIndex={Math.min(
                slashMenu.highlightIndex,
                Math.max(0, slashCommands.length - 1),
              )}
              setHighlightIndex={(i) =>
                setSlashMenu({ ...slashMenu, highlightIndex: i })
              }
              onPick={pickSlashCommand}
            />
          ) : null}

          {}
          {pendingPreview ? (
            <div className="absolute inset-x-3 bottom-3 z-10 rounded-md border border-border bg-background/95 p-3 shadow-lg">
              <div className="mb-2 flex items-start gap-2">
                <div className="flex-1 text-sm">
                  <div className="font-semibold">변경 미리보기</div>
                  <div className="text-xs text-muted-foreground">{pendingPreview.summary}</div>
                </div>
                <Button size="sm" variant="outline" onClick={cancelPreview}>
                  <X className="mr-1 h-3.5 w-3.5" /> 취소
                </Button>
                <Button size="sm" variant="default" onClick={acceptPreview}>
                  <Check className="mr-1 h-3.5 w-3.5" /> 수락
                </Button>
              </div>
              <div className="max-h-40 space-y-2 overflow-auto text-xs">
                {pendingPreview.changes.slice(0, 5).map((ch, i) => (
                  <div key={i} className="rounded bg-muted/40 p-2 font-mono">
                    <div className="mb-1 text-[10px] text-muted-foreground">
                      {ch.start}..{ch.end} → +{ch.newText.length}자
                    </div>
                    <div className="grid gap-1 text-xs md:grid-cols-2">
                      <div>
                        <div className="mb-0.5 text-[10px] text-muted-foreground">현재</div>
                        <div className="whitespace-pre-wrap rounded bg-background/70 p-1.5">
                          {content.slice(ch.start, ch.end).slice(0, 200)}
                          {content.slice(ch.start, ch.end).length > 200 ? '…' : ''}
                        </div>
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] text-muted-foreground">변경</div>
                        <div className="whitespace-pre-wrap rounded bg-emerald-500/10 p-1.5">
                          {ch.newText.slice(0, 200)}
                          {ch.newText.length > 200 ? '…' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {pendingPreview.changes.length > 5 ? (
                  <div className="text-[11px] text-muted-foreground">
                    +{pendingPreview.changes.length - 5} more
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
      </MarkdownEditorSurface>
    </div>
  )
}

function SelectionFloatingMenu({
  x,
  y,
  onAction,
  onDismiss,
}: {
  x: number
  y: number
  onAction: (actionId: string) => void
  onDismiss: () => void
}) {
  const left = Math.max(8, Math.min(x, window.innerWidth - 360))
  const top = Math.max(8, y - 56)
  return (
    <div
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1 shadow-lg"
      style={{ left, top, maxWidth: 'min(540px, calc(100vw - 16px))' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Sparkles className="ml-1 mr-0.5 h-3.5 w-3.5 text-primary" />
      {SELECTION_ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onAction(a.id)}
          className="rounded px-2 py-1 text-xs hover:bg-muted"
          title={a.label}
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-1 py-1 text-muted-foreground hover:bg-muted"
        title="닫기"
        aria-label="닫기"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
