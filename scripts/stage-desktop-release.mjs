#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { access, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuild } from '@electron/rebuild'
import { pruneThirdPartyRuntimeFixtures } from './lib/release-runtime-sanitizer.mjs'
import { isolateNativePackageTree } from './lib/release-native-isolation.mjs'
import {
  stagedRuntimeManifestPath,
  writeStagedRuntimeNames,
} from '../packages/desktop/scripts/runtime-manifest.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const desktopDir = resolve(repoRoot, 'packages', 'desktop')
const appRoot = resolve(desktopDir, '.electron-builder', 'app')
const daemonRoot = resolve(desktopDir, '.electron-builder', 'daemon')
const gatewayRoot = resolve(desktopDir, '.electron-builder', 'gateway')
const electronVersion = JSON.parse(
  await readFile(resolve(desktopDir, 'node_modules', 'electron', 'package.json'), 'utf8'),
).version
const targetArch = process.env.npm_config_target_arch ?? process.env.npm_config_arch ?? process.arch
const desktopPackage = JSON.parse(await readFile(resolve(desktopDir, 'package.json'), 'utf8'))

function resolveReleaseBuildId() {
  const explicit = process.env.SEPILOT_BUILD_ID?.trim()
  if (explicit) return explicit
  const githubSha = process.env.GITHUB_SHA?.trim()
  if (githubSha) return `sepilotd-${githubSha.slice(0, 16)}`
  const result = spawnSync('git', ['rev-parse', '--short=16', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const revision = result.status === 0 ? result.stdout.trim() : desktopPackage.version
  return `sepilotd-${revision.replace(/[^A-Za-z0-9._-]/gu, '-').slice(0, 48)}`
}

const releaseBuildEnv = {
  ...process.env,
  NODE_ENV: 'production',
  SEPILOTD_RELEASE_BUILD: '1',
  SEPILOT_BUILD_ID: resolveReleaseBuildId(),
}

function run(command, args, options = {}) {
  const startedAt = Date.now()
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  console.log(
    `[stage-desktop-release] ${command} ${args.join(' ')} completed in ${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s`,
  )
}

function deployPackage(pkg, target) {
  run('pnpm', [
    '--config.allow-unused-patches=true',
    '--filter',
    pkg,
    'deploy',
    '--legacy',
    '--prod',
    '--node-linker=hoisted',
    '--package-import-method=copy',
    target,
  ])
  run(process.execPath, ['scripts/materialize-node-symlinks.mjs', resolve(target, 'node_modules')])
}

async function rebuildElectronNativeModules(target) {
  const startedAt = Date.now()
  await rebuild({
    buildPath: target,
    projectRootPath: target,
    electronVersion,
    arch: targetArch,
    platform: process.platform,
    force: true,
    onlyModules: ['better-sqlite3'],
    types: ['prod', 'optional'],
  })
  console.log(
    `[stage-desktop-release] rebuilt better-sqlite3 for Electron ${electronVersion} in ${target} (${(
      (Date.now() - startedAt) /
      1000
    ).toFixed(1)}s)`,
  )
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function assertDesktopStageLayout() {
  const required = [
    join(appRoot, 'package.json'),
    join(appRoot, 'out', 'index.html'),
    join(appRoot, 'out', 'main', 'index.js'),
    join(appRoot, 'out', 'preload', 'index.js'),
    join(appRoot, 'build', 'icon.png'),
    join(appRoot, 'node_modules', 'node-pty'),
  ]
  for (const path of required) {
    if (!(await pathExists(path))) {
      throw new Error(`desktop runtime staging is missing required path: ${path}`)
    }
  }

  const topLevelEntries = await readdir(appRoot)
  const forbiddenTopLevel = topLevelEntries.filter(
    (name) =>
      name === '.next' || name === 'public' || name === 'release' || /^release-/u.test(name),
  )
  if (forbiddenTopLevel.length > 0) {
    throw new Error(
      `desktop runtime staging contains non-shipping build outputs: ${forbiddenTopLevel.join(', ')}`,
    )
  }

  const forbiddenPackages = [
    join(appRoot, 'node_modules', 'next'),
    join(appRoot, 'node_modules', '@next'),
    join(appRoot, 'node_modules', '@sepilotd', 'gateway'),
  ]
  for (const path of forbiddenPackages) {
    if (await pathExists(path)) {
      throw new Error(`desktop runtime staging contains build-only dependency: ${path}`)
    }
  }
}

async function pruneUnshippedRuntimeFiles(runtimeRoots) {
  const required = [
    join(daemonRoot, 'dist', 'index.js'),
    join(daemonRoot, 'dist', 'embedded.js'),
    ...(runtimeRoots.includes(gatewayRoot) ? [join(gatewayRoot, 'dist', 'index.js')] : []),
  ]
  for (const path of required) {
    if (!(await pathExists(path))) {
      throw new Error(`desktop runtime staging is missing required entry: ${path}`)
    }
  }

  for (const name of ['main.js', 'benchmark.js']) {
    await rm(join(daemonRoot, 'dist', name), { force: true })
  }

  const ssh2Constants = join(daemonRoot, 'node_modules', 'ssh2', 'lib', 'protocol', 'constants.js')
  if (!(await pathExists(ssh2Constants))) {
    throw new Error(`desktop daemon staging is missing required ssh2 runtime: ${ssh2Constants}`)
  }
  if ((await readFile(ssh2Constants, 'utf8')).includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      `desktop daemon staging contains ssh2's unpatched static private key: ${ssh2Constants}`,
    )
  }

  await pruneThirdPartyRuntimeFixtures(runtimeRoots)
}

const bundleGateway = await pathExists(resolve(repoRoot, 'packages', 'gateway', 'package.json'))
const runtimeRoots = bundleGateway ? [daemonRoot, gatewayRoot] : [daemonRoot]

run(
  'pnpm',
  [
    'turbo',
    'build',
    '--env-mode=loose',
    '--filter=@sepilotd/daemon...',
    ...(bundleGateway ? ['--filter=@sepilotd/gateway...'] : []),
    '--filter=@sepilotd/desktop...',
  ],
  { env: releaseBuildEnv },
)

await rm(appRoot, { recursive: true, force: true })
await rm(daemonRoot, { recursive: true, force: true })
await rm(gatewayRoot, { recursive: true, force: true })
await rm(stagedRuntimeManifestPath(desktopDir), { force: true })

deployPackage('@sepilotd/desktop', appRoot)
deployPackage('@sepilotd/daemon', daemonRoot)
if (bundleGateway) deployPackage('@sepilotd/gateway', gatewayRoot)

await assertDesktopStageLayout()
await pruneUnshippedRuntimeFiles(runtimeRoots)

for (const runtimeRoot of runtimeRoots) {
  await isolateNativePackageTree(join(runtimeRoot, 'node_modules', 'better-sqlite3'))
}
for (const runtimeRoot of runtimeRoots) {
  await rebuildElectronNativeModules(runtimeRoot)
}

run(process.execPath, ['scripts/harden-release-artifacts.mjs', appRoot, ...runtimeRoots], {
  env: releaseBuildEnv,
})

await writeStagedRuntimeNames(desktopDir, bundleGateway ? ['daemon', 'gateway'] : ['daemon'])
