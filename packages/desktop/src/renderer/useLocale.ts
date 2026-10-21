import { useCallback, useEffect, useState } from 'react'

export type SupportedLocale = 'en' | 'ko'

const STORAGE_KEY = 'sepilot_desktop_locale'

function detectInitial(): SupportedLocale {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'ko') return stored
  const language = window.navigator?.language?.toLowerCase() ?? ''
  if (language.startsWith('ko')) return 'ko'
  return 'en'
}

export function readCurrentLocale(): SupportedLocale {
  return detectInitial()
}

export interface LocaleApi {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
  cycleLocale: () => void
}

export function useLocale(): LocaleApi {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => detectInitial())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next)
  }, [])

  const cycleLocale = useCallback(() => {
    setLocaleState((current) => (current === 'ko' ? 'en' : 'ko'))
  }, [])

  return { locale, setLocale, cycleLocale }
}
