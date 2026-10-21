import { createResettableStore } from './create-store'

type ExtensionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'crashed'
  | 'disabled'

export interface ExtensionItem {
  id: string
  name: string
  enabled: boolean
  status: ExtensionStatus
  error: string | null
}

interface ExtensionsState {
  items: ExtensionItem[]
  version: number
  setItems: (items: ExtensionItem[]) => void
}

const defaults = {
  items: [] as ExtensionItem[],
  version: 0,
}

function areExtensionItemsEqual(a: ExtensionItem[], b: ExtensionItem[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((item, index) => {
    const other = b[index]
    return (
      other != null &&
      item.id === other.id &&
      item.name === other.name &&
      item.enabled === other.enabled &&
      item.status === other.status &&
      item.error === other.error
    )
  })
}

const { store, reset } = createResettableStore<ExtensionsState>(
  (set) => ({
    ...defaults,
    setItems: (items: ExtensionItem[]) =>
      set((state) =>
        areExtensionItemsEqual(state.items, items)
          ? state
          : { items, version: state.version + 1 },
      ),
  }),
  {
    ...defaults,
    setItems: () => {},
  },
)

export const useExtensionsStore = store
export const resetExtensionsStore = reset
