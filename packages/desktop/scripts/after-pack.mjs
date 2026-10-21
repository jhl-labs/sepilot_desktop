import { access, cp, mkdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isForbidden } from '../../../scripts/verify-no-source-leak.mjs'
import { readStagedRuntimeNames } from './runtime-manifest.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultDesktopDir = resolve(scriptDir, '..')
const nonShippingDirectoryNames = new Set([
  '.circleci',
  '.github',
  '.idea',
  '.vscode',
  '__tests__',
  'benchmarks',
  'demos',
  'docs',
  'examples',
])
const nonShippingFilePatterns = [
  /^(?:AUTHORS|CHANGELOG|CONTRIBUTING|HISTORY|LICEN[CS]E|NOTICE|SECURITY)/iu,
  /^README/iu,
  /\.(?:md|markdown)$/iu,
  /^(?:\.babelrc.*|\.editorconfig|\.eslintrc.*|\.npmignore|\.prettierrc.*)$/iu,
  /^(?:jest|rollup|tsup|vite|vitest)\.config.*$/iu,
  /^tsconfig.*\.json$/iu,
  /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/iu,
]

function slash(path) {
  return path.split(sep).join('/')
}

export function shouldCopyRuntimePath(sourceRoot, sourcePath) {
  const relativePath = slash(relative(sourceRoot, sourcePath))
  if (relativePath === '') return true

  const betterSqliteBuild = relativePath.match(
    /(?:^|\/)node_modules\/better-sqlite3\/build(?:\/(.*))?$/u,
  )
  if (betterSqliteBuild) {
    const buildPath = betterSqliteBuild[1] ?? ''
    return buildPath === '' || buildPath === 'Release' || buildPath === 'Release/better_sqlite3.node'
  }

  const segments = relativePath.split('/')
  if (segments.some((segment) => nonShippingDirectoryNames.has(segment))) return false
  if (/node_modules\/(?:ssh2|tar-fs|thread-stream)\/test(?:\/|$)/u.test(relativePath)) {
    return false
  }
  if (isForbidden(relativePath)) return false

  const name = basename(sourcePath)
  return !nonShippingFilePatterns.some((pattern) => pattern.test(name))
}

async function assertPath(path, label) {
  await access(path).catch(() => {
    throw new Error(`Packaged Desktop ${label} is missing: ${path}`)
  })
}

async function copyRuntimeTree({ runtimeName, desktopDir, resourcesDir }) {
  const source = join(desktopDir, '.electron-builder', runtimeName)
  const target = join(resourcesDir, runtimeName)
  const stagedTarget = join(resourcesDir, `.${runtimeName}.sepilotd-copy`)

  await Promise.all([
    assertPath(join(source, 'dist', 'index.js'), `${runtimeName} entry`),
    assertPath(join(source, 'node_modules'), `${runtimeName} dependencies`),
    assertPath(
      join(
        source,
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node',
      ),
      `${runtimeName} native database module`,
    ),
  ])

  await rm(stagedTarget, { recursive: true, force: true })
  try {
    await cp(source, stagedTarget, {
      recursive: true,
      dereference: true,
      force: true,
      filter: (sourcePath) => shouldCopyRuntimePath(source, sourcePath),
    })
    await rm(target, { recursive: true, force: true })
    await rename(stagedTarget, target)
  } catch (error) {
    await rm(stagedTarget, { recursive: true, force: true })
    throw error
  }
}

export async function copyPackagedRuntimeTrees({ appOutDir, desktopDir = defaultDesktopDir }) {
  const resourcesDir = join(appOutDir, 'resources')
  await mkdir(resourcesDir, { recursive: true })

  for (const runtimeName of await readStagedRuntimeNames(desktopDir)) {
    await copyRuntimeTree({ runtimeName, desktopDir, resourcesDir })
  }

  console.log(`[desktop-after-pack] copied packaged runtime dependencies to ${resourcesDir}`)
}

export default async function afterPackDesktop(context) {
  await copyPackagedRuntimeTrees({ appOutDir: context.appOutDir })
}
