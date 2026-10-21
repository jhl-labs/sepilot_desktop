'use client'
import type { ReactNode } from 'react'
import { previewTarget, usePreviewStore } from '@/lib/store/preview-store'
import { useSessionStore } from '@/lib/store/session-store'
import { useSettingsStore } from '@/lib/store/settings-store'

export function PreviewLink({ href, children, baseDirectory }: { href?: string; children: ReactNode; baseDirectory?: string }) {
  const target = href ? previewTarget(href) : null
  return <a
    href={target?.kind === 'file' ? '#' : href}
    target="_blank"
    rel="noopener noreferrer"
    title={target ? `미리보기 · ${target.location}` : undefined}
    className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
    onClick={(event) => {
      if (!target || event.button !== 0 || (target.kind === 'web' && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))) return
      event.preventDefault()
      const { sessions, activeId } = useSessionStore.getState()
      const session = sessions.find((item) => item.id === activeId)
      const cwd = baseDirectory ?? session?.cwd ?? (!session ? useSettingsStore.getState().general.workingDir ?? undefined : undefined)
      usePreviewStore.getState().open(target, cwd)
    }}
  >{children}</a>
}
