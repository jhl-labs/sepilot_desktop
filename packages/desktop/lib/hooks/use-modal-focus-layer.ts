'use client'

import { useCallback, useEffect, useRef } from 'react'

const modalLayers: symbol[] = []

export function useModalFocusLayer(open: boolean): () => boolean {
  const tokenRef = useRef(Symbol('modal-focus-layer'))

  useEffect(() => {
    if (!open) return
    const token = tokenRef.current
    modalLayers.push(token)
    return () => {
      const index = modalLayers.lastIndexOf(token)
      if (index >= 0) modalLayers.splice(index, 1)
    }
  }, [open])

  return useCallback(
    () => modalLayers.length > 0 && modalLayers.at(-1) === tokenRef.current,
    [],
  )
}
