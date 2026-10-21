'use client'
import { useEffect, useState } from 'react'
import { CapabilityUnavailableError } from '@/lib/api/_http'

export type ResourceState<T> =
  | { kind: 'loading' }
  | { kind: 'unavailable'; capability: string }
  | { kind: 'error'; error: Error }
  | { kind: 'ready'; data: T }

export function useCapabilityResource<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    load()
      .then((d) => {
        if (!cancelled) setState({ kind: 'ready', data: d })
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (e instanceof CapabilityUnavailableError)
          setState({ kind: 'unavailable', capability: e.capability })
        else setState({ kind: 'error', error: e })
      })
    return () => {
      cancelled = true
    }
  }, deps)
  return state
}
