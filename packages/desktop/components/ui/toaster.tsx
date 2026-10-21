'use client'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/components/providers/theme-provider'

export function Toaster() {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            'pointer-events-none border border-border bg-background text-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'pointer-events-auto bg-primary text-primary-foreground',
          cancelButton: 'pointer-events-auto bg-muted text-muted-foreground',
          closeButton: 'pointer-events-auto',
        },
      }}
    />
  )
}
