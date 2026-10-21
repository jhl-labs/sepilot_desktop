'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ThemePreference } from '@/lib/store/app-shell-store'

interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export interface ThemeProviderProps {
  initial?: ThemePreference
  children: ReactNode
}

export function ThemeProvider({
  initial = 'system',
  children,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemePreference>(initial)

  const apply = useCallback((next: ThemePreference) => {
    if (typeof document === 'undefined') return
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false
    const isDark = next === 'dark' || (next === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  useEffect(() => apply(theme), [theme, apply])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme }),
    [theme],
  )
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
