import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { transform, version as esbuildVersion } from 'esbuild'
import JavaScriptObfuscator from 'javascript-obfuscator'

const require = createRequire(import.meta.url)
const obfuscatorVersion = require('javascript-obfuscator/package.json').version

export const HARDENING_ALGORITHM_VERSION = '4'
const CACHE_MAGIC = 'sepilotd-release-hardening-cache-v1'

const BASE_OBFUSCATOR_OPTIONS = Object.freeze({
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  simplify: true,
  sourceMap: false,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: [],
  stringArrayThreshold: 0.25,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stripShebang(source) {
  if (!source.startsWith('#!')) {
    return { shebang: '', source }
  }
  const newline = source.indexOf('\n')
  if (newline === -1) {
    return { shebang: source, source: '' }
  }
  return {
    shebang: source.slice(0, newline),
    source: source.slice(newline + 1),
  }
}

export function obfuscatorTarget(logicalPath) {
  return logicalPath.includes('/out/renderer/') || logicalPath.includes(':out/renderer/')
    ? 'browser-no-eval'
    : 'node'
}

function cacheFingerprint(inputHash, options, target) {
  const descriptor = JSON.stringify({
    algorithm: HARDENING_ALGORITHM_VERSION,
    inputHash,
    minify: options.minify,
    obfuscate: options.obfuscate,
    target,
    esbuildVersion,
    obfuscatorVersion,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    obfuscatorOptions: BASE_OBFUSCATOR_OPTIONS,
  })
  return {
    inputHash,
    key: sha256(descriptor),
  }
}

function cacheEntryPath(cacheDir, key) {
  return join(cacheDir, key.slice(0, 2), `${key}.cache`)
}

async function removeCorruptCacheEntry(path) {
  try {
    await rm(path, { force: true })
    return null
  } catch (error) {
    return `cannot remove corrupt cache entry ${path}: ${String(error)}`
  }
}

async function readCacheEntry(cacheDir, key) {
  const path = cacheEntryPath(cacheDir, key)
  let encoded
  try {
    encoded = await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'miss', path }
    return { status: 'unavailable', path, warning: String(error) }
  }

  const newline = encoded.indexOf(0x0a)
  if (newline <= 0 || newline > 512) {
    return {
      status: 'corrupt',
      path,
      warning: await removeCorruptCacheEntry(path),
    }
  }

  const header = encoded.subarray(0, newline).toString('utf8').split(' ')
  const body = encoded.subarray(newline + 1)
  const [magic, storedKey, storedHash, storedLength] = header
  const valid =
    magic === CACHE_MAGIC &&
    storedKey === key &&
    storedHash === sha256(body) &&
    /^(?:0|[1-9]\d*)$/u.test(storedLength ?? '') &&
    Number(storedLength) === body.length
  if (!valid) {
    return {
      status: 'corrupt',
      path,
      warning: await removeCorruptCacheEntry(path),
    }
  }

  return { status: 'hit', path, body }
}

async function writeCacheEntry(cacheDir, key, output) {
  const path = cacheEntryPath(cacheDir, key)
  const outputBuffer = Buffer.from(output, 'utf8')
  const header = Buffer.from(
    `${CACHE_MAGIC} ${key} ${sha256(outputBuffer)} ${outputBuffer.length}\n`,
    'utf8',
  )
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(tempPath, Buffer.concat([header, outputBuffer]))
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    const winner = await readCacheEntry(cacheDir, key)
    if (winner.status === 'hit' && winner.body.equals(outputBuffer)) {
      return null
    }
    return `cannot publish validated cache entry ${path}: ${String(error)}`
  }
  return null
}

async function replaceFileAtomically(filePath, output) {
  const original = await stat(filePath)
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.hardened`
  try {
    await writeFile(tempPath, output, 'utf8')
    await chmod(tempPath, original.mode)
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function hardenJavaScriptFile(task, options) {
  const startedAt = Date.now()
  const raw = await readFile(task.filePath, 'utf8')
  const actualInputHash = sha256(raw)
  if (task.expectedInputHash && task.expectedInputHash !== actualInputHash) {
    throw new Error(`release input changed after secret preflight: ${task.filePath}`)
  }
  const { shebang, source } = stripShebang(raw)
  if (!source.trim()) {
    return {
      hardened: false,
      cacheStatus: 'disabled',
      elapsedMs: Date.now() - startedAt,
    }
  }

  const target = obfuscatorTarget(task.logicalPath)
  const { inputHash, key } = cacheFingerprint(actualInputHash, options, target)
  let cacheStatus = options.cacheDir ? 'miss' : 'disabled'
  let cacheWarning = null

  if (options.cacheDir) {
    const cached = await readCacheEntry(options.cacheDir, key)
    cacheStatus = cached.status
    cacheWarning = cached.warning ?? null
    if (cached.status === 'hit') {
      await replaceFileAtomically(task.filePath, cached.body.toString('utf8'))
      return {
        hardened: true,
        cacheStatus,
        cacheWarning,
        elapsedMs: Date.now() - startedAt,
      }
    }
  }

  const isRenderer = target === 'browser-no-eval'
  let hardened = source
  if (options.minify) {
    const result = await transform(hardened, {
      loader: 'js',
      target: 'es2022',
      platform: isRenderer ? 'browser' : 'node',
      minify: true,
      legalComments: 'none',
      sourcemap: false,
      sourcefile: 'release-input.js',
    })
    hardened = result.code
  }

  if (options.obfuscate) {
    hardened = JavaScriptObfuscator.obfuscate(hardened, {
      ...BASE_OBFUSCATOR_OPTIONS,
      seed: Number.parseInt(inputHash.slice(0, 8), 16) || 1,
      target,
    }).getObfuscatedCode()
  }

  const output = shebang ? `${shebang}\n${hardened}\n` : `${hardened}\n`
  await replaceFileAtomically(task.filePath, output)

  if (options.cacheDir) {
    const warning = await writeCacheEntry(options.cacheDir, key, output)
    cacheWarning = cacheWarning ?? warning
  }

  return {
    hardened: true,
    cacheStatus,
    cacheWarning,
    elapsedMs: Date.now() - startedAt,
  }
}

export function logicalRelativePath(rootIndex, root, filePath) {
  return `${rootIndex}:${relative(root, filePath).split('\\').join('/')}`
}
