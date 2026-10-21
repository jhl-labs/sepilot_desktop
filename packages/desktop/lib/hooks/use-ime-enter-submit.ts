import { useEffect, useRef } from 'react'
import type { CompositionEvent, KeyboardEvent } from 'react'

const IME_CONFIRM_EVENT_GUARD_MS = 100

export function useImeEnterSubmit(onSubmit: (value: string) => void) {
  const submitRef = useRef(onSubmit)
  const compositionActive = useRef(false)
  const submitAfterComposition = useRef(false)
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressEnterUntil = useRef(0)
  submitRef.current = onSubmit

  useEffect(() => () => {
    if (submitTimer.current) clearTimeout(submitTimer.current)
  }, [])

  return {
    handleKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
      const composing = compositionActive.current
        || event.nativeEvent.isComposing
        || event.nativeEvent.keyCode === 229
      if (composing) {
        if (event.key === 'Enter' && !event.shiftKey) submitAfterComposition.current = true
        return true
      }
      if (
        event.key === 'Enter'
        && (submitTimer.current !== null || Date.now() <= suppressEnterUntil.current)
      ) {
        event.preventDefault()
        return true
      }
      return false
    },
    handleCompositionStart(): void {
      compositionActive.current = true
      submitAfterComposition.current = false
    },
    handleCompositionEnd(event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>): void {
      compositionActive.current = false
      if (!submitAfterComposition.current) return
      submitAfterComposition.current = false
      suppressEnterUntil.current = Date.now() + IME_CONFIRM_EVENT_GUARD_MS
      const node = event.currentTarget
      if (submitTimer.current) clearTimeout(submitTimer.current)
      submitTimer.current = setTimeout(() => {
        submitTimer.current = null
        submitRef.current(node.value)
      }, 0)
    },
  }
}
