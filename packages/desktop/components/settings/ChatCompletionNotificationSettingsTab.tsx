'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/components/providers/transport-provider'
import { createSettingsJsonApi } from '@/lib/api/settings-json'
import { registerSettingsTab } from './registry'

interface ChatNotificationForm {
  enabled: boolean
  includeFailures: boolean
}

registerSettingsTab({
  key: 'chat-notifications',
  section: 'notifications',
  label: 'Chat Completion',
  search: ['chat', 'completion', 'notification', 'failure'],
  render: () => <ChatCompletionNotificationSettingsTab />,
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickForm(doc: Record<string, unknown>): ChatNotificationForm {
  const notifications = asRecord(doc.notifications)
  const chatCompletion = asRecord(notifications.chatCompletion)
  return {
    enabled:
      typeof chatCompletion.enabled === 'boolean'
        ? chatCompletion.enabled
        : true,
    includeFailures:
      typeof chatCompletion.includeFailures === 'boolean'
        ? chatCompletion.includeFailures
        : true,
  }
}

export function ChatCompletionNotificationSettingsTab() {
  const transport = useTransport()
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<ChatNotificationForm>({
    enabled: true,
    includeFailures: true,
  })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const api = await createSettingsJsonApi(transport)
      const next = await api.get()
      setDoc(next)
      setForm(pickForm(next))
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'chat notification settings load failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [transport])

  async function save(): Promise<void> {
    if (!doc) return
    setStatus('saving')
    try {
      const notifications = asRecord(doc.notifications)
      const api = await createSettingsJsonApi(transport)
      const saved = await api.set({
        ...doc,
        notifications: {
          ...notifications,
          chatCompletion: {
            enabled: form.enabled,
            includeFailures: form.includeFailures,
          },
        },
      })
      setDoc(saved)
      setForm(pickForm(saved))
      toast.success('Chat completion 알림 설정을 저장했습니다.')
    } catch (err) {
      toast.error('Chat completion 알림 설정을 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setStatus('ready')
    }
  }

  if (status === 'loading') return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error') return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="space-y-4 text-sm">
      <section className="rounded-md border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Chat Completion Notifications</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span>완료 알림</span>
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={status === 'saving'}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span>실패도 알림에 포함</span>
            <input
              type="checkbox"
              checked={form.includeFailures}
              disabled={status === 'saving'}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, includeFailures: event.target.checked }))
              }
            />
          </label>
        </div>
      </section>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중…' : '저장'}
        </Button>
      </div>
    </div>
  )
}
