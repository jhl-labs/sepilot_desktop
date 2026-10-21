import type { Transport } from '@/lib/transport/transport-adapter'
import { memoryScopeHeaders, requireDaemonMemoryScope } from './_memory-scope'

export interface HttpClient {
  origin: string
  headers(): HeadersInit
  url(path: string): string
}

export interface MakeHttpOptions {
  memoryScope?: boolean
}

export async function makeHttp(
  transport: Transport,
  options: MakeHttpOptions = {},
): Promise<HttpClient> {
  const cfg = await transport.getConfig()
  const scopeHeaders = options.memoryScope
    ? memoryScopeHeaders(await requireDaemonMemoryScope(cfg.daemonOrigin, cfg.daemonToken))
    : {}
  const headers = (): HeadersInit =>
    cfg.daemonToken
      ? {
          authorization: `Bearer ${cfg.daemonToken}`,
          'content-type': 'application/json',
          ...scopeHeaders,
        }
      : { 'content-type': 'application/json', ...scopeHeaders }
  return {
    origin: cfg.daemonOrigin,
    headers,
    url: (p) => `${cfg.daemonOrigin}${p}`,
  }
}

export class CapabilityUnavailableError extends Error {
  constructor(public capability: string) {
    super(`daemon capability '${capability}' is not available`)
    this.name = 'CapabilityUnavailableError'
  }
}

export class DesktopHttpError extends Error {
  readonly status: number
  readonly requestId?: string
  readonly rawBody: string

  constructor(init: {
    path: string
    status: number
    statusText: string
    body: string
    requestId?: string
  }) {
    const detail = parseErrorBody(init.body)
    super(`${init.path} failed (${init.status}): ${detail.message || init.statusText}`)
    this.name = 'DesktopHttpError'
    this.status = init.status
    this.requestId = detail.requestId ?? init.requestId
    this.rawBody = init.body
  }
}

function parseErrorBody(body: string): { message?: string; requestId?: string } {
  if (!body) return {}
  try {
    const parsed = JSON.parse(body) as { error?: unknown } | null
    const error = parsed && typeof parsed === 'object' ? parsed.error : null
    if (!error || typeof error !== 'object') return { message: body }
    const message = (error as { message?: unknown }).message
    const requestId = (error as { requestId?: unknown }).requestId
    return {
      message: typeof message === 'string' ? message : body,
      requestId: typeof requestId === 'string' ? requestId : undefined,
    }
  } catch {
    return { message: body }
  }
}

export async function createHttpError(path: string, response: Response): Promise<DesktopHttpError> {
  return new DesktopHttpError({
    path,
    status: response.status,
    statusText: response.statusText,
    body: await response.text(),
    requestId: response.headers.get('x-request-id') ?? undefined,
  })
}

export async function getJson<T>(http: HttpClient, path: string, capability: string): Promise<T> {
  const r = await fetch(http.url(path), { headers: http.headers() })
  if (r.status === 404) throw new CapabilityUnavailableError(capability)
  if (!r.ok) throw await createHttpError(path, r)
  return (await r.json()) as T
}

export async function sendJson<T>(
  http: HttpClient,
  method: string,
  path: string,
  body: unknown,
  capability: string,
): Promise<T> {
  const headers = new Headers(http.headers())
  if (body === undefined) headers.delete('content-type')
  const r = await fetch(http.url(path), {
    method,
    headers,
    body: JSON.stringify(body),
  })
  if (r.status === 404) throw new CapabilityUnavailableError(capability)
  if (!r.ok) throw await createHttpError(path, r)
  if (r.status === 204) return undefined as T
  const text = await r.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}
