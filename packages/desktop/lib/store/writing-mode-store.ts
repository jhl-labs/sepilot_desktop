'use client'
import { create } from 'zustand'
import type { DocDiffPreview, DocSession } from '@sepilotd/api-client'

export interface WritingDocState {
  docId: string | null
  filePath: string | null
  content: string
  version: number
  dirty: boolean
  pendingPreview: DocDiffPreview | null

  setSession: (s: DocSession) => void
  setContent: (content: string) => void
  setVersion: (version: number) => void
  markSaved: (path: string, _mtimeMs: number) => void
  closeSession: () => void
  setPendingPreview: (p: DocDiffPreview | null) => void
}

const empty = {
  docId: null as string | null,
  filePath: null as string | null,
  content: '',
  version: 0,
  dirty: false,
  pendingPreview: null as DocDiffPreview | null,
}

export const useWritingDocStore = create<WritingDocState>((set) => ({
  ...empty,
  setSession: (s) =>
    set({
      docId: s.id,
      filePath: s.path,
      content: s.content,
      version: s.version,
      dirty: s.dirty,
    }),
  setContent: (content) => set({ content, dirty: true }),
  setVersion: (version) => set({ version }),
  markSaved: (path) => set({ filePath: path, dirty: false }),
  closeSession: () => set({ ...empty }),
  setPendingPreview: (pendingPreview) => set({ pendingPreview }),
}))
