import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { APP_TITLE_BAR_HEIGHT_PX } from '@/components/layout/app-shell-metrics'

type NotificationBarProps = {
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function NotificationBar({ children, action, className }: NotificationBarProps) {
  return (
    <aside
      role="status"
      aria-label="Notification Bar"
      data-ui="notification-bar"
      style={{ height: APP_TITLE_BAR_HEIGHT_PX }}
      className={cn(
        'notification-bar box-border flex shrink-0 flex-nowrap items-center gap-2 overflow-hidden border-b border-l-4 border-amber-400/80 bg-amber-50 px-3 text-xs text-amber-950 shadow-none dark:border-amber-500/70 dark:bg-amber-950/55 dark:text-amber-100',
        className,
      )}
    >
      <CircleAlert
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="min-w-0 flex-1 truncate leading-5">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </aside>
  )
}
