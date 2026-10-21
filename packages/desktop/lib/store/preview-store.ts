import { create } from 'zustand'

export interface PreviewTarget {
  kind: 'file' | 'web'
  location: string
}

export function previewTarget(href: string): PreviewTarget | null {
  if (!href || /[\u0000-\u001f]/.test(href) || href.startsWith('#')) return null
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href)
      if (url.username || url.password) return null
      return { kind: 'web', location: url.href }
    } catch { return null }
  }
  if (/^file:\/\//i.test(href)) {
    try {
      const url = new URL(href)
      if (url.hostname && url.hostname !== 'localhost') return null
      return { kind: 'file', location: decodeURIComponent(url.pathname) }
    } catch { return null }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return null
  if (href.startsWith('//') || href.startsWith('\\\\')) return null
  try {
    return { kind: 'file', location: decodeURIComponent(href).replace(/(?::\d+(?::\d+)?|#L\d+(?:-L?\d+)?)$/, '') }
  } catch { return null }
}

export interface PreviewTab extends PreviewTarget {
  id: string
  title: string
  cwd?: string
}

interface PreviewState {
  tabs: PreviewTab[]
  activeId: string | null
  visible: boolean
  open: (target: PreviewTarget, cwd?: string) => void
  select: (id: string) => void
  close: (id: string) => void
  hide: () => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  tabs: [], activeId: null, visible: false,
  open: (target, cwd) => set((state) => {
    const id = JSON.stringify([target.kind, target.location, cwd ?? ''])
    const title = target.kind === 'web' ? new URL(target.location).host : target.location.split(/[\\/]/).pop() || target.location
    const tab = { ...target, cwd, id, title }
    return { tabs: state.tabs.some((item) => item.id === id) ? state.tabs : [...state.tabs.slice(-11), tab], activeId: id, visible: true }
  }),
  select: (id) => set({ activeId: id, visible: true }),
  close: (id) => set((state) => {
    const tabs = state.tabs.filter((tab) => tab.id !== id)
    return { tabs, activeId: state.activeId === id ? tabs.at(-1)?.id ?? null : state.activeId, visible: tabs.length > 0 }
  }),
  hide: () => set({ visible: false }),
}))
