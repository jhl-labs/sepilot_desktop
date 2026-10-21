import { getJson, makeHttp } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface ToolCatalogItem {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  enabled: boolean
  source: 'builtin' | 'plugin'
  recommended: boolean
  defaultExposure: boolean
  exposureGroup: string | null
}

export interface ToolsApi {
  list: () => Promise<ToolCatalogItem[]>
}

type ToolCatalogWireItem = Omit<ToolCatalogItem, 'defaultExposure' | 'exposureGroup'> & {
  defaultExposure?: unknown
  exposureGroup?: unknown
}

const LEGACY_DEFAULT_PERSONAL_TOOLS = new Set([
  'question',
  'skill',
  'todowrite',
  'self.info',
  'system.info',
  'usage.report',
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_cancel',
  'schedule_get',
  'schedule_runs',
  'schedule_pause',
  'schedule_resume',
  'schedule_run_now',
  'memory.remember',
  'memory.list',
  'memory.search',
  'memory.graph.search',
  'memory.graph.neighbors',
  'memory.graph.page',
  'memory.forget',
])

export function normalizeToolCatalog(items: readonly ToolCatalogWireItem[]): ToolCatalogItem[] {
  return items.map((tool) => ({
    ...tool,
    defaultExposure: typeof tool.defaultExposure === 'boolean'
      ? tool.defaultExposure
      : LEGACY_DEFAULT_PERSONAL_TOOLS.has(tool.name),
    exposureGroup: typeof tool.exposureGroup === 'string' || tool.exposureGroup === null
      ? tool.exposureGroup
      : null,
  }))
}

export async function createToolsApi(transport: Transport): Promise<ToolsApi> {
  const http = await makeHttp(transport)
  return {
    list: async () => normalizeToolCatalog(
      await getJson<ToolCatalogWireItem[]>(http, '/api/v1/tools', 'tools'),
    ),
  }
}
