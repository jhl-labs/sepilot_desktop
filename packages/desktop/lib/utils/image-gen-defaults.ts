export interface ImageGenSizePreset {
  id: string
  label: string
  width: number
  height: number
}

export const IMAGE_GEN_SIZE_PRESETS: ImageGenSizePreset[] = [
  { id: 'sd-512', label: '512x512', width: 512, height: 512 },
  { id: 'sd-768', label: '768x768', width: 768, height: 768 },
  { id: 'sdxl', label: '1024x1024', width: 1024, height: 1024 },
  { id: 'portrait', label: '768x1152', width: 768, height: 1152 },
  { id: 'landscape', label: '1152x768', width: 1152, height: 768 },
]

export function resolveImageGenSizePreset(presetId: string): ImageGenSizePreset {
  return (
    IMAGE_GEN_SIZE_PRESETS.find((p) => p.id === presetId) ??
    IMAGE_GEN_SIZE_PRESETS.find((p) => p.id === IMAGE_GEN_DEFAULT_VALUES.sizePreset) ??
    IMAGE_GEN_SIZE_PRESETS[0]!
  )
}

export interface ImageGenDefaults {
  providerId: string | null
  deviceId: string
  operation: string
  model: string
  sizePreset: string
  steps: number
  cfgScale: number
  seed: number
  batchSize: number
  strength: number
  frames: number
  fps: number
  negativePrompt: string
}

export const IMAGE_GEN_DEFAULT_VALUES: ImageGenDefaults = {
  providerId: null,
  deviceId: 'auto',
  operation: 'text-to-image',
  model: 'stabilityai/sd-turbo',
  sizePreset: 'sd-512',
  steps: 2,
  cfgScale: 0,
  seed: -1,
  batchSize: 1,
  strength: 0.8,
  frames: 16,
  fps: 8,
  negativePrompt: '',
}

const STORAGE_KEY = 'sepilot:image-gen-defaults:v1'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function coerceDefaults(raw: unknown): ImageGenDefaults {
  if (!raw || typeof raw !== 'object') return { ...IMAGE_GEN_DEFAULT_VALUES }
  const r = raw as Record<string, unknown>
  const coerced = {
    providerId: typeof r.providerId === 'string' && r.providerId.length > 0 ? r.providerId : null,
    deviceId:
      typeof r.deviceId === 'string' && r.deviceId.length > 0
        ? r.deviceId
        : IMAGE_GEN_DEFAULT_VALUES.deviceId,
    operation:
      typeof r.operation === 'string' && r.operation.length > 0
        ? r.operation
        : IMAGE_GEN_DEFAULT_VALUES.operation,
    model: typeof r.model === 'string' ? r.model : IMAGE_GEN_DEFAULT_VALUES.model,
    sizePreset:
      typeof r.sizePreset === 'string' && r.sizePreset.length > 0
        ? r.sizePreset
        : IMAGE_GEN_DEFAULT_VALUES.sizePreset,
    steps:
      typeof r.steps === 'number' && Number.isFinite(r.steps) && r.steps >= 1
        ? Math.floor(r.steps)
        : IMAGE_GEN_DEFAULT_VALUES.steps,
    cfgScale:
      typeof r.cfgScale === 'number' && Number.isFinite(r.cfgScale)
        ? r.cfgScale
        : IMAGE_GEN_DEFAULT_VALUES.cfgScale,
    seed:
      typeof r.seed === 'number' && Number.isFinite(r.seed)
        ? Math.floor(r.seed)
        : IMAGE_GEN_DEFAULT_VALUES.seed,
    batchSize:
      typeof r.batchSize === 'number' && Number.isFinite(r.batchSize) && r.batchSize >= 1
        ? Math.min(8, Math.floor(r.batchSize))
        : IMAGE_GEN_DEFAULT_VALUES.batchSize,
    strength:
      typeof r.strength === 'number' && Number.isFinite(r.strength)
        ? Math.min(1, Math.max(0, r.strength))
        : IMAGE_GEN_DEFAULT_VALUES.strength,
    frames:
      typeof r.frames === 'number' && Number.isFinite(r.frames)
        ? Math.min(64, Math.max(1, Math.floor(r.frames)))
        : IMAGE_GEN_DEFAULT_VALUES.frames,
    fps:
      typeof r.fps === 'number' && Number.isFinite(r.fps)
        ? Math.min(30, Math.max(1, Math.floor(r.fps)))
        : IMAGE_GEN_DEFAULT_VALUES.fps,
    negativePrompt:
      typeof r.negativePrompt === 'string'
        ? r.negativePrompt
        : IMAGE_GEN_DEFAULT_VALUES.negativePrompt,
  }
  const looksLikeLegacyDefault =
    coerced.model === '' &&
    coerced.sizePreset === 'sd-768' &&
    coerced.steps === 30 &&
    coerced.cfgScale === 7
  return looksLikeLegacyDefault
    ? {
        ...coerced,
        model: IMAGE_GEN_DEFAULT_VALUES.model,
        sizePreset: IMAGE_GEN_DEFAULT_VALUES.sizePreset,
        steps: IMAGE_GEN_DEFAULT_VALUES.steps,
        cfgScale: IMAGE_GEN_DEFAULT_VALUES.cfgScale,
        strength: IMAGE_GEN_DEFAULT_VALUES.strength,
      }
    : coerced
}

export function loadImageGenDefaults(): ImageGenDefaults {
  if (!isBrowser()) return { ...IMAGE_GEN_DEFAULT_VALUES }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...IMAGE_GEN_DEFAULT_VALUES }
    return coerceDefaults(JSON.parse(raw))
  } catch {
    return { ...IMAGE_GEN_DEFAULT_VALUES }
  }
}

export function saveImageGenDefaults(defaults: Partial<ImageGenDefaults>): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(coerceDefaults(defaults)))
  } catch {
  }
}

export function resetImageGenDefaults(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
  }
}
