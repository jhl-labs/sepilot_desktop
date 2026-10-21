import { DEFAULT_NEW_CHAT_MODE, readDefaultNewChatMode } from '@/lib/chat/new-chat-mode'
import { CHAT_BACKENDS, chatBackend, type ChatBackendId } from '@/lib/chat/chat-backends'
import { createResettableStore } from './create-store'
import {
  buildChatModeCatalog,
  CHAT_MODES,
  normalizeChatMode,
  type ChatModeId,
  type ChatModeMeta,
  type ThinkingLevel,
} from '@/lib/chat/chat-modes'
import type { DaemonAgentDescriptor, DaemonRoleBot } from '@sepilotd/api-client'

interface ChatModeState {
  bots: DaemonRoleBot[]
  setBots: (bots: DaemonRoleBot[]) => void
  bot: string | null
  setBot: (bot: string | null) => void
  backendModels: Partial<Record<ChatBackendId, string>>
  setBackendModel: (backend: ChatBackendId, model: string) => void
  backend: ChatBackendId
  setBackend: (backend: ChatBackendId) => void
  mode: ChatModeId
  modeExplicit: boolean
  catalog: readonly ChatModeMeta[]
  catalogSource: 'fallback' | 'daemon'
  thinkingLevel: ThinkingLevel | null
  disableMemory: boolean
  setDisableMemory: (v: boolean) => void
  enableRAG: boolean
  enableImageGen: boolean
  inputTrustLevel: 'trusted' | 'untrusted'
  startNewConversation: () => void
  setMode: (mode: ChatModeId) => void
  setAgentDescriptors: (descriptors: readonly DaemonAgentDescriptor[]) => void
  setThinkingLevel: (level: ThinkingLevel | null) => void
  setEnableRAG: (v: boolean) => void
  setEnableImageGen: (v: boolean) => void
  setInputTrustLevel: (level: 'trusted' | 'untrusted') => void
}

const defaults = {
  bots: [] as DaemonRoleBot[],
  bot: null as string | null,
  backendModels: {} as Partial<Record<ChatBackendId, string>>,
  backend: 'sepilot' as ChatBackendId,
  mode: DEFAULT_NEW_CHAT_MODE as ChatModeId,
  modeExplicit: false,
  catalog: CHAT_MODES,
  catalogSource: 'fallback' as const,
  thinkingLevel: null as ThinkingLevel | null,
  disableMemory: false,
  enableRAG: false,
  enableImageGen: false,
  inputTrustLevel: 'trusted' as 'trusted' | 'untrusted',
}

const { store, reset } = createResettableStore<ChatModeState>(
  (set) => ({
    ...defaults,
    setBots: (bots) => set({ bots }),
    setBot: (bot) => set({ bot, mode: 'auto', modeExplicit: false }),
    setBackendModel: (backend, model) => set((state) => ({ backendModels: { ...state.backendModels, [backend]: model } })),
    setBackend: (backend) => set(() => chatBackend(backend).available ? { backend } : {}),
    startNewConversation: () => set((state) => {
      const mode = state.bot ? 'auto' : readDefaultNewChatMode(state.catalog)
      return { mode, modeExplicit: mode !== 'auto', enableImageGen: false }
    }),
    setMode: (mode) => set((state) => ({
      ...(CHAT_BACKENDS.find((entry) => entry.mode === mode)?.available
        ? { backend: CHAT_BACKENDS.find((entry) => entry.mode === mode)!.id }
        : {}),
      mode: CHAT_BACKENDS.some((entry) => entry.mode === mode) ? state.mode : normalizeChatMode(mode, state.catalog),
      modeExplicit: state.catalog.some((entry) => entry.id === mode),
    })),
    setAgentDescriptors: (descriptors) =>
      set((state) => {
        const catalog = buildChatModeCatalog(descriptors)
        return {
          catalog,
          catalogSource: 'daemon',
          mode: normalizeChatMode(state.mode, catalog),
          modeExplicit: state.modeExplicit && catalog.some((entry) => entry.id === state.mode),
        }
      }),
    setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
    setDisableMemory: (disableMemory) => set({ disableMemory }),
    setEnableRAG: (enableRAG) => set({ enableRAG }),
    setEnableImageGen: (enableImageGen) => set({ enableImageGen }),
    setInputTrustLevel: (inputTrustLevel) => set({ inputTrustLevel }),
  }),
  {
    ...defaults,
    setBackendModel: () => {},
    setBots: () => {},
    setBot: () => {},
    setBackend: () => {},
    startNewConversation: () => {},
    setMode: () => {},
    setAgentDescriptors: () => {},
    setThinkingLevel: () => {},
    setDisableMemory: () => {},
    setEnableRAG: () => {},
    setEnableImageGen: () => {},
    setInputTrustLevel: () => {},
  },
)

export const useChatModeStore = store
export const resetChatModeStore = reset
