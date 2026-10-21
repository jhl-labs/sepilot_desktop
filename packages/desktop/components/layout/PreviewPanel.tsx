'use client'
import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Globe, PanelRightClose, RefreshCw, X } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { invokeDesktop } from '@/lib/electron/bridge'
import { createFilesApi } from '@/lib/api/files'
import { usePreviewStore, type PreviewTab } from '@/lib/store/preview-store'

function FilePreview({ tab, revision }: { tab: PreviewTab; revision: number }) {
  const transport = useOptionalTransport()
  const [result, setResult] = useState<{ path: string; content: string } | null>(null)
  const [error, setError] = useState('')
  const [source, setSource] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    void (async () => {
      const upload = /^\/api\/v1\/files\/([a-zA-Z0-9_-]+)\/download$/.exec(tab.location)
      if (upload && transport) {
        const blob = await (await createFilesApi(transport)).download(upload[1], controller.signal)
        if (blob.size > 2 * 1024 * 1024) throw new Error('미리보기는 2MB 이하 파일을 지원합니다.')
        const content = await blob.text()
        if (content.includes('\0')) throw new Error('바이너리 파일은 텍스트로 미리 볼 수 없습니다.')
        return { path: tab.location, content }
      }
      if (transport) {
        const config = await transport.getConfig()
        if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.daemonOrigin).hostname)) {
          throw new Error('원격 데몬의 파일 경로는 이 컴퓨터에서 열 수 없습니다. 업로드된 파일 링크를 사용하세요.')
        }
      }
      const file = await invokeDesktop<{ path: string; content: string }>('sepilot:preview/read-file', { path: tab.location, cwd: tab.cwd })
      if (!file) throw new Error('로컬 파일 미리보기는 Desktop 앱에서 사용할 수 있습니다.')
      return file
    })().then((file) => { if (!controller.signal.aborted) setResult(file) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => controller.abort()
  }, [tab, transport, revision])
  if (error) return <div role="alert" className="m-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6">{error}</div>
  if (!result) return <div role="status" className="p-6 text-sm text-muted-foreground">파일을 불러오는 중…</div>
  const markdown = /\.(md|markdown|mdx)$/i.test(result.path)
  const html = /\.html?$/i.test(result.path)
  const directory = result.path.replace(/[\\/][^\\/]*$/, '')
  return <>
    {(markdown || html) && <div className="flex items-center gap-2 border-b px-4 py-2 text-xs">
      <button className={!source ? 'font-semibold text-primary' : 'text-muted-foreground'} onClick={() => setSource(false)}>미리보기</button>
      <span className="text-border">/</span>
      <button className={source ? 'font-semibold text-primary' : 'text-muted-foreground'} onClick={() => setSource(true)}>원본</button>
      {html && <span className="ml-auto text-muted-foreground">단일 HTML · 외부 리소스 제외</span>}
    </div>}
    {html && !source ? <iframe
      title={tab.title}
      className="min-h-0 flex-1 bg-white"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${result.content}`}
    /> : <div className="min-h-0 flex-1 overflow-auto p-6">
      {markdown && !source ? <MarkdownRenderer content={result.content} baseDirectory={directory} /> : <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6">{result.content}</pre>}
    </div>}
  </>
}

export function PreviewPanel() {
  const { tabs, activeId, visible, select, close, hide } = usePreviewStore()
  const [width, setWidth] = useState(45)
  const [revision, setRevision] = useState(0)
  const tab = tabs.find((item) => item.id === activeId)
  if (!visible || !tab) return null
  return <aside aria-label="파일 및 웹 미리보기" style={{ width: `${width}%` }} className="relative flex h-full min-w-[320px] shrink-0 flex-col border-l bg-background max-md:absolute max-md:inset-0 max-md:z-30 max-md:!w-full">
    <div role="separator" aria-label="미리보기 너비 조절" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={25} aria-valuemax={70} tabIndex={0}
      className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-primary/20 focus-visible:bg-primary/20"
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const bounds = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect()
        if (bounds) setWidth(Math.max(25, Math.min(70, (bounds.right - event.clientX) / bounds.width * 100)))
      }}
      onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        setWidth((value) => Math.max(25, Math.min(70, value + (event.key === 'ArrowLeft' ? 5 : -5))))
      }}
    />
    <div className="flex items-center border-b bg-muted/30 px-2 pt-2">
      <div role="tablist" aria-label="열린 미리보기" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {tabs.map((item) => <div key={item.id} className={`flex max-w-52 shrink-0 items-center gap-1 rounded-t-lg border border-b-0 px-2 py-2 ${item.id === activeId ? 'bg-background text-primary' : 'border-transparent text-muted-foreground'}`}>
          <button role="tab" aria-selected={item.id === activeId} onClick={() => select(item.id)} className="flex min-w-0 items-center gap-2 text-xs" title={item.location}>
            {item.kind === 'web' ? <Globe className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{item.title}</span>
          </button>
          <button aria-label={`${item.title} 닫기`} className="rounded p-0.5 hover:bg-muted" onClick={() => close(item.id)}><X className="h-3 w-3" /></button>
        </div>)}
      </div>
      <button aria-label="미리보기 패널 닫기" onClick={hide} className="mb-2 rounded p-2 hover:bg-muted"><PanelRightClose className="h-4 w-4" /></button>
    </div>
    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1 truncate" title={tab.location}>{tab.location}</span>
      <button aria-label="미리보기 새로고침" onClick={() => setRevision((value) => value + 1)} className="rounded p-1 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
      {tab.kind === 'web' && <a aria-label="외부 브라우저에서 열기" href={tab.location} target="_blank" rel="noopener noreferrer" className="rounded p-1 hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" /></a>}
    </div>
    {tab.kind === 'web' ? <>
      <iframe key={`${tab.id}:${revision}`} title={tab.title} src={tab.location} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="min-h-0 flex-1 bg-white" />
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">사이트에서 미리보기를 차단하거나 로그인이 필요하면 외부 브라우저에서 열어주세요.</p>
    </> : <FilePreview key={tab.id} tab={tab} revision={revision} />}
  </aside>
}
