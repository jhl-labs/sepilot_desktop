import Script from 'next/script';
import '@/app/globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';

export default function QuickInputLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans overflow-hidden" suppressHydrationWarning>
        {/* Critical polyfills - must load before React */}
        <Script src="/polyfills.js" strategy="beforeInteractive" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
