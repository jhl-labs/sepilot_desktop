'use client'
import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type {
  InteractiveInputData,
  InteractiveSelectData,
  ToolResultData,
} from '@/lib/utils/interactive-parser'

export function InteractiveSelectBlock({
  data,
}: {
  data: InteractiveSelectData
}) {
  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
      {data.title ? (
        <p className="mb-2 text-sm font-medium text-foreground">{data.title}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {data.options.map((option, i) => (
          <li
            key={`${i}-${option}`}
            className="rounded border border-border/60 bg-background px-2 py-1 text-foreground"
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function InteractiveInputBlock({
  data,
}: {
  data: InteractiveInputData
}) {
  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
      {data.title ? (
        <p className="mb-2 text-sm font-medium text-foreground">{data.title}</p>
      ) : null}
      <div
        className={cn(
          'rounded border border-dashed border-border bg-background p-2 text-muted-foreground',
          data.multiline ? 'min-h-[64px]' : '',
        )}
      >
        {data.placeholder ?? '(입력 필드)'}
      </div>
    </div>
  )
}

export function ToolResultBlock({ data }: { data: ToolResultData }) {
  const [open, setOpen] = useState(false)
  const ok = data.status !== 'error'
  const Icon = ok ? CheckCircle2 : XCircle
  const hasDetails = !!data.details && data.details.length > 0
  return (
    <div
      className={cn(
        'my-2 rounded-md border p-2 text-xs',
        ok
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500',
          )}
        />
        <span className="font-medium text-foreground">
          {data.toolName || 'tool'}
        </span>
        {data.summary ? (
          <span className="truncate text-muted-foreground">
            — {data.summary}
          </span>
        ) : null}
        {typeof data.duration === 'number' ? (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {data.duration}ms
          </span>
        ) : null}
      </div>
      {hasDetails ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:bg-accent hover:px-1 hover:py-0.5"
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {open ? '상세 숨기기' : '상세 보기'}
          </button>
          {open ? (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px] text-foreground">
              {data.details}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
