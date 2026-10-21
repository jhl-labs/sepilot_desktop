import { makeDaemonRequestContext } from './_daemon'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface MarketplaceEntry {
  name: string
  url: string
}

interface MarketplaceListResponse {
  data: MarketplaceEntry[]
}

interface MarketplaceCreateResponse {
  data: MarketplaceEntry
}

interface MarketplaceDeleteResponse {
  data: { removed: boolean }
}

export interface MarketplacesApi {
  list: () => Promise<MarketplaceEntry[]>
  add: (name: string, url: string) => Promise<MarketplaceEntry>
  remove: (name: string) => Promise<boolean>
}

export async function createMarketplacesApi(
  transport: Transport,
): Promise<MarketplacesApi> {
  const daemon = await makeDaemonRequestContext(transport)

  async function requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(daemon.url(path), {
      method,
      headers: daemon.headers(),
      body: body == null ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`${path} failed (${response.status})`)
    }
    const payload = await response.json()
    return payload as T
  }

  return {
    list: async () => {
      const res = await requestJson<MarketplaceListResponse>(
        'GET',
        '/marketplaces',
      )
      return res.data
    },
    add: async (name, url) => {
      const res = await requestJson<MarketplaceCreateResponse>(
        'POST',
        '/marketplaces',
        { name, url },
      )
      return res.data
    },
    remove: async (name) => {
      const res = await requestJson<MarketplaceDeleteResponse>(
        'DELETE',
        `/marketplaces/${encodeURIComponent(name)}`,
      )
      return res.data.removed
    },
  }
}
