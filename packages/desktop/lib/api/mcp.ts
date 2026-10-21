import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

interface McpPerToolMetrics {
  calls: number
  errors: number
  totalDurationMs: number
}

export interface McpServerMetrics {
  totalCalls: number
  errors: number
  totalDurationMs: number
  lastCallAt: string | null
  perTool: Record<string, McpPerToolMetrics>
}

export interface McpServerStatus {
  name: string
  enabled: boolean
  status: 'disabled' | 'connected' | 'error'
  connected: boolean
  transport: string
  command?: string
  args?: string[]
  url?: string
  toolCount: number
  tools: string[]
  allTools?: string[]
  disabledTools?: string[]
  error?: string
}

export interface McpServerTemplate {
  name: string
  description: string
  transport: string
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  tags: string[]
  homepage?: string
  variables?: McpServerTemplateVariable[]
  marketplace: string
}

export interface McpServerTemplateVariable {
  name: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  secret?: boolean
}

interface McpInstallResult {
  installed: boolean
  serverName: string
}

export interface McpMarketplace {
  name: string
  url: string
  addedAt: string
  lastSync: string | null
}

export interface McpClientRootConfig {
  uri: string
  name?: string
  _meta?: Record<string, unknown>
}

export interface McpClientConfig {
  roots: {
    enabled: boolean
    listChanged: boolean
    entries: McpClientRootConfig[]
  }
  sampling: {
    enabled: boolean
    provider?: string
    model?: string
    maxTokens: number
    temperature?: number
  }
  elicitation: {
    enabled: boolean
    mode: 'decline' | 'accept-defaults'
    applyDefaults: boolean
  }
}

export function createDefaultMcpClientConfig(): McpClientConfig {
  return {
    roots: {
      enabled: false,
      listChanged: true,
      entries: [],
    },
    sampling: {
      enabled: false,
      maxTokens: 1024,
    },
    elicitation: {
      enabled: false,
      mode: 'decline',
      applyDefaults: true,
    },
  }
}

function withMcpClientDefaults(client?: Partial<McpClientConfig>): McpClientConfig {
  const defaults = createDefaultMcpClientConfig()
  return {
    roots: {
      ...defaults.roots,
      ...(client?.roots ?? {}),
      entries: client?.roots?.entries ?? defaults.roots.entries,
    },
    sampling: {
      ...defaults.sampling,
      ...(client?.sampling ?? {}),
    },
    elicitation: {
      ...defaults.elicitation,
      ...(client?.elicitation ?? {}),
    },
  }
}

function readMcpConfig(
  body: unknown,
): { servers?: McpServerConfig[]; client?: Partial<McpClientConfig> } | undefined {
  const config =
    body && typeof body === 'object' && 'data' in body
      ? (
          body as {
            data?: {
              mcp?: {
                servers?: McpServerConfig[]
                client?: Partial<McpClientConfig>
              }
            }
          }
        ).data
      : (body as {
          mcp?: {
            servers?: McpServerConfig[]
            client?: Partial<McpClientConfig>
          }
        })
  return config?.mcp
}

export type McpServerConfig =
  | {
      transport: 'stdio'
      name: string
      enabled: boolean
      command: string
      args: string[]
      env?: Record<string, string>
      disabledTools?: string[]
    }
  | {
      transport: 'sse' | 'http'
      name: string
      enabled: boolean
      url: string
      headers?: Record<string, string>
      disabledTools?: string[]
    }

export interface McpApi {
  list: () => Promise<McpServerStatus[]>
  listConfig: () => Promise<McpServerConfig[]>
  getClientConfig: () => Promise<McpClientConfig>
  updateClientConfig: (client: McpClientConfig) => Promise<void>
  upsert: (config: McpServerConfig) => Promise<void>
  remove: (name: string) => Promise<void>
  setEnabled: (name: string, enabled: boolean) => Promise<void>
  searchMarketplace: (query: string) => Promise<McpServerTemplate[]>
  install: (
    name: string,
    marketplace?: string,
    variables?: Record<string, string>,
  ) => Promise<McpInstallResult>
  listMarketplaces: () => Promise<McpMarketplace[]>
  addMarketplace: (name: string, url: string) => Promise<McpMarketplace>
  removeMarketplace: (name: string) => Promise<{ removed: boolean }>
  setDisabledTools: (name: string, disabledTools: string[]) => Promise<void>
  metrics: (server: string) => Promise<McpServerMetrics | null>
}

export async function createMcpApi(transport: Transport): Promise<McpApi> {
  const http = await makeHttp(transport)
  return {
    list: async () => {
      const body = await getJson<unknown>(http, '/mcp/servers', 'mcp')
      const list = Array.isArray(body)
        ? (body as McpServerStatus[])
        : ((body as { data?: McpServerStatus[] }).data ?? [])
      return list
    },
    listConfig: async () => {
      const body = await getJson<unknown>(http, '/config', 'config')
      return readMcpConfig(body)?.servers ?? []
    },
    getClientConfig: async () => {
      const body = await getJson<unknown>(http, '/config', 'config')
      return withMcpClientDefaults(readMcpConfig(body)?.client)
    },
    updateClientConfig: (client) =>
      sendJson<void>(http, 'PUT', '/config', { 'mcp.client': client }, 'config'),
    upsert: (config) => sendJson<void>(http, 'POST', '/config/mcp/servers', config, 'mcp'),
    remove: (name) =>
      sendJson<void>(http, 'DELETE', `/config/mcp/servers/${encodeURIComponent(name)}`, {}, 'mcp'),
    setEnabled: (name, enabled) =>
      sendJson<void>(
        http,
        'POST',
        `/config/mcp/servers/${encodeURIComponent(name)}/enable`,
        { enabled },
        'mcp',
      ),
    searchMarketplace: async (query) => {
      const body = await getJson<unknown>(
        http,
        `/mcp/marketplace/search?q=${encodeURIComponent(query)}`,
        'mcp',
      )
      return Array.isArray(body)
        ? (body as McpServerTemplate[])
        : ((body as { data?: McpServerTemplate[] }).data ?? [])
    },
    install: async (name, marketplace, variables) => {
      const body = await sendJson<unknown>(
        http,
        'POST',
        '/mcp/install',
        { name, marketplace, variables },
        'mcp',
      )
      const envelope = body as { data?: McpInstallResult } | null | undefined
      return envelope?.data ?? (body as McpInstallResult)
    },
    listMarketplaces: async () => {
      const body = await getJson<unknown>(http, '/mcp/marketplaces', 'mcp')
      return Array.isArray(body)
        ? (body as McpMarketplace[])
        : ((body as { data?: McpMarketplace[] }).data ?? [])
    },
    addMarketplace: async (name, url) => {
      const body = await sendJson<unknown>(http, 'POST', '/mcp/marketplaces', { name, url }, 'mcp')
      const envelope = body as { data?: McpMarketplace } | null | undefined
      return envelope?.data ?? (body as McpMarketplace)
    },
    removeMarketplace: async (name) => {
      const body = await sendJson<unknown>(
        http,
        'DELETE',
        `/mcp/marketplaces/${encodeURIComponent(name)}`,
        {},
        'mcp',
      )
      const envelope = body as { data?: { removed: boolean } } | null | undefined
      return envelope?.data ?? (body as { removed: boolean })
    },
    setDisabledTools: (name, disabledTools) =>
      sendJson<void>(
        http,
        'POST',
        `/config/mcp/servers/${encodeURIComponent(name)}/disabled-tools`,
        { disabledTools },
        'mcp',
      ),
    metrics: async (server) => {
      const r = await fetch(http.url(`/mcp/metrics/${encodeURIComponent(server)}`), {
        headers: http.headers(),
      })
      if (r.status === 404) return null
      if (r.status === 503) throw new CapabilityUnavailableError('mcp')
      if (!r.ok) throw new Error(`mcp metrics failed (${r.status})`)
      const body = (await r.json()) as McpServerMetrics | { data?: McpServerMetrics }
      const entry =
        'data' in (body as { data?: McpServerMetrics }) &&
        (body as { data?: McpServerMetrics }).data
          ? (body as { data: McpServerMetrics }).data
          : (body as McpServerMetrics)
      return entry ?? null
    },
  }
}
