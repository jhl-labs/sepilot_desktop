'use client'
import { useEffect } from 'react'

export interface Binding {
  combo: string
  handler: (e: KeyboardEvent) => void
  preventDefault?: boolean
}

function matches(combo: string, e: KeyboardEvent): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
  const key = parts[parts.length - 1]
  const wantMod = parts.includes('mod')
  const wantShift = parts.includes('shift')
  const wantAlt = parts.includes('alt')
  const isMod = e.ctrlKey || e.metaKey
  if (wantMod !== isMod) return false
  if (wantShift !== e.shiftKey) return false
  if (wantAlt !== e.altKey) return false
  return e.key.toLowerCase() === key
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    const input = target as HTMLInputElement | HTMLTextAreaElement
    if (!input.readOnly && !input.disabled) return true
  }
  if (target.isContentEditable) return true
  return false
}

function comboHasModifier(combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  return parts.includes('mod') || parts.includes('alt') || parts.includes('shift')
}

export function useKeymap(bindings: Binding[]): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      for (const b of bindings) {
        if (!matches(b.combo, e)) continue
        if (!comboHasModifier(b.combo) && isEditableTarget(e.target)) {
          continue
        }
        if (b.preventDefault !== false) e.preventDefault()
        b.handler(e)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings])
}
