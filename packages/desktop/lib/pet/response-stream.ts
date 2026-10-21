import type { ChatMessage } from '@/lib/store/chat-store'

export function currentPetAssistantReply(messages: readonly ChatMessage[]): string {
  let latestUser = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') { latestUser = index; break }
  }
  if (latestUser < 0) return ''
  for (let index = messages.length - 1; index > latestUser; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && message.content.trim()) return message.content
  }
  return ''
}

export const PET_STREAM_UPDATE_INTERVAL_MS = 120
