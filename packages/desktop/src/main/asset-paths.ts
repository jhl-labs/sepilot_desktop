import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface DesktopAssetPaths {
  preloadPath: string
  rendererPath: string
  nextStaticEntry: string | null
  nextStaticRoot: string | null
}

function resolveExistingPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[candidates.length - 1]
}

export function resolveDesktopAssetPaths(mainDir: string): DesktopAssetPaths {
  const bundledPreloadPath = join(mainDir, '../preload/index.js')
  const bundledRendererPath = join(mainDir, '../renderer/index.html')
  const bundledNextRoot = join(mainDir, '..')
  const bundledNextEntry = join(bundledNextRoot, 'index.html')

  if (!app.isPackaged || typeof process.resourcesPath !== 'string') {
    return {
      preloadPath: bundledPreloadPath,
      rendererPath: bundledRendererPath,
      nextStaticEntry: existsSync(bundledNextEntry) ? bundledNextEntry : null,
      nextStaticRoot: existsSync(bundledNextEntry) ? bundledNextRoot : null,
    }
  }

  const unpackedRoot = join(process.resourcesPath, 'app.asar.unpacked', 'out')
  const nextStaticEntry = resolveExistingPath([
    join(unpackedRoot, 'index.html'),
    bundledNextEntry,
  ])

  return {
    preloadPath: resolveExistingPath([
      join(unpackedRoot, 'preload', 'index.js'),
      bundledPreloadPath,
    ]),
    rendererPath: resolveExistingPath([
      join(unpackedRoot, 'renderer', 'index.html'),
      bundledRendererPath,
    ]),
    nextStaticEntry: existsSync(nextStaticEntry) ? nextStaticEntry : null,
    nextStaticRoot: existsSync(nextStaticEntry)
      ? join(nextStaticEntry, '..')
      : null,
  }
}
