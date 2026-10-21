import { createResettableStore } from './create-store'

export interface Snippet {
  id: string
  title: string
  language: string
  body: string
  tags: string[]
  gist?: {
    id: string
    file: string
    htmlUrl: string | null
    updatedAt: string | null
    syncedAt: number | null
  } | null
}

interface SnippetsState {
  items: Snippet[]
  setItems: (next: Snippet[]) => void
}

const defaults = { items: [] as Snippet[] }

const { store, reset } = createResettableStore<SnippetsState>(
  (set) => ({
    ...defaults,
    setItems: (items: Snippet[]) => set({ items }),
  }),
  { ...defaults, setItems: () => {} },
)

export const useSnippetsStore = store
export const resetSnippetsStore = reset
