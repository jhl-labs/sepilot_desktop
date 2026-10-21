import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isAbsolute, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

export const DEFAULT_DESKTOP_SETTINGS_FEATURES = Object.freeze({
  google: true,
  'smart-home': true,
  'github-oauth': true,
  'github-sync': true,
  'team-docs': true,
  snippets: true,
  shell: true,
  apps: true,
  canvas: true,
})

export const DEFAULT_DESKTOP_MODE_FEATURES = Object.freeze({
  coding: true,
  'computer-use': true,
})

export const DEFAULT_DESKTOP_APP_CATALOG = Object.freeze({
  enabledTemplateIds: null,
  defaultOpenTemplateIds: null,
})

const DESKTOP_SETTINGS_FEATURE_IDS = Object.freeze(Object.keys(DEFAULT_DESKTOP_SETTINGS_FEATURES))
const DESKTOP_MODE_FEATURE_IDS = Object.freeze(Object.keys(DEFAULT_DESKTOP_MODE_FEATURES))

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function parseBooleanFeatureGroup({ desktop, group, defaults, ids, source, featureLabel }) {
  const configured = desktop[group]
  if (configured == null) return { ...defaults }
  if (!isRecord(configured)) {
    throw new Error(`${source}: features.desktop.${group} must be a map`)
  }

  const unknown = Object.keys(configured).filter((key) => !ids.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${source}: unknown Desktop ${featureLabel}(s): ${unknown.join(', ')}`)
  }

  const resolved = { ...defaults }
  for (const id of ids) {
    const value = configured[id]
    if (value === undefined) continue
    if (typeof value !== 'boolean') {
      throw new Error(`${source}: features.desktop.${group}.${id} must be a boolean`)
    }
    resolved[id] = value
  }
  return resolved
}

function parseStringList(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`)
  const result = []
  const seen = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error(`${path} entries must be non-empty strings`)
    }
    const id = entry.trim()
    if (seen.has(id)) throw new Error(`${path} contains duplicate app id: ${id}`)
    seen.add(id)
    result.push(id)
  }
  return result
}

function parseDesktopAppCatalog(desktop, source) {
  const configured = desktop.apps
  if (configured == null) return { ...DEFAULT_DESKTOP_APP_CATALOG }
  if (!isRecord(configured)) {
    throw new Error(`${source}: features.desktop.apps must be a map`)
  }

  const knownKeys = ['enabled-template-ids', 'default-open-template-ids']
  const unknown = Object.keys(configured).filter((key) => !knownKeys.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${source}: unknown Desktop apps setting(s): ${unknown.join(', ')}`)
  }

  const enabledTemplateIds =
    configured['enabled-template-ids'] === undefined
      ? null
      : parseStringList(
          configured['enabled-template-ids'],
          `${source}: features.desktop.apps.enabled-template-ids`,
        )
  const defaultOpenTemplateIds =
    configured['default-open-template-ids'] === undefined
      ? enabledTemplateIds == null
        ? null
        : [...enabledTemplateIds]
      : parseStringList(
          configured['default-open-template-ids'],
          `${source}: features.desktop.apps.default-open-template-ids`,
        )

  if (enabledTemplateIds != null && defaultOpenTemplateIds != null) {
    const enabled = new Set(enabledTemplateIds)
    const unavailable = defaultOpenTemplateIds.filter((id) => !enabled.has(id))
    if (unavailable.length > 0) {
      throw new Error(
        `${source}: default-open-template-ids must be enabled first: ${unavailable.join(', ')}`,
      )
    }
  }

  return { enabledTemplateIds, defaultOpenTemplateIds }
}

export function parseDesktopBuildProfile(raw, source = 'build.features.yaml') {
  const document = parseYaml(raw)
  const features = document?.features
  if (features == null) {
    return {
      settings: { ...DEFAULT_DESKTOP_SETTINGS_FEATURES },
      modes: { ...DEFAULT_DESKTOP_MODE_FEATURES },
      apps: { ...DEFAULT_DESKTOP_APP_CATALOG },
    }
  }
  if (!isRecord(features)) {
    throw new Error(`${source}: features must be a map`)
  }

  const desktop = features.desktop
  if (desktop == null) {
    return {
      settings: { ...DEFAULT_DESKTOP_SETTINGS_FEATURES },
      modes: { ...DEFAULT_DESKTOP_MODE_FEATURES },
      apps: { ...DEFAULT_DESKTOP_APP_CATALOG },
    }
  }
  if (!isRecord(desktop)) {
    throw new Error(`${source}: features.desktop must be a map`)
  }
  const unknownDesktopKeys = Object.keys(desktop).filter(
    (key) => key !== 'settings' && key !== 'modes' && key !== 'apps',
  )
  if (unknownDesktopKeys.length > 0) {
    throw new Error(`${source}: unknown Desktop feature group(s): ${unknownDesktopKeys.join(', ')}`)
  }

  const settings = parseBooleanFeatureGroup({
    desktop,
    group: 'settings',
    defaults: DEFAULT_DESKTOP_SETTINGS_FEATURES,
    ids: DESKTOP_SETTINGS_FEATURE_IDS,
    source,
    featureLabel: 'settings feature',
  })
  const modes = parseBooleanFeatureGroup({
    desktop,
    group: 'modes',
    defaults: DEFAULT_DESKTOP_MODE_FEATURES,
    ids: DESKTOP_MODE_FEATURE_IDS,
    source,
    featureLabel: 'mode',
  })
  const apps = parseDesktopAppCatalog(desktop, source)

  if (settings['github-sync'] && !settings['github-oauth']) {
    throw new Error(
      `${source}: Desktop setting 'github-sync' requires 'github-oauth'; ` +
        'disable github-sync too, or enable github-oauth',
    )
  }

  return { settings, modes, apps }
}

export function parseDesktopBuildFeatures(raw, source = 'build.features.yaml') {
  return parseDesktopBuildProfile(raw, source).settings
}

export function parseDesktopModeBuildFeatures(raw, source = 'build.features.yaml') {
  return parseDesktopBuildProfile(raw, source).modes
}

export function loadDesktopBuildProfile(options = {}) {
  const selectedPath =
    options.featuresFile ?? process.env.SEPILOT_BUILD_FEATURES_FILE ?? 'build.features.yaml'
  const featuresFile = isAbsolute(selectedPath)
    ? selectedPath
    : resolve(fileURLToPath(new URL('../../', import.meta.url)), selectedPath)

  try {
    return parseDesktopBuildProfile(readFileSync(featuresFile, 'utf8'), featuresFile)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`Desktop build feature manifest not found: ${featuresFile}`, {
        cause: error,
      })
    }
    throw error
  }
}

export function loadDesktopBuildFeatures(options = {}) {
  return loadDesktopBuildProfile(options).settings
}

export function loadDesktopModeBuildFeatures(options = {}) {
  return loadDesktopBuildProfile(options).modes
}
