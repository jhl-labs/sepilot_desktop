import { chatBackend, type ChatBackendId } from './chat-backends'
import { confirm } from '@/lib/utils/confirm'

type Translator = (key: string) => string
type DisclosureStorage = Pick<Storage, 'getItem' | 'setItem'>

const DISCLOSURE_VERSION = 1
const PROVIDER_MESSAGE_KEYS: Partial<Record<ChatBackendId, string>> = {
  'claude-cli': 'chatBackend.disclosure.claude',
  'codex-cli': 'chatBackend.disclosure.codex',
  'opencode-cli': 'chatBackend.disclosure.opencode',
}

export function externalCliDisclosureKey(backendId: ChatBackendId): string | null {
  if (chatBackend(backendId).daemonFeatures) return null
  return `sepilot.desktop.external-cli-disclosure.v${DISCLOSURE_VERSION}.${backendId}`
}

function browserStorage(): DisclosureStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export async function confirmExternalCliActivation(
  backendId: ChatBackendId,
  t: Translator,
  storage: DisclosureStorage | undefined = browserStorage(),
): Promise<boolean> {
  const key = externalCliDisclosureKey(backendId)
  if (!key) return true

  try {
    if (storage?.getItem(key) === 'acknowledged') return true
  } catch {
  }

  const providerMessageKey = PROVIDER_MESSAGE_KEYS[backendId] ?? 'chatBackend.disclosure.other'
  const accepted = await confirm(
    `${t('chatBackend.disclosure.common')}\n\n${t(providerMessageKey)}`,
    {
      title: t('chatBackend.disclosure.title'),
      confirmLabel: t('chatBackend.disclosure.continue'),
      cancelLabel: t('chatBackend.disclosure.cancel'),
    },
  )
  if (!accepted) return false

  try {
    storage?.setItem(key, 'acknowledged')
  } catch {
  }
  return true
}
