import { createResettableStore } from './create-store'

export interface WikiNode {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  group: string | null
  order: number
  body?: string
  updatedAt?: number
}

interface WikiState {
  nodes: WikiNode[]
  selectedId: string | null
  setNodes: (next: WikiNode[]) => void
  setSelected: (id: string | null) => void
}

const defaults = { nodes: [] as WikiNode[], selectedId: null as string | null }

const { store, reset } = createResettableStore<WikiState>(
  (set) => ({
    ...defaults,
    setNodes: (nodes: WikiNode[]) => set({ nodes }),
    setSelected: (selectedId: string | null) => set({ selectedId }),
  }),
  { ...defaults, setNodes: () => {}, setSelected: () => {} },
)

export const useWikiStore = store
export const resetWikiStore = reset
