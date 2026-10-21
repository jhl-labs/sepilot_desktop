'use client'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Folder,
  History,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { DesktopAppAuditEntry, DesktopAppStorageDiagnostic } from '@sepilotd/api-client'
import { Button } from '@/components/ui/button'
import type { AppPage } from '@/lib/apps/types'
import { getDesktopApi } from '@/lib/electron/bridge'
import { useAppsStore } from '@/lib/store/apps-store'
import { cn } from '@/lib/utils/cn'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function textBytes(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return value.length
}

function jsonBytes(value: unknown): number {
  try {
    return textBytes(JSON.stringify(value ?? {}))
  } catch {
    return 0
  }
}

function formatDate(epoch: number | undefined): string {
  if (!epoch) return '-'
  return new Date(epoch).toLocaleString()
}

function validationTone(page: AppPage): 'ok' | 'warn' | 'error' {
  const issues = page.validation?.issues ?? []
  if (issues.some((issue) => issue.severity === 'error')) return 'error'
  if (issues.some((issue) => issue.severity === 'warning')) return 'warn'
  return 'ok'
}

function permissionsSummary(page: AppPage): string {
  const permissions = page.permissions
  if (!permissions) return 'storage only'
  const enabled = Object.entries(permissions)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
  return enabled.length > 0 ? enabled.join(', ') : 'none'
}

function diagnosticTitle(diagnostic: DesktopAppStorageDiagnostic): string {
  return (
    diagnostic.manifest?.title ??
    diagnostic.manifest?.id ??
    diagnostic.directoryName ??
    'Invalid app'
  )
}

export function AppsManagerDialog({
  open,
  onOpenChange,
  onOpenCodeAgent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenCodeAgent?: () => void
}) {
  useModalViewportLock(open)
  const pages = useAppsStore((state) => state.pages)
  const activeId = useAppsStore((state) => state.activeId)
  const setActive = useAppsStore((state) => state.setActive)
  const deletePage = useAppsStore((state) => state.deletePage)
  const duplicatePage = useAppsStore((state) => state.duplicatePage)
  const updatePage = useAppsStore((state) => state.updatePage)
  const restorePageVersion = useAppsStore((state) => state.restorePageVersion)
  const exportPage = useAppsStore((state) => state.exportPage)
  const importPage = useAppsStore((state) => state.importPage)
  const exportBackup = useAppsStore((state) => state.exportBackup)
  const restoreBackup = useAppsStore((state) => state.restoreBackup)
  const resetToTemplates = useAppsStore((state) => state.resetToTemplates)
  const hydrateFromStorage = useAppsStore((state) => state.hydrateFromStorage)
  const storagePath = useAppsStore((state) => state.storagePath)
  const storageError = useAppsStore((state) => state.storageError)
  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [selectedDiagnosticDir, setSelectedDiagnosticDir] = useState<string | null>(null)
  const [busyVersion, setBusyVersion] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fileBusy, setFileBusy] = useState<'import' | 'export' | 'backup' | 'restore' | null>(null)
  const [auditEntries, setAuditEntries] = useState<DesktopAppAuditEntry[]>([])
  const [auditRefreshing, setAuditRefreshing] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DesktopAppStorageDiagnostic[]>([])
  const invalidDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => diagnostic.status === 'invalid'),
    [diagnostics],
  )
  const selectedDiagnostic =
    invalidDiagnostics.find((diagnostic) => diagnostic.directoryName === selectedDiagnosticDir) ??
    null

  const selectedPage = selectedDiagnostic
    ? null
    : (pages.find((page) => page.id === selectedId) ??
      pages.find((page) => page.id === activeId) ??
      pages[0] ??
      null)

  async function fetchAuditEntries(appId: string): Promise<DesktopAppAuditEntry[]> {
    const entries = await getDesktopApi()?.apps?.audit?.(appId)
    return entries?.slice(0, 30) ?? []
  }

  async function loadDiagnostics(): Promise<void> {
    const api = getDesktopApi()
    if (!api?.apps?.diagnostics) {
      setDiagnostics([])
      return
    }
    const next = await api.apps.diagnostics()
    setDiagnostics(next)
    const invalid = next.filter((diagnostic) => diagnostic.status === 'invalid')
    setSelectedDiagnosticDir((current) =>
      current && invalid.some((diagnostic) => diagnostic.directoryName === current)
        ? current
        : null,
    )
  }

  useEffect(() => {
    if (!open || !selectedPage) {
      setAuditEntries([])
      return
    }
    let cancelled = false
    void fetchAuditEntries(selectedPage.id)
      .then((entries) => {
        if (!cancelled) setAuditEntries(entries)
      })
      .catch(() => {
        if (!cancelled) setAuditEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedPage?.id])

  async function reloadAuditEntries(): Promise<void> {
    if (!selectedPage) return
    setAuditRefreshing(true)
    try {
      setAuditEntries(await fetchAuditEntries(selectedPage.id))
    } catch (error) {
      setAuditEntries([])
      toast.error('앱 감사 로그를 읽지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setAuditRefreshing(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setDiagnostics([])
      setSelectedDiagnosticDir(null)
      return
    }
    let cancelled = false
    void loadDiagnostics().catch(() => {
      if (!cancelled) setDiagnostics([])
    })
    return () => {
      cancelled = true
    }
  }, [open, pages.length, storagePath])

  const totals = useMemo(() => {
    const htmlBytes = pages.reduce((sum, page) => sum + textBytes(page.html), 0)
    const dataBytes = pages.reduce((sum, page) => sum + jsonBytes(page.data), 0)
    const warningCount = pages.reduce(
      (sum, page) => sum + (page.validation?.issues?.length ?? 0),
      0,
    )
    return { htmlBytes, dataBytes, warningCount: warningCount + invalidDiagnostics.length }
  }, [invalidDiagnostics.length, pages])

  if (!open) return null

  async function refresh(): Promise<void> {
    setRefreshing(true)
    try {
      await hydrateFromStorage()
      await loadDiagnostics()
      toast.success('앱 저장소를 다시 읽었습니다.')
    } catch (error) {
      toast.error('앱 저장소를 새로고침하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setRefreshing(false)
    }
  }

  async function restore(version: number): Promise<void> {
    if (!selectedPage) return
    setBusyVersion(version)
    try {
      await restorePageVersion(selectedPage.id, version)
      toast.success(`v${version}에서 새 버전을 만들었습니다.`)
    } catch (error) {
      toast.error('앱 버전을 복원하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setBusyVersion(null)
    }
  }

  function duplicate(): void {
    if (!selectedPage) return
    const id = duplicatePage(selectedPage.id)
    if (!id) return
    setSelectedId(id)
    toast.success('앱을 복제했습니다.')
  }

  async function archiveInvalidPackage(diagnostic: DesktopAppStorageDiagnostic): Promise<void> {
    const api = getDesktopApi()
    if (!api?.apps?.delete || !diagnostic.canDelete) return
    setFileBusy('restore')
    try {
      await api.apps.delete(diagnostic.directoryName)
      await hydrateFromStorage()
      await loadDiagnostics()
      setSelectedDiagnosticDir(null)
      toast.success('앱 패키지를 복구 보관함으로 이동했습니다.')
    } catch (error) {
      toast.error('앱 패키지를 보관하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setFileBusy(null)
    }
  }

  function remove(): void {
    if (!selectedPage) return
    deletePage(selectedPage.id)
    setSelectedId(pages.find((page) => page.id !== selectedPage.id)?.id ?? null)
    toast.success('앱을 삭제했습니다.')
  }

  function activate(): void {
    if (!selectedPage) return
    setActive(selectedPage.id)
    onOpenChange(false)
  }

  function updateDataPolicy(
    key: 'aiReadable' | 'aiWritable' | 'interAppReadable',
    value: boolean,
  ): void {
    if (!selectedPage) return
    updatePage(selectedPage.id, {
      dataPolicy: {
        aiReadable: true,
        aiWritable: true,
        interAppReadable: true,
        backup: 'included',
        sensitivePaths: [],
        redactedKeys: [],
        ...(selectedPage.dataPolicy ?? {}),
        [key]: value,
      },
    })
  }

  function updateCapability(
    key:
      | 'collections'
      | 'timeSeries'
      | 'semanticSearch'
      | 'scheduler'
      | 'notifications'
      | 'backup'
      | 'interAppRead'
      | 'agentTools'
      | 'customComponents',
    value: boolean,
  ): void {
    if (!selectedPage) return
    updatePage(selectedPage.id, {
      capabilities: {
        fields: true,
        collections: true,
        timeSeries: true,
        semanticSearch: true,
        scheduler: true,
        notifications: true,
        backup: true,
        encryption: false,
        interAppRead: true,
        agentTools: true,
        customComponents: true,
        ...(selectedPage.capabilities ?? {}),
        [key]: value,
      },
    })
  }

  async function importBundle(): Promise<void> {
    setFileBusy('import')
    try {
      const importedId = await importPage()
      if (!importedId) return
      setSelectedId(importedId)
      setSelectedDiagnosticDir(null)
      await loadDiagnostics()
      toast.success('앱 번들을 가져왔습니다.')
    } catch (error) {
      toast.error('앱 번들을 가져오지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setFileBusy(null)
    }
  }

  async function exportBundle(): Promise<void> {
    if (!selectedPage) return
    setFileBusy('export')
    try {
      const path = await exportPage(selectedPage.id)
      if (!path) return
      toast.success('앱 번들을 내보냈습니다.', { description: path })
    } catch (error) {
      toast.error('앱 번들을 내보내지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setFileBusy(null)
    }
  }

  async function exportAllApps(): Promise<void> {
    setFileBusy('backup')
    try {
      const path = await exportBackup()
      if (!path) return
      toast.success('앱 백업을 내보냈습니다.', { description: path })
    } catch (error) {
      toast.error('앱 백업을 내보내지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setFileBusy(null)
    }
  }

  async function restoreAllApps(): Promise<void> {
    setFileBusy('restore')
    try {
      await restoreBackup()
      setSelectedId(useAppsStore.getState().activeId)
      setSelectedDiagnosticDir(null)
      await loadDiagnostics()
      toast.success('앱 백업을 복구했습니다.')
    } catch (error) {
      toast.error('앱 백업을 복구하지 못했습니다.', {
        description: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    } finally {
      setFileBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Apps manager"
      className="fixed inset-0 z-50 bg-background/70 p-3 backdrop-blur-sm dark:bg-slate-950/60"
      onClick={() => onOpenChange(false)}
    >
      <div className="mx-auto flex h-full max-h-[820px] w-full max-w-5xl overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
          <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/20">
            <div className="border-b px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold tracking-tight">App Manager</h2>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {pages.length} apps · {formatBytes(totals.htmlBytes + totals.dataBytes)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 rounded-md"
                  onClick={() => onOpenChange(false)}
                  aria-label="close apps manager"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
                <div className="rounded border bg-background px-1.5 py-1">
                  <div className="font-semibold text-foreground">{pages.length}</div>
                  <div>apps</div>
                </div>
                <div className="rounded border bg-background px-1.5 py-1">
                  <div className="font-semibold text-foreground">
                    {formatBytes(totals.htmlBytes)}
                  </div>
                  <div>html</div>
                </div>
                <div className="rounded border bg-background px-1.5 py-1">
                  <div className="font-semibold text-foreground">{totals.warningCount}</div>
                  <div>issues</div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {pages.length === 0 ? (
                <div className="rounded-md border border-dashed bg-background px-3 py-6 text-center text-xs text-muted-foreground">
                  관리할 앱이 없습니다.
                </div>
              ) : (
                <div className="space-y-1">
                  {pages.map((page) => {
                    const selected = page.id === selectedPage?.id
                    const tone = validationTone(page)
                    const Icon = tone === 'ok' ? CheckCircle2 : AlertTriangle
                    return (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(page.id)
                          setSelectedDiagnosticDir(null)
                        }}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                          selected
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-transparent bg-background/70 hover:border-border hover:bg-accent',
                        )}
                      >
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: page.accent ?? '#0f766e' }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">{page.title}</span>
                          <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                            <Icon
                              className={cn(
                                'h-3 w-3 shrink-0',
                                tone === 'ok'
                                  ? 'text-emerald-500'
                                  : tone === 'warn'
                                    ? 'text-amber-500'
                                    : 'text-destructive',
                              )}
                            />
                            v{page.version ?? 1} · {page.category ?? page.kind}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  {invalidDiagnostics.length > 0 ? (
                    <div className="pt-2">
                      <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        Storage Issues
                      </div>
                      <div className="space-y-1">
                        {invalidDiagnostics.map((diagnostic) => {
                          const selected =
                            diagnostic.directoryName === selectedDiagnostic?.directoryName
                          return (
                            <button
                              key={diagnostic.directoryName}
                              type="button"
                              onClick={() => {
                                setSelectedDiagnosticDir(diagnostic.directoryName)
                                setSelectedId(null)
                              }}
                              className={cn(
                                'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                                selected
                                  ? 'border-destructive/50 bg-destructive/10'
                                  : 'border-transparent bg-background/70 hover:border-border hover:bg-accent',
                              )}
                            >
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold">
                                  {diagnosticTitle(diagnostic)}
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                  {diagnostic.validation.issues.length} issues ·{' '}
                                  {diagnostic.directoryName}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5">
              <div className="min-w-0">
                <h3 className="truncate text-xs font-semibold">
                  {selectedDiagnostic
                    ? diagnosticTitle(selectedDiagnostic)
                    : (selectedPage?.title ?? 'No app selected')}
                </h3>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {selectedDiagnostic
                    ? `${selectedDiagnostic.directoryName} · storage issue`
                    : selectedPage
                      ? `${selectedPage.id} · ${selectedPage.origin ?? 'template'}`
                      : (storagePath ?? '~/.sepilotd/apps')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5"
                  onClick={() => {
                    onOpenChange(false)
                    onOpenCodeAgent?.()
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Code Agent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5"
                  onClick={() => void importBundle()}
                  disabled={fileBusy != null}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                >
                  <RefreshCcw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                  Refresh
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 rounded-md px-3"
                  onClick={activate}
                  disabled={!selectedPage}
                >
                  Open
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {selectedDiagnostic ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-3">
                    <section className="rounded-md border border-destructive/30 bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Invalid App Package
                      </div>
                      <div className="space-y-1.5">
                        {selectedDiagnostic.validation.issues.map((issue) => (
                          <div
                            key={`${issue.code}:${issue.message}`}
                            className={cn(
                              'rounded border px-2 py-1.5 text-xs',
                              issue.severity === 'error'
                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                            )}
                          >
                            <div className="font-semibold">{issue.code}</div>
                            <div className="mt-0.5 opacity-90">{issue.message}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="space-y-3">
                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        Package
                      </div>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Directory</dt>
                          <dd className="truncate font-medium">
                            {selectedDiagnostic.directoryName}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Manifest ID</dt>
                          <dd className="truncate font-medium">
                            {selectedDiagnostic.manifest?.id ?? '-'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Kind</dt>
                          <dd className="truncate font-medium">
                            {selectedDiagnostic.manifest?.kind ?? '-'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Version</dt>
                          <dd className="font-medium">
                            {selectedDiagnostic.manifest?.version
                              ? `v${selectedDiagnostic.manifest.version}`
                              : '-'}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Folder className="h-3.5 w-3.5 text-primary" />
                        Storage
                      </div>
                      <p className="break-all rounded border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
                        {selectedDiagnostic.path}
                      </p>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 text-xs font-semibold">Actions</div>
                      <div className="grid gap-1.5">
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => void refresh()}
                          disabled={refreshing}
                        >
                          <RefreshCcw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                          Re-scan storage
                        </Button>
                        <Button
                          variant="destructive"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => void archiveInvalidPackage(selectedDiagnostic)}
                          disabled={!selectedDiagnostic.canDelete || fileBusy != null}
                        >
                          <Trash2 className="h-4 w-4" />
                          Move to recovery
                        </Button>
                      </div>
                    </section>
                  </aside>
                </div>
              ) : selectedPage ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-3">
                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Validation
                      </div>
                      {selectedPage.validation?.issues?.length ? (
                        <div className="space-y-1.5">
                          {selectedPage.validation.issues.map((issue) => (
                            <div
                              key={`${issue.code}:${issue.message}`}
                              className={cn(
                                'rounded border px-2 py-1.5 text-xs',
                                issue.severity === 'error'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                              )}
                            >
                              <div className="font-semibold">{issue.code}</div>
                              <div className="mt-0.5 opacity-90">{issue.message}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                          이 앱은 현재 sandbox 검증을 통과했습니다.
                        </div>
                      )}
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <History className="h-3.5 w-3.5 text-primary" />
                        Version History
                      </div>
                      {selectedPage.versions?.length ? (
                        <div className="space-y-1.5">
                          {selectedPage.versions
                            .slice()
                            .reverse()
                            .map((version) => (
                              <div
                                key={`${version.version}:${version.sha256}`}
                                className="flex items-center justify-between gap-3 rounded border bg-muted/20 px-2 py-1.5"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold">
                                    v{version.version}
                                    {version.version === selectedPage.version ? ' · current' : ''}
                                  </div>
                                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {formatDate(version.createdAt)}
                                    {version.prompt ? ` · ${version.prompt}` : ''}
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1.5 rounded-md px-2"
                                  onClick={() => void restore(version.version)}
                                  disabled={
                                    busyVersion != null || version.version === selectedPage.version
                                  }
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Restore
                                </Button>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          이 앱에는 아직 저장된 버전 파일이 없습니다.
                        </p>
                      )}
                    </section>
                  </div>

                  <aside className="space-y-3">
                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        Bundle
                      </div>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Kind</dt>
                          <dd className="truncate font-medium">{selectedPage.kind}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Version</dt>
                          <dd className="font-medium">v{selectedPage.version ?? 1}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">HTML</dt>
                          <dd className="font-medium">
                            {formatBytes(textBytes(selectedPage.html))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Data</dt>
                          <dd className="font-medium">
                            {formatBytes(jsonBytes(selectedPage.data))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Updated</dt>
                          <dd className="truncate font-medium">
                            {formatDate(selectedPage.updatedAt)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Folder className="h-3.5 w-3.5 text-primary" />
                        Storage
                      </div>
                      <p className="break-all rounded border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
                        {selectedPage.storagePath ?? storagePath ?? '~/.sepilotd/apps'}
                      </p>
                      {storageError ? (
                        <p className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                          {storageError}
                        </p>
                      ) : null}
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Permissions
                      </div>
                      <p className="rounded border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                        {permissionsSummary(selectedPage)}
                      </p>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Data Policy
                      </div>
                      <div className="space-y-1.5">
                        {[
                          {
                            key: 'aiReadable' as const,
                            label: 'AI tools can read redacted data',
                            checked: selectedPage.dataPolicy?.aiReadable !== false,
                          },
                          {
                            key: 'aiWritable' as const,
                            label: 'AI tools can write app data',
                            checked: selectedPage.dataPolicy?.aiWritable !== false,
                          },
                          {
                            key: 'interAppReadable' as const,
                            label: 'Other apps can read redacted data',
                            checked: selectedPage.dataPolicy?.interAppReadable !== false,
                          },
                        ].map((item) => (
                          <label
                            key={item.key}
                            className="flex items-center justify-between gap-3 rounded border bg-muted/20 px-2 py-1.5 text-xs"
                          >
                            <span>{item.label}</span>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={item.checked}
                              onChange={(event) => updateDataPolicy(item.key, event.target.checked)}
                            />
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        Framework Capabilities
                      </div>
                      <div className="grid gap-1.5">
                        {[
                          {
                            key: 'collections' as const,
                            label: 'Collections API',
                            icon: Database,
                            checked: selectedPage.capabilities?.collections !== false,
                          },
                          {
                            key: 'timeSeries' as const,
                            label: 'Time-series API',
                            icon: Timer,
                            checked: selectedPage.capabilities?.timeSeries !== false,
                          },
                          {
                            key: 'semanticSearch' as const,
                            label: 'Semantic/search index',
                            icon: Search,
                            checked: selectedPage.capabilities?.semanticSearch !== false,
                          },
                          {
                            key: 'scheduler' as const,
                            label: 'Daemon scheduler',
                            icon: History,
                            checked: selectedPage.capabilities?.scheduler !== false,
                          },
                          {
                            key: 'notifications' as const,
                            label: 'Desktop notifications',
                            icon: Bell,
                            checked: selectedPage.capabilities?.notifications !== false,
                          },
                          {
                            key: 'agentTools' as const,
                            label: 'Agent tool access',
                            icon: ShieldCheck,
                            checked: selectedPage.capabilities?.agentTools !== false,
                          },
                          {
                            key: 'customComponents' as const,
                            label: 'Custom UI components',
                            icon: Copy,
                            checked: selectedPage.capabilities?.customComponents !== false,
                          },
                        ].map((item) => {
                          const Icon = item.icon
                          return (
                            <label
                              key={item.key}
                              className="flex items-center justify-between gap-3 rounded border bg-muted/20 px-2 py-1.5 text-xs"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={item.checked}
                                onChange={(event) =>
                                  updateCapability(item.key, event.target.checked)
                                }
                              />
                            </label>
                          )
                        })}
                      </div>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Database className="h-3.5 w-3.5 text-primary" />
                        SDK Surface
                      </div>
                      <div className="space-y-1 rounded border bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                        <div>
                          <code>sepilotApps.data</code> · fields and document state
                        </div>
                        <div>
                          <code>sepilotApps.collection(name)</code> · app-owned records
                        </div>
                        <div>
                          <code>sepilotApps.timeSeries(name)</code> · dated metrics
                        </div>
                        <div>
                          <code>sepilotApps.apps.search()</code> · redacted inter-app context
                        </div>
                        <div>
                          <code>sepilotApps.scheduler</code> · app-scoped daemon jobs
                        </div>
                        <div>
                          <code>sepilotApps.notifications</code> · desktop alerts
                        </div>
                      </div>
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                          <History className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate">Sandbox Egress Audit</span>
                        </div>
                        <Button
                          variant="ghost"
                          className="h-6 w-6 rounded-md p-0"
                          onClick={() => void reloadAuditEntries()}
                          disabled={auditRefreshing}
                          aria-label="Refresh audit log"
                        >
                          <RefreshCcw
                            className={cn('h-3.5 w-3.5', auditRefreshing && 'animate-spin')}
                          />
                        </Button>
                      </div>
                      {auditEntries.length > 0 ? (
                        <div className="space-y-1.5">
                          {auditEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className={cn(
                                'rounded border px-2 py-1.5 text-[10px]',
                                entry.status === 'error'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'bg-muted/20 text-muted-foreground',
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">
                                  {entry.capability} · {entry.operation}
                                </span>
                                <span>{formatDate(entry.createdAt)}</span>
                              </div>
                              <div className="mt-0.5 uppercase tracking-wide">
                                {entry.status} · {entry.source}
                              </div>
                              {entry.message ? (
                                <div className="mt-0.5 truncate">{entry.message}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded border bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                          아직 sandbox 밖으로 나간 앱 SDK 요청 이력이 없습니다.
                        </p>
                      )}
                    </section>

                    <section className="rounded-md border bg-background p-3">
                      <div className="mb-2 text-xs font-semibold">Actions</div>
                      <div className="grid grid-cols-1 gap-1.5">
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => void exportBundle()}
                          disabled={fileBusy != null}
                        >
                          <Download className="h-4 w-4" />
                          Export app
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => void exportAllApps()}
                          disabled={fileBusy != null}
                        >
                          <Download className="h-4 w-4" />
                          Export backup
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => void restoreAllApps()}
                          disabled={fileBusy != null}
                        >
                          <Upload className="h-4 w-4" />
                          Restore backup
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={duplicate}
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate app
                        </Button>
                        <Button
                          variant="outline"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={() => {
                            resetToTemplates()
                            toast.success('기본 앱 템플릿을 복원했습니다.')
                          }}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Reset templates
                        </Button>
                        <Button
                          variant="destructive"
                          className="h-8 justify-start gap-2 rounded-md px-2"
                          onClick={remove}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete app
                        </Button>
                      </div>
                    </section>
                  </aside>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-xs text-muted-foreground">
                  앱을 만들거나 템플릿을 복원하면 여기에서 관리할 수 있습니다.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
