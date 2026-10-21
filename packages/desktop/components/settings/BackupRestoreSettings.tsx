'use client'
import { useState } from 'react'
import { Copy, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { createBackupApi, type BackupItem } from '@/lib/api/backup'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'
import { Button } from '@/components/ui/button'

registerSettingsTab({
  key: 'backup',
  section: 'system',
  label: 'Backup & Restore',
  search: ['backup', 'restore'],
  render: () => <BackupRestoreSettings />,
})

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`
  return `${bytes} B`
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function BackupRestoreSettings() {
  const transport = useTransport()
  const [bumper, setBumper] = useState(0)
  const [creating, setCreating] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const state = useCapabilityResource(
    async () => (await createBackupApi(transport)).list(),
    [transport, bumper],
  )

  async function makeBackup(): Promise<void> {
    setCreating(true)
    try {
      const api = await createBackupApi(transport)
      const item = await api.create()
      toast.success('백업을 생성했습니다.', {
        description: `${item.id} (${formatSize(item.sizeBytes)})`,
      })
      setBumper((n) => n + 1)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setCreating(false)
    }
  }

  async function removeBackup(item: BackupItem): Promise<void> {
    const ok = await confirm(
      `백업 '${item.id}'을(를) 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?`,
      { destructive: true },
    )
    if (!ok) return
    setRemovingId(item.id)
    try {
      const api = await createBackupApi(transport)
      await api.remove(item.id)
      toast.success('백업을 삭제했습니다.')
      setBumper((n) => n + 1)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRemovingId(null)
    }
  }

  async function restoreBackup(item: BackupItem): Promise<void> {
    const ok = await confirm(
      `백업 '${item.id}'을(를) 현재 daemon 데이터 디렉토리에 복원합니다. 현재 설정/세션/문서/동기화 상태가 덮어써질 수 있습니다. 계속하시겠습니까?`,
      { destructive: true },
    )
    if (!ok) return
    setRestoringId(item.id)
    try {
      const api = await createBackupApi(transport)
      const result = await api.restore(item.id)
      toast.success('백업을 복원했습니다.', {
        description: `${result.restoredFiles} files restored`,
      })
      setBumper((n) => n + 1)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRestoringId(null)
    }
  }

  async function handleCopyPath(path: string): Promise<void> {
    const ok = await copyToClipboard(path)
    if (ok) toast.success('경로를 클립보드에 복사했습니다.')
    else toast.error('클립보드 접근에 실패했습니다.')
  }

  if (state.kind === 'unavailable')
    return <UnimplementedBanner what="Backup/Restore" />
  if (state.kind === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'error')
    return <p className="text-sm text-red-500">{state.error.message}</p>

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backups</h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBumper((n) => n + 1)}
            disabled={creating || removingId != null || restoringId != null}
            aria-label="새로고침"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => void makeBackup()}
            disabled={creating || removingId != null || restoringId != null}
          >
            {creating ? '생성 중…' : '백업 생성'}
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {state.data.map((b) => (
          <li
            key={b.id}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">
                    {new Date(b.createdAt).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatSize(b.sizeBytes)}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground" title={b.id}>
                  {b.id}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => void restoreBackup(b)}
                  disabled={removingId != null || restoringId != null || creating}
                  aria-label={`${b.id} 복원`}
                >
                  {restoringId === b.id ? (
                    <span className="text-[10px]">...</span>
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void removeBackup(b)}
                  disabled={removingId != null || restoringId != null || creating}
                  aria-label={`${b.id} 삭제`}
                >
                  {removingId === b.id ? (
                    <span className="text-[10px]">...</span>
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
            {b.path ? (
              <button
                type="button"
                onClick={() => void handleCopyPath(b.path!)}
                className="inline-flex items-center gap-1 self-start truncate rounded text-[10px] text-muted-foreground hover:bg-accent hover:px-1.5 hover:py-0.5"
                title={b.path}
              >
                <Copy className="h-3 w-3 shrink-0" />
                <span className="truncate">{b.path}</span>
              </button>
            ) : null}
            {b.sha256 ? (
              <span
                className="font-mono text-[10px] text-muted-foreground"
                title={b.sha256}
              >
                sha256: {b.sha256.slice(0, 12)}…
              </span>
            ) : null}
          </li>
        ))}
        {state.data.length === 0 && (
          <li className="text-xs text-muted-foreground">
            저장된 백업이 없습니다.
          </li>
        )}
      </ul>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
        <p className="font-semibold">복원 및 보안 안내</p>
        <p className="mt-1 leading-relaxed">
          백업은
          <code className="mx-1 rounded bg-amber-500/10 px-1">~/.sepilotd/backup/</code>
          에 보관되며 provider API key, GitHub token, Team Docs PAT, 세션 전문을 포함할 수 있습니다.
          복원은 현재 daemon 데이터 디렉토리에 같은 경로로 덮어씁니다.
        </p>
      </div>
    </div>
  )
}
