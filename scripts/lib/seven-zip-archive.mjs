import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, chmod, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, posix, relative, resolve, sep } from 'node:path'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_ENTRIES = 250_000
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 8n * 1024n * 1024n * 1024n
const MAX_LINK_TARGET_BYTES = 4 * 1024
const MAX_LINK_BATCH_ARGUMENT_CHARS = 24 * 1024
const MAX_LINK_BATCH_OUTPUT_BYTES = 1024 * 1024
const WINDOWS_DEVICE_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

export class SevenZipProcessError extends Error {
  constructor(message, { exitCode, signal } = {}) {
    super(message)
    this.name = 'SevenZipProcessError'
    this.exitCode = exitCode
    this.signal = signal
  }
}

function formatProcessFailure(label, code, signal, output) {
  const detail = output.trim()
  return new SevenZipProcessError(
    `${label} failed (exit=${code ?? 'null'}, signal=${signal ?? 'none'})` +
      (detail ? `: ${detail}` : ''),
    { exitCode: code, signal },
  )
}

export function runSevenZip(
  sevenZipPath,
  args,
  { label = '7z command', timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(sevenZipPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let output = ''
    let outputBytes = 0
    let settled = false
    let timer
    let forcedError

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const collectOutput = (stream) => {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        if (forcedError) return
        outputBytes += Buffer.byteLength(chunk)
        if (outputBytes > DEFAULT_MAX_OUTPUT_BYTES) {
          forcedError = new Error(`${label} output exceeded safety limit`)
          child.kill()
          return
        }
        output += chunk
      })
    }
    collectOutput(child.stdout)
    collectOutput(child.stderr)

    timer = setTimeout(() => {
      forcedError = new Error(`${label} timed out after ${timeoutMs}ms`)
      child.kill()
    }, timeoutMs)
    timer.unref?.()

    child.on('error', (error) => {
      finish(() => rejectPromise(new Error(`${label} failed to start: ${error.message}`)))
    })
    child.on('close', (code, signal) => {
      finish(() => {
        if (forcedError) rejectPromise(forcedError)
        else if (code === 0 && signal === null) resolvePromise(output)
        else rejectPromise(formatProcessFailure(label, code, signal, output))
      })
    })
  })
}

function runSevenZipToBuffer(
  sevenZipPath,
  args,
  {
    label = '7z command',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = MAX_LINK_BATCH_OUTPUT_BYTES,
  } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(sevenZipPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const chunks = []
    let outputBytes = 0
    let errorOutput = ''
    let settled = false
    let timer
    let forcedError

    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    const terminate = (error) => {
      if (forcedError) return
      forcedError = error
      child.kill()
    }

    child.stdout.on('data', (chunk) => {
      if (forcedError) return
      outputBytes += chunk.length
      if (outputBytes > maxOutputBytes) {
        terminate(new Error(`${label} output exceeded safety limit`))
        return
      }
      chunks.push(chunk)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      if (forcedError) return
      errorOutput += chunk
      if (Buffer.byteLength(errorOutput) > DEFAULT_MAX_OUTPUT_BYTES) {
        terminate(new Error(`${label} diagnostic output exceeded safety limit`))
      }
    })

    timer = setTimeout(() => {
      terminate(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    timer.unref?.()

    child.on('error', (error) => {
      finish(() => rejectPromise(new Error(`${label} failed to start: ${error.message}`)))
    })
    child.on('close', (code, signal) => {
      finish(() => {
        if (forcedError) rejectPromise(forcedError)
        else if (code === 0 && signal === null) resolvePromise(Buffer.concat(chunks))
        else rejectPromise(formatProcessFailure(label, code, signal, errorOutput))
      })
    })
  })
}

export function validateArchiveEntryPath(entryPath) {
  if (typeof entryPath !== 'string' || entryPath.length === 0 || entryPath.includes('\0')) {
    throw new Error('7z archive contains an empty or NUL-containing path')
  }

  const normalized = entryPath.replaceAll('\\', '/')
  if (normalized.length > 1024 || normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) {
    throw new Error(`7z archive contains an absolute path: ${entryPath}`)
  }

  const segments = normalized.split('/')
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.includes(':') ||
        /[\u0000-\u001F<>"|?*]/u.test(segment) ||
        /[. ]$/u.test(segment) ||
        WINDOWS_DEVICE_NAME_RE.test(segment),
    )
  ) {
    throw new Error(`7z archive contains an unsafe path: ${entryPath}`)
  }
  return normalized
}

function normalizeSymbolicLinkTarget(entryPath, rawTarget) {
  const target = rawTarget.replaceAll('\\', '/')
  if (
    target.length === 0 ||
    target.includes('\0') ||
    /[\u0000-\u001F]/u.test(target) ||
    target.startsWith('/') ||
    /^[A-Za-z]:/u.test(target)
  ) {
    throw new Error(`7z archive contains an unsafe symbolic-link target for ${entryPath}`)
  }
  const normalized = posix.normalize(posix.join(posix.dirname(entryPath), target))
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`7z archive symbolic link escapes its root: ${entryPath}`)
  }
  return normalized
}

function normalizeHardLinkTarget(rawTarget) {
  return validateArchiveEntryPath(rawTarget)
}

function parseRecord(record) {
  const fields = new Map()
  for (const line of record.split(/\r?\n/u)) {
    if (!line.trim()) continue
    const match = /^([^=]+?) =(?: (.*))?$/u.exec(line)
    if (!match) {
      throw new Error(`7z technical listing contains an invalid line: ${line}`)
    }
    const key = match[1]
    if (fields.has(key)) {
      throw new Error(`7z technical listing contains duplicate field: ${key}`)
    }
    fields.set(key, match[2] ?? '')
  }
  return fields
}

export function parseSevenZipTechnicalList(
  output,
  {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
    allowUnresolvedSymbolicLinks = false,
  } = {},
) {
  const records = output
    .split(/(?:\r?\n){2,}/u)
    .map((record) => record.trimEnd())
    .filter(Boolean)
  if (records.length === 0) throw new Error('7z archive contains no entries')
  if (records.length > maxEntries) {
    throw new Error(`7z archive entry count exceeds safety limit: ${records.length}`)
  }

  const seen = new Set()
  const entries = []
  let totalUncompressedBytes = 0n
  for (const record of records) {
    const fields = parseRecord(record)
    const rawPath = fields.get('Path')
    if (!rawPath) throw new Error('7z technical listing entry is missing Path')
    const path = validateArchiveEntryPath(rawPath)
    const collisionKey = path.toLocaleLowerCase('en-US')
    if (seen.has(collisionKey)) {
      throw new Error(`7z archive contains duplicate or case-colliding path: ${rawPath}`)
    }
    seen.add(collisionKey)

    const alternateStream = fields.get('Alternate Stream')?.trim()
    if (alternateStream && alternateStream !== '-') {
      throw new Error(`7z archive contains an alternate stream: ${rawPath}`)
    }
    if (fields.get('Encrypted')?.trim() === '+') {
      throw new Error(`7z archive contains an encrypted entry: ${rawPath}`)
    }

    const listedSymbolicTarget = fields.get('Symbolic Link')?.trim()
    const listedHardTarget = fields.get('Hard Link')?.trim()
    const symbolicTarget =
      listedSymbolicTarget && listedSymbolicTarget !== '-' ? listedSymbolicTarget : undefined
    const hardTarget = listedHardTarget && listedHardTarget !== '-' ? listedHardTarget : undefined
    if (symbolicTarget && hardTarget) {
      throw new Error(`7z archive entry declares both symbolic and hard links: ${rawPath}`)
    }
    const linkAttribute = /l/iu.test(fields.get('Attributes') ?? '')
    const linkMode = /^(?:l|0?12[0-7]{4})/iu.test(fields.get('Mode')?.trim() ?? '')
    if ((linkAttribute || linkMode) && !symbolicTarget && !hardTarget) {
      if (!allowUnresolvedSymbolicLinks) {
        throw new Error(`7z archive link metadata has no inspectable target: ${rawPath}`)
      }
    }

    const rawSize = fields.get('Size') ?? '0'
    if (!/^(?:0|[1-9]\d*)$/u.test(rawSize)) {
      throw new Error(`7z archive contains an invalid size for ${rawPath}: ${rawSize}`)
    }
    const size = BigInt(rawSize)
    if (
      (linkAttribute || linkMode) &&
      !symbolicTarget &&
      !hardTarget &&
      size > BigInt(MAX_LINK_TARGET_BYTES)
    ) {
      throw new Error(`7z archive symbolic-link target exceeds safety limit: ${rawPath}`)
    }
    totalUncompressedBytes += size
    if (totalUncompressedBytes > maxUncompressedBytes) {
      throw new Error('7z archive uncompressed size exceeds safety limit')
    }
    const link = symbolicTarget
      ? {
          linkType: 'symbolic',
          linkTarget: normalizeSymbolicLinkTarget(path, symbolicTarget),
        }
      : hardTarget
        ? {
            linkType: 'hard',
            linkTarget: normalizeHardLinkTarget(hardTarget),
          }
        : linkAttribute || linkMode
          ? { linkType: 'symbolic', linkTarget: null }
          : {}
    entries.push({ path, size, directory: fields.get('Folder') === '+', ...link })
  }

  if (!allowUnresolvedSymbolicLinks) assertKnownLinkTargets(entries)

  return entries
}

function assertKnownLinkTargets(entries) {
  const knownPaths = new Set()
  for (const { path } of entries) {
    const segments = path.split('/')
    for (let index = 1; index <= segments.length; index += 1) {
      knownPaths.add(segments.slice(0, index).join('/').toLocaleLowerCase('en-US'))
    }
  }
  const symbolicLinks = new Map(
    entries
      .filter((entry) => entry.linkType === 'symbolic')
      .map((entry) => [entry.path.toLocaleLowerCase('en-US'), entry]),
  )

  for (const entry of entries) {
    if (!entry.linkType) continue
    if (!entry.linkTarget) {
      throw new Error(`7z archive link target could not be inspected: ${entry.path}`)
    }

    let currentTarget = entry.linkTarget
    const visited = new Set()
    for (let step = 0; step <= symbolicLinks.size; step += 1) {
      const targetKey = currentTarget.toLocaleLowerCase('en-US')
      if (visited.has(targetKey)) {
        throw new Error(`7z archive symbolic-link cycle detected at ${entry.path}`)
      }
      visited.add(targetKey)

      const segments = currentTarget.split('/')
      let followedLink = false
      for (let index = 1; index <= segments.length; index += 1) {
        const prefix = segments.slice(0, index).join('/').toLocaleLowerCase('en-US')
        const symbolicLink = symbolicLinks.get(prefix)
        if (!symbolicLink) continue
        if (!symbolicLink.linkTarget) {
          throw new Error(`7z archive link target could not be inspected: ${symbolicLink.path}`)
        }
        const suffix = segments.slice(index).join('/')
        currentTarget = suffix
          ? posix.join(symbolicLink.linkTarget, suffix)
          : symbolicLink.linkTarget
        followedLink = true
        break
      }

      if (followedLink) continue
      if (!knownPaths.has(targetKey)) {
        throw new Error(`7z archive link target is missing: ${entry.path}`)
      }
      break
    }

    if (!knownPaths.has(currentTarget.toLocaleLowerCase('en-US'))) {
      throw new Error(`7z archive symbolic-link chain exceeds safety limit: ${entry.path}`)
    }
  }
}

function createLinkBatches(entries) {
  const batches = []
  let current = []
  let argumentChars = 0
  let outputBytes = 0
  for (const entry of entries) {
    const entryBytes = Number(entry.size)
    const entryArgumentChars = entry.path.length + 3
    if (
      current.length > 0 &&
      (argumentChars + entryArgumentChars > MAX_LINK_BATCH_ARGUMENT_CHARS ||
        outputBytes + entryBytes > MAX_LINK_BATCH_OUTPUT_BYTES)
    ) {
      batches.push(current)
      current = []
      argumentChars = 0
      outputBytes = 0
    }
    current.push(entry)
    argumentChars += entryArgumentChars
    outputBytes += entryBytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

async function resolveUnlistedSymbolicLinkTargets(sevenZipPath, archivePath, entries, options) {
  const unresolved = entries.filter(
    (entry) => entry.linkType === 'symbolic' && entry.linkTarget === null,
  )
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (const batch of createLinkBatches(unresolved)) {
    const expectedBytes = batch.reduce((total, entry) => total + Number(entry.size), 0)
    const contents = await runSevenZipToBuffer(
      sevenZipPath,
      ['e', '-so', '-bd', '-y', '-sccUTF-8', '--', archivePath, ...batch.map(({ path }) => path)],
      {
        label: '7z symbolic-link target inspection',
        timeoutMs: options.timeoutMs,
        maxOutputBytes: Math.max(expectedBytes, 1),
      },
    )
    if (contents.length !== expectedBytes) {
      throw new Error('7z symbolic-link target output length did not match its listing')
    }
    let offset = 0
    for (const entry of batch) {
      const nextOffset = offset + Number(entry.size)
      let rawTarget
      try {
        rawTarget = decoder.decode(contents.subarray(offset, nextOffset))
      } catch {
        throw new Error(`7z archive symbolic-link target is not valid UTF-8: ${entry.path}`)
      }
      entry.linkTarget = normalizeSymbolicLinkTarget(entry.path, rawTarget)
      offset = nextOffset
    }
  }
  assertKnownLinkTargets(entries)
  return entries
}

function isWithinRoot(root, target) {
  const pathFromRoot = relative(root, target)
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  )
}

async function assertExtractedTree(destination, entries) {
  const allowed = new Set()
  const observed = new Set()
  for (const { path } of entries) {
    const segments = path.split('/')
    for (let index = 1; index <= segments.length; index += 1) {
      allowed.add(segments.slice(0, index).join('/').toLocaleLowerCase('en-US'))
    }
  }
  const destinationPrefix = resolve(destination).replace(/[\\/]$/u, '') + sep
  const canonicalDestination = await realpath(destination)
  const metadata = new Map(entries.map((entry) => [entry.path.toLocaleLowerCase('en-US'), entry]))

  async function walk(directory) {
    const dirEntries = await readdir(directory, { withFileTypes: true })
    for (const entry of dirEntries) {
      const fullPath = resolve(directory, entry.name)
      if (!fullPath.startsWith(destinationPrefix)) {
        throw new Error(`7z extraction escaped destination: ${fullPath}`)
      }
      const archivePath = relative(destination, fullPath).split(sep).join('/')
      if (!allowed.has(archivePath.toLocaleLowerCase('en-US'))) {
        throw new Error(`7z extraction produced an unlisted path: ${archivePath}`)
      }
      observed.add(archivePath.toLocaleLowerCase('en-US'))
      if (entry.isSymbolicLink()) {
        const declared = metadata.get(archivePath.toLocaleLowerCase('en-US'))
        if (declared?.linkType !== 'symbolic') {
          throw new Error(`7z extraction produced an undeclared symbolic link: ${archivePath}`)
        }
        const resolvedTarget = await realpath(fullPath)
        if (!isWithinRoot(canonicalDestination, resolvedTarget)) {
          throw new Error(`7z extraction symbolic link escaped destination: ${archivePath}`)
        }
        continue
      }
      if (entry.isDirectory()) await walk(fullPath)
      else if (!entry.isFile()) {
        throw new Error(`7z extraction produced an unsupported file type: ${archivePath}`)
      }
    }
  }
  await walk(destination)
  for (const entry of entries) {
    if (!observed.has(entry.path.toLocaleLowerCase('en-US'))) {
      throw new Error(`7z extraction omitted a listed path: ${entry.path}`)
    }
  }
}

export async function testSevenZipArchive(sevenZipPath, archivePath, options = {}) {
  await runSevenZip(sevenZipPath, ['t', '-bd', '-y', '-sccUTF-8', '--', archivePath], {
    label: '7z integrity test',
    timeoutMs: options.timeoutMs,
  })
}

export async function resolveSevenZipPath(explicitPath) {
  if (explicitPath) return resolve(explicitPath)
  const module = await import('7zip-bin')
  const path = module.path7za ?? module.default?.path7za
  if (!path) throw new Error('7za binary could not be resolved')
  await ensureExecutable(resolve(path))
  return resolve(path)
}

export async function ensureExecutable(path, platform = process.platform) {
  if (platform === 'win32') return
  try {
    await access(path, fsConstants.X_OK)
  } catch {
    const { mode } = await stat(path)
    await chmod(path, mode | 0o111)
  }
}

export async function extractSevenZipSafely(sevenZipPath, archivePath, destination, options = {}) {
  const entries = options.entries ?? (await listSevenZipEntries(sevenZipPath, archivePath, options))
  await mkdir(destination, { recursive: true })
  await runSevenZip(
    sevenZipPath,
    ['x', '-bd', '-y', '-bb0', '-sccUTF-8', `-o${destination}`, '--', archivePath],
    { label: '7z extraction', timeoutMs: options.timeoutMs },
  )
  await assertExtractedTree(destination, entries)
  return entries
}

export async function listSevenZipEntries(sevenZipPath, archivePath, options = {}) {
  const listing = await runSevenZip(
    sevenZipPath,
    ['l', '-slt', '-ba', '-sccUTF-8', '--', archivePath],
    { label: '7z technical listing', timeoutMs: options.timeoutMs },
  )
  const entries = parseSevenZipTechnicalList(listing, {
    ...options,
    allowUnresolvedSymbolicLinks: true,
  })
  return resolveUnlistedSymbolicLinkTargets(sevenZipPath, archivePath, entries, options)
}
