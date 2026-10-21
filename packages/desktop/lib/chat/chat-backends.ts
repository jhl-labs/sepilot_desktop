import { CLI_IMAGE_TYPES } from './cli-chat-contract'
import type { ChatStreamOptions } from '@sepilotd/api-client'

export const CHAT_BACKENDS = [
  { id: 'sepilot', label: 'SEPilot', mode: undefined, available: true, daemonFeatures: true },
  { id: 'codex-cli', label: 'Codex CLI', mode: 'external-codex', available: true, daemonFeatures: false },
  { id: 'claude-cli', label: 'Claude CLI', mode: 'external-claude', available: true, daemonFeatures: false },
  { id: 'gemini-cli', label: 'Gemini CLI', mode: 'external-gemini', available: false, daemonFeatures: false },
  { id: 'opencode-cli', label: 'OpenCode CLI', mode: 'external-opencode', available: true, daemonFeatures: false },
] as const
export type ChatBackendId = typeof CHAT_BACKENDS[number]['id']
export function chatBackend(id: ChatBackendId) {
  return CHAT_BACKENDS.find((entry) => entry.id === id) ?? CHAT_BACKENDS[0]
}

export function backendChatOptions(id: ChatBackendId, options: ChatStreamOptions, model?: string): ChatStreamOptions {
  const backend = chatBackend(id)
  if (!backend.available) throw new Error('External CLI chat adapter is not available.')
  if (backend.daemonFeatures) return options
  return {
    mode: backend.mode,
    ...(model ? { model } : {}),
    ...(options.fileIds?.length ? { fileIds: options.fileIds } : {}),
    cwd: options.cwd,
    workspaceRoot: options.workspaceRoot,
  }
}

export function supportsChatAttachments(id: ChatBackendId, mimeTypes: readonly string[] = []): boolean {
  const backend = chatBackend(id)
  return backend.daemonFeatures || (backend.available && mimeTypes.every((mime) => CLI_IMAGE_TYPES.some((type) => type === mime)))
}
