import { createResettableStore } from './create-store'
import type { UploadedFileSummary } from '@/lib/api/files'

interface ChatAttachment extends UploadedFileSummary {
  previewUrl?: string
}

interface ChatAttachmentsState {
  attachments: ChatAttachment[]
  add: (entries: ChatAttachment[]) => void
  remove: (id: string) => void
  clear: () => void
  releasePreviews: () => void
}

const defaults = {
  attachments: [] as ChatAttachment[],
}

function revokeIfBlob(url: string | undefined): void {
  if (!url || !url.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(url)
  } catch {
  }
}

const { store, reset } = createResettableStore<ChatAttachmentsState>(
  (set, get) => ({
    ...defaults,
    add: (entries) => {
      const existing = new Map(get().attachments.map((a) => [a.id, a]))
      for (const entry of entries) existing.set(entry.id, entry)
      set({ attachments: Array.from(existing.values()) })
    },
    remove: (id) => {
      const target = get().attachments.find((a) => a.id === id)
      revokeIfBlob(target?.previewUrl)
      set({ attachments: get().attachments.filter((a) => a.id !== id) })
    },
    clear: () => set({ attachments: [] }),
    releasePreviews: () => {
      for (const a of get().attachments) revokeIfBlob(a.previewUrl)
      set({ attachments: [] })
    },
  }),
  {
    ...defaults,
    add: () => {},
    remove: () => {},
    clear: () => {},
    releasePreviews: () => {},
  },
)

export const useChatAttachmentsStore = store
export const resetChatAttachmentsStore = reset
