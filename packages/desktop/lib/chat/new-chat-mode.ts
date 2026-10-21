import { CHAT_MODES, normalizeChatMode, type ChatModeId, type ChatModeMeta } from './chat-modes'

export const DEFAULT_NEW_CHAT_MODE: ChatModeId = 'auto'
const STORAGE_KEY = 'sepilot.default-new-chat-mode.v1'

export function newChatModeOptions(catalog: readonly ChatModeMeta[]): readonly ChatModeMeta[] {
  return catalog.filter((mode) => mode.category !== 'external')
}

export function readDefaultNewChatMode(catalog: readonly ChatModeMeta[] = CHAT_MODES): ChatModeId {
  const options = newChatModeOptions(catalog)
  try {
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
    if (saved && options.some((mode) => mode.id === saved)) return saved
  } catch {}
  return normalizeChatMode(DEFAULT_NEW_CHAT_MODE, options)
}

export function saveDefaultNewChatMode(mode: ChatModeId, catalog: readonly ChatModeMeta[]): void {
  if (!newChatModeOptions(catalog).some((option) => option.id === mode)) throw new Error('Unsupported default chat mode')
  window.localStorage.setItem(STORAGE_KEY, mode)
}
