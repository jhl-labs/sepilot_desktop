import {
  DEFAULT_CHAT_OPTION_DEFAULTS,
  sanitizeChatOptions,
  type ChatOptions,
  type ChatStreamOptions,
} from '@sepilotd/api-client'

export function sanitizeDesktopChatOptions(
  options?: ChatOptions | ChatStreamOptions,
): ChatStreamOptions | undefined {
  const sanitized = sanitizeChatOptions(options, DEFAULT_CHAT_OPTION_DEFAULTS)
  const explicitMode =
    typeof options?.mode === 'string' && options.mode.trim()
      ? (options.mode.trim() as NonNullable<ChatOptions['mode']>)
      : undefined
  const normalized: ChatStreamOptions = {
    ...(sanitized ?? {}),
    ...(explicitMode ? { mode: explicitMode } : {}),
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}
