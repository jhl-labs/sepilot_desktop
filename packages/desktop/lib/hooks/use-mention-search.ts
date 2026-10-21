'use client'
import { useEffect, useRef, useState } from 'react'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import { createFilesApi, type FileSearchMatch } from '@/lib/api/files'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'

interface Options {
  cwd: string | null
  query: string | null
  limit?: number
  debounceMs?: number
}

interface State {
  matches: FileSearchMatch[]
  loading: boolean
  error: Error | null
}

const EMPTY: FileSearchMatch[] = []

export function useMentionSearch({
  cwd,
  query,
  limit = 8,
  debounceMs = 150,
}: Options): State {
  const transport = useOptionalTransport()
  const [state, setState] = useState<State>({
    matches: EMPTY,
    loading: false,
    error: null,
  })
  const tokenRef = useRef(0)

  useEffect(() => {
    if (query == null || !cwd || !transport) {
      setState({ matches: EMPTY, loading: false, error: null })
      return
    }
    setState((curr) => ({ ...curr, loading: true, error: null }))
    tokenRef.current += 1
    const myToken = tokenRef.current
    const handle = setTimeout(() => {
      void (async () => {
        try {
          if (await isBrowserPreviewTransport(transport)) {
            if (myToken !== tokenRef.current) return
            setState({ matches: EMPTY, loading: false, error: null })
            return
          }
          const api = await createFilesApi(transport)
          const matches = await api.search(cwd, query, limit)
          if (myToken !== tokenRef.current) return
          setState({ matches, loading: false, error: null })
        } catch (error) {
          if (myToken !== tokenRef.current) return
          setState({
            matches: EMPTY,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      })()
    }, debounceMs)
    return () => {
      clearTimeout(handle)
    }
  }, [transport, cwd, query, limit, debounceMs])

  return state
}
