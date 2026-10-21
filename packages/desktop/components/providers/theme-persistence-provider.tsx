'use client'
import { useEffect, type ReactNode } from 'react'
import { useTheme } from './theme-provider'
import type { ThemePreference } from '@/lib/store/app-shell-store'

const STORAGE_KEY = 'sepilotd.theme'

export function ThemePersistenceProvider({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(STORAGE_KEY) as
      | ThemePreference
      | null
    if (saved && saved !== theme) setTheme(saved)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  return <>{children}</>
}
