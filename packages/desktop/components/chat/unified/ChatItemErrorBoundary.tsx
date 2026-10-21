'use client'

import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { getDesktopApi } from '@/lib/electron/bridge'

interface ChatItemErrorBoundaryProps {
  children: React.ReactNode
  resetKey: string
}

interface ChatItemErrorBoundaryState {
  error: Error | null
}

export class ChatItemErrorBoundary extends React.Component<
  ChatItemErrorBoundaryProps,
  ChatItemErrorBoundaryState
> {
  state: ChatItemErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ChatItemErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    void getDesktopApi()
      ?.reportRendererError?.({
        source: 'chat-item-error-boundary',
        message: error.message,
        name: error.name,
        stack: error.stack,
        componentStack: info.componentStack ?? undefined,
        href: window.location.href,
        userAgent: navigator.userAgent,
        attributes: { kind: 'chat-item-render' },
      })
      .catch(() => {})
  }

  componentDidUpdate(previousProps: ChatItemErrorBoundaryProps): void {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <section
        role="alert"
        className="my-1 flex min-w-0 items-start gap-2.5 rounded-xl border border-destructive/35 bg-destructive/[0.045] px-3 py-2.5 text-xs"
      >
        <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <strong className="block text-foreground">이 대화 항목을 표시하지 못했습니다.</strong>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            다른 메시지는 계속 사용할 수 있습니다. 원본 이벤트는 세션 기록에 남아 있습니다.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => this.setState({ error: null })}
        >
          <RotateCcw aria-hidden className="h-3 w-3" />
          다시 표시
        </button>
      </section>
    )
  }
}
