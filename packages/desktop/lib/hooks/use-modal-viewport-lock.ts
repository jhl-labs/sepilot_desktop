'use client'

import { useEffect } from 'react'

interface InlineStyleValue {
  value: string
  priority: string
}

interface ViewportSnapshot {
  htmlOverflow: InlineStyleValue
  htmlOverscrollBehavior: InlineStyleValue
  bodyOverflow: InlineStyleValue
  bodyOverscrollBehavior: InlineStyleValue
  scrollX: number
  scrollY: number
}

const activeLocks = new Set<symbol>()
let viewportSnapshot: ViewportSnapshot | null = null

function readInlineStyle(style: CSSStyleDeclaration, property: string): InlineStyleValue {
  return {
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  }
}

function restoreInlineStyle(
  style: CSSStyleDeclaration,
  property: string,
  snapshot: InlineStyleValue,
): void {
  if (snapshot.value) {
    style.setProperty(property, snapshot.value, snapshot.priority)
  } else {
    style.removeProperty(property)
  }
}

function acquireViewportLock(): () => void {
  const token = Symbol('modal-viewport-lock')

  if (activeLocks.size === 0) {
    const htmlStyle = document.documentElement.style
    const bodyStyle = document.body.style
    viewportSnapshot = {
      htmlOverflow: readInlineStyle(htmlStyle, 'overflow'),
      htmlOverscrollBehavior: readInlineStyle(htmlStyle, 'overscroll-behavior'),
      bodyOverflow: readInlineStyle(bodyStyle, 'overflow'),
      bodyOverscrollBehavior: readInlineStyle(bodyStyle, 'overscroll-behavior'),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }

    htmlStyle.setProperty('overflow', 'hidden')
    htmlStyle.setProperty('overscroll-behavior', 'none')
    bodyStyle.setProperty('overflow', 'hidden')
    bodyStyle.setProperty('overscroll-behavior', 'none')
  }

  activeLocks.add(token)
  let released = false

  return () => {
    if (released) return
    released = true
    activeLocks.delete(token)
    if (activeLocks.size > 0 || !viewportSnapshot) return

    const snapshot = viewportSnapshot
    viewportSnapshot = null
    restoreInlineStyle(document.documentElement.style, 'overflow', snapshot.htmlOverflow)
    restoreInlineStyle(
      document.documentElement.style,
      'overscroll-behavior',
      snapshot.htmlOverscrollBehavior,
    )
    restoreInlineStyle(document.body.style, 'overflow', snapshot.bodyOverflow)
    restoreInlineStyle(
      document.body.style,
      'overscroll-behavior',
      snapshot.bodyOverscrollBehavior,
    )

    if (window.scrollX !== snapshot.scrollX || window.scrollY !== snapshot.scrollY) {
      window.scrollTo(snapshot.scrollX, snapshot.scrollY)
    }
  }
}

export function useModalViewportLock(open: boolean): void {
  useEffect(() => {
    if (!open) return
    return acquireViewportLock()
  }, [open])
}
