import { makeDaemonRequestContext } from './_daemon'
import type { Transport } from '@/lib/transport/transport-adapter'
import type { SkillItem } from '@/lib/store/skills-store'

interface InstalledSkillSummary {
  name: string
  version: string
}

interface InstallSkillResponse {
  installed: InstalledSkillSummary[]
}

type SkillAutonomyLevel =
  | 'readonly'
  | 'accept-edits'
  | 'workspace-write'
  | 'supervised'
  | 'autonomous'

interface SkillSourceRecord {
  type: 'marketplace' | 'git' | 'url'
  ref: string
}

export interface SkillInstallPreviewCandidate {
  metadata: {
    id: string
    name: string
    version: string
    description: string
    author?: string
    tags?: string[]
    tools: string[]
    autonomy_required?: SkillAutonomyLevel
    risk_tier?: 'low' | 'medium' | 'high'
    permissions?: {
      tools?: string[]
      network?: string[]
      files?: string[]
    }
    source?: SkillSourceRecord
  }
  source: SkillSourceRecord
}

export interface SkillInstallPreview {
  digest: string
  candidates: SkillInstallPreviewCandidate[]
}

export interface SkillInstallOptions {
  expectedDigest: string
  force?: boolean
}

interface MarketplaceSkillMetadata {
  id?: string
  name: string
  version?: string
  description?: string | null
  author?: string
  tags?: string[]
  tools?: string[]
}

interface SkillMetadata {
  id: string
  name: string
  version: string
  description: string
  author?: string
  tags?: string[]
  tools: string[]
  autonomy_required?: SkillAutonomyLevel
  enabled?: boolean
  source?: { type: 'marketplace' | 'git' | 'url'; ref: string }
  provenance?: {
    source?: { type: 'marketplace' | 'git' | 'url'; ref: string }
  }
}

export interface MarketplaceSkillSearchResult {
  marketplace: string
  source: string
  metadata: MarketplaceSkillMetadata
  installed: boolean
}

export interface SkillDetail {
  metadata: {
    id: string
    name: string
    version: string
    description: string
    author?: string
    tags?: string[]
    tools?: string[]
    source?: { type: 'marketplace' | 'git' | 'url'; ref: string }
  }
  content: string
}

export interface SkillCreateInput {
  metadata: {
    id: string
    name: string
    version: string
    description: string
    author?: string
    tags?: string[]
    tools?: string[]
    autonomy_required?:
      | 'readonly'
      | 'accept-edits'
      | 'workspace-write'
      | 'supervised'
      | 'autonomous'
  }
  content: string
  force?: boolean
}

export interface SkillsApi {
  list: () => Promise<SkillItem[]>
  get: (id: string) => Promise<SkillDetail>
  setEnabled: (name: string, enabled: boolean) => Promise<void>
  searchMarketplace: (
    query: string,
    options?: { marketplace?: string; limit?: number },
  ) => Promise<MarketplaceSkillSearchResult[]>
  previewInstall: (source: string) => Promise<SkillInstallPreview>
  install: (source: string, options: SkillInstallOptions) => Promise<InstallSkillResponse>
  uninstall: (name: string) => Promise<void>
  create: (input: SkillCreateInput) => Promise<{ id: string; version: string }>
}

export async function createSkillsApi(transport: Transport): Promise<SkillsApi> {
  const daemon = await makeDaemonRequestContext(transport)

  async function errorText(response: Response, path: string): Promise<string> {
    const fallback = `${path} failed (${response.status})`
    const raw = await response.text().catch(() => '')
    if (!raw.trim()) return fallback
    try {
      const payload = JSON.parse(raw) as { error?: { code?: unknown; message?: unknown } }
      const code = typeof payload.error?.code === 'string' ? payload.error.code : undefined
      const message = typeof payload.error?.message === 'string' ? payload.error.message : undefined
      if (code && message) return `${fallback}: ${code}: ${message}`
      if (message) return `${fallback}: ${message}`
    } catch {
    }
    return `${fallback}: ${raw.trim()}`
  }

  async function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(daemon.url(path), {
      method,
      headers: daemon.headers(),
      body: body == null ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(await errorText(response, path))
    }
    if (response.status === 204) return undefined as T
    const payload = await response.json()
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
      return (payload as { data: T }).data
    }
    return payload as T
  }

  function mapSkillItem(skill: SkillMetadata): SkillItem {
    return {
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      author: skill.author,
      tags: skill.tags,
      tools: skill.tools,
      enabled: skill.enabled !== false,
      source: skill.source ?? skill.provenance?.source,
      path: skill.source?.ref ?? skill.provenance?.source?.ref,
    }
  }

  return {
    list: async () => {
      const skills = await requestJson<SkillMetadata[]>(
        'GET',
        '/skills?includeDisabled=true&includeBuiltins=false',
      )
      return skills.map(mapSkillItem)
    },
    get: (id) => requestJson<SkillDetail>('GET', `/skills/${encodeURIComponent(id)}`),
    setEnabled: (name, enabled) =>
      requestJson<void>(
        'POST',
        `/skills/${encodeURIComponent(name)}/${enabled ? 'enable' : 'disable'}`,
        {},
      ),
    searchMarketplace: (query, options = {}) => {
      const params = new URLSearchParams({ query })
      if (options.marketplace) params.set('marketplace', options.marketplace)
      if (options.limit) params.set('limit', String(options.limit))
      return requestJson<MarketplaceSkillSearchResult[]>(
        'GET',
        `/skills/marketplace/search?${params.toString()}`,
      )
    },
    previewInstall: (source) =>
      requestJson<SkillInstallPreview>('POST', '/skills/install/preview', { source }),
    install: (source, options) =>
      requestJson<InstallSkillResponse>('POST', '/skills/install', {
        source,
        expectedDigest: options.expectedDigest,
        ...(options.force ? { force: true } : {}),
      }),
    uninstall: (name) => requestJson<void>('DELETE', `/skills/${encodeURIComponent(name)}`),
    create: (input) =>
      requestJson<{ id: string; version: string }>('POST', '/skills/create', input),
  }
}
