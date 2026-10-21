import React from 'react'
import {
  describeStopReason,
  shouldRenderStopCard,
  type RunStopNextAction,
  type RunStopReason,
} from '@sepilotd/api-client'

export interface DesktopRunStopCardProps {
  reason: RunStopReason | null | undefined
  locale?: 'en' | 'ko'
  disabled?: boolean
  availableActions?: RunStopNextAction[]
  onAction?: (kind: RunStopNextAction) => void | Promise<void>
}

export function DesktopRunStopCard({
  reason,
  locale = 'en',
  disabled = false,
  availableActions,
  onAction,
}: DesktopRunStopCardProps) {
  if (!shouldRenderStopCard(reason)) return null
  const copy = describeStopReason(reason, locale)
  const available = availableActions ? new Set(availableActions) : null
  return (
    <section
      className={`run-stop-card run-stop-card-${reason.kind}`}
      role="status"
      aria-live="polite"
      data-stop-code={reason.code}
      data-testid="run-stop-card"
    >
      <div className="run-stop-card-head">
        <span className="run-stop-card-kicker">
          {locale === 'ko' ? '실행 종료' : 'Run stopped'}
        </span>
        <strong className="run-stop-card-title">{copy.title}</strong>
      </div>
      <p className="run-stop-card-body">{copy.body}</p>
      {copy.actions.length > 0 ? (
        <div className="run-stop-card-actions">
          {copy.actions.map((action) => {
            const wired = Boolean(onAction) && (!available || available.has(action.kind))
            return wired ? (
              <button
                key={action.kind}
                type="button"
                className="run-stop-card-action"
                data-action={action.kind}
                disabled={disabled}
                onClick={() => void onAction?.(action.kind)}
              >
                {action.label}
              </button>
            ) : (
              <span key={action.kind} className="run-stop-card-hint" data-action={action.kind}>
                {action.label}
              </span>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
