#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises'
import { availableParallelism, totalmem } from 'node:os'
import { dirname, extname, basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { logicalRelativePath } from './lib/release-hardening.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_CACHE_DIR = join(REPO_ROOT, 'node_modules', '.cache', 'sepilotd-release-hardening-v4')
const DEFAULT_CACHE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024

const SKIP_DIRS = new Set(['.git', '.turbo', '.next/cache', '.single-file-cli-build', 'release'])

const REMOVE_EXTENSIONS = new Set(['.map', '.pdb', '.tsbuildinfo'])
const REMOVE_FILE_PATTERNS = [/\.d\.[cm]?ts$/u, /\.env(?:\..*)?$/u, /^\.npmrc$/u]

const TRUSTED_VENDOR_HASHES = new Map([
  ['out/vendor/mermaid.min.js', '18327bef70d96fb505fe7287d9f6a7362ebf07ff6576ddfaffb1a06f3e1a2954'],
  ['out/vendor/plotly.min.js', 'df2d6ef7fdd63cff4b9709d0688bdf8865b34e63346339c669ba2c2ed75b2f6f'],
])

function parseInteger(value, label, minimum, maximum) {
  if (!/^[1-9]\d*$/u.test(value ?? '')) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

export function defaultWorkerCount() {
  const cpuBudget = Math.max(1, availableParallelism() - 1)
  const memoryBudget = Math.max(1, Math.floor(totalmem() / (8 * 1024 * 1024 * 1024)))
  return Math.max(1, Math.min(4, cpuBudget, memoryBudget))
}

export function parseArgs(argv, env = process.env) {
  const args = {
    roots: [],
    obfuscate: env.SEPILOTD_RELEASE_OBFUSCATE !== '0',
    minify: env.SEPILOTD_RELEASE_MINIFY !== '0',
    cacheDir: null,
    cacheExplicit: false,
    workers: null,
  }

  let cacheEnabled = env.SEPILOTD_RELEASE_HARDEN_CACHE !== '0'
  const envCacheDir = env.SEPILOTD_RELEASE_HARDEN_CACHE_DIR?.trim()
  if (envCacheDir) {
    args.cacheDir = resolve(envCacheDir)
    args.cacheExplicit = true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--no-obfuscate') {
      args.obfuscate = false
      continue
    }
    if (arg === '--no-minify') {
      args.minify = false
      continue
    }
    if (arg === '--no-cache') {
      cacheEnabled = false
      args.cacheDir = null
      args.cacheExplicit = true
      continue
    }
    if (arg === '--cache-dir' || arg === '--workers') {
      const value = argv[index + 1]
      if (!value) throw new Error(`${arg} requires a value`)
      index += 1
      if (arg === '--cache-dir') {
        args.cacheDir = resolve(value)
        args.cacheExplicit = true
        cacheEnabled = true
      } else {
        args.workers = parseInteger(value, '--workers', 1, 4)
      }
      continue
    }
    if (arg.startsWith('--cache-dir=')) {
      args.cacheDir = resolve(arg.slice('--cache-dir='.length))
      args.cacheExplicit = true
      cacheEnabled = true
      continue
    }
    if (arg.startsWith('--workers=')) {
      args.workers = parseInteger(arg.slice('--workers='.length), '--workers', 1, 4)
      continue
    }
    if (arg.startsWith('-')) throw new Error(`unknown release hardening option: ${arg}`)
    args.roots.push(resolve(arg))
  }

  const envWorkers = env.SEPILOTD_RELEASE_HARDEN_WORKERS?.trim()
  if (args.workers === null && envWorkers) {
    args.workers = parseInteger(envWorkers, 'SEPILOTD_RELEASE_HARDEN_WORKERS', 1, 4)
  }
  args.workers ??= defaultWorkerCount()

  if (env.CI && env.SEPILOTD_RELEASE_HARDEN_CACHE_TRUSTED !== '1') {
    if (args.cacheExplicit && cacheEnabled) {
      throw new Error('CI release hardening cache requires SEPILOTD_RELEASE_HARDEN_CACHE_TRUSTED=1')
    }
    cacheEnabled = false
  }
  if (!cacheEnabled) args.cacheDir = null
  else args.cacheDir ??= DEFAULT_CACHE_DIR

  if (args.roots.length === 0) {
    throw new Error(
      'Usage: node scripts/harden-release-artifacts.mjs [--workers=1..4] [--no-cache] <release-root> [more-roots...]',
    )
  }
  return args
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function slash(path) {
  return path.split(sep).join('/')
}

function shouldSkipDir(dirName, relPath) {
  const rel = slash(relPath)
  if (SKIP_DIRS.has(dirName) || SKIP_DIRS.has(rel)) return true
  if (/^release-/u.test(dirName)) return true
  if (rel === 'node_modules/.cache' || rel.includes('/node_modules/.cache/')) return true
  return false
}

function shouldRemoveFile(filePath) {
  const name = basename(filePath)
  if (REMOVE_EXTENSIONS.has(extname(name))) return true
  return REMOVE_FILE_PATTERNS.some((pattern) => pattern.test(name))
}

function isJavaScriptFile(filePath) {
  return filePath.endsWith('.js') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs')
}

function isFirstPartyJavaScript(root, filePath) {
  const rel = slash(relative(root, filePath))
  if (rel.includes('/node_modules/') && !rel.includes('/node_modules/@sepilotd/')) return false
  if (rel.startsWith('node_modules/') && !rel.startsWith('node_modules/@sepilotd/')) return false
  return isJavaScriptFile(filePath)
}

function pathContains(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function validateCacheLocation(cacheDir, roots) {
  if (!cacheDir) return null
  let canonicalCacheDir
  try {
    await mkdir(cacheDir, { recursive: true })
    canonicalCacheDir = await realpath(cacheDir)
  } catch (error) {
    console.warn(`release hardening cache is unavailable and will be disabled: ${String(error)}`)
    return null
  }

  for (const root of roots) {
    const canonicalRoot = await realpath(root)
    if (
      pathContains(canonicalRoot, canonicalCacheDir) ||
      pathContains(canonicalCacheDir, canonicalRoot)
    ) {
      throw new Error(
        `release hardening cache must not overlap a release root: cache=${canonicalCacheDir}, root=${canonicalRoot}`,
      )
    }
  }
  return canonicalCacheDir
}

function validateReleasePolicy(args, env = process.env) {
  const strictRelease = env.SEPILOTD_RELEASE_BUILD === '1' || Boolean(env.CI)
  if (env.SEPILOTD_SKIP_RELEASE_HARDENING === '1') {
    if (strictRelease) {
      throw new Error('release hardening cannot honor the skip switch in a release or CI build')
    }
    return { skip: true, strictRelease }
  }
  if (strictRelease && (!args.minify || !args.obfuscate)) {
    throw new Error('release or CI builds cannot disable minification or obfuscation')
  }
  return { skip: false, strictRelease }
}

async function loadSecretScanner() {
  const module = await import(
    new URL('../sepilot-cli/packages/bundle/scripts/secret-scan.ts', import.meta.url).href
  )
  if (typeof module.scanArtifactBytes !== 'function') {
    throw new Error('release secret scanner does not export scanArtifactBytes')
  }
  return module.scanArtifactBytes
}

async function collectRoot(root, rootIndex, scanArtifactBytes) {
  const tasks = []
  const removals = []
  const stats = {
    scanned: 0,
    candidates: 0,
    trustedVendors: 0,
    removed: 0,
    skippedDirs: 0,
  }

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const filePath = resolve(current, entry.name)
      const relPath = relative(root, filePath)

      if (entry.isDirectory()) {
        if (shouldRemoveFile(filePath)) {
          removals.push({ filePath, recursive: true, rootIndex })
          continue
        }
        if (shouldSkipDir(entry.name, relPath)) {
          stats.skippedDirs += 1
          continue
        }
        await walk(filePath)
        continue
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      if (shouldRemoveFile(filePath)) {
        removals.push({ filePath, recursive: false, rootIndex })
        continue
      }
      if (!entry.isFile() || !isFirstPartyJavaScript(root, filePath)) continue

      const rawInput = await readFile(filePath)
      const expectedInputHash = createHash('sha256').update(rawInput).digest('hex')
      const scanResult = scanArtifactBytes(rawInput, filePath)
      stats.scanned += 1
      if (!scanResult.ok) {
        throw new Error(
          `release hardening blocked a secret-like raw input ${filePath}:\n${scanResult.findings.join('\n')}`,
        )
      }

      const logicalPath = logicalRelativePath(rootIndex, root, filePath)
      const rootRelativePath = logicalPath.slice(logicalPath.indexOf(':') + 1)
      const trustedHash = TRUSTED_VENDOR_HASHES.get(rootRelativePath)
      if (trustedHash) {
        if (expectedInputHash !== trustedHash) {
          throw new Error(
            `trusted vendor artifact changed without review: ${rootRelativePath} (${expectedInputHash})`,
          )
        }
        stats.trustedVendors += 1
        continue
      }

      const info = await stat(filePath)
      tasks.push({
        filePath,
        logicalPath,
        rootIndex,
        size: info.size,
        expectedInputHash,
      })
      stats.candidates += 1
    }
  }

  await walk(root)
  return { tasks, removals, stats }
}

async function runBounded(items, concurrency, operation) {
  let cursor = 0
  async function consume() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      await operation(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()))
}

function balanceTasks(tasks, workerCount) {
  const count = Math.min(workerCount, tasks.length)
  const buckets = Array.from({ length: count }, () => ({ bytes: 0, tasks: [] }))
  const sorted = [...tasks].sort((left, right) => right.size - left.size)
  for (const task of sorted) {
    let lightest = buckets[0]
    for (const bucket of buckets) {
      if (bucket.bytes < lightest.bytes) lightest = bucket
    }
    lightest.tasks.push(task)
    lightest.bytes += task.size
  }
  return buckets
}

function waitForWorker(worker) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    worker.once('message', (message) => {
      if (settled) return
      if (message?.type === 'done') {
        settled = true
        resolvePromise(message.stats)
      } else if (message?.type === 'error') {
        settled = true
        rejectPromise(new Error(message.error ?? 'release hardening worker failed'))
      }
    })
    worker.once('error', (error) => {
      if (settled) return
      settled = true
      rejectPromise(error)
    })
    worker.once('exit', (code) => {
      if (settled) return
      settled = true
      if (code === 0) {
        rejectPromise(new Error('release hardening worker exited without a result'))
      } else {
        rejectPromise(new Error(`release hardening worker exited with code ${code}`))
      }
    })
  })
}

async function hardenTasks(tasks, args) {
  if (tasks.length === 0) return []
  const buckets = balanceTasks(tasks, args.workers)
  const workers = []
  try {
    for (const bucket of buckets) {
      workers.push(
        new Worker(new URL('./harden-release-worker.mjs', import.meta.url), {
          workerData: {
            tasks: bucket.tasks,
            options: {
              cacheDir: args.cacheDir,
              minify: args.minify,
              obfuscate: args.obfuscate,
            },
          },
        }),
      )
    }
    return await Promise.all(workers.map(waitForWorker))
  } catch (error) {
    await Promise.allSettled(workers.map((worker) => worker.terminate()))
    throw error
  }
}

function mergeWorkerStats(workerStats) {
  const total = {
    hardened: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheCorrupt: 0,
    cacheUnavailable: 0,
    cacheDisabled: 0,
    cacheWarnings: 0,
    elapsedTaskMs: 0,
    byRoot: {},
  }
  for (const stats of workerStats) {
    for (const key of [
      'hardened',
      'cacheHits',
      'cacheMisses',
      'cacheCorrupt',
      'cacheUnavailable',
      'cacheDisabled',
      'cacheWarnings',
      'elapsedTaskMs',
    ]) {
      total[key] += stats[key] ?? 0
    }
    for (const [rootIndex, rootStats] of Object.entries(stats.byRoot ?? {})) {
      const current = total.byRoot[rootIndex] ?? { hardened: 0, cacheHits: 0 }
      current.hardened += rootStats.hardened ?? 0
      current.cacheHits += rootStats.cacheHits ?? 0
      total.byRoot[rootIndex] = current
    }
  }
  return total
}

async function pruneCache(cacheDir, limitBytes = DEFAULT_CACHE_LIMIT_BYTES) {
  if (!cacheDir || !(await pathExists(cacheDir))) return { removed: 0, bytes: 0 }
  const entries = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name.endsWith('.cache')) {
        const info = await stat(path)
        entries.push({ path, size: info.size, mtimeMs: info.mtimeMs })
      }
    }
  }
  await walk(cacheDir)
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (totalBytes <= limitBytes) return { removed: 0, bytes: 0 }

  const targetBytes = Math.floor(limitBytes * 0.8)
  entries.sort((left, right) => left.mtimeMs - right.mtimeMs)
  let removed = 0
  let bytes = 0
  for (const entry of entries) {
    if (totalBytes <= targetBytes) break
    try {
      await rm(entry.path, { force: true })
      totalBytes -= entry.size
      bytes += entry.size
      removed += 1
    } catch {
    }
  }
  return { removed, bytes }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env)
  const policy = validateReleasePolicy(args, env)
  if (policy.skip) {
    console.log('release artifact hardening skipped by SEPILOTD_SKIP_RELEASE_HARDENING=1')
    return 0
  }

  for (const root of args.roots) {
    if (!(await pathExists(root))) {
      throw new Error(`release hardening root does not exist: ${root}`)
    }
    const info = await stat(root)
    if (!info.isDirectory()) throw new Error(`release hardening root is not a directory: ${root}`)
  }
  args.cacheDir = await validateCacheLocation(args.cacheDir, args.roots)

  const scanArtifact = await loadSecretScanner()
  const scanStartedAt = Date.now()
  const collected = []
  for (let rootIndex = 0; rootIndex < args.roots.length; rootIndex += 1) {
    collected.push(await collectRoot(args.roots[rootIndex], rootIndex, scanArtifact))
  }
  const scanMs = Date.now() - scanStartedAt

  const removals = collected.flatMap((result) => result.removals)
  const removalStartedAt = Date.now()
  await runBounded(removals, 16, async (item) => {
    await rm(item.filePath, { recursive: item.recursive, force: true })
    collected[item.rootIndex].stats.removed += 1
  })
  const removalMs = Date.now() - removalStartedAt

  const tasks = collected.flatMap((result) => result.tasks)
  const hardeningStartedAt = Date.now()
  const workerStats = await hardenTasks(tasks, args)
  const hardeningMs = Date.now() - hardeningStartedAt
  const totals = mergeWorkerStats(workerStats)

  for (let rootIndex = 0; rootIndex < args.roots.length; rootIndex += 1) {
    const stats = collected[rootIndex].stats
    const transformed = totals.byRoot[rootIndex] ?? { hardened: 0, cacheHits: 0 }
    console.log(
      `hardened ${args.roots[rootIndex]}: ${transformed.hardened} JS files (${transformed.cacheHits} cache hits), ` +
        `${stats.trustedVendors} trusted vendor files, removed ${stats.removed} metadata files`,
    )
  }

  let eviction = { removed: 0, bytes: 0 }
  try {
    eviction = await pruneCache(args.cacheDir)
  } catch (error) {
    console.warn(`release hardening cache eviction was skipped: ${String(error)}`)
  }
  console.log(
    `release hardening complete: ${totals.hardened} JS files, workers=${Math.min(args.workers, tasks.length)}, ` +
      `cache hit/miss/corrupt/unavailable=${totals.cacheHits}/${totals.cacheMisses}/${totals.cacheCorrupt}/${totals.cacheUnavailable}, ` +
      `scan=${(scanMs / 1000).toFixed(1)}s remove=${(removalMs / 1000).toFixed(1)}s harden=${(hardeningMs / 1000).toFixed(1)}s`,
  )
  if (totals.cacheWarnings > 0) {
    console.warn(`release hardening cache had ${totals.cacheWarnings} recoverable warning(s)`)
  }
  if (eviction.removed > 0) {
    console.log(
      `release hardening cache evicted ${eviction.removed} old entries (${(eviction.bytes / 1024 / 1024).toFixed(1)} MiB)`,
    )
  }
  return 0
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectExecution) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
