'use client'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/providers/theme-provider'
import { cn } from '@/lib/utils/cn'

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const nextTheme = isDark ? 'light' : 'dark'
        setTheme(nextTheme)
        setIsDark(nextTheme === 'dark')
      }}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(className)}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span className="sr-only">테마 전환</span>
    </Button>
  )
}
