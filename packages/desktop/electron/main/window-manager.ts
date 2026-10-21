import { readFileSync, writeFileSync } from 'node:fs'
import type { BrowserWindowConstructorOptions, Display } from 'electron'

export type RestorableBounds = Pick<WindowBounds, 'width' | 'height'> &
  Partial<Pick<WindowBounds, 'x' | 'y' | 'isMaximized'>>

export interface WindowOptionsInput {
  isDarkSystem: boolean
  preloadPath: string
  platform: NodeJS.Platform
  savedBounds?: RestorableBounds | null
}

const DEFAULT_WIDTH = 1100
const DEFAULT_HEIGHT = 750
const MIN_WIDTH = 600
const MIN_HEIGHT = 400

export function computeWindowOptions(
  input: WindowOptionsInput,
): BrowserWindowConstructorOptions {
  const bounds = input.savedBounds
  return {
    width: bounds?.width ?? DEFAULT_WIDTH,
    height: bounds?.height ?? DEFAULT_HEIGHT,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'sepilotd',
    titleBarStyle: input.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(input.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
    backgroundColor: input.isDarkSystem ? '#0a0a0f' : '#f8f8fa',
    show: false,
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  }
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized?: boolean
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.width) &&
    candidate.width >= MIN_WIDTH &&
    isFiniteNumber(candidate.height) &&
    candidate.height >= MIN_HEIGHT
  )
}

export function loadWindowBounds(stateFilePath: string): WindowBounds | null {
  try {
    const raw = readFileSync(stateFilePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return isWindowBounds(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveWindowBounds(stateFilePath: string, bounds: WindowBounds): void {
  try {
    writeFileSync(stateFilePath, JSON.stringify(bounds), 'utf8')
  } catch {
  }
}

export function clampBoundsToDisplays(
  bounds: WindowBounds,
  displays: readonly Display[],
): RestorableBounds {
  const onScreen = displays.some((display) => {
    const area = display.workArea
    return (
      bounds.x + bounds.width > area.x &&
      bounds.x < area.x + area.width &&
      bounds.y + bounds.height > area.y &&
      bounds.y < area.y + area.height
    )
  })
  if (onScreen) return bounds
  const { x: _x, y: _y, ...rest } = bounds
  return rest
}

type AuxiliaryWindowKind = 'quick-input' | 'notification'

export interface AuxiliaryWindowSlot {
  kind: AuxiliaryWindowKind
  isOpen: () => boolean
  open: () => Promise<void>
  close: () => Promise<void>
  toggle?: () => Promise<void>
}

export interface WindowManager {
  registerAuxiliary: (slot: AuxiliaryWindowSlot) => void
  getAuxiliary: (kind: AuxiliaryWindowKind) => AuxiliaryWindowSlot | null
}

export function createWindowManager(): WindowManager {
  const slots = new Map<AuxiliaryWindowKind, AuxiliaryWindowSlot>()
  return {
    registerAuxiliary: (slot) => {
      slots.set(slot.kind, slot)
    },
    getAuxiliary: (kind) => slots.get(kind) ?? null,
  }
}
