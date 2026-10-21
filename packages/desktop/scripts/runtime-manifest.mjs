import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const REQUIRED_RUNTIME_NAMES = ['daemon']
export const OPTIONAL_RUNTIME_NAMES = ['gateway']
const LEGACY_RUNTIME_NAMES = [...REQUIRED_RUNTIME_NAMES, ...OPTIONAL_RUNTIME_NAMES]
const MANIFEST_NAME = 'runtimes.json'

export function stagedRuntimeManifestPath(desktopDir) {
  return join(desktopDir, '.electron-builder', MANIFEST_NAME)
}

export function validateRuntimeNames(names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
    throw new Error('Desktop runtime manifest must list runtime names as strings')
  }
  const known = new Set(LEGACY_RUNTIME_NAMES)
  const unknown = names.filter((name) => !known.has(name))
  if (unknown.length > 0) {
    throw new Error(`Desktop runtime manifest lists unknown runtimes: ${unknown.join(', ')}`)
  }
  const missing = REQUIRED_RUNTIME_NAMES.filter((name) => !names.includes(name))
  if (missing.length > 0) {
    throw new Error(`Desktop runtime manifest is missing required runtimes: ${missing.join(', ')}`)
  }
  return [...new Set(names)]
}

export async function writeStagedRuntimeNames(desktopDir, names) {
  const runtimes = validateRuntimeNames(names)
  await writeFile(stagedRuntimeManifestPath(desktopDir), `${JSON.stringify({ runtimes }, null, 2)}\n`)
  return runtimes
}

export async function readStagedRuntimeNames(desktopDir) {
  let text
  try {
    text = await readFile(stagedRuntimeManifestPath(desktopDir), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return [...LEGACY_RUNTIME_NAMES]
    throw error
  }
  return validateRuntimeNames(JSON.parse(text).runtimes)
}
