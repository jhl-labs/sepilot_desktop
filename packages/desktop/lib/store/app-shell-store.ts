import { createResettableStore } from './create-store'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Locale = 'ko' | 'en'

interface AppShellState {
  theme: ThemePreference
  locale: Locale
  setTheme: (next: ThemePreference) => void
  setLocale: (next: Locale) => void
}

const defaults = {
  theme: 'system' as ThemePreference,
  locale: 'ko' as Locale,
}

const creator = (set: (partial: Partial<AppShellState>) => void): AppShellState => ({
  ...defaults,
  setTheme: (next) => set({ theme: next }),
  setLocale: (next) => set({ locale: next }),
})

const { store, reset } = createResettableStore<AppShellState>(
  (set) => creator((p) => set(p as AppShellState)),
  creator(() => undefined),
)

export const useAppShellStore = store
export const resetAppShellStore = reset
