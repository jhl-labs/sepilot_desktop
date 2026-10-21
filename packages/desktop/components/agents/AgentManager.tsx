'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DaemonAgentDescriptor,
  DaemonAgentGraphSnapshot,
  DaemonUserAgentInput,
} from '@sepilotd/api-client'
import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTransport } from '@/components/providers/transport-provider'
import { createAgentsApi } from '@/lib/api/agents'
import { confirm } from '@/lib/utils/confirm'
import { explainChatStreamError } from '@/lib/utils/friendly-error'

interface AgentForm {
  id: string
  name: string
  description: string
  base: string
  model: string
  temperature: string
  topP: string
  maxTokens: string
  maxIterations: string
  systemPrompt: string
}

const DEFAULT_FORM: AgentForm = {
  id: '',
  name: '',
  description: '',
  base: 'enhanced',
  model: '',
  temperature: '',
  topP: '',
  maxTokens: '',
  maxIterations: '',
  systemPrompt: '',
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
]

const SYSTEM_INFO_PATTERNS = [
  /\b(?:home|users)\/[A-Za-z0-9._-]+/i,
  /\b[A-Za-z0-9._-]+@[A-Za-z0-9._-]+\b/,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
]

export function findAgentPromptWarnings(prompt: string): string[] {
  const warnings: string[] = []
  if (SECRET_PATTERNS.some((pattern) => pattern.test(prompt))) {
    warnings.push('credential 또는 token처럼 보이는 값이 포함되어 있습니다.')
  }
  if (SYSTEM_INFO_PATTERNS.some((pattern) => pattern.test(prompt))) {
    warnings.push('사용자명, host, IP 같은 로컬 시스템 정보처럼 보이는 값이 있습니다.')
  }
  return warnings
}

function parseOptionalNumber(
  value: string,
  label: string,
  min: number,
  max: number,
): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label}은 ${min} 이상 ${max} 이하의 숫자여야 합니다.`)
  }
  return parsed
}

function parseOptionalPositiveInteger(value: string, label: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label}은 1 이상의 정수여야 합니다.`)
  }
  return parsed
}

function buildUserAgentInput(form: AgentForm): DaemonUserAgentInput {
  const id = form.id.trim()
  const description = form.description.trim()
  const systemPrompt = form.systemPrompt.trim()
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(id)) {
    throw new Error('id는 영문/숫자로 시작하고 영문, 숫자, -, _만 쓸 수 있습니다.')
  }
  if (!description) throw new Error('description은 필수입니다.')
  if (!systemPrompt) throw new Error('system prompt는 필수입니다.')

  return {
    id,
    name: form.name.trim() || undefined,
    description,
    base: form.base.trim() || 'enhanced',
    model: form.model.trim() || undefined,
    temperature: parseOptionalNumber(form.temperature, 'temperature', 0, 2),
    topP: parseOptionalNumber(form.topP, 'topP', 0, 1),
    maxTokens: parseOptionalPositiveInteger(form.maxTokens, 'maxTokens'),
    maxIterations: parseOptionalPositiveInteger(form.maxIterations, 'maxIterations'),
    systemPrompt,
  }
}

function sourceLabel(source: DaemonAgentDescriptor['source']): string {
  return source ?? 'builtin'
}

function sortedAgents(agents: DaemonAgentDescriptor[]): DaemonAgentDescriptor[] {
  return [...agents].sort((a, b) => {
    const sourceOrder = sourceLabel(a.source).localeCompare(sourceLabel(b.source))
    if (sourceOrder !== 0) return sourceOrder
    return a.name.localeCompare(b.name)
  })
}

export function AgentManager() {
  const transport = useTransport()
  const [agents, setAgents] = useState<DaemonAgentDescriptor[]>([])
  const [graphs, setGraphs] = useState<DaemonAgentGraphSnapshot[]>([])
  const [form, setForm] = useState<AgentForm>(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const baseOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string; description: string }>()
    options.set('enhanced', {
      id: 'enhanced',
      name: 'Enhanced Agent',
      description: 'General-purpose orchestration',
    })
    for (const graph of graphs) {
      if (graph.source && graph.source !== 'builtin') continue
      options.set(graph.id, {
        id: graph.id,
        name: graph.name || graph.id,
        description: graph.description,
      })
    }
    return [...options.values()].sort((a, b) => {
      if (a.id === 'enhanced') return -1
      if (b.id === 'enhanced') return 1
      return a.name.localeCompare(b.name)
    })
  }, [graphs])

  const promptWarnings = useMemo(
    () => findAgentPromptWarnings(form.systemPrompt),
    [form.systemPrompt],
  )

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const api = await createAgentsApi(transport)
      const [agentList, graphList] = await Promise.all([
        api.list(),
        api.graphs().catch(() => []),
      ])
      setAgents(agentList)
      setGraphs(graphList)
    } catch (err) {
      const friendly = explainChatStreamError(err)
      setError(friendly.description ?? friendly.title)
      setAgents([])
      setGraphs([])
    } finally {
      setLoading(false)
    }
  }, [transport])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createAgent(): Promise<void> {
    let input: DaemonUserAgentInput
    try {
      input = buildUserAgentInput(form)
    } catch (err) {
      toast.warning(err instanceof Error ? err.message : 'agent 입력을 확인하세요.')
      return
    }

    if (promptWarnings.length > 0) {
      toast.warning('Agent prompt를 저장하기 전에 민감 정보 여부를 확인하세요.', {
        description: promptWarnings.join(' '),
      })
    }

    setSaving(true)
    try {
      const api = await createAgentsApi(transport)
      const created = await api.create(input)
      toast.success(`Agent '${created.name}' 저장됨`)
      setForm(DEFAULT_FORM)
      await refresh()
    } catch (err) {
      const friendly = explainChatStreamError(err)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function removeAgent(agent: DaemonAgentDescriptor): Promise<void> {
    if (agent.source !== 'user') return
    const ok = await confirm(`'${agent.name}' user agent를 삭제할까요?`, {
      destructive: true,
    })
    if (!ok) return
    setRemovingId(agent.id)
    try {
      const api = await createAgentsApi(transport)
      await api.remove(agent.id)
      toast.success(`Agent '${agent.name}' 삭제됨`)
      await refresh()
    } catch (err) {
      const friendly = explainChatStreamError(err)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Agents</h2>
          <p className="text-xs text-muted-foreground">
            user agent를 만들고 daemon agent 카탈로그를 확인합니다.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading || saving}
          aria-label="agent 목록 새로고침"
          title="agent 목록 새로고침"
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          새로고침
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <section className="rounded-md border border-border p-3" aria-label="user agent 만들기">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              User Agent
            </h3>
            <p className="text-xs text-muted-foreground">
              같은 id로 저장하면 기존 user agent를 교체합니다.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void createAgent()}
            disabled={saving}
          >
            <Plus className="mr-1 h-4 w-4" />
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium">id</span>
            <Input
              value={form.id}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, id: event.target.value }))
              }
              placeholder="release-reviewer"
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">name</span>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Release Reviewer"
              disabled={saving}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium">description</span>
            <Input
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Reviews release readiness and risk."
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">base graph</span>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={form.base}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, base: event.target.value }))
              }
              disabled={saving}
            >
              {baseOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.id})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">model override</span>
            <Input
              value={form.model}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, model: event.target.value }))
              }
              placeholder="provider/model"
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">temperature</span>
            <Input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={form.temperature}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, temperature: event.target.value }))
              }
              placeholder="0.2"
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">topP</span>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={form.topP}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, topP: event.target.value }))
              }
              placeholder="0.9"
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">maxTokens</span>
            <Input
              type="number"
              min="1"
              step="1"
              value={form.maxTokens}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxTokens: event.target.value }))
              }
              placeholder="4096"
              disabled={saving}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">maxIterations</span>
            <Input
              type="number"
              min="1"
              step="1"
              value={form.maxIterations}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, maxIterations: event.target.value }))
              }
              placeholder="12"
              disabled={saving}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium">system prompt</span>
            <textarea
              value={form.systemPrompt}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, systemPrompt: event.target.value }))
              }
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="You are a release reviewer. Focus on shipped behavior, risk, and validation."
              disabled={saving}
            />
          </label>
        </div>
        {promptWarnings.length > 0 ? (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {promptWarnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-border p-3" aria-label="agent 카탈로그">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Catalog
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {loading ? '로딩 중...' : `${agents.length} agents`}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {!loading && agents.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 agent가 없습니다.</p>
          ) : null}
          {sortedAgents(agents).map((agent) => {
            const isUserAgent = agent.source === 'user'
            const deleting = removingId === agent.id
            return (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{agent.name}</span>
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {agent.id}
                    </span>
                    <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                      {sourceLabel(agent.source)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {agent.description}
                  </div>
                </div>
                {isUserAgent ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeAgent(agent)}
                    disabled={deleting}
                    aria-label={`${agent.name} 삭제`}
                    title={`${agent.name} 삭제`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
