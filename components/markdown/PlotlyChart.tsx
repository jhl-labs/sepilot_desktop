'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils/clipboard';

// Dynamically import Plotly to avoid SSR issues
// Using factory pattern to bind plotly.js-dist-min
const Plot = dynamic(
  () =>
    import('react-plotly.js/factory').then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Plotly = require('plotly.js-dist-min');
      return mod.default(Plotly);
    }),
  { ssr: false }
);

interface PlotlyChartProps {
  data: string;
}

export function PlotlyChart({ data }: PlotlyChartProps) {
  const [error, setError] = useState<string>('');
  const [plotData, setPlotData] = useState<{
    data?: any[];
    layout?: any;
    config?: any;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(data);

      // Validate that we have data array
      if (!parsed.data || !Array.isArray(parsed.data)) {
        throw new Error('Invalid Plotly data: "data" array is required');
      }

      setPlotData(parsed);
      setError('');
    } catch (err) {
      console.error('Plotly parsing error:', err);
      setError(err instanceof Error ? err.message : String(err) || 'Failed to parse chart data');
    }
  }, [data]);

  const handleCopy = async () => {
    const success = await copyToClipboard(data);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error) {
    return (
      <div className="my-4 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10">
        <div className="flex items-center justify-between border-b border-destructive/50 bg-destructive/20 px-4 py-2">
          <span className="text-xs font-medium text-destructive">Plotly Chart Error</span>
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
        <div className="p-4 space-y-2">
          <p className="text-sm text-destructive font-medium">파싱 오류:</p>
          <pre className="text-xs text-destructive/80 whitespace-pre-wrap bg-destructive/5 p-2 rounded">
            {error}
          </pre>
          <p className="text-sm text-muted-foreground font-medium mt-4">원본 코드:</p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded font-mono">
            {data}
          </pre>
        </div>
      </div>
    );
  }

  if (!plotData) {
    return null;
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border bg-muted">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">Plotly Chart</span>
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

      {/* Chart */}
      <div className="flex items-center justify-center bg-background p-4">
        <Plot
          data={plotData.data || []}
          layout={{
            autosize: true,
            ...(plotData.layout || {}),
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            ...(plotData.config || {}),
          }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
