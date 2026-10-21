'use client'
import { useEffect, useState } from 'react'
import { useTransport } from '@/components/providers/transport-provider'
import { createDocsGitApi, type GitStatus, type GitPreview } from '@/lib/api/docs-git'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function DocsGitPanel({ onSynced }: { onSynced: () => void }) {
  const transport = useTransport()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [source, setSource] = useState('')
  const [branch, setBranch] = useState('main')
  const [docs, setDocs] = useState(true)
  const [wiki, setWiki] = useState(true)
  const [preview, setPreview] = useState<GitPreview | null>(null)
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!transport) return
    let disposed = false
    void createDocsGitApi(transport)
      .then((api) => api.status())
      .then((value) => {
        if (!disposed) {
          setStatus(value)
          setPreview(value.preview)
        }
      })
      .catch((e) => {
        if (!disposed) setError(String(e))
      })
    return () => {
      disposed = true
    }
  }, [transport])
  async function run(action: (api: Awaited<ReturnType<typeof createDocsGitApi>>) => Promise<void>) {
    if (!transport) return
    setBusy(true)
    setError('')
    try {
      const api = await createDocsGitApi(transport)
      await action(api)
      setStatus(await api.status())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }
  const unresolved = preview?.changes.some((c) => c.action === 'conflict' && !choices[c.key])
  return (
    <div
      className="shrink-0 max-h-[65vh] overflow-auto border-b bg-muted/20 p-3 text-sm"
      aria-label="Git 동기화 설정"
    >
      <p className="mb-2">
        Docs 문서와 Wiki 지식을 Git의 <code>.sepilot-docs</code> 폴더에 Markdown으로 동기화합니다.
        출처 인용도 포함됩니다.
      </p>
      {!status?.connection ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async (api) => {
              setStatus(await api.connect({ source, branch, docs, wiki }))
              setPreview(null)
            })
          }}
        >
          <Input
            aria-label="Git 저장소 URL 또는 로컬 경로"
            placeholder="https://…/repo.git 또는 로컬 Git 경로"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-w-64 flex-1"
            required
          />
          <Input
            aria-label="Git 브랜치"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-32"
            required
          />
          <label>
            <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />{' '}
            문서
          </label>
          <label>
            <input type="checkbox" checked={wiki} onChange={(e) => setWiki(e.target.checked)} />{' '}
            Wiki
          </label>
          <Button disabled={busy || !transport || (!docs && !wiki)}>저장소 연결</Button>
          <p className="w-full text-xs text-muted-foreground">
            이 기기의 Git 인증 또는 SSH agent를 사용합니다. 연결만으로 업로드하지 않으며, 삭제는
            자동 전파하지 않습니다.
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all">
            {status.connection.source} · {status.connection.branch}
          </span>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async (api) => {
                setChoices({})
                setPreview(await api.preview())
              })
            }
          >
            변경 사항 비교
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async (api) => {
                setStatus(await api.disconnect())
                setPreview(null)
              })
            }
          >
            연결 해제
          </Button>
          {status.lastSync && (
            <span>최근 동기화: {new Date(status.lastSync).toLocaleString()}</span>
          )}
        </div>
      )}
      {(error || status?.error) && (
        <p role="alert" className="my-2 text-destructive">
          {error || status?.error}
        </p>
      )}
      {busy && <p role="status">Git 작업 중…</p>}
      {preview && (
        <div className="mt-3 space-y-2">
          <p>
            {preview.changes.length
              ? `${preview.changes.length}개 변경 사항`
              : '동기화할 변경 사항이 없습니다.'}
          </p>
          {preview.changes.map((c) => (
            <details key={c.key} className="rounded border p-2">
              <summary>
                {c.title} ·{' '}
                {c.action === 'upload'
                  ? '앱 → Git'
                  : c.action === 'download'
                    ? 'Git → 앱'
                    : '충돌: 사용할 버전을 선택하세요'}
              </summary>
              {c.action === 'conflict' && (
                <div className="my-2 flex gap-2">
                  {(['local', 'remote'] as const).map(
                    (side) =>
                      c[side] !== null && (
                        <label key={side}>
                          <input
                            type="radio"
                            name={c.key}
                            checked={choices[c.key] === side}
                            onChange={() => setChoices((prev) => ({ ...prev, [c.key]: side }))}
                          />
                          {side === 'local' ? '앱 버전' : 'Git 버전'}
                        </label>
                      ),
                  )}
                  {(c.local === null || c.remote === null) && (
                    <span>삭제 대신 남아 있는 버전을 복원합니다.</span>
                  )}
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {(['local', 'remote'] as const).map((side) => (
                  <div key={side}>
                    <strong>{side === 'local' ? '앱' : 'Git'}</strong>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {c[side] ?? '(없음)'}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          ))}
          <Button
            disabled={busy || unresolved}
            onClick={() =>
              void run(async (api) => {
                setStatus(await api.sync(preview.id, choices))
                setPreview(null)
                onSynced()
              })
            }
          >
            선택한 내용 동기화 · Commit & Push
          </Button>
        </div>
      )}
    </div>
  )
}
