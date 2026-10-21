import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export const SETTINGS_CONTROL_CLASS = 'h-8 px-2.5 text-xs'

export function SettingsStack({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-2.5 text-[13px]', className)} {...props} />
}

export function SettingsSection({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn('rounded-lg border border-border bg-background p-2.5', className)}
      {...props}
    />
  )
}

export function SettingsSectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-1.5 flex min-w-0 items-start justify-between gap-2', className)}>
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold leading-5">{title}</h4>
        {description ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
