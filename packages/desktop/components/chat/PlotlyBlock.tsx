'use client'
import { useEffect, useState } from 'react'

interface PlotlyBlockProps {
  source: string
  streaming?: boolean
}

interface PlotlyData {
  data: unknown
  layout?: unknown
  config?: unknown
}

function parsePlotly(source: string): PlotlyData | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (Array.isArray(obj.data)) {
    return {
      data: obj.data,
      layout: obj.layout,
      config: obj.config,
    }
  }
  return null
}

const PLOTLY_TRACE_KEYS = new Set([
  'type',
  'mode',
  'x',
  'y',
  'z',
  'values',
  'labels',
  'lat',
  'lon',
  'marker',
  'line',
  'cells',
  'header',
])

export function looksLikePlotly(source: string): boolean {
  const candidate = parsePlotly(source)
  if (!candidate || !Array.isArray(candidate.data) || candidate.data.length === 0) {
    return false
  }
  const first = candidate.data[0]
  if (!first || typeof first !== 'object') return false
  const keys = Object.keys(first as Record<string, unknown>)
  const hasTraceKey = keys.some((k) => PLOTLY_TRACE_KEYS.has(k))
  return hasTraceKey || candidate.layout !== undefined
}

type PlotlyComponent = React.ComponentType<{
  data: unknown
  layout?: unknown
  config?: unknown
  useResizeHandler?: boolean
  style?: React.CSSProperties
  className?: string
}>

let cachedPlot: PlotlyComponent | null = null
let plotLoadPromise: Promise<PlotlyComponent> | null = null

async function loadPlot(): Promise<PlotlyComponent> {
  if (cachedPlot) return cachedPlot
  if (plotLoadPromise) return plotLoadPromise
  plotLoadPromise = (async () => {
    const [{ default: createPlotlyComponent }, plotlyDist] = await Promise.all([
      import('react-plotly.js/factory'),
      import('plotly.js-dist-min'),
    ])
    const Plot = createPlotlyComponent(
      (plotlyDist as unknown as { default: unknown }).default
        ?? plotlyDist,
    ) as PlotlyComponent
    cachedPlot = Plot
    return Plot
  })()
  return plotLoadPromise
}

export function PlotlyBlock({ source, streaming }: PlotlyBlockProps) {
  const [Plot, setPlot] = useState<PlotlyComponent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (streaming) {
      setError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const Component = await loadPlot()
        if (!cancelled) setPlot(() => Component)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'plotly load failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [streaming])

  const figure = streaming ? null : parsePlotly(source)

  if (streaming) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
        <code>{source}</code>
      </pre>
    )
  }

  if (!figure) {
    return (
      <div className="my-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
          Plotly 데이터 파싱 실패
        </div>
        <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
          <code>{source}</code>
        </pre>
      </div>
    )
  }

  if (error) {
    return (
      <div className="my-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">
          Plotly 렌더링 실패
        </div>
        <div className="mb-2 text-[11px] text-amber-700/80 dark:text-amber-300/80">
          {error}
        </div>
        <pre className="overflow-x-auto rounded bg-background p-2 text-xs">
          <code>{source}</code>
        </pre>
      </div>
    )
  }

  if (!Plot) {
    return (
      <div className="my-2 rounded-md border border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
        Plotly 차트 로딩 중…
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-background">
      <Plot
        data={figure.data as unknown}
        layout={{
          autosize: true,
          margin: { t: 24, r: 16, b: 32, l: 40 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          ...(figure.layout as Record<string, unknown> | undefined),
        }}
        config={{
          displayModeBar: false,
          responsive: true,
          ...(figure.config as Record<string, unknown> | undefined),
        }}
        useResizeHandler
        style={{ width: '100%', height: '320px' }}
      />
    </div>
  )
}
