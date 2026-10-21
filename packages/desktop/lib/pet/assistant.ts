import { createPersonaApi } from '@/lib/api/persona'
import { ASSISTANT_SESSION_TAG } from '@/lib/apps/assistant'
import { useChatStore } from '@/lib/store/chat-store'
import { useChatAttachmentsStore } from '@/lib/store/chat-attachments-store'
import { usePersonaStore, type Persona } from '@/lib/store/persona-store'
import type { SessionSummary } from '@/lib/store/session-store'
import type { Transport } from '@/lib/transport/transport-adapter'
import { petPersonaPrompt, type PetConfig } from './model'

export type PetRequestMode = 'continue' | 'web-search'

export interface PetAssistantActions {
  send: (text: string, config: PetConfig, sessionId?: string, mode?: PetRequestMode) => Promise<void>
  resume: (config: PetConfig) => Promise<void>
  openResource: (view: 'office' | 'memory' | 'tasks' | 'wiki') => void
}

export const PET_ASSISTANT_SESSION_TAG = 'surface:pet-assistant'
export function findPetAssistantSession(sessions: readonly SessionSummary[], personaId: string) {
  return sessions.filter(session => session.tags?.includes(PET_ASSISTANT_SESSION_TAG)
    && session.personaIds?.length === 1 && session.personaIds[0] === personaId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export function findAssistantSession(sessions: readonly SessionSummary[], activeId: string | null) {
  const assistants = sessions.filter(session => session.tags?.includes(ASSISTANT_SESSION_TAG))
  return assistants.find(session => session.id === activeId)
    ?? assistants.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export function assertPetAssistantAvailable(queued: boolean) {
  const chat = useChatStore.getState()
  if (queued || chat.pending || chat.pendingQuestion || chat.pendingApprovals.length) {
    throw new Error('진행 중인 대화나 확인 요청이 있습니다. 대화로 돌아가 이어서 진행해 주세요.')
  }
  if (chat.composer.trim() || useChatAttachmentsStore.getState().attachments.length) {
    throw new Error('대화창에 작성 중인 메시지나 첨부가 있습니다. 먼저 확인해 주세요. 펫의 요청은 여기에 보관됩니다.')
  }
}

export async function preparePetPersona(transport: Transport, config: PetConfig): Promise<string> {
  const key = 'sepilot.desktop.pet.persona-id'
  const stored = localStorage.getItem(key)
  const id = stored && /^desktop-pet-[a-f0-9-]{36}$/.test(stored)
    ? stored : `desktop-pet-${crypto.randomUUID()}`
  localStorage.setItem(key, id)
  const api = await createPersonaApi(transport)
  const persona: Persona = { id, name: `${config.name} · 펫`, systemPrompt: petPersonaPrompt(config), isActive: false, memoryScope: 'isolated' }
  const saved = await api.upsert(persona)
  usePersonaStore.getState().upsert({ ...persona, ...saved })
  return id
}
