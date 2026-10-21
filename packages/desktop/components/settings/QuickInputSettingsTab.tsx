'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Keyboard, Pencil, Plus, Trash2 } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  invokeDesktop,
  onDesktopChannel,
  publishQuickInput,
} from '@/lib/electron/bridge'
import {
  CapabilityUnavailableError,
  createQuickInputApi,
  type QuickQuestion,
} from '@/lib/api/quick-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShortcutInput } from './_shared/ShortcutInput'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import { registerSettingsTab } from './registry'
import type { QuickInputRegistrationState } from '@/electron/main/quick-input'

const QUICK_QUESTION_TEMPLATES: ReadonlyArray<{
  key: string
  label: string
  emoji: string
  name: string
  prompt: string
  shortcut: string
}> = [
  {
    key: 'translate-ko',
    label: '한국어로 번역',
    emoji: '🇰🇷',
    name: '한국어로 번역',
    prompt: '아래 텍스트를 자연스러운 한국어로 번역해주세요. 원문의 뉘앙스를 살리되, 한국어 어법에 맞게 의역해도 좋습니다.',
    shortcut: 'CommandOrControl+Alt+T',
  },
  {
    key: 'translate-en',
    label: '영어로 번역',
    emoji: '🇺🇸',
    name: '영어로 번역',
    prompt: 'Translate the following text into natural, idiomatic English. Preserve tone and intent, and keep the result concise.',
    shortcut: 'CommandOrControl+Alt+E',
  },
  {
    key: 'summarize',
    label: '핵심 요약',
    emoji: '📝',
    name: '핵심 요약',
    prompt: '아래 텍스트를 핵심 5개 불릿으로 요약해주세요. 각 불릿은 한 문장 이내로 간결하게.',
    shortcut: 'CommandOrControl+Alt+S',
  },
  {
    key: 'review-code',
    label: '코드 리뷰',
    emoji: '🔍',
    name: '코드 리뷰',
    prompt: '아래 코드를 시니어 개발자 관점에서 리뷰해주세요. 버그, 보안, 성능, 가독성, 베스트 프랙티스 측면에서 개선 포인트를 우선순위 순으로 알려주세요.',
    shortcut: 'CommandOrControl+Alt+R',
  },
  {
    key: 'fix-grammar',
    label: '문법 다듬기',
    emoji: '✍️',
    name: '문법 / 문장 다듬기',
    prompt: '아래 글의 문법, 맞춤법, 문장 흐름을 다듬어 주세요. 원래 의미와 어조는 유지하면서 더 자연스럽게.',
    shortcut: 'CommandOrControl+Alt+G',
  },
  {
    key: 'explain',
    label: '쉽게 설명',
    emoji: '💡',
    name: '쉽게 설명',
    prompt: '아래 내용을 비전공자도 이해할 수 있도록 쉽게 풀어 설명해주세요. 필요한 경우 비유나 예시를 사용해도 좋습니다.',
    shortcut: 'CommandOrControl+Alt+X',
  },
]

registerSettingsTab({
  key: 'quick-input',
  section: 'system',
  label: 'Quick Input',
  search: ['quick', 'hotkey', 'shortcut', 'tray', 'global shortcut'],
  render: () => <QuickInputSettingsTab />,
})

interface QuestionDraft {
  id: string
  name: string
  prompt: string
  shortcut: string
  enabled: boolean
  isNew: boolean
}

function emptyDraft(): QuestionDraft {
  const id = `qq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name: '',
    prompt: '',
    shortcut: 'CommandOrControl+Alt+T',
    enabled: true,
    isNew: true,
  }
}

function isQuickInputRegistrationState(
  value: unknown,
): value is QuickInputRegistrationState {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<QuickInputRegistrationState>
  return (
    typeof item.requestedAccelerator === 'string'
    && (typeof item.activeAccelerator === 'string' || item.activeAccelerator === null)
    && Array.isArray(item.attemptedAccelerators)
    && ['pending', 'preferred', 'fallback', 'unavailable', 'disabled'].includes(
      item.status ?? '',
    )
  )
}

export function QuickInputSettingsTab() {
  const transport = useTransport()
  const [form, setForm] = useState<{
    hotkey: string
    prefix: string
    quickQuestions: QuickQuestion[]
  }>({ hotkey: '', prefix: '', quickQuestions: [] })
  const [testText, setTestText] = useState('')
  const [editing, setEditing] = useState<QuestionDraft | null>(null)
  const [registrations, setRegistrations] = useState<
    Record<string, { registered: boolean }>
  >({})
  const [quickInputRegistration, setQuickInputRegistration] =
    useState<QuickInputRegistrationState | null>(null)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useModalViewportLock(Boolean(editing))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatus('loading')
      setError(null)
      try {
        const api = await createQuickInputApi(transport)
        const next = await api.getSettings()
        if (!cancelled) {
          setForm({
            hotkey: next.hotkey,
            prefix: next.prefix,
            quickQuestions: next.quickQuestions ?? [],
          })
          setStatus('ready')
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof CapabilityUnavailableError) {
          setStatus('unavailable')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'quick-input load failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  useEffect(() => {
    type Registration = { id: string; registered: boolean; enabled: boolean }

    const handler = (payload: Registration[] | undefined) => {
      if (!Array.isArray(payload)) return
      const next: Record<string, { registered: boolean }> = {}
      for (const entry of payload) {
        if (entry && typeof entry.id === 'string') {
          next[entry.id] = { registered: Boolean(entry.registered) }
        }
      }
      setRegistrations(next)
    }

    const unsub = onDesktopChannel<Registration[] | undefined>(
      'sepilot:quick-question/registration',
      handler,
    )
    void (async () => {
      try {
        const snapshot = await invokeDesktop<Registration[] | undefined>(
          'sepilot:quick-questions/registration',
        )
        if (Array.isArray(snapshot)) handler(snapshot)
      } catch {
      }
    })()
    return unsub
  }, [])

  useEffect(() => {
    const handler = (payload: unknown) => {
      if (isQuickInputRegistrationState(payload)) {
        setQuickInputRegistration(payload)
      }
    }
    const unsub = onDesktopChannel(
      'sepilot:quick-input/registration',
      handler,
    )
    void (async () => {
      try {
        handler(await invokeDesktop('sepilot:quick-input/registration'))
      } catch {
      }
    })()
    return unsub
  }, [])

  async function persist(
    next: typeof form,
    successMessage: string,
  ): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const api = await createQuickInputApi(transport)
      const saved = await api.setSettings(next)
      setForm({
        hotkey: saved.hotkey,
        prefix: saved.prefix,
        quickQuestions: saved.quickQuestions ?? [],
      })
      await reloadElectronQuickInputShortcuts()
      toast.success(successMessage)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'quick-input save failed'
      setError(message)
      toast.error('Quick Input 설정을 저장하지 못했습니다.', {
        description: message,
      })
    } finally {
      setSaving(false)
    }
  }

  async function save(): Promise<void> {
    await persist(form, 'Quick Input 설정을 저장했습니다.')
  }

  async function reloadElectronQuickInputShortcuts(): Promise<void> {
    try {
      const registration = await invokeDesktop('sepilot:quick-input/reload')
      if (isQuickInputRegistrationState(registration)) {
        setQuickInputRegistration(registration)
      }
    } catch {
    }
  }

  async function openQuickInputWindow(): Promise<void> {
    try {
      const result = await invokeDesktop<{ ok?: boolean }>('sepilot:quick-input/open')
      if (!result?.ok) throw new Error('Desktop 입력 창을 열 수 없습니다.')
    } catch (cause) {
      toast.error('Quick Input 창을 열지 못했습니다.', {
        description: cause instanceof Error ? cause.message : 'open failed',
      })
    }
  }

  function openNewQuestion(): void {
    setEditing(emptyDraft())
  }

  function openEditQuestion(q: QuickQuestion): void {
    setEditing({ ...q, isNew: false })
  }

  async function commitQuestion(): Promise<void> {
    if (!editing) return
    const trimmedName = editing.name.trim()
    const trimmedPrompt = editing.prompt.trim()
    const trimmedShortcut = editing.shortcut.trim()
    if (!trimmedName || !trimmedPrompt || !trimmedShortcut) {
      toast.warning('이름, 프롬프트, 단축키를 모두 입력하세요.')
      return
    }
    const replacement: QuickQuestion = {
      id: editing.id,
      name: trimmedName,
      prompt: trimmedPrompt,
      shortcut: trimmedShortcut,
      enabled: editing.enabled,
    }
    const list = editing.isNew
      ? [...form.quickQuestions, replacement]
      : form.quickQuestions.map((q) =>
          q.id === replacement.id ? replacement : q,
        )
    await persist(
      { ...form, quickQuestions: list },
      editing.isNew ? 'Quick Question을 추가했습니다.' : 'Quick Question을 수정했습니다.',
    )
    setEditing(null)
  }

  async function removeQuestion(id: string): Promise<void> {
    const ok = await confirm('이 Quick Question을 삭제할까요?', { destructive: true })
    if (!ok) return
    await persist(
      {
        ...form,
        quickQuestions: form.quickQuestions.filter((q) => q.id !== id),
      },
      'Quick Question을 삭제했습니다.',
    )
  }

  async function toggleEnabled(q: QuickQuestion): Promise<void> {
    await persist(
      {
        ...form,
        quickQuestions: form.quickQuestions.map((item) =>
          item.id === q.id ? { ...item, enabled: !item.enabled } : item,
        ),
      },
      q.enabled
        ? 'Quick Question 단축키를 비활성화했습니다.'
        : 'Quick Question 단축키를 활성화했습니다.',
    )
  }

  async function publishTest(): Promise<void> {
    const text = testText.trim()
    if (!text) return
    try {
      const published = await publishQuickInput(text)
      if (!published) {
        const api = await createQuickInputApi(transport)
        await api.publish(text)
      }
      setTestText('')
      toast.success(
        published
          ? 'Quick Input 메시지를 메인 입력으로 전송했습니다.'
          : 'Quick Input 메시지를 daemon으로 전송했습니다.',
      )
    } catch (err) {
      toast.error('Quick Input 테스트 전송에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'publish failed',
      })
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Quick Input" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Quick Input</h4>
          <p className="text-xs text-muted-foreground">
            전역 입력 창의 호출 키와 기본 prefix를 daemon 설정으로 저장합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Hotkey</label>
            <ShortcutInput
              value={form.hotkey}
              onChange={(next) =>
                setForm((prev) => ({ ...prev, hotkey: next }))
              }
              placeholder="클릭 후 키 조합을 누르세요"
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Prefix</label>
            <Input
              value={form.prefix}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, prefix: event.target.value }))
              }
              placeholder="/ask"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void openQuickInputWindow()}
            disabled={saving}
          >
            <Keyboard className="mr-1 h-3.5 w-3.5" />
            입력 창 열기
          </Button>
          <span className="text-xs text-muted-foreground">
            입력 창 자체는 Electron에서 열리지만 설정은 daemon이 관리합니다.
          </span>
        </div>
        {quickInputRegistration ? (
          <div
            data-testid="quick-input-registration"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <span
              className={
                quickInputRegistration.status === 'preferred'
                  ? 'inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300'
                  : quickInputRegistration.status === 'fallback'
                    ? 'inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300'
                    : quickInputRegistration.status === 'unavailable'
                      ? 'inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300'
                      : 'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground'
              }
            >
              {quickInputRegistration.status === 'preferred' ? (
                <Check className="h-3.5 w-3.5" />
              ) : quickInputRegistration.status === 'fallback'
                || quickInputRegistration.status === 'unavailable' ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <Keyboard className="h-3.5 w-3.5" />
                )}
              {quickInputRegistration.status === 'preferred'
                ? '단축키 활성'
                : quickInputRegistration.status === 'fallback'
                  ? '대체 단축키 활성'
                  : quickInputRegistration.status === 'unavailable'
                    ? '단축키 등록 실패'
                    : quickInputRegistration.status === 'disabled'
                      ? '전역 단축키 비활성화'
                      : '단축키 확인 중'}
            </span>
            <span className="font-mono text-[11px] text-foreground">
              {quickInputRegistration.activeAccelerator
                ?? quickInputRegistration.requestedAccelerator}
            </span>
            {quickInputRegistration.status === 'fallback' ? (
              <>
                <span className="text-[11px] text-muted-foreground">
                  요청한 {quickInputRegistration.requestedAccelerator} 키를 다른 앱이 사용 중입니다.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    const active = quickInputRegistration.activeAccelerator
                    if (active) setForm((prev) => ({ ...prev, hotkey: active }))
                  }}
                >
                  활성 키를 입력값에 적용
                </Button>
              </>
            ) : quickInputRegistration.status === 'unavailable' ? (
              <span className="text-[11px] text-muted-foreground">
                시도한 키: {quickInputRegistration.attemptedAccelerators.join(', ')}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            실제 OS 등록 상태는 Desktop 앱에서 확인할 수 있습니다.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Quick Questions</h4>
            <p className="text-xs text-muted-foreground">
              단축키를 누르면 클립보드 내용을 프롬프트와 합쳐 새 채팅으로
              자동 전송합니다. 예: 영문 복사 → 단축키 → 한국어로 번역.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openNewQuestion()}
            disabled={saving || form.quickQuestions.length >= 16}
          >
            <Plus className="mr-1 h-4 w-4" />
            추가
          </Button>
        </div>
        {form.quickQuestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            등록된 Quick Question이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {form.quickQuestions.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{q.name}</span>
                    <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {q.shortcut}
                    </span>
                    {!q.enabled ? (
                      <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                        비활성
                      </span>
                    ) : registrations[q.id]?.registered === false ? (
                      <span
                        title="다른 앱이 단축키를 점유 중입니다. 다른 키 조합으로 변경하세요."
                        className="inline-flex items-center gap-0.5 rounded bg-red-500/10 px-1 py-0.5 text-[10px] text-red-700 dark:text-red-300"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        충돌
                      </span>
                    ) : registrations[q.id]?.registered === true ? (
                      <span
                        title="단축키가 등록되어 동작 중입니다."
                        className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                      >
                        <Check className="h-2.5 w-2.5" />
                        활성
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {q.prompt}
                  </p>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleEnabled(q)}
                    disabled={saving}
                    className="rounded px-2 py-0.5 text-[11px] hover:bg-accent disabled:opacity-50"
                  >
                    {q.enabled ? '끄기' : '켜기'}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openEditQuestion(q)}
                    disabled={saving}
                    aria-label={`${q.name} 편집`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void removeQuestion(q.id)}
                    disabled={saving}
                    aria-label={`${q.name} 삭제`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Publish Test</h4>
          <p className="text-xs text-muted-foreground">
            브라우저에서도 daemon quick-input bus로 테스트 메시지를 보낼 수 있습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            placeholder="메인 입력으로 보낼 테스트 텍스트"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void publishTest()}
          >
            전송
          </Button>
        </div>
      </div>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing.isNew ? '새 Quick Question' : 'Quick Question 편집'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (saving ? null : setEditing(null))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-border px-6 py-4">
              <h3 className="text-sm font-semibold">
                {editing.isNew ? '새 Quick Question' : 'Quick Question 편집'}
              </h3>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-6 py-4">
            {editing.isNew ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  템플릿으로 시작하기
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_QUESTION_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        setEditing((s) =>
                          s
                            ? {
                                ...s,
                                name: tpl.name,
                                prompt: tpl.prompt,
                                shortcut: tpl.shortcut,
                              }
                            : s,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    >
                      <span aria-hidden>{tpl.emoji}</span>
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="flex flex-col gap-1 text-xs">
              이름
              <Input
                autoFocus
                value={editing.name}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, name: e.target.value } : s))
                }
                placeholder="예: 한국어로 번역"
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              프롬프트
              <textarea
                value={editing.prompt}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, prompt: e.target.value } : s))
                }
                placeholder="아래 텍스트를 한국어로 자연스럽게 번역해주세요."
                disabled={saving}
                rows={4}
                className="w-full rounded-md border border-border bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-[10px] text-muted-foreground">
                트리거 시 클립보드 내용이 두 줄 아래에 자동으로 덧붙습니다.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              단축키
              <ShortcutInput
                value={editing.shortcut}
                onChange={(next) =>
                  setEditing((s) => (s ? { ...s, shortcut: next } : s))
                }
                disabled={saving}
              />
              <span className="text-[10px] text-muted-foreground">
                예: Ctrl+Alt+T (Windows/Linux) · Cmd+Alt+T (macOS)
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, enabled: e.target.checked } : s,
                  )
                }
                disabled={saving}
              />
              활성화
            </label>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => void commitQuestion()}
                disabled={saving}
              >
                {saving ? '저장 중…' : '저장'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
