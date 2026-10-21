'use client'
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface SecretStatusFieldProps {
  label: string
  isSet: boolean | null
  hint?: string
  busy?: boolean
  onRotate: (next: string) => Promise<void> | void
  onClear?: () => Promise<void> | void
  placeholder?: string
  disabled?: boolean
  submitLabel?: string
  busyLabel?: string
}

export function SecretStatusField({
  label,
  isSet,
  hint,
  busy = false,
  onRotate,
  onClear,
  placeholder = '새 값 입력',
  disabled = false,
  submitLabel = '저장',
  busyLabel = '저장 중…',
}: SecretStatusFieldProps) {
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setDraft('')
      setReveal(false)
    }
  }, [editing])

  async function submit(): Promise<void> {
    const next = draft.trim()
    if (!next) return
    await onRotate(next)
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
        <span
          className={
            'rounded-full px-1.5 py-0.5 text-[10px] ' +
            (isSet === null
              ? 'bg-muted text-muted-foreground'
              : isSet
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')
          }
        >
          {isSet === null
            ? '확인 중'
            : isSet
              ? '설정됨'
              : '설정 안 됨'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {!editing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={disabled || busy}
            >
              {isSet ? '회전' : '입력'}
            </Button>
          ) : null}
          {!editing && isSet && onClear ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void onClear()}
              disabled={disabled || busy}
              aria-label={`${label} 제거`}
              title="제거"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditing(false)
                }
              }}
              placeholder={placeholder}
              className="h-8 pr-8 text-xs"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={reveal ? '값 숨기기' : '값 보이기'}
              tabIndex={-1}
            >
              {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={busy || draft.trim().length === 0}
          >
            {busy ? busyLabel : submitLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            취소
          </Button>
        </div>
      ) : null}
    </div>
  )
}
