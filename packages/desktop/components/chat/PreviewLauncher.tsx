'use client'
import { useState } from 'react'
import { FolderOpen, PanelRightOpen } from 'lucide-react'
import { invokeDesktop } from '@/lib/electron/bridge'
import { previewTarget, usePreviewStore } from '@/lib/store/preview-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'

export function PreviewLauncher() {
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const tabs = usePreviewStore((state) => state.tabs)
  const open = (location: string) => {
    const target = previewTarget(location.trim())
    if (!target) { setError('파일 경로 또는 http(s) 주소를 입력하세요.'); return }
    const { sessions, activeId } = useSessionStore.getState()
    const session = sessions.find((item) => item.id === activeId)
    usePreviewStore.getState().open(target, session?.cwd ?? (!session ? useSettingsStore.getState().general.workingDir ?? undefined : undefined))
    setExpanded(false)
    setError('')
  }
  return <div className="relative shrink-0">
    <button type="button" aria-label="파일 및 웹 열기" aria-expanded={expanded} title="파일 및 웹 열기" onClick={() => setExpanded(!expanded)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><PanelRightOpen className="h-4 w-4" /></button>
    {expanded && <div className="absolute bottom-full right-0 z-40 mb-2 w-80 rounded-xl border bg-background p-3 shadow-xl">
      <form onSubmit={(event) => { event.preventDefault(); open(value) }} className="space-y-2">
        <label htmlFor="preview-location" className="text-xs font-medium">파일 경로 또는 웹 주소</label>
        <input id="preview-location" autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="./README.md 또는 http://localhost:3000" className="w-full rounded-md border bg-muted/30 px-2 py-2 text-xs" />
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">열기</button>
          <button type="button" className="flex items-center gap-1 rounded-md border px-2 text-xs" onClick={() => {
            void invokeDesktop<string | null>('sepilot:preview/pick-file').then((path) => {
              if (path) open(path)
              else if (path === undefined) setError('파일 선택은 Desktop 앱에서 사용할 수 있습니다.')
            }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
          }}><FolderOpen className="h-3 w-3" />파일 선택</button>
        </div>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {tabs.length > 0 && <div className="mt-3 space-y-1 border-t pt-2">{tabs.map((tab) => <button key={tab.id} title={tab.location} className="block w-full truncate rounded p-1 text-left text-xs hover:bg-muted" onClick={() => { usePreviewStore.getState().select(tab.id); setExpanded(false) }}>{tab.title}</button>)}</div>}
    </div>}
  </div>
}
