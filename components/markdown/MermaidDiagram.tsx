'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { Button } from '@/components/ui/button';
import { Check, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';

interface MermaidDiagramProps {
  chart: string;
  onChartFixed?: (fixedChart: string) => void;
}

// Initialize mermaid once
let mermaidInitialized = false;

const MAX_RETRY_COUNT = 2;

export function MermaidDiagram({ chart, onChartFixed }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentChart, setCurrentChart] = useState(chart);
  const { theme } = useTheme();

  // Reset state when chart prop changes
  useEffect(() => {
    setCurrentChart(chart);
    setRetryCount(0);
    setError('');
    setErrorDetails('');
  }, [chart]);

  // Auto-fix mermaid syntax using LLM
  const fixMermaidSyntax = useCallback(async (brokenChart: string, errorMsg: string): Promise<string | null> => {
    try {
      const prompt = `Fix the following Mermaid diagram syntax error. Return ONLY the corrected Mermaid code without any explanation or markdown code blocks.

Error: ${errorMsg}

Broken Mermaid code:
${brokenChart}

Corrected Mermaid code:`;

      const messages = [{ role: 'user' as const, content: prompt, id: 'fix-mermaid', created_at: Date.now() }];

      if (isElectron() && window.electronAPI?.llm) {
        // Electron: Use IPC llm.chat
        const result = await window.electronAPI.llm.chat(messages, { maxTokens: 2000, temperature: 0.3 });
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
          const webMessages = [{ role: 'user' as const, content: prompt, id: 'fix-mermaid', created_at: Date.now() }];
          const response = await provider.chat(webMessages, { maxTokens: 2000, temperature: 0.3 });
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
  }, []);

  // Try to auto-fix on error
  const attemptAutoFix = useCallback(async (brokenChart: string, errorMsg: string) => {
    if (retryCount >= MAX_RETRY_COUNT || isFixing) return;

    setIsFixing(true);
    try {
      const fixedChart = await fixMermaidSyntax(brokenChart, errorMsg);
      if (fixedChart && fixedChart !== brokenChart) {
        setCurrentChart(fixedChart);
        setRetryCount((prev) => prev + 1);
        onChartFixed?.(fixedChart);
      }
    } finally {
      setIsFixing(false);
    }
  }, [retryCount, isFixing, fixMermaidSyntax, onChartFixed]);

  useEffect(() => {
    const isDark = theme === 'dark';

    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit',
      });
      mermaidInitialized = true;
    } else {
      // Re-initialize with new theme
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'inherit',
      });
    }

    const renderDiagram = async () => {
      if (!containerRef.current) return;

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      try {
        const { svg: renderedSvg } = await mermaid.render(id, currentChart);
        setSvg(renderedSvg);
        setError('');
        setErrorDetails('');
      } catch (err: any) {
        console.error('Mermaid rendering error:', err);
        const errorMsg = err.message || 'Failed to render diagram';
        setError(errorMsg);
        setErrorDetails(err.toString());

        // Clean up error SVG elements created by mermaid
        // Mermaid creates error SVG with the same ID when rendering fails
        const errorElement = document.getElementById(id);
        if (errorElement) {
          errorElement.remove();
        }
        // Also clean up any "Syntax error in text" SVG elements
        document.querySelectorAll('svg[id^="mermaid-"]').forEach((el) => {
          if (el.textContent?.includes('Syntax error')) {
            el.remove();
          }
        });

        // Auto-fix attempt
        if (retryCount < MAX_RETRY_COUNT && !isFixing) {
          attemptAutoFix(currentChart, errorMsg);
        }
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
  }, [currentChart, theme, retryCount, isFixing, attemptAutoFix]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentChart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            다이어그램 자동 수정 중... ({retryCount + 1}/{MAX_RETRY_COUNT})
          </span>
        </div>
        <div className="p-4">
          <p className="text-sm text-primary">AI가 Mermaid 문법 오류를 수정하고 있습니다</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10">
        <div className="flex items-center justify-between border-b border-destructive/50 bg-destructive/20 px-4 py-2">
          <span className="text-xs font-medium text-destructive">
            Mermaid Diagram Error {retryCount > 0 && `(자동 수정 ${retryCount}/${MAX_RETRY_COUNT}회 시도됨)`}
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
          <p className="text-xs text-destructive/80 mt-1">문법 오류가 있습니다. 복사 버튼을 클릭하여 코드를 확인하세요.</p>
          {/* 에러 상세 정보는 콘솔에만 출력 - UI에서는 간결하게 */}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border bg-muted">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Mermaid Diagram
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1 px-2"
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
