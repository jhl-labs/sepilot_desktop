'use client'
import { useEffect, useState } from 'react'
import { useTransport } from '@/components/providers/transport-provider'
import {
  createUsageApi,
  type DailyUsageSummary,
  type UsageSummary,
} from '@/lib/api/usage'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'usage',
  section: 'agent',
  label: 'Usage',
  search: ['usage', 'cost', 'tokens', 'requests'],
  render: () => <UsageDashboard />,
})

export function UsageDashboard() {
  const transport = useTransport()
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [daily, setDaily] = useState<DailyUsageSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const api = await createUsageApi(transport)
        const [nextSummary, nextDaily] = await Promise.all([
          api.getSummary(),
          api.getDaily(14),
        ])
        if (!cancelled) {
          setSummary(nextSummary)
          setDaily(nextDaily)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'usage load failed')
          setSummary(null)
          setDaily([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [transport])

  if (loading) {
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!summary) {
    return (
      <p className="text-sm text-muted-foreground">
        아직 집계된 사용량이 없습니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          label="Requests"
          value={summary.requestCount.toLocaleString()}
        />
        <MetricCard
          label="Input Tokens"
          value={summary.inputTokens.toLocaleString()}
        />
        <MetricCard
          label="Output Tokens"
          value={summary.outputTokens.toLocaleString()}
        />
        <MetricCard
          label="Cost"
          value={`$${summary.costUsd.toFixed(4)}`}
        />
      </div>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold">최근 14일 사용량</h4>
          <p className="text-xs text-muted-foreground">
            provider / model 기준으로 집계된 요청량입니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Requests</th>
                <th className="px-4 py-2">Input</th>
                <th className="px-4 py-2">Output</th>
                <th className="px-4 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={`${row.date}:${row.provider}:${row.model}`} className="border-b border-border/70">
                  <td className="px-4 py-2">{row.date}</td>
                  <td className="px-4 py-2">{row.provider}</td>
                  <td className="px-4 py-2">{row.model}</td>
                  <td className="px-4 py-2">{row.requestCount}</td>
                  <td className="px-4 py-2">{row.totalInputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{row.totalOutputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">${row.totalCostUsd.toFixed(4)}</td>
                </tr>
              ))}
              {daily.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    일별 사용량 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
