export interface ActiveRunController {
  cancel(): void
  dispose(): void
}

export interface ActiveRunRegistry<TController extends ActiveRunController> {
  begin(sessionId?: string): TController
  clear(controller: TController): void
  current(sessionId?: string): TController | null
  cancelAll(): void
}

export function createActiveRunRegistry<TController extends ActiveRunController>(
  factory: () => TController,
): ActiveRunRegistry<TController> {
  const active = new Map<string | undefined, TController>()

  return {
    begin(sessionId) {
      active.get(sessionId)?.cancel()
      active.get(sessionId)?.dispose()
      const controller = factory()
      active.delete(sessionId)
      active.set(sessionId, controller)
      return controller
    },

    clear(controller) {
      controller.dispose()
      for (const [sessionId, current] of active) {
        if (current === controller) active.delete(sessionId)
      }
    },

    current(sessionId) {
      return sessionId === undefined
        ? [...active.values()].at(-1) ?? null
        : active.get(sessionId) ?? null
    },

    cancelAll() {
      for (const controller of active.values()) {
        controller.cancel()
        controller.dispose()
      }
      active.clear()
    },
  }
}
