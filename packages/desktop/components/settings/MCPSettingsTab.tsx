'use client'
import { useEffect, useState } from 'react'
import { confirm } from '@/lib/utils/confirm'
import {
  BookOpen,
  Building2,
  ExternalLink,
  Github,
  Info,
  ListChecks,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { useCapabilityResource } from '@/lib/hooks/use-capability-resource'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import {
  createDefaultMcpClientConfig,
  createMcpApi,
  type McpClientConfig,
  type McpMarketplace,
  type McpServerConfig,
  type McpServerMetrics,
  type McpServerStatus,
  type McpServerTemplate,
  type McpServerTemplateVariable,
} from '@/lib/api/mcp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { McpServerDetailDialog } from './McpServerDetailDialog'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'mcp',
  section: 'tools',
  label: 'MCP',
  search: ['mcp', 'tool', 'server'],
  render: () => <MCPSettingsTab />,
})

type Transport = McpServerConfig['transport']

interface EditingState {
  originalName?: string
  name: string
  enabled: boolean
  transport: Transport
  command: string
  argsText: string
  envText: string
  url: string
  headersText: string
  disabledTools: string[]
}

function emptyEditing(): EditingState {
  return {
    name: '',
    enabled: true,
    transport: 'stdio',
    command: '',
    argsText: '',
    envText: '',
    url: '',
    headersText: '',
    disabledTools: [],
  }
}

function formatKeyValueText(record: Record<string, string> | undefined): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

const REDACTED_LITERAL = '***redacted***'

interface QuickConnector {
  name: string
  marketplace: string
  label: string
  description: string
  icon: LucideIcon
  tags: string[]
  homepage?: string
  variables?: McpServerTemplateVariable[]
}

const QUICK_CONNECTORS: QuickConnector[] = [
  {
    name: 'notion',
    marketplace: 'builtin',
    label: 'Notion',
    description: 'Workspace docs, databases, tasks, and project notes.',
    icon: BookOpen,
    tags: ['docs', 'tasks'],
    homepage: 'https://developers.notion.com/guides/mcp/mcp',
  },
  {
    name: 'github',
    marketplace: 'builtin',
    label: 'GitHub',
    description: 'Repositories, issues, pull requests, and code context.',
    icon: Github,
    tags: ['code', 'prs'],
    homepage: 'https://github.com/github/github-mcp-server',
  },
  {
    name: 'linear',
    marketplace: 'builtin',
    label: 'Linear',
    description: 'Issues, projects, cycles, comments, and planning.',
    icon: ListChecks,
    tags: ['issues', 'planning'],
    homepage: 'https://linear.app/docs/mcp',
  },
  {
    name: 'atlassian',
    marketplace: 'builtin',
    label: 'Atlassian',
    description: 'Jira, Confluence, Compass, and project knowledge.',
    icon: Building2,
    tags: ['jira', 'confluence'],
    homepage:
      'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/',
  },
  {
    name: 'slack-mcp',
    marketplace: 'builtin',
    label: 'Slack MCP',
    description: 'Workspace search, channel history, messages, and canvases.',
    icon: MessageSquare,
    tags: ['chat', 'history'],
    homepage: 'https://docs.slack.dev/ai/mcp-server/',
  },
  {
    name: 'google-workspace-remote',
    marketplace: 'builtin',
    label: 'Google Workspace',
    description: 'Gmail, Calendar, Drive, Docs, Sheets, and Slides endpoint.',
    icon: Mail,
    tags: ['gmail', 'calendar'],
    variables: [
      {
        name: 'GOOGLE_WORKSPACE_MCP_URL',
        label: 'Endpoint URL',
        placeholder: 'https://...',
        required: true,
      },
    ],
  },
  {
    name: 'email-remote',
    marketplace: 'builtin',
    label: 'Email Remote',
    description: 'Gmail, Outlook, IMAP, or SMTP MCP endpoint.',
    icon: Mail,
    tags: ['email', 'inbox'],
    variables: [
      {
        name: 'EMAIL_MCP_URL',
        label: 'Endpoint URL',
        placeholder: 'https://...',
        required: true,
      },
    ],
  },
  {
    name: 'zapier-remote',
    marketplace: 'builtin',
    label: 'Zapier',
    description: 'CRM, email, calendar, and SaaS automation endpoint.',
    icon: Workflow,
    tags: ['automation', 'saas'],
    variables: [
      {
        name: 'ZAPIER_MCP_URL',
        label: 'Endpoint URL',
        placeholder: 'https://...',
        required: true,
      },
    ],
  },
]

function countRedactedRows(text: string): number {
  let count = 0
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const value = line.slice(eq + 1).trim()
    if (value === REDACTED_LITERAL) count += 1
  }
  return count
}

function parseKeyValueText(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return separator >= 0
          ? [line.slice(0, separator).trim(), line.slice(separator + 1)]
          : [line, '']
      })
      .filter(([key]) => key.length > 0),
  )
}

function statusToEditing(status: McpServerStatus, config?: McpServerConfig): EditingState {
  const transport: Transport =
    status.transport === 'sse' || status.transport === 'http' ? status.transport : 'stdio'
  const disabledTools = config?.disabledTools ?? status.disabledTools ?? []
  const args = config?.transport === 'stdio' ? config.args : (status.args ?? [])
  return {
    originalName: status.name,
    name: status.name,
    enabled: status.enabled,
    transport,
    command: config?.transport === 'stdio' ? config.command : (status.command ?? ''),
    argsText: args.join(' '),
    envText: config?.transport === 'stdio' ? formatKeyValueText(config.env) : '',
    url: config?.transport === 'sse' || config?.transport === 'http' ? config.url : '',
    headersText:
      config?.transport === 'sse' || config?.transport === 'http'
        ? formatKeyValueText(config.headers)
        : '',
    disabledTools,
  }
}

function buildConfig(state: EditingState): McpServerConfig | null {
  if (!state.name.trim()) return null
  if (state.transport === 'stdio') {
    if (!state.command.trim()) return null
    return {
      transport: 'stdio',
      name: state.name.trim(),
      enabled: state.enabled,
      command: state.command.trim(),
      args: state.argsText
        .split(/\s+/)
        .map((a) => a.trim())
        .filter(Boolean),
      env: parseKeyValueText(state.envText),
      disabledTools: state.disabledTools,
    }
  }
  if (!state.url.trim()) return null
  return {
    transport: state.transport,
    name: state.name.trim(),
    enabled: state.enabled,
    url: state.url.trim(),
    headers: parseKeyValueText(state.headersText),
    disabledTools: state.disabledTools,
  }
}

function formatRootEntries(entries: McpClientConfig['roots']['entries']): string {
  return entries
    .map((entry) => (entry.name ? `${entry.uri} | ${entry.name}` : entry.uri))
    .join('\n')
}

function parseRootEntries(text: string): McpClientConfig['roots']['entries'] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [uriPart, namePart] = line.split('|', 2)
      const uri = uriPart.trim()
      if (!uri.startsWith('file://')) {
        throw new Error('MCP roots는 file:// URI만 사용할 수 있습니다.')
      }
      const name = namePart?.trim()
      return name ? { uri, name } : { uri }
    })
}

function normalizeClientConfig(draft: McpClientConfig, rootEntriesText: string): McpClientConfig {
  const provider = draft.sampling.provider?.trim()
  const model = draft.sampling.model?.trim()
  return {
    roots: {
      enabled: draft.roots.enabled,
      listChanged: draft.roots.listChanged,
      entries: draft.roots.enabled ? parseRootEntries(rootEntriesText) : draft.roots.entries,
    },
    sampling: {
      enabled: draft.sampling.enabled,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      maxTokens: Math.max(1, Math.min(8192, draft.sampling.maxTokens || 1024)),
      ...(draft.sampling.temperature != null
        ? {
            temperature: Math.max(0, Math.min(2, draft.sampling.temperature)),
          }
        : {}),
    },
    elicitation: {
      enabled: draft.elicitation.enabled,
      mode: draft.elicitation.mode,
      applyDefaults: draft.elicitation.applyDefaults,
    },
  }
}

export const __mcpSettingsTesting = {
  buildConfig,
  countRedactedRows,
  parseKeyValueText,
  statusToEditing,
}

export function MCPSettingsTab() {
  const transport = useTransport()
  const state = useCapabilityResource(async () => {
    const api = await createMcpApi(transport)
    const [statuses, configuredServers, clientConfig] = await Promise.all([
      api.list(),
      api.listConfig().catch(() => []),
      api.getClientConfig().catch(() => createDefaultMcpClientConfig()),
    ])
    const marketplaces = await api.listMarketplaces().catch(() => [])
    return { statuses, configuredServers, clientConfig, marketplaces }
  }, [transport])
  const [items, setItems] = useState<McpServerStatus[]>([])
  const [configuredServers, setConfiguredServers] = useState<McpServerConfig[]>([])
  const [clientDraft, setClientDraft] = useState<McpClientConfig>(() =>
    createDefaultMcpClientConfig(),
  )
  const [rootEntriesText, setRootEntriesText] = useState('')
  const [clientSaving, setClientSaving] = useState(false)
  const [marketplaces, setMarketplaces] = useState<McpMarketplace[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyTool, setBusyTool] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<McpServerMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [marketplaceQuery, setMarketplaceQuery] = useState('')
  const [marketplaceResults, setMarketplaceResults] = useState<McpServerTemplate[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [installingTemplate, setInstallingTemplate] = useState<string | null>(null)
  const [templateVariables, setTemplateVariables] = useState<
    Record<string, Record<string, string>>
  >({})
  const [marketplaceName, setMarketplaceName] = useState('')
  const [marketplaceUrl, setMarketplaceUrl] = useState('')
  const [marketplaceBusy, setMarketplaceBusy] = useState<string | null>(null)
  useModalViewportLock(Boolean(editing))

  useEffect(() => {
    if (state.kind === 'ready') {
      setItems(state.data.statuses)
      setConfiguredServers(state.data.configuredServers)
      setClientDraft(state.data.clientConfig)
      setRootEntriesText(formatRootEntries(state.data.clientConfig.roots.entries))
      setMarketplaces(state.data.marketplaces)
    }
  }, [state])

  useEffect(() => {
    if (!detailName) {
      setMetrics(null)
      return
    }
    let cancelled = false
    setMetricsLoading(true)
    void (async () => {
      try {
        const api = await createMcpApi(transport)
        const m = await api.metrics(detailName)
        if (!cancelled) setMetrics(m)
      } catch {
        if (!cancelled) setMetrics(null)
      } finally {
        if (!cancelled) setMetricsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailName, transport, busyTool])

  async function refresh(): Promise<void> {
    try {
      const api = await createMcpApi(transport)
      const [list, configured, clientConfig, marketplaceList] = await Promise.all([
        api.list(),
        api.listConfig().catch(() => []),
        api.getClientConfig().catch(() => createDefaultMcpClientConfig()),
        api.listMarketplaces().catch(() => []),
      ])
      setItems(list)
      setConfiguredServers(configured)
      setClientDraft(clientConfig)
      setRootEntriesText(formatRootEntries(clientConfig.roots.entries))
      setMarketplaces(marketplaceList)
    } catch {
    }
  }

  async function manualRefresh(): Promise<void> {
    setRefreshing(true)
    try {
      await refresh()
      toast.success('MCP 서버 상태를 새로 가져왔습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRefreshing(false)
    }
  }

  async function saveClientConfig(): Promise<void> {
    let next: McpClientConfig
    try {
      next = normalizeClientConfig(clientDraft, rootEntriesText)
    } catch (error) {
      toast.warning(error instanceof Error ? error.message : 'MCP client 설정을 확인하세요.')
      return
    }

    setClientSaving(true)
    try {
      const api = await createMcpApi(transport)
      await api.updateClientConfig(next)
      setClientDraft(next)
      setRootEntriesText(formatRootEntries(next.roots.entries))
      toast.success('MCP client 설정을 저장했습니다.')
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setClientSaving(false)
    }
  }

  async function searchMarketplace(): Promise<void> {
    const query = marketplaceQuery.trim()
    if (!query) {
      toast.warning('검색어를 입력하세요.')
      return
    }

    setMarketplaceLoading(true)
    try {
      const api = await createMcpApi(transport)
      const results = await api.searchMarketplace(query)
      setMarketplaceResults(results)
      if (results.length === 0) {
        toast.info('검색 결과가 없습니다.')
      }
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setMarketplaceLoading(false)
    }
  }

  function templateKey(template: Pick<McpServerTemplate, 'marketplace' | 'name'>): string {
    return `${template.marketplace}:${template.name}`
  }

  function templateVariableValues(
    template: Pick<McpServerTemplate, 'marketplace' | 'name' | 'variables'>,
  ): Record<string, string> | undefined {
    if (!template.variables?.length) return undefined
    const values = templateVariables[templateKey(template)] ?? {}
    const variables: Record<string, string> = {}
    for (const variable of template.variables) {
      const value = values[variable.name]?.trim() ?? ''
      if (variable.required && !value) {
        toast.warning(`${variable.label ?? variable.name} 값을 입력하세요.`)
        return undefined
      }
      if (value) variables[variable.name] = value
    }
    return variables
  }

  function setTemplateVariable(
    template: Pick<McpServerTemplate, 'marketplace' | 'name'>,
    variableName: string,
    value: string,
  ): void {
    const key = templateKey(template)
    setTemplateVariables((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {}),
        [variableName]: value,
      },
    }))
  }

  async function installTemplate(template: McpServerTemplate): Promise<void> {
    const key = templateKey(template)
    const variables = templateVariableValues(template)
    if (template.variables?.length && variables === undefined) return

    setInstallingTemplate(key)
    try {
      const api = await createMcpApi(transport)
      const result = await api.install(template.name, template.marketplace, variables)
      toast.success('MCP 서버를 설치했습니다.', {
        description: result.serverName,
      })
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setInstallingTemplate(null)
    }
  }

  async function addMarketplace(): Promise<void> {
    const name = marketplaceName.trim()
    const url = marketplaceUrl.trim()
    if (!name || !url) {
      toast.warning('Marketplace 이름과 URL을 입력하세요.')
      return
    }

    setMarketplaceBusy(`add:${name}`)
    try {
      const api = await createMcpApi(transport)
      const entry = await api.addMarketplace(name, url)
      toast.success('MCP marketplace를 추가했습니다.', {
        description: entry.name,
      })
      setMarketplaceName('')
      setMarketplaceUrl('')
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setMarketplaceBusy(null)
    }
  }

  async function removeMarketplace(entry: McpMarketplace): Promise<void> {
    const ok = await confirm(`'${entry.name}' MCP marketplace를 삭제하시겠습니까?`, {
      destructive: true,
    })
    if (!ok) return

    setMarketplaceBusy(`remove:${entry.name}`)
    try {
      const api = await createMcpApi(transport)
      const result = await api.removeMarketplace(entry.name)
      if (result.removed) {
        toast.success('MCP marketplace를 삭제했습니다.', {
          description: entry.name,
        })
      } else {
        toast.warning('MCP marketplace를 찾을 수 없습니다.', {
          description: entry.name,
        })
      }
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setMarketplaceBusy(null)
    }
  }

  async function setDisabledTools(serverName: string, nextDisabled: string[]): Promise<void> {
    const current = items.find((s) => s.name === serverName)
    const before = new Set(current?.disabledTools ?? [])
    const after = new Set(nextDisabled)
    const changed = [...before, ...after].find((t) => before.has(t) !== after.has(t))
    setBusyTool(changed ?? null)
    try {
      const api = await createMcpApi(transport)
      await api.setDisabledTools(serverName, nextDisabled)
      setItems((prev) =>
        prev.map((s) => (s.name === serverName ? { ...s, disabledTools: [...nextDisabled] } : s)),
      )
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusyTool(null)
    }
  }

  async function save(): Promise<void> {
    if (!editing) return
    const config = buildConfig(editing)
    if (!config) {
      toast.warning('필수 항목을 모두 입력하세요.')
      return
    }
    setSaving(true)
    try {
      const api = await createMcpApi(transport)
      if (editing.originalName && editing.originalName !== config.name) {
        try {
          await api.remove(editing.originalName)
        } catch {
        }
      }
      await api.upsert(config)
      toast.success(
        editing.originalName ? 'MCP 서버를 수정했습니다.' : 'MCP 서버를 추가했습니다.',
        { description: config.name },
      )
      setEditing(null)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function remove(server: McpServerStatus): Promise<void> {
    const ok = await confirm(`'${server.name}' MCP 서버를 삭제하시겠습니까?`, {
      destructive: true,
    })
    if (!ok) return
    setBusyName(server.name)
    try {
      const api = await createMcpApi(transport)
      await api.remove(server.name)
      toast.success(`MCP 서버 '${server.name}'을 삭제했습니다.`)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusyName(null)
    }
  }

  async function toggle(server: McpServerStatus): Promise<void> {
    setBusyName(server.name)
    try {
      const api = await createMcpApi(transport)
      await api.setEnabled(server.name, !server.enabled)
      toast.success(`${server.name}: ${!server.enabled ? '활성' : '비활성'}`)
      await refresh()
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setBusyName(null)
    }
  }

  if (state.kind === 'unavailable') return <UnimplementedBanner what="MCP" />
  if (state.kind === 'loading' && items.length === 0)
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (state.kind === 'error' && items.length === 0)
    return <p className="text-sm text-red-500">{state.error.message}</p>

  const enabledServers = items.filter((s) => s.enabled)
  const connectedCount = enabledServers.filter((s) => s.status === 'connected').length
  const errorCount = enabledServers.filter((s) => s.status === 'error').length
  const totalTools = enabledServers.reduce((sum, s) => sum + (s.toolCount ?? 0), 0)
  const jumpToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">MCP 서버</h3>
          {enabledServers.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              <span
                className={
                  connectedCount === enabledServers.length
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : connectedCount === 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                }
              >
                {connectedCount}/{enabledServers.length} 연결됨
              </span>
              {errorCount > 0 ? (
                <span className="ml-1 text-red-600 dark:text-red-400">· {errorCount} 에러</span>
              ) : null}
              {totalTools > 0 ? <span className="ml-1">· {totalTools}개 도구</span> : null}
            </span>
          ) : items.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">모두 비활성</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void manualRefresh()}
            disabled={refreshing || saving || busyName != null}
            aria-label="MCP 서버 새로고침"
          >
            <RefreshCcw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(emptyEditing())}>
            <Plus className="mr-1 h-4 w-4" />새 서버
          </Button>
        </div>
      </div>

      <nav
        aria-label="MCP 설정 바로가기"
        className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/20 p-1"
      >
        {[
          ['mcp-servers', `서버 ${items.length}`],
          ['mcp-client', 'Client 권한'],
          ['mcp-connectors', '빠른 설치'],
          ['mcp-marketplace', 'Marketplace'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => jumpToSection(id)}
            className="rounded px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {label}
          </button>
        ))}
      </nav>

      <div id="mcp-client" className="scroll-mt-3 rounded-md border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold">Daemon MCP client</h4>
            <p className="text-[11px] text-muted-foreground">
              MCP 서버가 daemon에 요청할 수 있는 client capability를 설정합니다.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void saveClientConfig()}
            disabled={clientSaving}
            aria-label="MCP client 설정 저장"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {clientSaving ? '저장 중…' : '저장'}
          </Button>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <label className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-background p-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={clientDraft.roots.enabled}
              onChange={(event) =>
                setClientDraft((current) => ({
                  ...current,
                  roots: {
                    ...current.roots,
                    enabled: event.target.checked,
                  },
                }))
              }
              disabled={clientSaving}
              aria-label="MCP roots 활성화"
            />
            <span className="min-w-0">
              <span className="block font-medium">Roots</span>
              <span className="block text-xs text-muted-foreground">
                서버의 roots/list 요청에 등록된 file URI를 응답합니다.
              </span>
            </span>
          </label>

          <label className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-background p-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={clientDraft.sampling.enabled}
              onChange={(event) =>
                setClientDraft((current) => ({
                  ...current,
                  sampling: {
                    ...current.sampling,
                    enabled: event.target.checked,
                  },
                }))
              }
              disabled={clientSaving}
              aria-label="MCP sampling 활성화"
            />
            <span className="min-w-0">
              <span className="block font-medium">Sampling</span>
              <span className="block text-xs text-muted-foreground">
                서버가 daemon LLM provider로 sampling/createMessage를 요청할 수 있습니다.
              </span>
            </span>
          </label>

          <label className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-background p-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={clientDraft.elicitation.enabled}
              onChange={(event) =>
                setClientDraft((current) => ({
                  ...current,
                  elicitation: {
                    ...current.elicitation,
                    enabled: event.target.checked,
                  },
                }))
              }
              disabled={clientSaving}
              aria-label="MCP elicitation 활성화"
            />
            <span className="min-w-0">
              <span className="block font-medium">Elicitation</span>
              <span className="block text-xs text-muted-foreground">
                서버의 사용자 입력 요청을 daemon 정책에 따라 처리합니다.
              </span>
            </span>
          </label>
        </div>

        {clientDraft.roots.enabled ? (
          <label className="mt-3 flex flex-col gap-1 text-xs">
            Roots entries
            <textarea
              className="min-h-20 rounded-md border border-input bg-background px-2 py-2 font-mono text-sm"
              value={rootEntriesText}
              onChange={(event) => setRootEntriesText(event.target.value)}
              placeholder={'file:///C:/Users/qmoix/git/sepilotd | sepilotd'}
              disabled={clientSaving}
              aria-label="MCP root entries"
            />
          </label>
        ) : null}

        {clientDraft.sampling.enabled ? (
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              Provider
              <Input
                type="text"
                value={clientDraft.sampling.provider ?? ''}
                onChange={(event) =>
                  setClientDraft((current) => ({
                    ...current,
                    sampling: {
                      ...current.sampling,
                      provider: event.target.value,
                    },
                  }))
                }
                placeholder="default"
                disabled={clientSaving}
                aria-label="Sampling provider"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              Model
              <Input
                type="text"
                value={clientDraft.sampling.model ?? ''}
                onChange={(event) =>
                  setClientDraft((current) => ({
                    ...current,
                    sampling: {
                      ...current.sampling,
                      model: event.target.value,
                    },
                  }))
                }
                placeholder="provider default"
                disabled={clientSaving}
                aria-label="Sampling model"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              Max tokens
              <Input
                type="number"
                min={1}
                max={8192}
                value={clientDraft.sampling.maxTokens}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setClientDraft((current) => ({
                    ...current,
                    sampling: {
                      ...current.sampling,
                      maxTokens: Number.isFinite(value) ? value : current.sampling.maxTokens,
                    },
                  }))
                }}
                disabled={clientSaving}
                aria-label="Sampling max tokens"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              Temperature
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={clientDraft.sampling.temperature ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  const value = raw ? Number(raw) : undefined
                  setClientDraft((current) => ({
                    ...current,
                    sampling: {
                      ...current.sampling,
                      temperature:
                        value == null || Number.isFinite(value)
                          ? value
                          : current.sampling.temperature,
                    },
                  }))
                }}
                placeholder="default"
                disabled={clientSaving}
                aria-label="Sampling temperature"
              />
            </label>
          </div>
        ) : null}

        {clientDraft.elicitation.enabled ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              Elicitation mode
              <select
                value={clientDraft.elicitation.mode}
                onChange={(event) =>
                  setClientDraft((current) => ({
                    ...current,
                    elicitation: {
                      ...current.elicitation,
                      mode: event.target.value as McpClientConfig['elicitation']['mode'],
                    },
                  }))
                }
                disabled={clientSaving}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                aria-label="Elicitation mode"
              >
                <option value="decline">decline</option>
                <option value="accept-defaults">accept-defaults</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-xs">
              <input
                type="checkbox"
                checked={clientDraft.elicitation.applyDefaults}
                onChange={(event) =>
                  setClientDraft((current) => ({
                    ...current,
                    elicitation: {
                      ...current.elicitation,
                      applyDefaults: event.target.checked,
                    },
                  }))
                }
                disabled={clientSaving}
                aria-label="Elicitation defaults 적용"
              />
              기본값 자동 적용
            </label>
          </div>
        ) : null}
      </div>

      <div id="mcp-connectors" className="scroll-mt-3 rounded-md border border-border bg-muted/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold">빠른 커넥터</h4>
            <p className="text-[11px] text-muted-foreground">
              기본 제공 템플릿으로 자주 쓰는 MCP 커넥터를 설치합니다.
            </p>
          </div>
          <span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
            builtin
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {QUICK_CONNECTORS.map((connector) => {
            const Icon = connector.icon
            const template: McpServerTemplate = {
              name: connector.name,
              marketplace: connector.marketplace,
              description: connector.description,
              transport: 'stdio',
              tags: connector.tags,
              homepage: connector.homepage,
              variables: connector.variables,
            }
            const key = templateKey(template)
            const installing = installingTemplate === key
            const installed = items.find((server) => server.name === connector.name)
            return (
              <div
                key={key}
                className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-background p-2 text-sm"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 rounded bg-muted p-1.5 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{connector.label}</span>
                      {connector.homepage ? (
                        <a
                          href={connector.homepage}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${connector.label} 문서 열기`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{connector.description}</p>
                  </div>
                </div>
                {connector.variables?.map((variable) => (
                  <label key={variable.name} className="flex min-w-0 flex-col gap-1 text-[11px]">
                    {variable.label ?? variable.name}
                    <Input
                      type={variable.secret ? 'password' : 'url'}
                      value={templateVariables[key]?.[variable.name] ?? ''}
                      aria-label={`${connector.label} ${variable.label ?? variable.name}`}
                      placeholder={variable.placeholder ?? variable.name}
                      onChange={(event) =>
                        setTemplateVariable(template, variable.name, event.target.value)
                      }
                      disabled={installingTemplate != null}
                    />
                  </label>
                ))}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span
                    className={
                      installed?.status === 'connected'
                        ? 'text-[11px] text-emerald-600 dark:text-emerald-400'
                        : installed?.status === 'error'
                          ? 'text-[11px] text-red-600 dark:text-red-400'
                          : 'text-[11px] text-muted-foreground'
                    }
                  >
                    {installed ? installed.status : connector.tags.join(', ')}
                  </span>
                  <Button
                    size="sm"
                    variant={installed ? 'outline' : 'default'}
                    onClick={() => void installTemplate(template)}
                    disabled={installingTemplate != null}
                    aria-label={`Install ${connector.label} connector`}
                  >
                    {installing ? '설치 중…' : installed ? '다시 설치' : '설치'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div id="mcp-marketplace" className="scroll-mt-3 rounded-md border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            Marketplace 검색
            <Input
              type="search"
              value={marketplaceQuery}
              placeholder="playwright, github, slack..."
              onChange={(e) => setMarketplaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchMarketplace()
              }}
              disabled={marketplaceLoading}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void searchMarketplace()}
            disabled={marketplaceLoading}
          >
            {marketplaceLoading ? '검색 중…' : '검색'}
          </Button>
        </div>
        {marketplaceResults.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {marketplaceResults.map((template) => {
              const installing = installingTemplate === `${template.marketplace}:${template.name}`
              return (
                <div
                  key={`${template.marketplace}:${template.name}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{template.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {template.transport}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {template.marketplace}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                    {(template.tags ?? []).length > 0 ? (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {(template.tags ?? []).join(', ')}
                      </p>
                    ) : null}
                    {template.variables?.length ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {template.variables.map((variable) => (
                          <label
                            key={variable.name}
                            className="flex min-w-0 flex-col gap-1 text-[11px]"
                          >
                            {variable.label ?? variable.name}
                            <Input
                              type={variable.secret ? 'password' : 'url'}
                              value={
                                templateVariables[`${template.marketplace}:${template.name}`]?.[
                                  variable.name
                                ] ?? ''
                              }
                              aria-label={`${template.name} ${variable.label ?? variable.name}`}
                              placeholder={variable.placeholder ?? variable.name}
                              onChange={(event) =>
                                setTemplateVariable(template, variable.name, event.target.value)
                              }
                              disabled={installingTemplate != null}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void installTemplate(template)}
                    disabled={installingTemplate != null}
                  >
                    {installing ? '설치 중…' : '설치'}
                  </Button>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold">Marketplace 관리</h4>
            <p className="text-[11px] text-muted-foreground">
              검색과 설치에 사용할 MCP server catalog를 관리합니다.
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground">{marketplaces.length}개</span>
        </div>
        {marketplaces.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {marketplaces.map((entry) => {
              const removing = marketplaceBusy === `remove:${entry.name}`
              return (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{entry.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{entry.url}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {entry.lastSync ? `synced ${entry.lastSync}` : '아직 동기화 전'}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void removeMarketplace(entry)}
                    disabled={marketplaceBusy != null}
                    aria-label={`${entry.name} marketplace 삭제`}
                    title="Marketplace 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">{removing ? '삭제 중' : '삭제'}</span>
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">등록된 MCP marketplace가 없습니다.</p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            이름
            <Input
              type="text"
              value={marketplaceName}
              placeholder="local"
              onChange={(e) => setMarketplaceName(e.target.value)}
              disabled={marketplaceBusy != null}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            URL
            <Input
              type="url"
              value={marketplaceUrl}
              placeholder="https://github.com/org/mcp-marketplace.git"
              onChange={(e) => setMarketplaceUrl(e.target.value)}
              disabled={marketplaceBusy != null}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void addMarketplace()}
            disabled={marketplaceBusy != null || !marketplaceName.trim() || !marketplaceUrl.trim()}
          >
            {marketplaceBusy?.startsWith('add:') ? '추가 중…' : '추가'}
          </Button>
        </div>
      </div>

      <div id="mcp-servers" className="flex scroll-mt-3 flex-col gap-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-4 text-center text-[13px] text-muted-foreground">
            <p>등록된 MCP 서버가 없습니다.</p>
            <Button size="sm" variant="outline" onClick={() => setEditing(emptyEditing())}>
              <Plus className="mr-1 h-3.5 w-3.5" />첫 서버 추가
            </Button>
          </div>
        ) : (
          items.map((s) => {
            const isBusy = busyName === s.name
            const subtitle =
              s.command != null
                ? `stdio · ${s.command}${s.args && s.args.length > 0 ? ' ' + s.args.join(' ') : ''}`
                : s.transport
            return (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                  <div className="mt-0.5 text-[11px]">
                    <span
                      className={
                        s.status === 'connected'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : s.status === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }
                    >
                      {s.status}
                    </span>
                    <span className="text-muted-foreground"> · {s.toolCount}개 도구</span>
                    {s.error ? (
                      <span className="text-red-600 dark:text-red-400"> · {s.error}</span>
                    ) : null}
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setDetailName(s.name)}
                    disabled={isBusy}
                    aria-label={`${s.name} 상세`}
                    title="상세 보기"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={s.enabled ? 'outline' : 'default'}
                    onClick={() => void toggle(s)}
                    disabled={isBusy}
                  >
                    {s.enabled ? '비활성' : '활성'}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() =>
                      setEditing(
                        statusToEditing(
                          s,
                          configuredServers.find((server) => server.name === s.name),
                        ),
                      )
                    }
                    disabled={isBusy}
                    aria-label={`${s.name} 편집`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void remove(s)}
                    disabled={isBusy}
                    aria-label={`${s.name} 삭제`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing.originalName ? 'MCP 서버 편집' : '새 MCP 서버'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
          onClick={() => (saving ? null : setEditing(null))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">
                {editing.originalName ? 'MCP 서버 편집' : '새 MCP 서버'}
              </h3>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3">
            <label className="flex flex-col gap-1 text-xs">
              이름
              <Input
                type="text"
                autoFocus
                value={editing.name}
                onChange={(e) =>
                  setEditing((curr) => (curr ? { ...curr, name: e.target.value } : curr))
                }
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Transport
              <select
                value={editing.transport}
                onChange={(e) =>
                  setEditing((curr) =>
                    curr ? { ...curr, transport: e.target.value as Transport } : curr,
                  )
                }
                disabled={saving}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
              </select>
            </label>
            {editing.transport === 'stdio' ? (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  Command
                  <Input
                    type="text"
                    placeholder="예: npx"
                    value={editing.command}
                    onChange={(e) =>
                      setEditing((curr) => (curr ? { ...curr, command: e.target.value } : curr))
                    }
                    disabled={saving}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Args (공백 구분)
                  <Input
                    type="text"
                    placeholder="-y @modelcontextprotocol/server-everything"
                    value={editing.argsText}
                    onChange={(e) =>
                      setEditing((curr) => (curr ? { ...curr, argsText: e.target.value } : curr))
                    }
                    disabled={saving}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-2">
                    <span>Env (KEY=VALUE, 한 줄에 하나)</span>
                    {countRedactedRows(editing.envText) > 0 ? (
                      <span
                        className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                        title={`${REDACTED_LITERAL} 으로 표시된 값은 daemon에 저장된 secret이 유지된다. 새 값으로 바꾸면 회전된다.`}
                      >
                        🔒 {countRedactedRows(editing.envText)} secret 보존됨
                      </span>
                    ) : null}
                  </span>
                  <textarea
                    className="min-h-20 rounded-md border border-input bg-transparent px-2 py-2 font-mono text-sm"
                    placeholder={'MCP_TOKEN=${MCP_TOKEN}\nGITHUB_TOKEN=***redacted***'}
                    value={editing.envText}
                    onChange={(e) =>
                      setEditing((curr) => (curr ? { ...curr, envText: e.target.value } : curr))
                    }
                    disabled={saving}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  URL
                  <Input
                    type="url"
                    placeholder="https://example.com/mcp"
                    value={editing.url}
                    onChange={(e) =>
                      setEditing((curr) => (curr ? { ...curr, url: e.target.value } : curr))
                    }
                    disabled={saving}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-2">
                    <span>Headers (KEY=VALUE, 한 줄에 하나)</span>
                    {countRedactedRows(editing.headersText) > 0 ? (
                      <span
                        className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                        title={`${REDACTED_LITERAL} 으로 표시된 값은 daemon에 저장된 secret이 유지된다. 새 값으로 바꾸면 회전된다.`}
                      >
                        🔒 {countRedactedRows(editing.headersText)} secret 보존됨
                      </span>
                    ) : null}
                  </span>
                  <textarea
                    className="min-h-20 rounded-md border border-input bg-transparent px-2 py-2 font-mono text-sm"
                    placeholder={'Authorization=Bearer ${MCP_TOKEN}\nX-API-Key=***redacted***'}
                    value={editing.headersText}
                    onChange={(e) =>
                      setEditing((curr) => (curr ? { ...curr, headersText: e.target.value } : curr))
                    }
                    disabled={saving}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) =>
                  setEditing((curr) => (curr ? { ...curr, enabled: e.target.checked } : curr))
                }
                disabled={saving}
              />
              저장 시 즉시 활성화
            </label>
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={saving || !buildConfig(editing)}
              >
                {saving ? '저장 중…' : '저장'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      <McpServerDetailDialog
        open={detailName != null}
        server={items.find((s) => s.name === detailName) ?? null}
        onClose={() => setDetailName(null)}
        onSetDisabledTools={(name, next) => setDisabledTools(name, next)}
        busyTool={busyTool}
        metrics={metrics}
        metricsLoading={metricsLoading}
      />
    </div>
  )
}
