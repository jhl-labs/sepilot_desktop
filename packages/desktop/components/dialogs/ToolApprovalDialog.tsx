'use client'
import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileDiff, FolderLock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { useChatStore } from '@/lib/store/chat-store'
import { useSessionStore } from '@/lib/store/session-store'
import { type ApprovalScope, createApprovalsApi } from '@/lib/api/approvals'
import { createChatApi } from '@/lib/api/chat'
import { getDesktopApi } from '@/lib/electron/bridge'
import { Button } from '@/components/ui/button'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

const SCOPE_LABEL: Record<ApprovalScope, string> = {
  once: '이번 한 번',
  session: '이 세션 동안',
  always: '항상 (영구)',
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function summarizeArguments(args: unknown): string | null {
  const record = toRecord(args)
  if (!record) return null

  for (const key of ['path', 'file', 'target', 'url', 'cwd']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  for (const key of ['cmd', 'command']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const executable = record.executable
  if (typeof executable !== 'string' || !executable.trim()) return null
  const commandArgs = Array.isArray(record.args)
    ? record.args.filter((value): value is string => typeof value === 'string')
    : []
  return [executable.trim(), ...commandArgs].join(' ')
}

function formatArguments(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2) ?? String(args)
  } catch {
    return String(args)
  }
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = useMemo(() => diff.replace(/\r\n/g, '\n').split('\n'), [diff])
  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) added += 1
      if (line.startsWith('-') && !line.startsWith('---')) removed += 1
    }
    return { added, removed }
  }, [lines])

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-muted/15">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <FileDiff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-xs font-semibold">변경 미리보기</h3>
        <div className="ml-auto flex gap-2 font-mono text-[11px]">
          {stats.added > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">+{stats.added}</span>
          ) : null}
          {stats.removed > 0 ? (
            <span className="text-red-600 dark:text-red-400">-{stats.removed}</span>
          ) : null}
        </div>
      </div>
      <div
        aria-label="변경 미리보기"
        className="max-h-64 overflow-auto bg-background/60 py-2 font-mono text-[11px] leading-5"
      >
        {lines.map((line, index) => {
          const added = line.startsWith('+') && !line.startsWith('+++')
          const removed = line.startsWith('-') && !line.startsWith('---')
          return (
            <div
              key={index}
              className={
                added
                  ? 'bg-emerald-500/10 px-3 text-emerald-700 dark:text-emerald-300'
                  : removed
                    ? 'bg-red-500/10 px-3 text-red-700 dark:text-red-300'
                    : 'px-3 text-muted-foreground'
              }
            >
              <span className="whitespace-pre">{line || ' '}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ToolApprovalDialog() {
  const transport = useOptionalTransport()
  const queue = useChatStore((s) => s.pendingApprovals)
  const settleApproval = useChatStore((s) => s.settleApproval)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActiveSession = useSessionStore((s) => s.setActive)
  const [busy, setBusy] = useState(false)
  const busyRequestIdRef = useRef<string | null>(null)
  const [scope, setScope] = useState<ApprovalScope>('once')
  const [acknowledgedRequestId, setAcknowledgedRequestId] = useState<string | null>(null)
  const head = queue[0]

  const requestSession = head?.sessionId
    ? sessions.find((session) => session.id === head.sessionId)
    : undefined
  const activeSession = activeId
    ? sessions.find((session) => session.id === activeId)
    : undefined
  const requestSessionTitle = head?.sessionTitle ?? requestSession?.title
  const workspaceRoot = head?.workspaceRoot ?? requestSession?.cwd
  const sessionMismatch = Boolean(head?.sessionId && activeId && head.sessionId !== activeId)
  const sessionIdentityMissing = Boolean(head && !head.sessionId)
  const needsIdentityAcknowledgement = sessionMismatch
  const identityAcknowledged = acknowledgedRequestId === head?.requestId
  const argumentSummary = head ? summarizeArguments(head.args) : null
  const isResumableStaleApproval = head?.state === 'stale' && head.resumeAvailable === true
  const resumeSessionIdentityMissing = isResumableStaleApproval && !head?.sessionId
  const resumeRequiresSessionSwitch = Boolean(
    isResumableStaleApproval && head?.sessionId && head.sessionId !== activeId,
  )
  useModalViewportLock(Boolean(head))

  function beginBusy(requestId: string): boolean {
    if (busyRequestIdRef.current) return false
    busyRequestIdRef.current = requestId
    setBusy(true)
    return true
  }

  function finishBusy(requestId: string): void {
    if (busyRequestIdRef.current !== requestId) return
    busyRequestIdRef.current = null
    setBusy(false)
  }

  function activateResumeSession(): void {
    if (!head?.sessionId || busyRequestIdRef.current) return
    setScope('once')
    setAcknowledgedRequestId(null)
    setActiveSession(head.sessionId)
  }

  function dismissUnboundResume(): void {
    if (!head || !resumeSessionIdentityMissing || busyRequestIdRef.current) return
    settleApproval(head.requestId, 'cancelled')
    setScope('once')
    setAcknowledgedRequestId(null)
  }

  async function decide(decision: 'approved' | 'denied'): Promise<void> {
    if (!head || busy || busyRequestIdRef.current) return
    if (
      head.state === 'stale'
      && head.resumeAvailable
      && (!head.sessionId || useSessionStore.getState().activeId !== head.sessionId)
    ) return
    if (decision === 'approved' && needsIdentityAcknowledgement && !identityAcknowledged) return
    if (!beginBusy(head.requestId)) return

    if (head.state === 'stale' && head.resumeAvailable) {
      const approval = head
      const approved = decision === 'approved'
      const appliesToActiveSession = Boolean(
        approval.sessionId && useSessionStore.getState().activeId === approval.sessionId,
      )
      let resumeFailure: Error | null = null
      try {
        const api = await createChatApi(transport ?? null)
        if (!api.resumeApproval) throw new Error('Approval resume is not available')
        settleApproval(approval.requestId, approved ? 'approved' : 'denied')
        finishBusy(approval.requestId)
        if (appliesToActiveSession) useChatStore.getState().setPending(true)

        await api.resumeApproval(
          approval.requestId,
          approved,
          approval.sessionId,
          {
            onUpsertMessage: (message) => {
              if (useSessionStore.getState().activeId === approval.sessionId) {
                useChatStore.getState().upsertMessage(message)
              }
            },
            onPlannerWorkingMemoryUpdated: (memory) => {
              if (useSessionStore.getState().activeId === approval.sessionId) {
                useChatStore.getState().setPlannerWorkingMemory(memory)
              }
            },
            onEditCheckpointResolved: (checkpoint) => {
              if (useSessionStore.getState().activeId === approval.sessionId) {
                useChatStore.getState().appendEditRollback(checkpoint)
              }
            },
            onDebateRound: (round) => {
              if (useSessionStore.getState().activeId === approval.sessionId) {
                useChatStore.getState().appendDebateRound(round)
              }
            },
            onApprovalRequest: (request) => {
              useChatStore.getState().enqueueApproval({
                ...request,
                state: 'live',
                sessionTitle: approval.sessionTitle,
                workspaceRoot: request.workspaceRoot ?? approval.workspaceRoot,
              })
            },
            onDone: () => {},
            onError: (error) => {
              resumeFailure = error
            },
          },
          {
            toolCall: {
              id: approval.toolCallId,
              name: approval.toolName,
              arguments: approval.args,
            },
            workspaceRoot: approval.workspaceRoot,
          },
        )
        if (resumeFailure) throw resumeFailure
        setScope('once')
        setAcknowledgedRequestId(null)
        return
      } catch (error) {
        const store = useChatStore.getState()
        const toolMessage = store.messages.find(
          (message) => message.id === `tool:${approval.toolCallId}`,
        )
        if (toolMessage) {
          store.upsertMessage({ ...toolMessage, toolState: 'approval_required' })
        }
        store.enqueueApproval(approval)
        const friendly = explainChatStreamError(error)
        toast.error('작업을 재개하지 못했습니다', { description: friendly.description })
        return
      } finally {
        if (useSessionStore.getState().activeId === approval.sessionId) useChatStore.getState().setPending(false)
        finishBusy(approval.requestId)
      }
    }

    let serverFailure: unknown = null
    try {
      const desktopApi = getDesktopApi()
      if (desktopApi?.respondApproval) {
        await desktopApi.respondApproval(
          head.requestId,
          decision === 'approved',
          { sessionId: head.sessionId, scope },
        )
      } else if (transport) {
        const api = await createApprovalsApi(transport)
        await api.respond({
          requestId: head.requestId,
          decision,
          scope,
          sessionId: head.sessionId,
        })
      } else {
        throw new Error('No transport available')
      }
    } catch (error) {
      serverFailure = error
    } finally {
      finishBusy(head.requestId)
    }

    if (!serverFailure) {
      settleApproval(head.requestId, decision === 'approved' ? 'approved' : 'denied')
      setScope('once')
      setAcknowledgedRequestId(null)
      return
    }

    const message =
      serverFailure instanceof Error
        ? serverFailure.message
        : String(serverFailure)
    const requestGone =
      /not found|NOT_FOUND|\b404\b|daemon capability ['"]approvals['"] is not available/i.test(
        message,
      )
    if (decision === 'denied' || requestGone) {
      settleApproval(head.requestId, requestGone ? 'cancelled' : 'denied')
      setScope('once')
      setAcknowledgedRequestId(null)
      toast.error('승인 요청을 닫았습니다', {
        description: requestGone
          ? '이미 처리되었거나 만료된 요청입니다.'
          : '서버로 거부 응답을 전송하지 못했지만 다이얼로그를 닫았습니다.',
      })
      return
    }

    const friendly = explainChatStreamError(serverFailure)
    toast.error(friendly.title, { description: friendly.description })
  }

  if (!head) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="도구 승인 요청"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-muted/20 px-5 py-4">
          <div className="mt-0.5 rounded-lg border border-border bg-background p-2 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">실행 전에 확인하세요</h2>
              {queue.length > 1 ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  +{queue.length - 1}개 대기 중
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              <strong className="font-semibold text-foreground">{head.toolName}</strong>이 아래 작업을
              수행하려고 합니다.
            </p>
            {argumentSummary ? (
              <p className="mt-1 truncate font-mono text-xs text-foreground" title={argumentSummary}>
                {argumentSummary}
              </p>
            ) : null}
          </div>
        </header>

        <div
          role="region"
          aria-label="도구 승인 세부 정보"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4 text-sm [scrollbar-gutter:stable]"
        >
          {head.context ? (
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                요청 이유
              </h3>
              <blockquote className="border-l-2 border-primary/50 pl-3 text-xs leading-5 text-foreground">
                {head.context}
              </blockquote>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-start gap-2.5">
              <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold">요청 세션과 워크스페이스</h3>
                <p className="mt-1 text-xs text-foreground">
                  {requestSessionTitle ?? '제목을 확인할 수 없는 세션'}
                </p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                  {workspaceRoot ?? '워크스페이스 정보 없음'}
                </p>
                {head.sessionId ? (
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80" title={head.sessionId}>
                    세션 {head.sessionId}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {isResumableStaleApproval && (resumeRequiresSessionSwitch || resumeSessionIdentityMissing) ? (
            <section
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 text-xs leading-5">
                  <p className="font-semibold">
                    {resumeSessionIdentityMissing
                      ? '요청 세션을 확인할 수 없어 재개할 수 없습니다.'
                      : '요청 대화로 이동한 뒤 재개해야 합니다.'}
                  </p>
                  <p>
                    {resumeSessionIdentityMissing
                      ? '안전하게 요청을 닫고 원래 대화에서 다시 시도해 주세요.'
                      : '재개 작업의 진행 상태와 중단 버튼을 올바른 대화에 표시하기 위한 보호 절차입니다.'}
                  </p>
                  {!resumeSessionIdentityMissing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 border-amber-500/50 bg-background/70 px-2.5 text-[11px] text-foreground"
                      onClick={activateResumeSession}
                      disabled={busy}
                    >
                      요청 대화로 이동
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : sessionMismatch || sessionIdentityMissing ? (
            <section
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 text-xs leading-5">
                  <p className="font-semibold">
                    {sessionMismatch ? '현재 보고 있는 대화의 요청이 아닙니다.' : '요청 세션을 확인할 수 없습니다.'}
                  </p>
                  {sessionMismatch ? (
                    <p>
                      현재 대화: {activeSession?.title ?? activeId}. 요청 세션을 확인한 뒤에만 승인하세요.
                    </p>
                  ) : (
                    <p>이전 버전에서 전달된 요청일 수 있습니다. 작업 맥락을 직접 확인하세요.</p>
                  )}
                  {sessionMismatch ? (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 font-medium">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={identityAcknowledged}
                        onChange={(event) =>
                          setAcknowledgedRequestId(event.target.checked ? head.requestId : null)
                        }
                        disabled={busy}
                      />
                      <span>요청 세션과 작업 범위를 확인했습니다.</span>
                    </label>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {head.previewDiff ? <DiffPreview diff={head.previewDiff} /> : null}

          <details
            className="rounded-lg border border-border/70 bg-muted/10"
            open={!head.previewDiff}
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
              요청 세부 정보
            </summary>
            <pre className="max-h-48 overflow-auto border-t border-border/70 bg-muted/30 p-3 text-[11px] leading-5">
              {formatArguments(head.args)}
            </pre>
          </details>

          {isResumableStaleApproval ? (
            <section className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                승인 범위
              </h3>
              <p className="mt-1 text-xs font-medium text-foreground">이번 한 번</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                중단된 체크포인트를 재개하는 승인은 이번 작업에만 적용되며 자동 승인 규칙으로 저장되지 않습니다.
              </p>
            </section>
          ) : (
            <>
              <fieldset className="flex flex-col gap-1.5 rounded-lg border border-border/70 px-3 py-2.5">
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  승인 범위
                </legend>
                {(['once', 'session', 'always'] as ApprovalScope[]).map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="radio"
                      name="approval-scope"
                      value={value}
                      checked={scope === value}
                      onChange={() => setScope(value)}
                      disabled={busy}
                    />
                    <span>{SCOPE_LABEL[value]}</span>
                    {value === 'always' ? (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        이후 같은 작업을 자동 승인
                      </span>
                    ) : null}
                  </label>
                ))}

                {scope !== 'once' && head.suggestedRule ? (
                  <div className="mt-1 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
                    저장될 규칙
                    <p className="mt-0.5 break-all font-mono text-foreground">
                      {head.suggestedRule.tool} · {head.suggestedRule.pattern}
                    </p>
                  </div>
                ) : null}
              </fieldset>

              <p className="text-[11px] leading-4 text-muted-foreground">
                안전상 강제 확인이 적용된 요청은 저장한 범위와 관계없이 다시 물을 수 있습니다.
              </p>
            </>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || resumeRequiresSessionSwitch}
            onClick={resumeSessionIdentityMissing ? dismissUnboundResume : () => void decide('denied')}
          >
            {resumeSessionIdentityMissing
              ? '요청 닫기'
              : isResumableStaleApproval
                ? '거부하고 재개'
                : '거부'}
          </Button>
          <Button
            size="sm"
            disabled={
              busy
              || resumeRequiresSessionSwitch
              || resumeSessionIdentityMissing
              || (needsIdentityAcknowledgement && !identityAcknowledged)
            }
            onClick={() => void decide('approved')}
          >
            {busy ? '처리 중…' : isResumableStaleApproval ? '승인하고 재개' : '승인'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
