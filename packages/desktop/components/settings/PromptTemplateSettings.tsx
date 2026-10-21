'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  CapabilityUnavailableError,
  createPromptTemplatesApi,
  type PromptTemplate,
} from '@/lib/api/prompt-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'prompt-templates',
  section: 'memory',
  label: 'Prompt Templates',
  search: ['prompt', 'template'],
  render: () => <PromptTemplateSettings />,
})

export function PromptTemplateSettings() {
  const transport = useTransport()
  const [items, setItems] = useState<PromptTemplate[]>([])
  const [editing, setEditing] = useState<{ id?: string; title: string; body: string }>({
    title: '',
    body: '',
  })
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      const api = await createPromptTemplatesApi(transport)
      setItems(await api.list())
      setStatus('ready')
    } catch (err) {
      if (err instanceof CapabilityUnavailableError) {
        setStatus('unavailable')
        return
      }
      setStatus('error')
      setError(
        err instanceof Error ? err.message : 'prompt templates load failed',
      )
    }
  }

  useEffect(() => {
    setStatus('loading')
    setError(null)
    void refresh()
  }, [transport])

  async function save(): Promise<void> {
    if (!editing.title.trim()) return
    try {
      const api = await createPromptTemplatesApi(transport)
      await api.upsert({
        id: editing.id,
        title: editing.title.trim(),
        body: editing.body,
      })
      setEditing({ title: '', body: '' })
      await refresh()
      toast.success('프롬프트 템플릿을 저장했습니다.')
    } catch (err) {
      toast.error('프롬프트 템플릿 저장에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      const api = await createPromptTemplatesApi(transport)
      await api.remove(id)
      if (editing.id === id) setEditing({ title: '', body: '' })
      await refresh()
    } catch (err) {
      toast.error('프롬프트 템플릿 삭제에 실패했습니다.', {
        description: err instanceof Error ? err.message : 'remove failed',
      })
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Prompt Templates" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Templates</h4>
          <p className="text-xs text-muted-foreground">
            자주 쓰는 프롬프트를 저장해 둡니다.
          </p>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setEditing(item)}
              className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                editing.id === item.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border'
              }`}
            >
              <div className="font-medium">{item.title}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {item.body || '본문 없음'}
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">템플릿 없음</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={editing.title}
              onChange={(event) =>
                setEditing((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="예: PR 리뷰 프롬프트"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Body</label>
            <textarea
              value={editing.body}
              onChange={(event) =>
                setEditing((prev) => ({ ...prev, body: event.target.value }))
              }
              className="min-h-[280px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="프롬프트 내용을 입력하세요."
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()}>
              {editing.id ? '업데이트' : '추가'}
            </Button>
            {editing.id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void remove(editing.id!)}
              >
                삭제
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing({ title: '', body: '' })}
            >
              새 템플릿
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
