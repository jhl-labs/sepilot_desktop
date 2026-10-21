'use client'
import { useEffect, useMemo, useState } from 'react'
import type { EditCheckpointSummary } from '@sepilotd/api-client/daemon/types'
import { useTransport } from '@/components/providers/transport-provider'
import { createCheckpointsApi } from '@/lib/api/checkpoints'

export function CheckpointReviewPanel({ sessionId, pending }: { sessionId: string; pending: boolean }) {
  const transport = useTransport()
  const api = useMemo(() => createCheckpointsApi(transport), [transport])
  const [open, setOpen] = useState(false)
  const [checkpoints, setCheckpoints] = useState<EditCheckpointSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, refresh] = useState(0)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.preview>> | null>(null)
  useEffect(() => {
    setPreview(null)
    if (!selected || pending) return
    let active = true
    void api.preview(sessionId, selected).then(value => { if (active) setPreview(value) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { active = false }
  }, [api, selected, sessionId, pending, revision])
  useEffect(() => {
    if (!open || pending) return
    let active = true
    setBusy(true)
    setError('')
    void api.list(sessionId).then(result => { if (active) setCheckpoints(result.checkpoints) })
      .catch(cause => { if (active) setError(String(cause instanceof Error ? cause.message : cause)) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [api, sessionId, open, pending, revision])
  const index = checkpoints.findIndex(item => item.checkpointId === selected)
  const paths = preview ? preview.files.map(file => file.path)
    : index < 0 ? [] : [...new Set(checkpoints.slice(index).flatMap(item => item.files.map(file => file.path)))]
  async function rewind() {
    if (!selected || pending || busy || !preview || preview.incompleteHistory || preview.files.some(file => file.conflict)) return
    setBusy(true)
    setError('')
    try {
      const result = await api.rewind(sessionId, selected, preview.checkpointIds)
      setNotice(`${result.restoredFiles.length}개 파일을 되돌렸습니다. 대화 기록은 유지됩니다.`)
      setSelected(null)
      refresh(value => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <section aria-label="파일 변경 되돌리기" className="rounded-lg border text-xs">
    <button type="button" aria-expanded={open} className="w-full p-2 text-left focus-visible:ring-2" onClick={() => setOpen(value => !value)}>파일 변경 검토 · 되돌리기 {open ? '▾' : '▸'}</button>
    {open ? <div className="max-h-64 space-y-2 overflow-auto border-t p-2">
      <p className="text-muted-foreground">선택한 편집 직전으로 파일을 복원합니다. 이후 체크포인트의 변경도 포함됩니다. 외부 변경이 감지되면 거부됩니다.</p>
      {pending ? <p role="status">실행이 끝난 뒤 검토할 수 있습니다.</p> : null}
      {!busy && !pending && !error && checkpoints.length === 0 ? <p>저장된 편집 체크포인트가 없습니다.</p> : null}
      {checkpoints.map(item => <div key={item.checkpointId} className="rounded border p-2">
        <p>{item.label} · {item.files.length}개 파일</p>
        <details><summary className="cursor-pointer">파일 목록</summary><ul>{item.files.map(file => <li className="break-all font-mono" key={file.path}>{file.path}</li>)}</ul></details>
        <button type="button" disabled={pending || busy} className="mt-1 rounded border px-2 py-1 disabled:opacity-50" onClick={() => { setPreview(null); setSelected(item.checkpointId); refresh(value => value + 1); setNotice(''); setError('') }}>이 편집 전으로 되돌리기…</button>
      </div>)}
      {selected ? <div role="group" aria-label="되돌리기 확인" className="space-y-2 rounded border border-amber-500 p-2">
        <p>다음 {paths.length}개 파일이 복원됩니다. 새로 만든 파일은 제거됩니다. 되돌린 체크포인트 기록도 제거됩니다.</p>
        <ul>{paths.map(path => <li key={path} className="break-all font-mono">{path}</li>)}</ul>
        {!preview ? <p role="status">변경 미리보기 확인 중…</p> : preview.files.map(file => <details key={file.path}><summary className="break-all">{file.path} · {file.conflict ? '충돌 — 복원 불가' : file.operation === 'remove' ? '제거 예정' : '복원 예정'}</summary>{file.diff ? <pre className="max-h-40 overflow-auto whitespace-pre font-mono">{file.diff}</pre> : <p>텍스트 diff를 표시할 수 없거나 변경이 없습니다.</p>}</details>)}
        {preview?.incompleteHistory ? <p role="alert">편집 기록이 불완전하여 복원할 수 없습니다.</p> : null}
        <button type="button" disabled={busy || pending || !preview || preview.incompleteHistory || preview.files.some(file => file.conflict)} onClick={() => void rewind()} className="rounded border px-2 py-1 disabled:opacity-50">확인하고 파일 복원</button>{' '}
        <button type="button" disabled={busy} onClick={() => setSelected(null)}>취소</button>
      </div> : null}
      {busy ? <p role="status">처리 중…</p> : null}
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <button type="button" disabled={busy || pending} onClick={() => refresh(value => value + 1)}>새로고침</button>
    </div> : null}
  </section>
}
