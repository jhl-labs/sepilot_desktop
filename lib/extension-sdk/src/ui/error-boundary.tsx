'use client';

import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * 에러 발생 시 표시할 폴백 UI
   * ReactNode 또는 (error, reset) => ReactNode 형태의 함수
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /**
   * 에러 발생 시 호출될 콜백
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /**
   * ErrorBoundary 라벨 (로깅용)
   */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary - React 컴포넌트 에러를 캐치하고 폴백 UI를 표시
 *
 * 컴포넌트 렌더링 중 발생하는 에러를 캐치하여 앱 전체가 크래시되는 것을 방지합니다.
 *
 * @example
 * ```tsx
 * // ReactNode 형태의 fallback
 * <ErrorBoundary fallback={<div>에러 발생</div>}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // 함수 형태의 fallback (error와 reset 사용 가능)
 * <ErrorBoundary
 *   label="My Component"
 *   fallback={(error, reset) => (
 *     <div>
 *       <p>{error.message}</p>
 *       <button onClick={reset}>재시도</button>
 *     </div>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const label = this.props.label || 'ErrorBoundary';
    console.error(`[${label}] Component error:`, error, errorInfo);

    // 커스텀 에러 핸들러 호출
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // 커스텀 폴백 UI가 있으면 사용
      if (this.props.fallback) {
        // 함수 형태의 fallback
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.reset);
        }
        // ReactNode 형태의 fallback
        return this.props.fallback;
      }

      // 기본 폴백 UI
      return (
        <div className="p-4 border border-destructive rounded-lg bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-destructive">
                {this.props.label
                  ? `${this.props.label} 렌더링 중 오류가 발생했습니다`
                  : '컴포넌트 렌더링 중 오류가 발생했습니다'}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <pre className="text-xs text-muted-foreground mt-2 overflow-auto">
                  {this.state.error.message}
                </pre>
              )}
              <button
                onClick={this.reset}
                className="mt-2 px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                재시도
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
