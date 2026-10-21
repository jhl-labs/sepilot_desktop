import { createResettableStore } from './create-store'
import type { ThemePreference, Locale } from './app-shell-store'

interface GeneralSettings {
  theme: ThemePreference
  locale: Locale
  workingDir: string | null
}

interface LlmSettings {
  providerId: string | null
  modelId: string | null
  maxTokens: number | null
  temperature: number | null
}

interface SettingsState {
  general: GeneralSettings
  llm: LlmSettings
  setGeneral: (next: Partial<GeneralSettings>) => void
  setLlm: (next: Partial<LlmSettings>) => void
}

const defaults = {
  general: {
    theme: 'system' as ThemePreference,
    locale: 'ko' as Locale,
    workingDir: null as string | null,
  },
  llm: {
    providerId: null as string | null,
    modelId: null as string | null,
    maxTokens: null as number | null,
    temperature: null as number | null,
  },
}

const { store, reset } = createResettableStore<SettingsState>(
  (set, get) => ({
    ...defaults,
    setGeneral: (next: Partial<GeneralSettings>) =>
      set({ general: { ...get().general, ...next } }),
    setLlm: (next: Partial<LlmSettings>) =>
      set({ llm: { ...get().llm, ...next } }),
  }),
  {
    ...defaults,
    setGeneral: () => {},
    setLlm: () => {},
  },
)

export const useSettingsStore = store
export const resetSettingsStore = reset
