import { createSettingsApi, type ProviderInfo } from '@/lib/api/settings'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { SlashProviderSummary } from './slash-commands'

let cacheByTransport = new WeakMap<Transport, SlashProviderSummary[]>()
let inflightByTransport = new WeakMap<Transport, Promise<SlashProviderSummary[]>>()
let lastCache: SlashProviderSummary[] | null = null
let cacheEpoch = 0
const invalidationListeners = new Set<() => void>()

function toSummary(list: ProviderInfo[]): SlashProviderSummary[] {
  return list.map((p) => ({
    id: p.id,
    label: p.label,
    models: p.models.map((m) => ({
      id: m.id,
      label: m.label,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      vision: m.vision,
    })),
  }))
}

export function getProviderCatalogSync(
  transport?: Transport | null,
): SlashProviderSummary[] | null {
  return transport ? (cacheByTransport.get(transport) ?? null) : lastCache
}

export async function ensureProviderCatalog(transport: Transport): Promise<SlashProviderSummary[]> {
  const cached = cacheByTransport.get(transport)
  if (cached) return cached
  const existing = inflightByTransport.get(transport)
  if (existing) return existing
  const requestEpoch = cacheEpoch
  const requestCache = cacheByTransport
  const requestInflight = inflightByTransport
  const inflight = (async () => {
    try {
      const api = await createSettingsApi(transport)
      const list = await api.listProviders()
      if (requestEpoch !== cacheEpoch) {
        return ensureProviderCatalog(transport)
      }
      const summary = toSummary(list)
      requestCache.set(transport, summary)
      lastCache = summary
      return summary
    } catch {
      return []
    }
  })()
  requestInflight.set(transport, inflight)
  void inflight.finally(() => {
    if (requestInflight.get(transport) === inflight) {
      requestInflight.delete(transport)
    }
  })
  return inflight
}

export function invalidateProviderCatalog(): void {
  cacheEpoch += 1
  cacheByTransport = new WeakMap()
  inflightByTransport = new WeakMap()
  lastCache = null
  for (const listener of invalidationListeners) listener()
}

export function getProviderCatalogEpoch(): number {
  return cacheEpoch
}

export function subscribeProviderCatalogInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener)
  return () => invalidationListeners.delete(listener)
}
