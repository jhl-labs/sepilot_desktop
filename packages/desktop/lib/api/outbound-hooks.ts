import {
  makeDaemonRequestContext,
  type DaemonRequestContext,
} from './_daemon'
import { CapabilityUnavailableError } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'
import type {
  DaemonOutboundWebhookConfig,
  DaemonOutboundWebhookDeadLetter,
  DaemonOutboundWebhookDelivery,
  DaemonOutboundWebhookEvent,
  DaemonOutboundWebhookSummary,
} from '@sepilotd/api-client'

export type {
  DaemonOutboundWebhookConfig,
  DaemonOutboundWebhookDeadLetter,
  DaemonOutboundWebhookDelivery,
  DaemonOutboundWebhookEvent,
  DaemonOutboundWebhookSummary,
}

interface OutboundWebhookDeliveryOptions {
  id?: string
  status?: DaemonOutboundWebhookDelivery['deliveryStatus']
  cursor?: string
  limit?: number
}

interface OutboundWebhookDeadLetterOptions {
  id?: string
  state?: DaemonOutboundWebhookDeadLetter['state'] | 'all'
  cursor?: string
  limit?: number
}

export interface OutboundHooksApi {
  listConfig: () => Promise<DaemonOutboundWebhookConfig[]>
  list: () => Promise<DaemonOutboundWebhookSummary[]>
  deliveries: (
    options?: OutboundWebhookDeliveryOptions,
  ) => Promise<DaemonOutboundWebhookDelivery[]>
  deadLetters: (
    options?: OutboundWebhookDeadLetterOptions,
  ) => Promise<DaemonOutboundWebhookDeadLetter[]>
  upsert: (webhook: DaemonOutboundWebhookConfig) => Promise<void>
  remove: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  replay: (
    deliveryId: string,
    options?: { force?: boolean },
  ) => Promise<DaemonOutboundWebhookDelivery>
  ack: (
    rootDeliveryId: string,
    options?: { note?: string },
  ) => Promise<DaemonOutboundWebhookDeadLetter>
}

function unwrap<T>(body: T | { data?: T }): T {
  if (
    body
    && typeof body === 'object'
    && 'data' in (body as { data?: T })
    && (body as { data?: T }).data !== undefined
  ) {
    return (body as { data: T }).data
  }
  return body as T
}

async function requestJson<T>(
  http: DaemonRequestContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(http.url(path), {
    method,
    headers: http.headers(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.status === 404) {
    throw new CapabilityUnavailableError('outbound-hooks')
  }
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status})`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  if (!text) {
    return undefined as T
  }
  return unwrap(JSON.parse(text) as T | { data?: T })
}

function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue
    }
    searchParams.set(key, String(value))
  }
  const suffix = searchParams.toString()
  return suffix ? `${path}?${suffix}` : path
}

export async function createOutboundHooksApi(
  transport: Transport,
): Promise<OutboundHooksApi> {
  const http = await makeDaemonRequestContext(transport)
  return {
    listConfig: async () => {
      const config = await requestJson<{
        hooks?: { outboundWebhooks?: DaemonOutboundWebhookConfig[] }
      }>(http, 'GET', '/config')
      return config.hooks?.outboundWebhooks ?? []
    },
    list: () =>
      requestJson<DaemonOutboundWebhookSummary[]>(
        http,
        'GET',
        '/config/hooks/outbound-webhooks',
      ),
    deliveries: (options = {}) =>
      requestJson<DaemonOutboundWebhookDelivery[]>(
        http,
        'GET',
        withQuery('/config/hooks/outbound-webhooks/deliveries', {
          id: options.id,
          status: options.status,
          cursor: options.cursor,
          limit: options.limit,
        }),
      ),
    deadLetters: (options = {}) =>
      requestJson<DaemonOutboundWebhookDeadLetter[]>(
        http,
        'GET',
        withQuery('/config/hooks/outbound-webhooks/dead-letters', {
          id: options.id,
          state: options.state,
          cursor: options.cursor,
          limit: options.limit,
        }),
      ),
    upsert: async (webhook) => {
      await requestJson<void>(
        http,
        'POST',
        '/config/hooks/outbound-webhooks',
        webhook,
      )
    },
    remove: async (id) => {
      await requestJson<void>(
        http,
        'DELETE',
        `/config/hooks/outbound-webhooks/${encodeURIComponent(id)}`,
      )
    },
    setEnabled: async (id, enabled) => {
      await requestJson<void>(
        http,
        'POST',
        `/config/hooks/outbound-webhooks/${encodeURIComponent(id)}/enable`,
        { enabled },
      )
    },
    replay: (deliveryId, options = {}) =>
      requestJson<DaemonOutboundWebhookDelivery>(
        http,
        'POST',
        `/config/hooks/outbound-webhooks/deliveries/${encodeURIComponent(deliveryId)}/replay`,
        options.force ? { force: true } : {},
      ),
    ack: (rootDeliveryId, options = {}) =>
      requestJson<DaemonOutboundWebhookDeadLetter>(
        http,
        'POST',
        `/config/hooks/outbound-webhooks/dead-letters/${encodeURIComponent(rootDeliveryId)}/ack`,
        options.note ? { note: options.note } : {},
      ),
  }
}
