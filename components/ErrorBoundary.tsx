'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError, isErrorReportingEnabled } from '@/lib/error-reporting';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorReportDialog } from './ErrorReportDialog';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo, resetError: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showReportDialog: boolean;
  reportSuccess: boolean;
  reportMessage: string | null;
}

/**
 * Error Boundary Component
 * React 컴포넌트 트리에서 발생한 에러를 캡처하고 자동으로 리포트
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showReportDialog: false,
      reportSuccess: false,
      reportMessage: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // 에러 리포팅이 활성화되어 있는지 확인
    const enabled = await isErrorReportingEnabled();
    if (enabled) {
      // 다이얼로그 표시 (사용자 동의 필요)
      this.setState({
        showReportDialog: true,
      });
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showReportDialog: false,
      reportSuccess: false,
      reportMessage: null,
    });
  };

  handleReportConfirm = async (additionalInfo?: string) => {
    if (!this.state.error || !this.state.errorInfo) {
      return;
    }

    try {
      const result = await reportError(this.state.error, {
        type: 'frontend',
        reproduction: additionalInfo,
        additionalInfo: {
          componentStack: this.state.errorInfo.componentStack,
          errorBoundary: true,
        },
      });

      this.setState({
        showReportDialog: false,
        reportSuccess: result.success,
        reportMessage: result.message || null,
      });
    } catch (err) {
      console.error('[ErrorBoundary] Failed to report error:', err);
      this.setState({
        showReportDialog: false,
        reportSuccess: false,
        reportMessage: '에러 리포트 전송에 실패했습니다.',
      });
    }
  };

  handleReportCancel = () => {
    this.setState({
      showReportDialog: false,
    });
  };

  render() {
    if (this.state.hasError) {
      // 커스텀 fallback이 제공된 경우
      if (this.props.fallback && this.state.error && this.state.errorInfo) {
        return this.props.fallback(this.state.error, this.state.errorInfo, this.resetError);
      }

      // 기본 에러 UI
      return (
        <>
          {/* 에러 리포트 다이얼로그 */}
          {this.state.error && (
            <ErrorReportDialog
              open={this.state.showReportDialog}
              onOpenChange={(open) => this.setState({ showReportDialog: open })}
              error={this.state.error}
              onConfirm={this.handleReportConfirm}
              onCancel={this.handleReportCancel}
            />
          )}

          <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="max-w-2xl w-full border-destructive">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <div>
                    <CardTitle className="text-2xl">앗, 문제가 발생했습니다!</CardTitle>
                    <CardDescription className="mt-2">
                      예상치 못한 오류가 발생했습니다. 불편을 드려 죄송합니다.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 에러 정보 */}
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                  <p className="font-mono text-sm text-destructive mb-2">
                    {this.state.error?.message || '알 수 없는 오류'}
                  </p>
                  {this.state.error?.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        기술적 세부 정보
                      </summary>
                      <pre className="mt-2 text-xs overflow-auto p-2 bg-background/50 rounded">
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                </div>

                {/* 리포트 상태 */}
                {this.state.reportSuccess && this.state.reportMessage && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-600 dark:text-green-500">
                    {this.state.reportMessage}
                  </div>
                )}

                {!this.state.reportSuccess && this.state.reportMessage && (
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-500">
                    {this.state.reportMessage}
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button onClick={this.resetError} className="flex-1">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      다시 시도
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => (window.location.href = '/')}
                      className="flex-1"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      홈으로
                    </Button>
                  </div>

                  {/* 에러 리포트 버튼 (리포팅이 활성화되고 아직 리포트하지 않은 경우) */}
                  {!this.state.reportSuccess && !this.state.reportMessage && (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const enabled = await isErrorReportingEnabled();
                        if (enabled) {
                          this.setState({ showReportDialog: true });
                        } else {
                          this.setState({
                            reportMessage:
                              '에러 리포팅이 비활성화되어 있습니다. Settings에서 활성화해주세요.',
                          });
                        }
                      }}
                      className="w-full"
                    >
                      <Bug className="mr-2 h-4 w-4" />
                      에러 리포트 전송
                    </Button>
                  )}
                </div>

                {/* 안내 메시지 */}
                <div className="text-xs text-muted-foreground text-center pt-2">
                  문제가 계속되면 앱을 재시작해보세요.
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      );
    }

    return this.props.children;
  }
}
