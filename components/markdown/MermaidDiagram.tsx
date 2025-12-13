'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'isomorphic-dompurify';
import { Button } from '@/components/ui/button';
import { Check, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';
import { copyToClipboard } from '@/lib/utils/clipboard';

interface MermaidDiagramProps {
  chart: string;
  onChartFixed?: (fixedChart: string) => void;
}

// Initialize mermaid once
let mermaidInitialized = false;

const MAX_RETRY_COUNT = 2;

interface FixAttempt {
  attemptNumber: number;
  errorMessage: string;
  attemptedFix: string;
}

export function MermaidDiagram({ chart, onChartFixed }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentChart, setCurrentChart] = useState(chart);
  const [fixHistory, setFixHistory] = useState<FixAttempt[]>([]);
  const { theme } = useTheme();

  // Reset state when chart prop changes
  useEffect(() => {
    setCurrentChart(chart);
    setRetryCount(0);
    setError('');
    setFixHistory([]);
  }, [chart]);

  // Auto-fix mermaid syntax using LLM
  const fixMermaidSyntax = useCallback(
    async (
      brokenChart: string,
      errorMsg: string,
      attemptNumber: number
    ): Promise<string | null> => {
      try {
        // 이전 시도 기록이 있으면 프롬프트에 포함
        let historyContext = '';
        if (fixHistory.length > 0) {
          historyContext = '\n\nPrevious fix attempts that FAILED:\n';
          fixHistory.forEach((attempt) => {
            historyContext += `\nAttempt ${attempt.attemptNumber}:\n`;
            historyContext += `Error: ${attempt.errorMessage}\n`;
            historyContext += `Tried fix:\n${attempt.attemptedFix}\n`;
            historyContext += '--- This approach did NOT work ---\n';
          });
          historyContext +=
            '\nIMPORTANT: Try a DIFFERENT approach from the previous attempts above.\n';
        }

        const prompt = `Fix the following Mermaid diagram syntax error. Return ONLY the corrected Mermaid code without any explanation or markdown code blocks.
${historyContext}
Current Error: ${errorMsg}

Current broken Mermaid code:
${brokenChart}

${attemptNumber === 1 ? 'First attempt - try the most common fixes.' : 'Second attempt - try a completely different approach from the first attempt.'}

Corrected Mermaid code:`;

        const messages = [
          { role: 'user' as const, content: prompt, id: 'fix-mermaid', created_at: Date.now() },
        ];

        if (isElectron() && window.electronAPI?.llm) {
          // Electron: Use IPC llm.chat
          const result = await window.electronAPI.llm.chat(messages, {
            maxTokens: 2000,
            temperature: 0.3,
          });
          if (result.success && result.data?.content) {
            // Clean up the response - remove markdown code blocks if present
            let fixed = result.data.content.trim();
            if (fixed.startsWith('```mermaid')) {
              fixed = fixed.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '');
            } else if (fixed.startsWith('```')) {
              fixed = fixed.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }
            return fixed.trim();
          }
        } else {
          // Web: Use LLMClient directly
          const { getLLMClient } = await import('@/lib/llm/client');
          const client = getLLMClient();
          if (client.isConfigured()) {
            const provider = client.getProvider();
            const webMessages = [
              { role: 'user' as const, content: prompt, id: 'fix-mermaid', created_at: Date.now() },
            ];
            const response = await provider.chat(webMessages, {
              maxTokens: 2000,
              temperature: 0.3,
            });
            if (response?.content) {
              let fixed = response.content.trim();
              if (fixed.startsWith('```mermaid')) {
                fixed = fixed.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '');
              } else if (fixed.startsWith('```')) {
                fixed = fixed.replace(/^```\n?/, '').replace(/\n?```$/, '');
              }
              return fixed.trim();
            }
          }
        }
      } catch (err) {
        console.error('[MermaidDiagram] Failed to fix syntax:', err);
      }
      return null;
    },
    [fixHistory]
  );

  // Try to auto-fix on error
  const attemptAutoFix = useCallback(
    async (brokenChart: string, errorMsg: string) => {
      if (retryCount >= MAX_RETRY_COUNT || isFixing) {
        return;
      }

      const currentAttempt = retryCount + 1;

      setIsFixing(true);
      try {
        const fixedChart = await fixMermaidSyntax(brokenChart, errorMsg, currentAttempt);

        if (fixedChart && fixedChart !== brokenChart) {
          // 수정된 차트로 업데이트 (렌더링 시도)
          setCurrentChart(fixedChart);
          setRetryCount(currentAttempt);

          // 성공 시 onChartFixed 호출은 렌더링 성공 후에만
          // (렌더링 실패 시 fixHistory에 기록됨)
        } else {
          // LLM이 수정에 실패했거나 동일한 코드를 반환한 경우
          setRetryCount(currentAttempt);

          // 실패한 시도 기록
          setFixHistory((prev) => [
            ...prev,
            {
              attemptNumber: currentAttempt,
              errorMessage: errorMsg,
              attemptedFix: fixedChart || brokenChart,
            },
          ]);
        }
      } catch (err) {
        console.error(`[MermaidDiagram] Attempt ${currentAttempt} error:`, err);
        setRetryCount(currentAttempt);

        // 예외 발생 시에도 기록
        setFixHistory((prev) => [
          ...prev,
          {
            attemptNumber: currentAttempt,
            errorMessage: `${errorMsg} (Fix attempt failed: ${err})`,
            attemptedFix: brokenChart,
          },
        ]);
      } finally {
        setIsFixing(false);
      }
    },
    [retryCount, isFixing, fixMermaidSyntax]
  );

  useEffect(() => {
    const isDark = theme === 'dark';

    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        // 보안 강화: strict 모드로 XSS 공격 방지
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      mermaidInitialized = true;
    } else {
      // Re-initialize with new theme
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        // 보안 강화: strict 모드로 XSS 공격 방지
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
    }

    const renderDiagram = async () => {
      if (!containerRef.current) {
        return;
      }

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      try {
        const { svg: renderedSvg } = await mermaid.render(id, currentChart);
        // DOMPurify로 SVG 살균하여 XSS 공격 방지
        const sanitizedSvg = DOMPurify.sanitize(renderedSvg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ['foreignObject'],
        });
        setSvg(sanitizedSvg);
        setError('');

        // 렌더링 성공 시 - 이전에 수정이 있었다면 콜백 호출
        if (retryCount > 0 && currentChart !== chart && onChartFixed) {
          onChartFixed(currentChart);
        }
      } catch (err) {
        const error = err as Error;
        console.error(`[MermaidDiagram] Rendering error (attempt ${retryCount + 1}):`, err);
        const errorMsg = error.message || 'Failed to render diagram';
        setError(errorMsg);

        // Clean up error SVG elements created by mermaid
        const errorElement = document.getElementById(id);
        if (errorElement) {
          errorElement.remove();
        }
        document.querySelectorAll('svg[id^="mermaid-"]').forEach((el) => {
          if (el.textContent?.includes('Syntax error')) {
            el.remove();
          }
        });

        // 렌더링 실패 - 수정 시도 중이었다면 실패 기록
        if (retryCount > 0 && currentChart !== chart) {
          setFixHistory((prev) => {
            // 이미 기록되어 있는지 확인 (중복 방지)
            const alreadyRecorded = prev.some((h) => h.attemptNumber === retryCount);
            if (!alreadyRecorded) {
              return [
                ...prev,
                {
                  attemptNumber: retryCount,
                  errorMessage: errorMsg,
                  attemptedFix: currentChart,
                },
              ];
            }
            return prev;
          });
        }

        // 자동 수정 제거 - 사용자가 수동으로 트리거해야 함
      }
    };

    renderDiagram();

    // Cleanup on unmount
    return () => {
      // Remove any leftover mermaid error elements
      document.querySelectorAll('svg[id^="mermaid-"]').forEach((el) => {
        if (el.textContent?.includes('Syntax error')) {
          el.remove();
        }
      });
    };
  }, [currentChart, theme, retryCount, chart, onChartFixed]);

  const handleCopy = async () => {
    const success = await copyToClipboard(currentChart);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Manual retry handler
  const handleManualRetry = () => {
    if (!isFixing && retryCount < MAX_RETRY_COUNT) {
      attemptAutoFix(currentChart, error);
    }
  };

  if (isFixing) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-primary/50 bg-primary/10">
        <div className="flex items-center justify-between border-b border-primary/50 bg-primary/20 px-4 py-2">
          <span className="text-xs font-medium text-primary flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            다이어그램 수정 중... ({retryCount + 1}/{MAX_RETRY_COUNT})
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-primary">AI가 Mermaid 문법 오류를 수정하고 있습니다</p>
        </div>
      </div>
    );
  }

  if (error) {
    // 최대 재시도 실패 시 텍스트 fallback으로 전환
    if (retryCount >= MAX_RETRY_COUNT) {
      return (
        <div className="my-4 overflow-hidden rounded-lg border border-muted bg-muted/30">
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Mermaid Code (렌더링 실패 - {MAX_RETRY_COUNT}회 수정 시도됨)
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1 px-2">
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  <span className="text-xs">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span className="text-xs">복사</span>
                </>
              )}
            </Button>
          </div>
          <div className="p-4 bg-background">
            <pre className="overflow-x-auto text-xs">
              <code>{currentChart}</code>
            </pre>
          </div>
        </div>
      );
    }

    // 재시도 가능한 경우 에러 UI 표시
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10">
        <div className="flex items-center justify-between border-b border-destructive/50 bg-destructive/20 px-4 py-2">
          <span className="text-xs font-medium text-destructive">
            Mermaid Diagram Error{' '}
            {retryCount > 0 && `(수정 ${retryCount}/${MAX_RETRY_COUNT}회 시도됨)`}
          </span>
          <div className="flex gap-1">
            {retryCount < MAX_RETRY_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleManualRetry}
                className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
                title="AI로 다시 수정 시도"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="text-xs">수정</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  <span className="text-xs">복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span className="text-xs">복사</span>
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-destructive font-medium">다이어그램을 렌더링할 수 없습니다</p>
          <p className="text-xs text-destructive/80 mt-1">
            문법 오류가 있습니다. &apos;수정&apos; 버튼을 클릭하여 AI로 자동 수정할 수 있습니다.
          </p>
          {/* 에러 상세 정보는 콘솔에만 출력 - UI에서는 간결하게 */}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border bg-muted">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Mermaid Diagram</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1 px-2">
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span className="text-xs">복사됨</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span className="text-xs">복사</span>
            </>
          )}
        </Button>
      </div>

      {/* Diagram */}
      <div className="flex items-center justify-center overflow-x-auto bg-background p-8">
        <div
          ref={containerRef}
          className="mermaid-diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
