import { useConfirmStore, type ConfirmRequest } from '@/lib/store/confirm-store'

let nextId = 1
const resolvers = new Map<number, (value: boolean) => void>()

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export function confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  const id = nextId++
  return new Promise<boolean>((resolve) => {
    resolvers.set(id, resolve)
    const request: ConfirmRequest = {
      id,
      message,
      title: options?.title,
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel,
      destructive: options?.destructive,
    }
    useConfirmStore.getState().push(request)
  })
}

export function resolveConfirm(id: number, value: boolean): void {
  const resolve = resolvers.get(id)
  if (!resolve) return
  resolvers.delete(id)
  resolve(value)
  useConfirmStore.getState().resolveHead()
}
