import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ThemePersistenceProvider } from '@/components/providers/theme-persistence-provider';

export const metadata: Metadata = {
  title: 'SEPilot Desktop',
  description: 'LLM Desktop Application with LangGraph, RAG, and MCP',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {/* Critical polyfills - must load before React */}
        <Script src="/polyfills.js" strategy="beforeInteractive" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="sepilot-theme"
        >
          <ThemePersistenceProvider>{children}</ThemePersistenceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
