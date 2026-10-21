'use client'
import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import { SecretStatusField } from './_shared/SecretStatusField'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'channels',
  section: 'notifications',
  label: 'Channels',
  search: ['channel', 'slack', 'telegram', 'discord', 'webhook', 'integration'],
  render: () => <ChannelsSettingsTab />,
})

interface ChannelConfig {
  type: string
  enabled?: boolean
  config?: Record<string, unknown>
}

interface EditingState {
  isNew: boolean
  index: number | null
  type: string
  enabled: boolean
  configText: string
  fields: Record<string, string>
  rawMode: boolean
}

const DEFAULT_TYPES = [
  'slack',
  'telegram',
  'discord',
  'mattermost',
  'whatsapp',
  'teams',
  'line',
  'github-issue',
  'webhook',
  'webchat',
] as const

interface FieldSpec {
  key: string
  label: string
  placeholder?: string
  password?: boolean
  kind?: 'text' | 'number' | 'boolean' | 'string-list' | 'json'
  options?: Array<{ value: string; label: string }>
  helper?: string
}

const STRUCTURED_FIELDS: Record<string, FieldSpec[] | undefined> = {
  slack: [
    {
      key: 'botToken',
      label: 'Bot token',
      placeholder: 'xoxb-…',
      password: true,
    },
    {
      key: 'signingSecret',
      label: 'Signing secret',
      placeholder: 'Slack signing secret',
      password: true,
    },
    {
      key: 'allowedChannels',
      label: 'Allowed channels',
      placeholder: 'C123456 또는 #general, 줄바꿈/쉼표로 구분',
      kind: 'string-list',
    },
    {
      key: 'allowedUsers',
      label: 'Allowed users',
      placeholder: 'U123456 또는 username, 줄바꿈/쉼표로 구분',
      kind: 'string-list',
    },
  ],
  telegram: [
    {
      key: 'botToken',
      label: 'Bot token',
      placeholder: '123456:ABC-DEF…',
      password: true,
    },
    {
      key: 'allowedUsers',
      label: 'Allowed users',
      placeholder: '123456789 또는 username, 줄바꿈/쉼표로 구분',
      kind: 'string-list',
      helper: '비워두면 pairing code로 새 사용자를 등록할 수 있습니다.',
    },
    {
      key: 'pairingRequired',
      label: 'Pairing required',
      kind: 'boolean',
      options: [
        { value: 'true', label: '필수' },
        { value: 'false', label: '열림' },
      ],
      helper: '활성화하면 Telegram 사용자가 pairing code를 제출해야 합니다.',
    },
    {
      key: 'pairingCodeTtl',
      label: 'Pairing code TTL (seconds)',
      placeholder: '300',
      kind: 'number',
      helper: '60-3600초 권장.',
    },
    {
      key: 'rateLimitPerMinute',
      label: 'Rate limit / minute',
      placeholder: '30',
      kind: 'number',
      helper: 'Telegram 경유 사용량을 제한합니다.',
    },
  ],
  discord: [
    {
      key: 'botToken',
      label: 'Bot token',
      placeholder: 'Discord bot token',
      password: true,
    },
    {
      key: 'applicationId',
      label: 'Application ID',
    },
    {
      key: 'publicKey',
      label: 'Public key',
      placeholder: '64 hex chars',
    },
    {
      key: 'allowedGuilds',
      label: 'Allowed guilds',
      kind: 'string-list',
    },
    {
      key: 'allowedChannels',
      label: 'Allowed channels',
      kind: 'string-list',
    },
    {
      key: 'allowedUsers',
      label: 'Allowed users',
      kind: 'string-list',
    },
  ],
  mattermost: [
    {
      key: 'serverUrl',
      label: 'Server URL',
      placeholder: 'https://mattermost.example.com',
    },
    {
      key: 'botToken',
      label: 'Bot token',
      password: true,
    },
    {
      key: 'webhookToken',
      label: 'Webhook token',
      password: true,
    },
    {
      key: 'allowedTeams',
      label: 'Allowed teams',
      kind: 'string-list',
    },
    {
      key: 'allowedChannels',
      label: 'Allowed channels',
      kind: 'string-list',
    },
    {
      key: 'allowedUsers',
      label: 'Allowed users',
      kind: 'string-list',
    },
  ],
  whatsapp: [
    {
      key: 'phoneNumberId',
      label: 'Phone number ID',
    },
    {
      key: 'accessToken',
      label: 'Access token',
      password: true,
    },
    {
      key: 'appSecret',
      label: 'App secret',
      password: true,
    },
    {
      key: 'verifyToken',
      label: 'Verify token',
      password: true,
    },
    {
      key: 'allowedNumbers',
      label: 'Allowed numbers',
      kind: 'string-list',
    },
  ],
  teams: [
    {
      key: 'appId',
      label: 'App ID',
    },
    {
      key: 'appPassword',
      label: 'App password',
      password: true,
    },
    {
      key: 'allowedTenants',
      label: 'Allowed tenants',
      kind: 'string-list',
    },
    {
      key: 'rateLimitPerMinute',
      label: 'Rate limit / minute',
      kind: 'number',
    },
  ],
  line: [
    {
      key: 'channelAccessToken',
      label: 'Channel access token',
      password: true,
    },
    {
      key: 'channelSecret',
      label: 'Channel secret',
      password: true,
    },
    {
      key: 'allowedUsers',
      label: 'Allowed users',
      kind: 'string-list',
    },
    {
      key: 'rateLimitPerMinute',
      label: 'Rate limit / minute',
      kind: 'number',
    },
  ],
  'github-issue': [
    {
      key: 'owner',
      label: 'Owner',
    },
    {
      key: 'repo',
      label: 'Repository',
    },
    {
      key: 'labels',
      label: 'Labels',
      kind: 'string-list',
      placeholder: 'triage, sepilotd',
    },
  ],
  webhook: [
    {
      key: 'endpoints',
      label: 'Endpoints JSON',
      kind: 'json',
      placeholder:
        '[{"enabled":true,"path":"github","secretHeader":"x-hub-signature-256","secretValue":"..."}]',
      helper: '각 endpoint는 path, secretHeader, secretValue가 필요합니다.',
    },
    {
      key: 'rateLimitPerMinute',
      label: 'Rate limit / minute',
      kind: 'number',
    },
  ],
  webchat: [],
}

function fieldsFromConfig(
  type: string,
  config: Record<string, unknown> | undefined,
): Record<string, string> {
  const spec = STRUCTURED_FIELDS[type]
  if (!spec) return {}
  const out: Record<string, string> = {}
  for (const f of spec) {
    const v = config?.[f.key]
    if (Array.isArray(v)) {
      out[f.key] =
        f.kind === 'json'
          ? JSON.stringify(v, null, 2)
          : v.filter((item) => typeof item === 'string').join('\n')
    } else if (f.kind === 'json' && v && typeof v === 'object') {
      out[f.key] = JSON.stringify(v, null, 2)
    } else {
      out[f.key] = typeof v === 'string' ? v : v == null ? '' : String(v)
    }
  }
  return out
}

function parseStructuredField(
  field: FieldSpec,
  rawValue: string,
): unknown {
  const value = rawValue.trim()
  if (!value) return undefined
  if (field.kind === 'number') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (field.kind === 'boolean') {
    return value === 'false' ? false : true
  }
  if (field.kind === 'string-list') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (field.kind === 'json') {
    return JSON.parse(value)
  }
  return value
}

function emptyEditing(): EditingState {
  return {
    isNew: true,
    index: null,
    type: 'slack',
    enabled: false,
    configText: '{\n}',
    fields: fieldsFromConfig('slack', {}),
    rawMode: false,
  }
}

function channelToEditing(c: ChannelConfig, index: number): EditingState {
  const hasSpec = STRUCTURED_FIELDS[c.type] != null
  return {
    isNew: false,
    index,
    type: c.type,
    enabled: !!c.enabled,
    configText: JSON.stringify(c.config ?? {}, null, 2),
    fields: fieldsFromConfig(c.type, c.config),
    rawMode: !hasSpec,
  }
}

export const __channelsSettingsTesting = {
  fieldsFromConfig,
  parseStructuredField,
  emptyEditing,
  channelToEditing,
}

export function ChannelsSettingsTab() {
  const transport = useTransport()
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useModalViewportLock(Boolean(editing))

  async function fetchConfig(): Promise<void> {
    try {
      const cfg = await transport.getConfig()
      const headers: HeadersInit = cfg.daemonToken
        ? { authorization: `Bearer ${cfg.daemonToken}` }
        : {}
      const r = await fetch(`${cfg.daemonOrigin}/api/v1/config`, { headers })
      if (!r.ok) throw new Error(`config fetch failed (${r.status})`)
      const body = (await r.json()) as {
        channels?: ChannelConfig[]
        data?: { channels?: ChannelConfig[] }
      }
      setChannels(body.data?.channels ?? body.channels ?? [])
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
  }, [transport])

  async function persist(next: ChannelConfig[]): Promise<void> {
    const cfg = await transport.getConfig()
    const headers: HeadersInit = cfg.daemonToken
      ? {
          authorization: `Bearer ${cfg.daemonToken}`,
          'content-type': 'application/json',
        }
      : { 'content-type': 'application/json' }
    const r = await fetch(`${cfg.daemonOrigin}/api/v1/config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ channels: next }),
    })
    if (!r.ok) throw new Error(`config save failed (${r.status})`)
  }

  async function save(): Promise<void> {
    if (!editing) return
    if (!editing.type.trim()) {
      toast.warning('type을 입력하세요.')
      return
    }
    const spec = STRUCTURED_FIELDS[editing.type]
    let parsed: Record<string, unknown>
    if (spec && !editing.rawMode) {
      parsed = {}
      try {
        for (const field of spec) {
          const value = (editing.fields[field.key] ?? '').trim()
          const parsedValue = parseStructuredField(field, value)
          if (parsedValue !== undefined) parsed[field.key] = parsedValue
        }
      } catch (error) {
        toast.error('필드 값이 올바르지 않습니다.', {
          description: error instanceof Error ? error.message : undefined,
        })
        return
      }
    } else {
      try {
        parsed = editing.configText.trim()
          ? (JSON.parse(editing.configText) as Record<string, unknown>)
          : {}
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('config는 JSON 객체여야 합니다.')
        }
      } catch (error) {
        toast.error('config JSON이 올바르지 않습니다.', {
          description: error instanceof Error ? error.message : undefined,
        })
        return
      }
    }
    const channel: ChannelConfig = {
      type: editing.type.trim(),
      enabled: editing.enabled,
      config: parsed,
    }
    setSaving(true)
    try {
      let next: ChannelConfig[]
      if (editing.isNew || editing.index == null) {
        next = [...channels, channel]
      } else {
        next = channels.map((c, i) => (i === editing.index ? channel : c))
      }
      await persist(next)
      setChannels(next)
      setEditing(null)
      toast.success(
        editing.isNew ? '채널을 추가했습니다.' : '채널을 수정했습니다.',
      )
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function remove(index: number): Promise<void> {
    const channel = channels[index]
    if (!channel) return
    const ok = await confirm(`'${channel.type}' 채널을 삭제하시겠습니까?`, { destructive: true })
    if (!ok) return
    setSaving(true)
    try {
      const next = channels.filter((_, i) => i !== index)
      await persist(next)
      setChannels(next)
      toast.success('채널을 삭제했습니다.')
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  async function toggle(index: number): Promise<void> {
    const channel = channels[index]
    if (!channel) return
    setSaving(true)
    try {
      const next = channels.map((c, i) =>
        i === index ? { ...c, enabled: !c.enabled } : c,
      )
      await persist(next)
      setChannels(next)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">로딩 중…</p>

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Channels</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(emptyEditing())}
          disabled={saving}
        >
          <Plus className="mr-1 h-4 w-4" />
          추가
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {channels.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            등록된 채널이 없습니다.
          </p>
        ) : (
          channels.map((c, i) => {
            const summary = c.config
              ? Object.keys(c.config).slice(0, 4).join(', ')
              : ''
            return (
              <div
                key={`${c.type}-${i}`}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.type}</span>
                    <span
                      className={
                        c.enabled
                          ? 'text-[10px] text-emerald-600 dark:text-emerald-400'
                          : 'text-[10px] text-muted-foreground'
                      }
                    >
                      {c.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  {summary ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {summary}
                    </div>
                  ) : null}
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant={c.enabled ? 'outline' : 'default'}
                    onClick={() => void toggle(i)}
                    disabled={saving}
                  >
                    {c.enabled ? '비활성' : '활성'}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditing(channelToEditing(c, i))}
                    disabled={saving}
                    aria-label={`${c.type} 편집`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void remove(i)}
                    disabled={saving}
                    aria-label={`${c.type} 삭제`}
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
          aria-labelledby="channel-editor-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => (saving ? null : setEditing(null))}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shrink-0 border-b border-border px-6 py-4">
              <h3 id="channel-editor-title" className="text-sm font-semibold">
                {editing.isNew ? '새 채널' : '채널 편집'}
              </h3>
            </header>
            <div
              role="region"
              aria-label="채널 설정"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-6 py-4 [scrollbar-gutter:stable]"
            >
            <label className="flex flex-col gap-1 text-xs">
              Type
              <Input
                type="text"
                list="channel-type-presets"
                value={editing.type}
                onChange={(e) => {
                  const nextType = e.target.value
                  setEditing((s) =>
                    s
                      ? {
                          ...s,
                          type: nextType,
                          fields: fieldsFromConfig(nextType.trim(), {}),
                          rawMode:
                            STRUCTURED_FIELDS[nextType.trim()] == null,
                        }
                      : s,
                  )
                }}
                placeholder="slack / telegram / discord / webhook / …"
                disabled={saving}
              />
              <datalist id="channel-type-presets">
                {DEFAULT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, enabled: e.target.checked } : s,
                  )
                }
                disabled={saving}
              />
              저장 시 활성
            </label>
            {(() => {
              const spec = STRUCTURED_FIELDS[editing.type]
              const usingStructured = spec != null && !editing.rawMode
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {usingStructured
                        ? '필드별 입력'
                        : 'Config (JSON 객체)'}
                    </span>
                    {spec ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing((s) =>
                            s ? { ...s, rawMode: !s.rawMode } : s,
                          )
                        }
                        className="rounded px-1.5 py-0.5 hover:bg-accent"
                        disabled={saving}
                      >
                        {usingStructured ? 'JSON 모드' : '폼 모드'}
                      </button>
                    ) : null}
                  </div>
                  {usingStructured ? (
                    <div className="flex flex-col gap-2">
                      {spec!.map((f) => {
                        if (f.password) {
                          const current = editing.fields[f.key] ?? ''
                          const isSet =
                            !editing.isNew && current.length > 0
                          return (
                            <SecretStatusField
                              key={f.key}
                              label={f.label}
                              isSet={isSet}
                              hint={f.helper}
                              busy={saving}
                              submitLabel="확인"
                              busyLabel="확인 중…"
                              placeholder={f.placeholder}
                              disabled={saving}
                              onRotate={(next) =>
                                setEditing((s) =>
                                  s
                                    ? {
                                        ...s,
                                        fields: {
                                          ...s.fields,
                                          [f.key]: next,
                                        },
                                      }
                                    : s,
                                )
                              }
                              onClear={
                                isSet
                                  ? () =>
                                      setEditing((s) =>
                                        s
                                          ? {
                                              ...s,
                                              fields: {
                                                ...s.fields,
                                                [f.key]: '',
                                              },
                                            }
                                          : s,
                                      )
                                  : undefined
                              }
                            />
                          )
                        }
                        if (f.kind === 'boolean') {
                          return (
                            <label key={f.key} className="flex flex-col gap-1 text-xs">
                              {f.label}
                              <select
                                value={editing.fields[f.key] || 'true'}
                                onChange={(e) =>
                                  setEditing((s) =>
                                    s
                                      ? {
                                          ...s,
                                          fields: {
                                            ...s.fields,
                                            [f.key]: e.target.value,
                                          },
                                        }
                                      : s,
                                  )
                                }
                                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                                disabled={saving}
                              >
                                {(f.options ?? [
                                  { value: 'true', label: 'true' },
                                  { value: 'false', label: 'false' },
                                ]).map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {f.helper ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {f.helper}
                                </span>
                              ) : null}
                            </label>
                          )
                        }
                        if (f.kind === 'string-list' || f.kind === 'json') {
                          return (
                            <label key={f.key} className="flex flex-col gap-1 text-xs">
                              {f.label}
                              <textarea
                                rows={f.kind === 'json' ? 5 : 3}
                                value={editing.fields[f.key] ?? ''}
                                onChange={(e) =>
                                  setEditing((s) =>
                                    s
                                      ? {
                                          ...s,
                                          fields: {
                                            ...s.fields,
                                            [f.key]: e.target.value,
                                          },
                                        }
                                      : s,
                                  )
                                }
                                placeholder={f.placeholder}
                                spellCheck={false}
                                className={
                                  'rounded border border-border bg-transparent p-2 text-xs'
                                  + (f.kind === 'json' ? ' font-mono' : '')
                                }
                                disabled={saving}
                              />
                              {f.helper ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {f.helper}
                                </span>
                              ) : null}
                            </label>
                          )
                        }
                        return (
                        <label key={f.key} className="flex flex-col gap-1 text-xs">
                          {f.label}
                          <Input
                            type={f.kind === 'number' ? 'number' : 'text'}
                            value={editing.fields[f.key] ?? ''}
                            onChange={(e) =>
                              setEditing((s) =>
                                s
                                  ? {
                                      ...s,
                                      fields: {
                                        ...s.fields,
                                        [f.key]: e.target.value,
                                      },
                                    }
                                  : s,
                              )
                            }
                            placeholder={f.placeholder}
                            disabled={saving}
                          />
                          {f.helper ? (
                            <span className="text-[10px] text-muted-foreground">
                              {f.helper}
                            </span>
                          ) : null}
                        </label>
                        )
                      })}
                    </div>
                  ) : (
                    <>
                      <textarea
                        rows={10}
                        value={editing.configText}
                        onChange={(e) =>
                          setEditing((s) =>
                            s ? { ...s, configText: e.target.value } : s,
                          )
                        }
                        placeholder={'{\n  "botToken": "…"\n}'}
                        spellCheck={false}
                        className="rounded border border-border bg-transparent p-2 font-mono text-[11px]"
                        disabled={saving}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        채널별 필드는 daemon channel adapter에 따라 다릅니다.
                      </span>
                    </>
                  )}
                </div>
              )
            })()}
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                취소
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
