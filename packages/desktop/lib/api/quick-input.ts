import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface QuickQuestion {
  id: string
  name: string
  prompt: string
  shortcut: string
  enabled: boolean
}

interface QuickInputSettings {
  hotkey: string
  prefix: string
  quickQuestions?: QuickQuestion[]
}

export interface QuickInputApi {
  publish: (text: string) => Promise<void>
  getSettings: () => Promise<QuickInputSettings>
  setSettings: (next: QuickInputSettings) => Promise<QuickInputSettings>
}

export async function createQuickInputApi(
  transport: Transport,
): Promise<QuickInputApi> {
  const http = await makeHttp(transport)
  return {
    publish: (text) =>
      sendJson<void>(
        http,
        'POST',
        '/quick-input/publish',
        { text },
        'quick-input',
      ),
    getSettings: () =>
      getJson<QuickInputSettings>(
        http,
        '/quick-input/settings',
        'quick-input',
      ),
    setSettings: (next) =>
      sendJson<QuickInputSettings>(
        http,
        'PUT',
        '/quick-input/settings',
        next,
        'quick-input',
      ),
  }
}
export { CapabilityUnavailableError }
