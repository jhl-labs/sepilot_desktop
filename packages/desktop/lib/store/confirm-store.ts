import { createResettableStore } from './create-store'

export interface ConfirmRequest {
  id: number
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  queue: ConfirmRequest[]
  push: (request: ConfirmRequest) => void
  resolveHead: () => void
}

const defaults = {
  queue: [] as ConfirmRequest[],
}

const { store, reset } = createResettableStore<ConfirmState>(
  (set, get) => ({
    ...defaults,
    push: (request) => set({ queue: [...get().queue, request] }),
    resolveHead: () => set({ queue: get().queue.slice(1) }),
  }),
  {
    ...defaults,
    push: () => {},
    resolveHead: () => {},
  },
)

export const useConfirmStore = store
export const resetConfirmStore = reset
