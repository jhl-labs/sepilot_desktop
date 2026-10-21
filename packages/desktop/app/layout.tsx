import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { UpdateNotificationDialog } from '@/components/dialogs/UpdateNotificationDialog'
import { ErrorReportDialog } from '@/components/dialogs/ErrorReportDialog'

export const metadata: Metadata = {
  title: 'sepilotd',
  description: 'sepilotd desktop',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon-32.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        <UpdateNotificationDialog />
        <ErrorReportDialog />
      </body>
    </html>
  )
}
