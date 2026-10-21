'use client'
import { useEffect, useRef, useState } from 'react'
import type { DesktopAgentEvent, DesktopAgentSession } from '@sepilotd/api-client'
import { useTranslation } from 'react-i18next'
import { createTerminalInputQueue, type DesktopAgentApi } from '@/lib/api/desktop-agent'
import { classifyTerminalStreamError } from '@/lib/api/desktop-agent-error'

const STREAM_RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 10000] as const

function waitForReconnect(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, delayMs)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export function AgentTerminal({
  session,
  api,
  onSessionUnavailable,
}: {
  session: DesktopAgentSession
  api: DesktopAgentApi
  onSessionUnavailable?: () => void
}) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(t('desktopAgent.terminal.connecting'))
  const [attempt, setAttempt] = useState(0)
  const interrupt = useRef<() => void>(() => {})
  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let dispose = () => {}
    setError('')
    setStatus(t('desktopAgent.terminal.connecting'))
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (controller.signal.aborted || !host.current) return
      const terminal = new Terminal({
        cols: session.cols,
        rows: session.rows,
        cursorBlink: true,
        scrollback: 1000,
        fontSize: 13,
        fontFamily: 'SFMono-Regular, Consolas, monospace',
        theme: { background: '#10141c', foreground: '#e4e8ef', cursor: '#93c5fd' },
        allowProposedApi: false,
        disableStdin: true,
      })
      const fit = new FitAddon()
      terminal.loadAddon(fit)
      terminal.open(host.current)
      const input = createTerminalInputQueue(
        (data) => api.input(session.id, data),
        (e) => {
          terminal.options.disableStdin = true
          setError(e instanceof Error ? e.message : String(e))
        },
      )
      const keys = terminal.onData((data) => input.write(data))
      let snapshot = false
      let running = session.state === 'running'
      let resizeTimer: ReturnType<typeof setTimeout> | undefined
      let resizePending = false
      const resize = () => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          if (!snapshot || !running || resizePending || controller.signal.aborted) return
          const size = fit.proposeDimensions()
          if (!size) return
          const cols = Math.max(2, Math.min(400, size.cols))
          const rows = Math.max(2, Math.min(160, size.rows))
          if (cols === terminal.cols && rows === terminal.rows) return
          resizePending = true
          void api
            .resize(session.id, cols, rows)
            .catch((e) => {
              if (!controller.signal.aborted) setError(String(e))
            })
            .finally(() => {
              resizePending = false
            })
        }, 80)
      }
      const observer = new ResizeObserver(resize)
      observer.observe(host.current)
      interrupt.current = () => {
        if (snapshot && running) input.write('\x03')
      }
      dispose = () => {
        if (disposed) return
        disposed = true
        input.dispose()
        keys.dispose()
        observer.disconnect()
        if (resizeTimer) clearTimeout(resizeTimer)
        terminal.dispose()
        interrupt.current = () => {}
      }
      let seq = -1
      const onEvent = async (event: DesktopAgentEvent) => {
        if (controller.signal.aborted) return
        if (event.type === 'snapshot') {
          seq = event.seq
          terminal.resize(event.cols!, event.rows!)
          await new Promise<void>((resolve) => terminal.write(event.data ?? '', resolve))
          if (controller.signal.aborted) return
          snapshot = true
          terminal.options.disableStdin = !running
          terminal.focus()
          setStatus(
            running
              ? t('desktopAgent.terminal.connected')
              : t('desktopAgent.terminal.exited'),
          )
          resize()
        } else {
          if (event.type !== 'exit' && event.seq !== seq + 1) {
            controller.abort()
            terminal.options.disableStdin = true
            setError(t('desktopAgent.terminal.sequenceGap'))
            return
          }
          seq = event.seq
          if (event.type === 'output')
            await new Promise<void>((resolve) => terminal.write(event.data ?? '', resolve))
          if (event.type === 'resize') terminal.resize(event.cols!, event.rows!)
          if (event.type === 'exit') {
            running = false
            terminal.options.disableStdin = true
            input.dispose()
            setStatus(t('desktopAgent.terminal.exitedWithCode', { code: event.exitCode }))
          }
        }
      }
      for (let reconnect = 0; ; reconnect += 1) {
        try {
          await api.stream(session.id, controller.signal, onEvent)
          break
        } catch (cause) {
          if (controller.signal.aborted) return
          const kind = classifyTerminalStreamError(cause)
          if (kind === 'missing') {
            terminal.options.disableStdin = true
            setStatus(t('desktopAgent.terminal.restoring'))
            dispose()
            onSessionUnavailable?.()
            return
          }
          const delay = STREAM_RECONNECT_DELAYS_MS[reconnect]
          if (kind !== 'network' || delay === undefined) throw cause
          terminal.options.disableStdin = true
          setStatus(t('desktopAgent.terminal.reconnecting'))
          await waitForReconnect(delay, controller.signal)
        }
      }
    })().catch((e) => {
      if (!controller.signal.aborted) {
        const kind = classifyTerminalStreamError(e)
        setError(
          kind === 'network'
            ? t('desktopAgent.terminal.networkError')
            : e instanceof Error
              ? e.message
              : String(e),
        )
        setStatus(t('desktopAgent.terminal.disconnected'))
        dispose()
      }
    })
    return () => {
      controller.abort()
      dispose()
    }
  }, [session.id, session.cols, session.rows, session.state, api, attempt, onSessionUnavailable, t])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span role="status">{status}</span>
        <button className="rounded border px-2 py-1" onClick={() => interrupt.current()}>
          {t('desktopAgent.terminal.interrupt')}
        </button>
        <button className="rounded border px-2 py-1" onClick={() => setAttempt((n) => n + 1)}>
          {t('desktopAgent.terminal.reconnect')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        ref={host}
        aria-label={t('desktopAgent.terminal.ariaLabel', { agent: session.agent })}
        className="shell-terminal-host min-h-[240px] flex-1 overflow-hidden rounded border bg-[#10141c] p-2"
        onKeyDown={(event) => event.stopPropagation()}
      />
    </div>
  )
}
