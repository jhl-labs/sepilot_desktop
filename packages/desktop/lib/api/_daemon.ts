import type { Transport } from '@/lib/transport/transport-adapter'
import { memoryScopeHeaders, requireDaemonMemoryScope } from './_memory-scope'

export interface DaemonRequestContext {
  headers(): HeadersInit
  url(path: string): string
}

export interface MakeDaemonRequestContextOptions {
  memoryScope?: boolean
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

export async function makeDaemonRequestContext(
  transport: Transport,
  options: MakeDaemonRequestContextOptions = {},
): Promise<DaemonRequestContext> {
  const cfg = await transport.getConfig()
  const baseUrl = `${cfg.daemonOrigin.replace(/\/$/, '')}/api/v1`
  const scopeHeaders = options.memoryScope
    ? memoryScopeHeaders(await requireDaemonMemoryScope(cfg.daemonOrigin, cfg.daemonToken))
    : {}

  return {
    headers(): HeadersInit {
      return cfg.daemonToken
        ? {
            authorization: `Bearer ${cfg.daemonToken}`,
            'content-type': 'application/json',
            ...scopeHeaders,
          }
        : { 'content-type': 'application/json', ...scopeHeaders }
    },
    url(path: string): string {
      return `${baseUrl}${normalizePath(path)}`
    },
  }
}
