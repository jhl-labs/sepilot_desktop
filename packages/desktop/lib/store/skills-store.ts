import { createResettableStore } from './create-store'
import { reconcileSelectedChatSkillIds, toggleSelectedChatSkillId } from '@sepilotd/api-client'

interface SkillSource {
  type: 'marketplace' | 'git' | 'url'
  ref: string
}

export interface SkillItem {
  name: string
  path?: string
  enabled: boolean
  description: string | null
  id?: string
  version?: string
  author?: string
  tags?: string[]
  tools?: string[]
  source?: SkillSource
}

interface SkillsState {
  items: SkillItem[]
  selectedIds: string[]
  setItems: (next: SkillItem[]) => void
  setEnabled: (name: string, enabled: boolean) => void
  toggleSelected: (id: string) => void
  removeSelected: (id: string) => void
  clearSelected: () => void
}

const defaults = { items: [] as SkillItem[], selectedIds: [] as string[] }

const { store, reset } = createResettableStore<SkillsState>(
  (set, get) => ({
    ...defaults,
    setItems: (items: SkillItem[]) => {
      set({
        items,
        selectedIds: reconcileSelectedChatSkillIds(get().selectedIds, items),
      })
    },
    setEnabled: (name: string, enabled: boolean) => {
      const current = get()
      const matched = current.items.find((skill) => skill.name === name || skill.id === name)
      const selectedId = matched ? (matched.id ?? matched.name) : name
      set({
        items: current.items.map((skill) =>
          skill.name === name || skill.id === name ? { ...skill, enabled } : skill,
        ),
        selectedIds: enabled
          ? current.selectedIds
          : current.selectedIds.filter((id) => id !== selectedId),
      })
    },
    toggleSelected: (id) => {
      set({
        selectedIds: toggleSelectedChatSkillId(get().selectedIds, id),
      })
    },
    removeSelected: (id) =>
      set({
        selectedIds: get().selectedIds.filter((selectedId) => selectedId !== id),
      }),
    clearSelected: () => set({ selectedIds: [] }),
  }),
  {
    ...defaults,
    setItems: () => {},
    setEnabled: () => {},
    toggleSelected: () => {},
    removeSelected: () => {},
    clearSelected: () => {},
  },
)

export const useSkillsStore = store
export const resetSkillsStore = reset
