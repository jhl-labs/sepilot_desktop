import type { Transport } from '@/lib/transport/transport-adapter'
import { makeDaemonRequestContext } from './_daemon'

export interface UsageSummary {
  inputTokens: number
  outputTokens: number
  costUsd: number
  requestCount: number
}

export interface DailyUsageSummary {
  date: string
  provider: string
  model: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  requestCount: number
}

export interface UsageApi {
  getSummary: () => Promise<UsageSummary>
  getDaily: (days?: number) => Promise<DailyUsageSummary[]>
}

export async function createUsageApi(transport: Transport): Promise<UsageApi> {
  const daemon = await makeDaemonRequestContext(transport)

  async function read<T>(path: string): Promise<T> {
    const response = await fetch(daemon.url(path), {
      headers: daemon.headers(),
    })
    if (!response.ok) {
      throw new Error(`${path} failed (${response.status})`)
    }
    return (await response.json()) as T
  }

  return {
    async getSummary() {
      const body = await read<{ data: UsageSummary }>('/usage')
      return body.data
    },
    async getDaily(days = 14) {
      const body = await read<{ data: DailyUsageSummary[] }>(
        `/usage/daily?days=${encodeURIComponent(String(days))}`,
      )
      return body.data
    },
  }
}
