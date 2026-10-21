import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './styles/theme.css'
import './styles/app.css'
import 'highlight.js/styles/github-dark.min.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Desktop renderer root element is missing')
}

const desktopBridge = (window as Window & { sepilot?: unknown }).sepilot

if (!desktopBridge) {
  createRoot(rootElement).render(
    <div className="empty-state" style={{ paddingTop: '20vh' }}>
      <h2 style={{ color: 'var(--color-error)', marginBottom: 'var(--space-3)' }}>
        Desktop bootstrap failed
      </h2>
      <p className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
        The Electron preload bridge did not initialize. Restart the app.
      </p>
      <p className="text-secondary" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
        If it happens again, check the desktop log in your user data directory.
      </p>
    </div>,
  )
} else {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  )
}
