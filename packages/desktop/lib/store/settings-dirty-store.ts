import { createResettableStore } from './create-store'

interface SettingsDirtyState {
  dirtyKeys: Record<string, true>
  markDirty: (key: string) => void
  markClean: (key: string) => void
}

const defaults = {
  dirtyKeys: {} as Record<string, true>,
}

const { store, reset } = createResettableStore<SettingsDirtyState>(
  (set, get) => ({
    ...defaults,
    markDirty: (key) => {
      if (get().dirtyKeys[key]) return
      set({ dirtyKeys: { ...get().dirtyKeys, [key]: true } })
    },
    markClean: (key) => {
      if (!(key in get().dirtyKeys)) return
      const next = { ...get().dirtyKeys }
      delete next[key]
      set({ dirtyKeys: next })
    },
  }),
  { ...defaults, markDirty: () => {}, markClean: () => {} },
)

export const useSettingsDirtyStore = store
export const resetSettingsDirtyStore = reset

export function hasUnsavedSettings(): boolean {
  return Object.keys(useSettingsDirtyStore.getState().dirtyKeys).length > 0
}
