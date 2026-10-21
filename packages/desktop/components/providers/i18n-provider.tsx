'use client'
import { I18nextProvider } from 'react-i18next'
import { useEffect, useState, type ReactNode } from 'react'
import type { i18n as I18n } from 'i18next'
import { initI18n } from '@/lib/i18n'
import { useAppShellStore } from '@/lib/store/app-shell-store'

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useAppShellStore((s) => s.locale)
  const [i18n, setI18n] = useState<I18n | null>(null)

  useEffect(() => {
    let cancelled = false
    void initI18n({ locale }).then((inst) => {
      if (!cancelled) setI18n(inst)
    })
    return () => {
      cancelled = true
    }
  }, [locale])

  if (!i18n) return null
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
