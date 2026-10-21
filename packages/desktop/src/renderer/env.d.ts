/// <reference types="vite/client" />

import type { SepilotDesktopApi } from '@sepilotd/api-client'

declare global {
  interface Window {
    sepilotd?: {
      on?: <T = unknown>(
        channel: string,
        handler: (payload: T) => void,
      ) => () => void
    }
    sepilot: SepilotDesktopApi
  }
}

export {}
