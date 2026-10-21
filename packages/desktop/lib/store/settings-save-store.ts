import { createResettableStore } from './create-store'

interface SettingsSaveState {
  lastSavedKey: string | null
  lastSavedAt: number | null
  recordSave: (key: string, at?: number) => void
  clear: () => void
}

const defaults = {
  lastSavedKey: null as string | null,
  lastSavedAt: null as number | null,
}

const { store, reset } = createResettableStore<SettingsSaveState>(
  (set) => ({
    ...defaults,
    recordSave: (key, at) =>
      set({ lastSavedKey: key, lastSavedAt: at ?? Date.now() }),
    clear: () => set({ ...defaults }),
  }),
  { ...defaults, recordSave: () => {}, clear: () => {} },
)

export const useSettingsSaveStore = store
export const resetSettingsSaveStore = reset

export function recordSettingsSave(key: string): void {
  useSettingsSaveStore.getState().recordSave(key)
}
