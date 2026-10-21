'use client'

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Search, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useModalFocusLayer } from '@/lib/hooks/use-modal-focus-layer'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import type { Persona } from '@/lib/store/persona-store'
import { cn } from '@/lib/utils/cn'

export interface PersonaDialogFrameProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  icon?: ReactNode
  headerAction?: ReactNode
  dismissDisabled?: boolean
  panelClassName?: string
  children: ReactNode
}

export function PersonaDialogFrame({
  open,
  onOpenChange,
  title,
  description,
  icon,
  headerAction,
  dismissDisabled = false,
  panelClassName,
  children,
}: PersonaDialogFrameProps) {
  useModalViewportLock(open)
  const isTopModalLayer = useModalFocusLayer(open)
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      if (!isTopModalLayer()) return
      const panel = panelRef.current
      const firstControl = panel?.querySelector<HTMLElement>(
        '[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      ;(firstControl ?? panel)?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      opener?.focus()
    }
  }, [isTopModalLayer, open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModalLayer()) return
      if (event.key === 'Tab') {
        const controls = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((node) => node.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (!first || !last) {
          event.preventDefault()
          panelRef.current?.focus()
          return
        }
        if (!panelRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
          return
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        dismissDisabled
      ) {
        return
      }
      event.preventDefault()
      onOpenChange(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dismissDisabled, isTopModalLayer, onOpenChange, open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="dialog-scroll-region fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 p-2 backdrop-blur-[2px] sm:p-4"
      data-slot="persona-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dismissDisabled) {
          onOpenChange(false)
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative my-auto flex h-[min(36rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] w-full max-w-[44rem] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:h-[min(36rem,calc(100dvh-2rem))] sm:max-h-[calc(100dvh-2rem)]',
          panelClassName,
        )}
        data-slot="persona-dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background px-4 py-3">
          {icon ? (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
          </div>
          {headerAction ? (
            <div className="shrink-0" data-slot="persona-dialog-header-action">
              {headerAction}
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={dismissDisabled}
            aria-label={`${title} 닫기`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          data-slot="persona-dialog-content"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export type PersonaAvatarSize = 'sm' | 'md' | 'lg'

export interface PersonaAvatarProps {
  persona: Persona
  size?: PersonaAvatarSize
  selected?: boolean
  loading?: boolean
  className?: string
}

const avatarSizeClassNames: Record<PersonaAvatarSize, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
}

const avatarIconSizeClassNames: Record<PersonaAvatarSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

export function PersonaAvatar({
  persona,
  size = 'md',
  selected = false,
  loading = false,
  className,
}: PersonaAvatarProps) {
  const avatar = persona.avatar?.trim()
  const initial = persona.name.trim().slice(0, 1).toLocaleUpperCase()

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border font-semibold leading-none transition-colors',
        selected
          ? 'border-primary/35 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground',
        avatarSizeClassNames[size],
        className,
      )}
      data-loading={loading || undefined}
      data-selected={selected || undefined}
      aria-hidden="true"
    >
      {loading ? (
        <LoaderCircle className={cn(avatarIconSizeClassNames[size], 'animate-spin')} />
      ) : avatar || initial ? (
        avatar || initial
      ) : (
        <User className={avatarIconSizeClassNames[size]} />
      )}
    </span>
  )
}

export interface PersonaIdentityProps {
  persona: Persona
  description?: ReactNode
  compact?: boolean
  className?: string
}

export function PersonaIdentity({
  persona,
  description,
  compact = false,
  className,
}: PersonaIdentityProps) {
  const resolvedDescription = description === undefined ? persona.description : description

  return (
    <span className={cn('min-w-0 flex-1', className)}>
      <span
        className={cn(
          'block truncate font-medium text-foreground',
          compact ? 'text-xs' : 'text-sm',
        )}
      >
        {persona.name}
      </span>
      {resolvedDescription ? (
        <span
          className={cn(
            'block truncate text-muted-foreground',
            compact ? 'mt-0.5 text-[10px] leading-3.5' : 'mt-0.5 text-xs leading-4',
          )}
        >
          {resolvedDescription}
        </span>
      ) : null}
    </span>
  )
}

export interface PersonaChoiceRowProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  persona: Persona
  selected?: boolean
  description?: ReactNode
  avatarSize?: PersonaAvatarSize
  loading?: boolean
  compact?: boolean
  trailing?: ReactNode
}

export const PersonaChoiceRow = forwardRef<HTMLButtonElement, PersonaChoiceRowProps>(
  function PersonaChoiceRow(
    {
      persona,
      selected = false,
      description,
      avatarSize,
      loading = false,
      compact = false,
      trailing,
      className,
      disabled,
      type = 'button',
      'aria-pressed': ariaPressed,
      ...buttonProps
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
          selected
            ? 'border-primary/35 bg-primary/10'
            : 'border-transparent bg-transparent hover:border-border hover:bg-muted/70',
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-pressed={ariaPressed ?? selected}
        data-selected={selected || undefined}
        {...buttonProps}
      >
        <PersonaAvatar
          persona={persona}
          size={avatarSize ?? (compact ? 'sm' : 'md')}
          selected={selected}
          loading={loading}
        />
        <PersonaIdentity persona={persona} description={description} compact={compact} />
        {trailing !== undefined && trailing !== null ? (
          <span className="ml-auto flex shrink-0 items-center" data-slot="persona-choice-trailing">
            {trailing}
          </span>
        ) : null}
      </button>
    )
  },
)

export interface PersonaSearchFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  clearLabel?: string
  className?: string
}

export function PersonaSearchField({
  value,
  onChange,
  label,
  placeholder,
  clearLabel = '검색어 지우기',
  className,
}: PersonaSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn('h-9 pl-8 text-xs', value && 'pr-9')}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          aria-label={clearLabel}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
