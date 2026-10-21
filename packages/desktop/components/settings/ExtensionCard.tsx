'use client'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ExtensionItem } from '@/lib/store/extensions-store'

export function ExtensionCard({
  item,
  onEnable,
  onDisable,
  onUninstall,
  busy = false,
}: {
  item: ExtensionItem
  onEnable: () => void
  onDisable: () => void
  onUninstall?: () => void
  busy?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{item.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          id: {item.id} · {item.status}
        </div>
        {item.error && (
          <div className="mt-1 text-xs text-red-500">{item.error}</div>
        )}
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant={item.enabled ? 'outline' : 'default'}
          onClick={item.enabled ? onDisable : onEnable}
          disabled={busy}
        >
          {item.enabled ? '비활성' : '활성'}
        </Button>
        {onUninstall ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onUninstall}
            disabled={busy}
            aria-label={`${item.name} 삭제`}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
