export const isMinimalDesktopProfile =
  process.env.NEXT_PUBLIC_SEPILOTD_FEATURE_PROFILE === 'minimal'

export const defaultDesktopSettingsFeatures = Object.freeze({
  google: false,
  'smart-home': false,
  'github-oauth': false,
  'github-sync': false,
  'team-docs': true,
  snippets: false,
  shell: false,
  apps: true,
  canvas: false,
})

export const defaultDesktopModeFeatures = Object.freeze({
  coding: true,
  'computer-use': true,
})

export type DesktopSettingsFeatureId = keyof typeof defaultDesktopSettingsFeatures
export type DesktopSettingsFeatures = Readonly<Record<DesktopSettingsFeatureId, boolean>>
export type DesktopModeFeatureId = keyof typeof defaultDesktopModeFeatures
export type DesktopModeFeatures = Readonly<Record<DesktopModeFeatureId, boolean>>

export interface DesktopAppCatalogProfile {
  readonly enabledTemplateIds: readonly string[] | null
  readonly defaultOpenTemplateIds: readonly string[] | null
}

export const defaultDesktopAppCatalogProfile: DesktopAppCatalogProfile = Object.freeze({
  enabledTemplateIds: null,
  defaultOpenTemplateIds: null,
})

const disabledDesktopAppCatalogProfile: DesktopAppCatalogProfile = Object.freeze({
  enabledTemplateIds: Object.freeze([]),
  defaultOpenTemplateIds: Object.freeze([]),
})

const disabledDesktopSettingsFeatures: DesktopSettingsFeatures = Object.freeze({
  google: false,
  'smart-home': false,
  'github-oauth': false,
  'github-sync': false,
  'team-docs': false,
  snippets: false,
  shell: false,
  apps: false,
  canvas: false,
})

const disabledDesktopModeFeatures: DesktopModeFeatures = Object.freeze({
  coding: false,
  'computer-use': false,
})

export function resolveDesktopSettingsFeatures(
  serialized: string | undefined,
): DesktopSettingsFeatures {
  if (serialized == null || serialized.trim() === '') {
    return defaultDesktopSettingsFeatures
  }
  try {
    const value: unknown = JSON.parse(serialized)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return disabledDesktopSettingsFeatures
    }
    const record = value as Record<string, unknown>
    const resolved: Record<DesktopSettingsFeatureId, boolean> = {
      ...defaultDesktopSettingsFeatures,
    }
    for (const id of Object.keys(defaultDesktopSettingsFeatures) as DesktopSettingsFeatureId[]) {
      if (record[id] === undefined) continue
      if (typeof record[id] !== 'boolean') return disabledDesktopSettingsFeatures
      resolved[id] = record[id]
    }
    if (resolved['github-sync'] && !resolved['github-oauth']) {
      resolved['github-sync'] = false
    }
    return Object.freeze(resolved)
  } catch {
    return disabledDesktopSettingsFeatures
  }
}

export const desktopSettingsFeatures = resolveDesktopSettingsFeatures(
  process.env.NEXT_PUBLIC_SEPILOTD_DESKTOP_SETTINGS_FEATURES,
)

export function resolveDesktopModeFeatures(serialized: string | undefined): DesktopModeFeatures {
  if (serialized == null || serialized.trim() === '') {
    return defaultDesktopModeFeatures
  }
  try {
    const value: unknown = JSON.parse(serialized)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return disabledDesktopModeFeatures
    }
    const record = value as Record<string, unknown>
    const ids = Object.keys(defaultDesktopModeFeatures) as DesktopModeFeatureId[]
    if (Object.keys(record).some((id) => !ids.includes(id as DesktopModeFeatureId))) {
      return disabledDesktopModeFeatures
    }
    const resolved: Record<DesktopModeFeatureId, boolean> = {
      ...defaultDesktopModeFeatures,
    }
    for (const id of ids) {
      if (typeof record[id] !== 'boolean') return disabledDesktopModeFeatures
      resolved[id] = record[id]
    }
    return Object.freeze(resolved)
  } catch {
    return disabledDesktopModeFeatures
  }
}

export const desktopModeFeatures = resolveDesktopModeFeatures(
  process.env.NEXT_PUBLIC_SEPILOTD_DESKTOP_MODE_FEATURES,
)

function normalizeAppTemplateIds(value: unknown): readonly string[] | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const ids: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') return undefined
    const id = entry.trim()
    if (seen.has(id)) return undefined
    seen.add(id)
    ids.push(id)
  }
  return Object.freeze(ids)
}

export function resolveDesktopAppCatalogProfile(
  serialized: string | undefined,
): DesktopAppCatalogProfile {
  if (serialized == null || serialized.trim() === '') return defaultDesktopAppCatalogProfile
  try {
    const value: unknown = JSON.parse(serialized)
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return disabledDesktopAppCatalogProfile
    }
    const record = value as Record<string, unknown>
    if (
      Object.keys(record).some(
        (key) => key !== 'enabledTemplateIds' && key !== 'defaultOpenTemplateIds',
      )
    ) {
      return disabledDesktopAppCatalogProfile
    }
    const enabledTemplateIds = normalizeAppTemplateIds(record.enabledTemplateIds)
    const defaultOpenTemplateIds = normalizeAppTemplateIds(record.defaultOpenTemplateIds)
    if (enabledTemplateIds === undefined || defaultOpenTemplateIds === undefined) {
      return disabledDesktopAppCatalogProfile
    }
    if (enabledTemplateIds != null && defaultOpenTemplateIds != null) {
      const enabled = new Set(enabledTemplateIds)
      if (defaultOpenTemplateIds.some((id) => !enabled.has(id))) {
        return disabledDesktopAppCatalogProfile
      }
    }
    return Object.freeze({ enabledTemplateIds, defaultOpenTemplateIds })
  } catch {
    return disabledDesktopAppCatalogProfile
  }
}

export const desktopAppCatalogProfile = resolveDesktopAppCatalogProfile(
  process.env.NEXT_PUBLIC_SEPILOTD_DESKTOP_APP_CATALOG,
)

export const desktopFeatures = Object.freeze({
  shell: !isMinimalDesktopProfile && desktopSettingsFeatures.shell,
  canvas: !isMinimalDesktopProfile && desktopSettingsFeatures.canvas,
  microApps: !isMinimalDesktopProfile && desktopSettingsFeatures.apps,
  externalAgents: !isMinimalDesktopProfile,
  automation: !isMinimalDesktopProfile,
  collaboration: !isMinimalDesktopProfile,
  extensions: !isMinimalDesktopProfile,
  notifications: !isMinimalDesktopProfile,
  integrations: !isMinimalDesktopProfile,
})

interface SettingsTabAvailabilityInput {
  key: string
  section: string
  buildFeature?: DesktopSettingsFeatureId
}

export function isSettingsTabEnabledForProfile(
  input: SettingsTabAvailabilityInput,
  options: {
    minimal: boolean
    settingsFeatures: DesktopSettingsFeatures
  },
): boolean {
  if (options.minimal) {
    if (['notifications', 'integrations', 'automation'].includes(input.section)) return false
    if (input.key === 'shell') return false
  }
  return input.buildFeature == null || options.settingsFeatures[input.buildFeature]
}

export function isSettingsTabEnabled(input: SettingsTabAvailabilityInput): boolean {
  return isSettingsTabEnabledForProfile(input, {
    minimal: isMinimalDesktopProfile,
    settingsFeatures: desktopSettingsFeatures,
  })
}
