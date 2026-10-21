'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { confirm } from '@/lib/utils/confirm'
import { toast } from 'sonner'
import { useTransport } from '@/components/providers/transport-provider'
import {
  CapabilityUnavailableError,
  createPersonalDocsApi,
  type PersonalDoc,
} from '@/lib/api/personal-docs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnimplementedBanner } from './_shared/UnimplementedBanner'

export function PersonalDocsSettings() {
  const transport = useTransport()
  const [items, setItems] = useState<PersonalDoc[]>([])
  const [path, setPath] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error' | 'unavailable'
  >('loading')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.path.toLowerCase().includes(q))
  }, [items, query])

  async function refresh(): Promise<void> {
    try {
      const api = await createPersonalDocsApi(transport)
      setItems(await api.list())
      setStatus('ready')
    } catch (err) {
      if (err instanceof CapabilityUnavailableError) {
        setStatus('unavailable')
        return
      }
      setStatus('error')
      setError(err instanceof Error ? err.message : 'personal docs load failed')
    }
  }

  useEffect(() => {
    setStatus('loading')
    setError(null)
    void refresh()
  }, [transport])

  async function save(): Promise<void> {
    if (!path.trim()) return
    setSaving(true)
    try {
      const api = await createPersonalDocsApi(transport)
      await api.upsert({
        path: path.trim(),
        content,
      })
      setPath('')
      setContent('')
      await refresh()
      toast.success('개인 문서를 저장했습니다.')
    } catch (err) {
      toast.error('개인 문서를 저장하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: PersonalDoc): Promise<void> {
    const ok = await confirm(`'${item.path}' 문서를 삭제하시겠습니까? 되돌릴 수 없습니다.`, {
      destructive: true,
    })
    if (!ok) return
    setRemovingId(item.id)
    try {
      const api = await createPersonalDocsApi(transport)
      await api.remove(item.id)
      await refresh()
      toast.success('개인 문서를 삭제했습니다.')
    } catch (err) {
      toast.error('개인 문서를 삭제하지 못했습니다.', {
        description: err instanceof Error ? err.message : 'remove failed',
      })
    } finally {
      setRemovingId(null)
    }
  }

  if (status === 'unavailable')
    return <UnimplementedBanner what="Personal Docs" />
  if (status === 'loading')
    return <p className="text-sm text-muted-foreground">로딩 중…</p>
  if (status === 'error')
    return <p className="text-sm text-red-500">{error}</p>
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Saved Docs</h4>
          <p className="text-xs text-muted-foreground">
            daemon 개인 문서 저장소에 들어간 문서 목록입니다.
          </p>
        </div>
        {items.length > 0 ? (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="path로 검색"
              className="h-8 pl-7 pr-7 text-xs"
              aria-label="개인 문서 검색"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="검색어 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const isRemoving = removingId === item.id
            return (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={item.path}>
                    {item.path}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(item)}
                  disabled={isRemoving}
                  className="shrink-0"
                >
                  {isRemoving ? '삭제 중…' : '삭제'}
                </Button>
              </div>
            )
          })}
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">개인 문서 없음</p>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-3 text-center text-xs text-muted-foreground">
              <Search className="h-5 w-5 opacity-50" />
              <p>'{query}'와 일치하는 문서가 없습니다.</p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-accent"
              >
                검색어 지우기
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Path</label>
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="docs/onboarding.md"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Content</label>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[280px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="문서 내용을 입력하세요."
            />
          </div>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving || !path.trim()}
          >
            {saving ? '저장 중…' : '문서 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}
