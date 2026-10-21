import {
  getComposerShortcutHint,
  resolveComposerShortcut,
  type ComposerShortcut,
  type ComposerShortcutHintCopy,
} from '@sepilotd/presentation'

export type DesktopComposerShortcut = ComposerShortcut

export interface DesktopComposerShortcutHintCopy extends ComposerShortcutHintCopy {
  help: string
  shellUnsupported: string
  memoryOpen: string
  memorySearch: string
  memoryCommand: string
  memorySave: string
  context: string
}

export function resolveDesktopComposerShortcut(value: string): DesktopComposerShortcut | null {
  return resolveComposerShortcut(value)
}

export function getDesktopComposerShortcutHint(
  value: string,
  copy: DesktopComposerShortcutHintCopy,
): string | null {
  const trimmed = value.trim()
  if (trimmed.startsWith('@')) {
    return getComposerShortcutHint(value, copy, { overrideHint: copy.context })
  }

  return getComposerShortcutHint(value, copy)
}
