'use client'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const MODIFIER_ONLY_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'Hyper',
  'Super',
  'OS',
])

const KEY_NAME_OVERRIDES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  ' ': 'Space',
  Spacebar: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  '+': 'Plus',
}

function normalizeKeyName(rawKey: string): string {
  if (KEY_NAME_OVERRIDES[rawKey]) return KEY_NAME_OVERRIDES[rawKey]
  if (rawKey.length === 1) return rawKey.toUpperCase()
  return rawKey
}

function eventToAccelerator(e: KeyboardEvent<HTMLElement>): string | null {
  if (MODIFIER_ONLY_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(normalizeKeyName(e.key))
  return parts.join('+')
}

interface ShortcutInputProps {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function ShortcutInput({
  value,
  onChange,
  disabled,
  placeholder = '클릭 후 키 조합을 누르세요',
  className,
}: ShortcutInputProps) {
  const [capturing, setCapturing] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const captureRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!capturing) return
    captureRef.current?.focus()
  }, [capturing])

  function handleCaptureKey(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      setCapturing(false)
      return
    }
    if (
      e.key === 'Escape'
      && !e.ctrlKey
      && !e.altKey
      && !e.shiftKey
      && !e.metaKey
    ) {
      e.preventDefault()
      setCapturing(false)
      setHint(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const accel = eventToAccelerator(e)
    if (!accel) {
      setHint('수정 키와 함께 일반 키를 눌러주세요 (예: Ctrl+Alt+T)')
      return
    }
    onChange(accel)
    setCapturing(false)
    setHint(null)
  }

  if (manualMode) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="CommandOrControl+Alt+T"
          disabled={disabled}
          className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setManualMode(false)}
          disabled={disabled}
          className="self-start text-[10px] text-muted-foreground hover:text-foreground"
        >
          ← 키 캡처 모드로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        ref={captureRef}
        type="button"
        onClick={() => {
          if (disabled) return
          setCapturing(true)
          setHint(null)
        }}
        onKeyDown={capturing ? handleCaptureKey : undefined}
        onBlur={() => {
          setCapturing(false)
          setHint(null)
        }}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-1 text-left text-sm transition-colors',
          capturing
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-border',
          disabled && 'opacity-50',
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Keyboard className="h-3.5 w-3.5 shrink-0 opacity-70" />
          {capturing ? (
            <span className="text-muted-foreground">키를 누르세요…</span>
          ) : value ? (
            <span className="font-mono text-xs">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        {value && !capturing ? (
          <span
            role="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange('')
            }}
            className="ml-2 shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          >
            지우기
          </span>
        ) : null}
      </button>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{hint ?? 'Tab / Esc로 빠져나갈 수 있습니다.'}</span>
        <button
          type="button"
          onClick={() => setManualMode(true)}
          disabled={disabled}
          className="hover:text-foreground"
        >
          수동 입력 →
        </button>
      </div>
    </div>
  )
}
