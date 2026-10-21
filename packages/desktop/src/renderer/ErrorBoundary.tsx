import React from 'react'
import { readCurrentLocale } from './useLocale'

const ERROR_BOUNDARY_COPY = {
  en: {
    heading: 'Something went wrong',
    retry: 'Try Again',
  },
  ko: {
    heading: '오류가 발생했습니다',
    retry: '다시 시도',
  },
} as const

interface Props {
  children: React.ReactNode
}
interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    void window.sepilot
      ?.reportRendererError?.({
        source: 'react-error-boundary',
        message: error.message,
        name: error.name,
        stack: error.stack,
        componentStack: info.componentStack ?? undefined,
        href: window.location.href,
        userAgent: navigator.userAgent,
        attributes: {
          kind: 'react-error-boundary',
        },
      })
      .catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      const locale = readCurrentLocale()
      const copy = ERROR_BOUNDARY_COPY[locale] ?? ERROR_BOUNDARY_COPY.en
      return (
        <div className="empty-state" style={{ paddingTop: '20vh' }}>
          <h2 style={{ color: 'var(--color-error)', marginBottom: 'var(--space-3)' }}>
            {copy.heading}
          </h2>
          <p className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
            {this.state.error?.message}
          </p>
          <button
            className="btn btn-secondary mt-4"
            onClick={() => this.setState({ hasError: false })}
          >
            {copy.retry}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
