'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { logger } from '@/lib/utils/logger';

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
  const [textDiagram, setTextDiagram] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [renderFailCount, setRenderFailCount] = useState(0);
  const [currentChart, setCurrentChart] = useState(chart);
  const [fixHistory, setFixHistory] = useState<FixAttempt[]>([]);
  const [needsAutoFix, setNeedsAutoFix] = useState(false);
  const [lastError, setLastError] = useState<string>('');
  const { theme } = useTheme();

  // Reset state when chart prop changes
  useEffect(() => {
    setCurrentChart(chart);
    setRenderFailCount(0);
    setError('');
    setFixHistory([]);
    setTextDiagram('');
    setSvg('');
    setNeedsAutoFix(false);
    setLastError('');
  }, [chart]);

  // Convert to text representation using LLM
  const convertToText = useCallback(async (brokenChart: string) => {
    setIsConverting(true);
    try {
      const prompt = `The following Mermaid diagram failed to render. Please convert it into a clear text-based diagram (ASCII art or structured list) that conveys the same information.
Return ONLY the text representation.

Broken Mermaid code:
${brokenChart}`;

      const messages = [
        { role: 'user' as const, content: prompt, id: 'convert-mermaid', created_at: Date.now() },
      ];

      if (isElectron() && window.electronAPI?.llm) {
        const result = await window.electronAPI.llm.chat(messages, {
          maxTokens: 2000,
          temperature: 0.3,
        });
        if (result.success && result.data?.content) {
          setTextDiagram(result.data.content);
        }
      } else {
        const { getLLMClient } = await import('@/lib/llm/client');
        const client = getLLMClient();
        if (client.isConfigured()) {
          const provider = client.getProvider();
          const response = await provider.chat(messages, {
            maxTokens: 2000,
            temperature: 0.3,
          });
          if (response?.content) {
            setTextDiagram(response.content);
          }
        }
      }
    } catch (err) {
      logger.error('[MermaidDiagram] Failed to convert to text:', err);
      // Fallback to showing code if conversion fails
      setTextDiagram(brokenChart);
    } finally {
      setIsConverting(false);
    }
  }, []);

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
        logger.error('[MermaidDiagram] Failed to fix syntax:', err);
      }
      return null;
    },
    [fixHistory]
  );

  // Mermaid 렌더링 useEffect
  useEffect(() => {
    const isDark = theme === 'dark';

    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      mermaidInitialized = true;
    } else {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
    }

    const renderDiagram = async () => {
      if (!containerRef.current) {
        return;
      }

      // 이미 텍스트로 변환된 상태면 렌더링 스킵
      if (textDiagram) {
        return;
      }

      // 수정 중이면 렌더링 스킵
      if (isFixing) {
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
        setNeedsAutoFix(false);
        setLastError('');

        // 렌더링 성공 시 - 수정이 있었다면 콜백 호출
        if (renderFailCount > 0 && currentChart !== chart && onChartFixed) {
          logger.info('[MermaidDiagram] Successfully fixed after', renderFailCount, 'attempts');
          onChartFixed(currentChart);
        }
      } catch (err) {
        const error = err as Error;
        const errorMsg = error.message || 'Failed to render diagram';
        logger.error(`[MermaidDiagram] Rendering error (fail count: ${renderFailCount}):`, err);

        setError(errorMsg);
        setLastError(errorMsg);

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

        // 렌더링 실패 카운트 증가
        const newFailCount = renderFailCount + 1;
        setRenderFailCount(newFailCount);

        // fixHistory에 기록
        setFixHistory((prev) => {
          // 중복 방지
          const alreadyRecorded = prev.some(
            (h) => h.attemptNumber === newFailCount && h.attemptedFix === currentChart
          );
          if (!alreadyRecorded) {
            return [
              ...prev,
              {
                attemptNumber: newFailCount,
                errorMessage: errorMsg,
                attemptedFix: currentChart,
              },
            ];
          }
          return prev;
        });

        // 자동 수정 필요 플래그 설정
        if (newFailCount < MAX_RETRY_COUNT) {
          setNeedsAutoFix(true);
        } else {
          // 최대 재시도 횟수 도달 -> 텍스트 변환
          if (!textDiagram && !isConverting) {
            convertToText(currentChart);
          }
        }
      }
    };

    renderDiagram();

    // Cleanup on unmount
    return () => {
      document.querySelectorAll('svg[id^="mermaid-"]').forEach((el) => {
        if (el.textContent?.includes('Syntax error')) {
          el.remove();
        }
      });
    };
  }, [
    currentChart,
    theme,
    textDiagram,
    isFixing,
    renderFailCount,
    chart,
    onChartFixed,
    isConverting,
    convertToText,
  ]);

  // 자동 수정 useEffect
  useEffect(() => {
    if (!needsAutoFix || isFixing || textDiagram || isConverting) {
      return;
    }

    const performAutoFix = async () => {
      setIsFixing(true);
      setNeedsAutoFix(false);

      try {
        logger.info(
          `[MermaidDiagram] Attempting auto-fix (attempt ${renderFailCount}/${MAX_RETRY_COUNT})`
        );

        const fixedChart = await fixMermaidSyntax(currentChart, lastError, renderFailCount);

        if (fixedChart && fixedChart !== currentChart) {
          logger.info('[MermaidDiagram] LLM returned a fix, applying...');
          // 수정된 차트로 업데이트 (렌더링 useEffect가 자동으로 재시도)
          setCurrentChart(fixedChart);
        } else {
          logger.warn('[MermaidDiagram] LLM failed to provide a valid fix');
          // LLM이 수정에 실패 -> 다음 단계로
          if (renderFailCount >= MAX_RETRY_COUNT) {
            await convertToText(currentChart);
          }
        }
      } catch (err) {
        logger.error(`[MermaidDiagram] Auto-fix attempt ${renderFailCount} error:`, err);
        // 에러 발생 시에도 다음 단계로
        if (renderFailCount >= MAX_RETRY_COUNT) {
          await convertToText(currentChart);
        }
      } finally {
        setIsFixing(false);
      }
    };

    performAutoFix();
  }, [
    needsAutoFix,
    isFixing,
    textDiagram,
    isConverting,
    renderFailCount,
    currentChart,
    lastError,
    fixMermaidSyntax,
    convertToText,
  ]);

  const handleCopy = async () => {
    const contentToCopy = textDiagram || currentChart;
    const success = await copyToClipboard(contentToCopy);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isFixing) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-primary/50 bg-primary/10">
        <div className="flex items-center justify-between border-b border-primary/50 bg-primary/20 px-4 py-2">
          <span className="text-xs font-medium text-primary flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            다이어그램 수정 중... ({renderFailCount}/{MAX_RETRY_COUNT})
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-primary">AI가 Mermaid 문법 오류를 수정하고 있습니다</p>
        </div>
      </div>
    );
  }

  if (isConverting) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-primary/50 bg-primary/10">
        <div className="flex items-center justify-between border-b border-primary/50 bg-primary/20 px-4 py-2">
          <span className="text-xs font-medium text-primary flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            텍스트로 변환 중...
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-primary">
            다이어그램 렌더링 실패로 텍스트 버전으로 변환하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (textDiagram) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-muted bg-muted/30">
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            Mermaid Text Fallback (렌더링 실패)
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
        <div className="p-4 bg-background overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap">{textDiagram}</pre>
        </div>
      </div>
    );
  }

  if (error) {
    // 에러 상태이면서 수정도 안 하고 변환도 안 하는 중이면 일시적인 상태
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10">
        <div className="flex items-center justify-between border-b border-destructive/50 bg-destructive/20 px-4 py-2">
          <span className="text-xs font-medium text-destructive">Mermaid Render Error</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-destructive" />
            <p className="text-sm text-destructive">오류 처리 중...</p>
          </div>
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
