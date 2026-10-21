'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export function useTranscriptScroll(sessionId: string | null | undefined, revision: unknown) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const jumpToLatest = useCallback(() => {
    followingRef.current = true
    setShowLatest(false)
    const viewport = viewportRef.current
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight })
  }, [])
  const onScroll = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    followingRef.current = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 48
    setShowLatest(!followingRef.current)
  }, [])

  useLayoutEffect(() => { jumpToLatest() }, [sessionId, jumpToLatest])
  useLayoutEffect(() => {
    if (followingRef.current) jumpToLatest()
  }, [revision, jumpToLatest])
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) jumpToLatest()
    })
    if (contentRef.current) observer.observe(contentRef.current)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [jumpToLatest])

  return { viewportRef, contentRef, onScroll, showLatest, jumpToLatest }
}
