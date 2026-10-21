import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { Socket } from 'node:net'
import { performance } from 'node:perf_hooks'
import type {
  DesktopServiceHealthCheckBatchResult,
  DesktopServiceHealthCheckInput,
  DesktopServiceHealthCheckItem,
  DesktopServiceHealthCheckResult,
  DesktopServiceHealthHttpResult,
  DesktopServiceHealthTcpResult,
} from '@sepilotd/api-client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeTimeout(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3_000
  return Math.max(500, Math.min(15_000, Math.round(parsed)))
}

function normalizePort(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) return null
  return parsed
}

function normalizeServices(input: unknown): DesktopServiceHealthCheckItem[] {
  const record = isRecord(input) ? (input as Partial<DesktopServiceHealthCheckInput>) : {}
  const services = Array.isArray(record.services) ? record.services : []
  return services
    .map((service, index) => {
      const item: Record<string, unknown> = isRecord(service) ? service : {}
      return {
        id: cleanText(item.id, 160) || `service-${index + 1}`,
        name: cleanText(item.name, 240) || undefined,
        url: cleanText(item.url, 2_000),
        port: normalizePort(item.port),
      }
    })
    .filter((service) => service.url)
}

function parseServiceUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    try {
      return new URL(`http://${raw}`)
    } catch {
      return null
    }
  }
}

function defaultPort(url: URL): number | null {
  if (url.port) return normalizePort(url.port)
  if (url.protocol === 'https:') return 443
  if (url.protocol === 'http:') return 80
  return null
}

function tcpTarget(service: DesktopServiceHealthCheckItem, url: URL | null): {
  host: string
  port: number
} | null {
  if (!url?.hostname) return null
  const port = normalizePort(service.port) ?? defaultPort(url)
  if (!port) return null
  return { host: url.hostname, port }
}

async function checkTcp(
  target: { host: string; port: number } | null,
  timeoutMs: number,
): Promise<DesktopServiceHealthTcpResult> {
  if (!target) return { status: 'skipped' }
  const startedAt = performance.now()
  return new Promise((resolve) => {
    let settled = false
    const socket = new Socket()

    const finish = (result: DesktopServiceHealthTcpResult) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () =>
      finish({
        status: 'ok',
        host: target.host,
        port: target.port,
        latencyMs: Math.round(performance.now() - startedAt),
      }),
    )
    socket.once('timeout', () =>
      finish({
        status: 'error',
        host: target.host,
        port: target.port,
        error: `TCP timeout after ${timeoutMs}ms`,
      }),
    )
    socket.once('error', (error) =>
      finish({
        status: 'error',
        host: target.host,
        port: target.port,
        error: error.message,
      }),
    )
    socket.connect(target.port, target.host)
  })
}

async function checkHttp(url: URL | null, timeoutMs: number): Promise<DesktopServiceHealthHttpResult> {
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return { status: 'skipped' }
  const startedAt = performance.now()
  const requester = url.protocol === 'https:' ? requestHttps : requestHttp
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: DesktopServiceHealthHttpResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const request = requester(
      url,
      {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'Cache-Control': 'no-store',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        response.on('error', () => {})
        response.resume()
        finish({
          status: statusCode >= 200 && statusCode < 400
            ? 'ok'
            : statusCode >= 400 && statusCode < 500
              ? 'warning'
              : 'error',
          statusCode,
          latencyMs: Math.round(performance.now() - startedAt),
        })
      },
    )
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`HTTP timeout after ${timeoutMs}ms`))
    })
    request.once('error', (error) => {
      finish({ status: 'error', error: error.message })
    })
    request.end()
  })
}

function overallStatus(
  tcp: DesktopServiceHealthTcpResult,
  http: DesktopServiceHealthHttpResult,
): DesktopServiceHealthCheckResult['status'] {
  if (tcp.status === 'skipped' && http.status === 'skipped') return 'skipped'
  if (tcp.status === 'error' && (http.status === 'error' || http.status === 'skipped')) return 'down'
  if (http.status === 'error' && (tcp.status === 'error' || tcp.status === 'skipped')) return 'down'
  if (tcp.status === 'ok' && (http.status === 'ok' || http.status === 'skipped')) return 'healthy'
  if (tcp.status === 'skipped' && http.status === 'ok') return 'healthy'
  return 'degraded'
}

function statusMessage(
  status: DesktopServiceHealthCheckResult['status'],
  tcp: DesktopServiceHealthTcpResult,
  http: DesktopServiceHealthHttpResult,
): string {
  if (status === 'healthy') return '서비스가 응답했습니다.'
  if (status === 'skipped') return '점검 가능한 TCP 또는 HTTP 대상이 없습니다.'
  if (http.error) return http.error
  if (tcp.error) return tcp.error
  if (http.statusCode) return `HTTP ${http.statusCode}`
  return status === 'down' ? '서비스가 응답하지 않습니다.' : '서비스 응답이 지연되거나 일부 점검이 실패했습니다.'
}

async function checkService(
  service: DesktopServiceHealthCheckItem,
  timeoutMs: number,
  checkedAt: number,
): Promise<DesktopServiceHealthCheckResult> {
  const url = parseServiceUrl(service.url)
  const [tcp, http] = await Promise.all([
    checkTcp(tcpTarget(service, url), timeoutMs),
    checkHttp(url, timeoutMs),
  ])
  const status = overallStatus(tcp, http)
  return {
    id: service.id,
    name: service.name,
    url: service.url,
    status,
    checkedAt,
    message: statusMessage(status, tcp, http),
    tcp,
    http,
  }
}

export async function checkDesktopServiceHealth(
  input: DesktopServiceHealthCheckInput | unknown,
): Promise<DesktopServiceHealthCheckBatchResult> {
  const checkedAt = Date.now()
  const timeoutMs = normalizeTimeout(isRecord(input) ? input.timeoutMs : undefined)
  const services = normalizeServices(input)
  const results = await Promise.all(
    services.map((service) => checkService(service, timeoutMs, checkedAt)),
  )
  return { checkedAt, results }
}
