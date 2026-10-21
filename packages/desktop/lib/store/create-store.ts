import {
  create,
  type StateCreator,
  type StoreApi,
  type UseBoundStore,
} from 'zustand'

export interface ResettableStore<T> {
  store: UseBoundStore<StoreApi<T>>
  reset: () => void
}

export function createResettableStore<T extends object>(
  initializer: StateCreator<T>,
  initial: T,
): ResettableStore<T> {
  const store = create<T>()(initializer)
  const snapshot = { ...initial }
  return {
    store,
    reset: () => {
      const current = store.getState()
      const merged = { ...current } as Record<string, unknown>
      for (const key of Object.keys(snapshot)) {
        const typedKey = key as keyof T
        if (typeof snapshot[typedKey] !== 'function') {
          merged[key] = snapshot[typedKey]
        }
      }
      store.setState(merged as T, true)
    },
  }
}
