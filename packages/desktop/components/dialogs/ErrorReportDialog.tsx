'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getDesktopApi } from '@/lib/electron/bridge'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

interface CapturedRendererError {
  message: string
  name?: string
  stack?: string
  source: string
  attributes?: Record<string, unknown>
  reportId?: string
  reportPending?: boolean
  logPath?: string | null
  diagnosticPath?: string | null
}

function rejectionReasonType(reason: unknown): string {
  if (typeof reason === 'undefined') return 'undefined'
  if (reason === null) return 'null'
  if (reason instanceof Error) return reason.name
  const type = typeof reason
  if (type !== 'object') return type
  const constructorName = reason.constructor?.name
  return constructorName && constructorName !== 'Object'
    ? constructorName
    : 'object'
}

export function ErrorReportDialog() {
  const [err, setErr] = useState<CapturedRendererError | null>(null)
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false)

  useEffect(() => {
    const report = (captured: CapturedRendererError) => {
      const api = getDesktopApi()
      setErr({
        ...captured,
        reportPending: Boolean(api?.reportRendererError),
      })
      if (!api?.reportRendererError) return

      void api
        .reportRendererError({
          source: captured.source,
          message: captured.message,
          name: captured.name,
          stack: captured.stack,
          href: window.location.href,
          userAgent: navigator.userAgent,
          attributes: captured.attributes,
        })
        .then((result) => {
          setErr((current) => {
            if (
              !current ||
              current.message !== captured.message ||
              current.source !== captured.source
            ) {
              return current
            }
            return {
              ...current,
              reportId: result.id,
              reportPending: false,
              logPath: result.logPath,
            }
          })
        })
        .catch(() => {
          setErr((current) =>
            current &&
            current.message === captured.message &&
            current.source === captured.source
              ? { ...current, reportPending: false }
              : current,
          )
        })
    }
    const onErr = (e: ErrorEvent) => {
      const error = e.error instanceof Error ? e.error : null
      report({
        source: 'window-error',
        message: e.message || error?.message || 'Unknown renderer error',
        name: error?.name,
        stack: error?.stack,
        attributes: {
          kind: 'window-error',
          filename: e.filename || undefined,
          lineNumber: e.lineno || undefined,
          columnNumber: e.colno || undefined,
        },
      })
    }
    const onRej = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const error = reason instanceof Error ? reason : null
      report({
        source: 'unhandled-rejection',
        message: error?.message ?? String(reason),
        name: error?.name,
        stack: error?.stack,
        attributes: {
          kind: 'unhandled-rejection',
          reasonType: rejectionReasonType(reason),
        },
      })
    }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [])

  useEscapeToClose(Boolean(err), () => setErr(null))
  useModalViewportLock(Boolean(err))

  if (!err) return null

  const exportDiagnostics = async () => {
    const api = getDesktopApi()
    if (!api?.exportDiagnostics || exportingDiagnostics || err.reportPending) return
    setExportingDiagnostics(true)
    try {
      const result = await api.exportDiagnostics({
        reportId: err.reportId,
      })
      setErr((current) =>
        current
          ? {
              ...current,
              diagnosticPath: result?.path ?? null,
            }
          : current,
      )
    } catch {
      setErr((current) =>
        current
          ? {
              ...current,
              diagnosticPath: null,
            }
          : current,
      )
    } finally {
      setExportingDiagnostics(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="오류 발생"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background">
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">오류 발생</h2>
        </header>
        <div
          role="region"
          aria-label="오류 상세"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-6 py-4"
        >
          <p className="text-sm text-red-500">{err.message}</p>
          {err.reportId ? (
            <p className="text-xs text-muted-foreground">
              report id: <code>{err.reportId}</code>
              {err.logPath ? (
                <>
                  {' '}
                  · log: <code>{err.logPath}</code>
                </>
              ) : null}
            </p>
          ) : null}
          {err.diagnosticPath ? (
            <p className="text-xs text-muted-foreground">
              diagnostics: <code>{err.diagnosticPath}</code>
            </p>
          ) : null}
          {err.stack && (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
              {err.stack}
            </pre>
          )}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Button
            size="sm"
            onClick={exportDiagnostics}
            disabled={exportingDiagnostics || err.reportPending}
          >
            {exportingDiagnostics
              ? '저장 중...'
              : err.reportPending
                ? '리포트 기록 중...'
                : '진단 번들 저장'}
          </Button>
          <Button size="sm" onClick={() => setErr(null)}>
            닫기
          </Button>
        </footer>
      </div>
    </div>
  )
}
