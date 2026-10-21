#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  copyFile,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  extractSevenZipSafely,
  listSevenZipEntries,
  resolveSevenZipPath,
} from './lib/seven-zip-archive.mjs'
import { verifyLauncherPayload } from './verify-launcher-payload.mjs'
import { isForbidden } from './verify-no-source-leak.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = join(HERE, '..')

const DECLARED_ARCHIVE_RE =
  /\.(?:7z|appimage|zip|exe|dmg|snap|deb|rpm|blockmap|tar|tar\.gz|tgz|gz|xz|bz2|rar|cab|cpio|iso)$/i
const SQUASHFS_ARCHIVE_RE = /\.(?:appimage|snap)$/i
const CUSTOM_LAUNCHER_NAME = 'sepilot-desktop.exe'
const MAX_NESTED_CONTAINER_DEPTH = 4
const MAX_PE_SECTIONS = 96
const MAX_PE_OPTIONAL_HEADER_BYTES = 4 * 1024
const MAX_PE_CERTIFICATE_TABLE_BYTES = 16 * 1024 * 1024
const EMBEDDED_ARCHIVE_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  Buffer.from([0x1f, 0x8b, 0x08]),
  Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]),
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01]),
  Buffer.from([0x4d, 0x53, 0x43, 0x46]),
  Buffer.from([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a]),
  Buffer.from([0xed, 0xab, 0xee, 0xdb]),
  Buffer.from('070701', 'ascii'),
  Buffer.from('070702', 'ascii'),
]
const TRUSTED_SSH2_PEM_SOURCE_HASHES = new Map([
  [
    'node_modules/ssh2/lib/keygen.js',
    '03d0be43e78ca4f82d4c96d084a39c0242f9c56f343da17a819f8bd0d873f06c',
  ],
  [
    'node_modules/ssh2/lib/protocol/keyParser.js',
    'ba4f40a5a9edef15ff49a38226e2be2e66f75aa2673840dd18b807bb7943eca9',
  ],
])
const TRUSTED_ELECTRON_RDATA_HASHES = new Set([
  '4ab80fe830164735121acb1cd6de2d1a65a19a19908fe6cd30014e4cb663b7b3',
])
const TRUSTED_ELECTRON_ELF_RODATA_HASHES = new Set([
  '62a7731f2db55816cb9c970ca136e90362050cf3685e017159ec3dbc6277f1ab',
])
const TRUSTED_ELECTRON_MACHO_CSTRING_HASHES = new Set([
  '32b35e76afe0bdb5a04a56288f7e7dabff1840461e09b1f839d378b55cf3b9f4',
  '779d8729688f3feff918fb5edd4bb078672357043ea2218a5dd0ec36180618fb',
])
const MAX_ELF_SECTIONS = 256
const MAX_MACHO_LOAD_COMMANDS = 512

async function loadSecretScannerModule() {
  return import(new URL('../sepilot-cli/packages/bundle/scripts/secret-scan.ts', import.meta.url).href)
}

export async function loadScanner() {
  const mod = await loadSecretScannerModule()
  if (typeof mod.scanArtifact !== 'function') {
    throw new Error('scanArtifact export not found in bundle secret-scan module')
  }
  return mod.scanArtifact
}

export function maskTrustedPortableExecutableSection(
  bytes,
  sectionName,
  trustedHashes,
) {
  if (bytes.length < 152 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null
  const peOffset = bytes.readUInt32LE(0x3c)
  if (peOffset < 64 || peOffset > bytes.length - 24) return null
  if (!bytes.subarray(peOffset, peOffset + 4).equals(Buffer.from('PE\0\0'))) return null

  const numberOfSections = bytes.readUInt16LE(peOffset + 6)
  const optionalHeaderBytes = bytes.readUInt16LE(peOffset + 20)
  if (
    numberOfSections === 0 ||
    numberOfSections > MAX_PE_SECTIONS ||
    optionalHeaderBytes > MAX_PE_OPTIONAL_HEADER_BYTES
  ) {
    return null
  }

  const sectionTableOffset = peOffset + 24 + optionalHeaderBytes
  const sectionTableEnd = sectionTableOffset + numberOfSections * 40
  if (sectionTableEnd > bytes.length) return null

  for (let index = 0; index < numberOfSections; index += 1) {
    const sectionOffset = sectionTableOffset + index * 40
    const name = bytes
      .subarray(sectionOffset, sectionOffset + 8)
      .toString('ascii')
      .replace(/\0.*$/u, '')
    if (name !== sectionName) continue

    const rawSize = bytes.readUInt32LE(sectionOffset + 16)
    const rawPointer = bytes.readUInt32LE(sectionOffset + 20)
    const rawEnd = rawPointer + rawSize
    if (
      rawSize === 0 ||
      rawPointer === 0 ||
      !Number.isSafeInteger(rawEnd) ||
      rawEnd > bytes.length
    ) {
      return null
    }

    const digest = createHash('sha256')
      .update(bytes.subarray(rawPointer, rawEnd))
      .digest('hex')
    if (!trustedHashes.has(digest)) return null

    const masked = Buffer.from(bytes)
    masked.fill(0, rawPointer, rawEnd)
    return masked
  }
  return null
}

function maskTrustedRange(bytes, offset, size, trustedHashes) {
  const end = offset + size
  if (size === 0 || offset === 0 || !Number.isSafeInteger(end) || end > bytes.length) return null
  const digest = createHash('sha256').update(bytes.subarray(offset, end)).digest('hex')
  if (!trustedHashes.has(digest)) return null
  const masked = Buffer.from(bytes)
  masked.fill(0, offset, end)
  return masked
}

export function maskTrustedElfSection(bytes, sectionName, trustedHashes) {
  if (bytes.length < 64 || bytes.readUInt32BE(0) !== 0x7f454c46) return null
  if (bytes[4] !== 2 || bytes[5] !== 1) return null
  const sectionHeaderOffset = Number(bytes.readBigUInt64LE(0x28))
  const entrySize = bytes.readUInt16LE(0x3a)
  const sectionCount = bytes.readUInt16LE(0x3c)
  const namesIndex = bytes.readUInt16LE(0x3e)
  if (
    entrySize < 64 ||
    sectionCount === 0 ||
    sectionCount > MAX_ELF_SECTIONS ||
    namesIndex >= sectionCount ||
    !Number.isSafeInteger(sectionHeaderOffset) ||
    sectionHeaderOffset + sectionCount * entrySize > bytes.length
  ) {
    return null
  }
  const header = (index) => {
    const base = sectionHeaderOffset + index * entrySize
    return {
      name: bytes.readUInt32LE(base),
      offset: Number(bytes.readBigUInt64LE(base + 0x18)),
      size: Number(bytes.readBigUInt64LE(base + 0x20)),
    }
  }
  const names = header(namesIndex)
  if (names.offset + names.size > bytes.length) return null
  for (let index = 0; index < sectionCount; index += 1) {
    const section = header(index)
    const nameStart = names.offset + section.name
    const nameEnd = bytes.indexOf(0, nameStart)
    if (nameEnd < 0 || nameEnd > names.offset + names.size) continue
    if (bytes.subarray(nameStart, nameEnd).toString('ascii') !== sectionName) continue
    return maskTrustedRange(bytes, section.offset, section.size, trustedHashes)
  }
  return null
}

export function maskTrustedMachOSection(bytes, segmentName, sectionName, trustedHashes) {
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) return null
  const commandCount = bytes.readUInt32LE(16)
  if (commandCount === 0 || commandCount > MAX_MACHO_LOAD_COMMANDS) return null
  const fixedName = (offset) => bytes.subarray(offset, offset + 16).toString('ascii').replace(/\0.*$/su, '')
  let offset = 32
  for (let command = 0; command < commandCount; command += 1) {
    if (offset + 8 > bytes.length) return null
    const kind = bytes.readUInt32LE(offset)
    const size = bytes.readUInt32LE(offset + 4)
    if (size < 8 || offset + size > bytes.length) return null
    if (kind === 0x19 && fixedName(offset + 8) === segmentName) {
      const sectionCount = bytes.readUInt32LE(offset + 64)
      if (72 + sectionCount * 80 > size) return null
      for (let index = 0; index < sectionCount; index += 1) {
        const base = offset + 72 + index * 80
        if (fixedName(base) !== sectionName) continue
        const sectionSize = Number(bytes.readBigUInt64LE(base + 40))
        const fileOffset = bytes.readUInt32LE(base + 48)
        return maskTrustedRange(bytes, fileOffset, sectionSize, trustedHashes)
      }
    }
    offset += size
  }
  return null
}

async function loadAsar() {
  try {
    const mod = await import('@electron/asar')
    return mod.extractAll ?? mod.default?.extractAll ?? null
  } catch {
    return null
  }
}

function isWithinRoot(root, target) {
  const pathFromRoot = relative(root, target)
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  )
}

async function collectArtifactTree(root, options = {}) {
  const out = []
  const links = []
  const canonicalRoot = await realpath(root)
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        if (!options.allowInternalLinks) {
          throw new Error(`artifact tree contains a symbolic link or junction: ${full}`)
        }
        const target = await realpath(full)
        if (!isWithinRoot(canonicalRoot, target)) {
          throw new Error(`artifact tree symbolic link escapes its root: ${full}`)
        }
        links.push(full)
        continue
      }
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(full)
      else throw new Error(`artifact tree contains an unsupported file type: ${full}`)
    }
  }
  await walk(root)
  return { files: out, links }
}

export async function collectFiles(root, options = {}) {
  return (await collectArtifactTree(root, options)).files
}

function slash(path) {
  return path.split(sep).join('/')
}

export async function collectTargets(releaseDir, options = {}) {
  const { files, links } = await collectArtifactTree(releaseDir, options)
  const asars = files.filter((file) => /\.asar$/iu.test(file))
  const archiveKinds = new Map()
  let cursor = 0
  async function inspectContainers() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= files.length) return
      const file = files[index]
      if (asars.includes(file)) continue
      const detected = await detectContainerKind(file)
      if (detected) {
        archiveKinds.set(file, detected)
      } else if (SQUASHFS_ARCHIVE_RE.test(file)) {
        archiveKinds.set(file, 'squashfs')
      } else if (/\.blockmap$/iu.test(file)) {
        archiveKinds.set(file, 'raw')
      } else if (DECLARED_ARCHIVE_RE.test(file)) {
        archiveKinds.set(file, 'archive')
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(32, files.length) }, () => inspectContainers()))
  const archives = [...archiveKinds.keys()]
  const asarSet = new Set(asars)
  const looseFiles = files.filter((file) => !asarSet.has(file))
  const launchers = looseFiles.filter(
    (file) =>
      basename(file).toLocaleLowerCase('en-US') === CUSTOM_LAUNCHER_NAME &&
      !slash(relative(releaseDir, file)).includes('/'),
  )
  return { files, asars, archives, archiveKinds, looseFiles, launchers, links }
}

function startsWithBytes(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false
  return bytes.every((byte, index) => buffer[offset + index] === byte)
}

function isTarHeader(buffer) {
  if (
    buffer.length < 512 ||
    !startsWithBytes(buffer, [0x75, 0x73, 0x74, 0x61, 0x72], 257) ||
    (buffer[262] !== 0x00 && buffer[262] !== 0x20)
  ) {
    return false
  }
  const storedChecksumText = buffer
    .subarray(148, 156)
    .toString('ascii')
    .replace(/[\0 ]+$/u, '')
    .trimStart()
  if (!/^[0-7]{1,7}$/u.test(storedChecksumText)) return false

  let calculatedChecksum = 0
  for (let index = 0; index < 512; index += 1) {
    calculatedChecksum += index >= 148 && index < 156 ? 0x20 : buffer[index]
  }
  if (Number.parseInt(storedChecksumText, 8) !== calculatedChecksum) return false

  const size = buffer.subarray(124, 136)
  const asciiSize = size
    .toString('ascii')
    .replace(/[\0 ]+$/u, '')
    .trimStart()
  const validSize = (size[0] & 0x80) !== 0 || asciiSize === '' || /^[0-7]+$/u.test(asciiSize)
  const typeFlag = buffer[156]
  return (
    validSize &&
    buffer.subarray(0, 100).some((byte) => byte !== 0) &&
    (typeFlag === 0x00 ||
      typeFlag === 0x30 ||
      (typeFlag >= 0x31 && typeFlag <= 0x37) ||
      [0x67, 0x78, 0x4c, 0x4b].includes(typeFlag))
  )
}

function isAsciiCpioHeader(buffer) {
  if (
    !startsWithBytes(buffer, [0x30, 0x37, 0x30, 0x37, 0x30, 0x31]) &&
    !startsWithBytes(buffer, [0x30, 0x37, 0x30, 0x37, 0x30, 0x32])
  ) {
    return false
  }
  return (
    buffer.length >= 110 && /^[0-9A-Fa-f]{104}$/u.test(buffer.subarray(6, 110).toString('ascii'))
  )
}

function containsEmbeddedArchiveSignature(buffer) {
  if (EMBEDDED_ARCHIVE_SIGNATURES.some((signature) => buffer.indexOf(signature) >= 0)) {
    return true
  }

  let bzipOffset = buffer.indexOf(Buffer.from('BZh', 'ascii'))
  while (bzipOffset >= 0) {
    if (buffer[bzipOffset + 3] >= 0x31 && buffer[bzipOffset + 3] <= 0x39) return true
    bzipOffset = buffer.indexOf(Buffer.from('BZh', 'ascii'), bzipOffset + 1)
  }

  let ustarOffset = buffer.indexOf(Buffer.from('ustar', 'ascii'))
  while (ustarOffset >= 257) {
    const headerOffset = ustarOffset - 257
    if (isTarHeader(buffer.subarray(headerOffset, headerOffset + 512))) return true
    ustarOffset = buffer.indexOf(Buffer.from('ustar', 'ascii'), ustarOffset + 1)
  }
  return false
}

function isCanonicalDerSequence(buffer) {
  if (buffer.length < 2 || buffer[0] !== 0x30) return false
  let headerBytes = 2
  let contentBytes
  if (buffer[1] < 0x80) {
    contentBytes = buffer[1]
  } else {
    const lengthBytes = buffer[1] & 0x7f
    if (
      lengthBytes === 0 ||
      lengthBytes > 4 ||
      buffer.length < 2 + lengthBytes ||
      buffer[2] === 0
    ) {
      return false
    }
    headerBytes += lengthBytes
    contentBytes = 0
    for (let index = 0; index < lengthBytes; index += 1) {
      contentBytes = contentBytes * 256 + buffer[2 + index]
    }
    if (contentBytes < 0x80) return false
  }
  const derEnd = headerBytes + contentBytes
  return derEnd <= buffer.length && buffer.subarray(derEnd).every((byte) => byte === 0)
}

async function inspectAuthenticodeTable(handle, offset, size, mappedEnd, fileSize) {
  if (
    offset < mappedEnd ||
    offset % 8 !== 0 ||
    size < 8 ||
    size > MAX_PE_CERTIFICATE_TABLE_BYTES ||
    offset + size > fileSize
  ) {
    return false
  }

  const table = Buffer.alloc(size)
  const tableRead = await handle.read(table, 0, table.length, offset)
  if (tableRead.bytesRead !== table.length || containsEmbeddedArchiveSignature(table)) {
    return false
  }

  let cursor = 0
  while (cursor < table.length) {
    if (table.length - cursor < 8) return false
    const certificateBytes = table.readUInt32LE(cursor)
    const revision = table.readUInt16LE(cursor + 4)
    const certificateType = table.readUInt16LE(cursor + 6)
    if (
      certificateBytes < 8 ||
      revision !== 0x0200 ||
      certificateType !== 0x0002 ||
      cursor + certificateBytes > table.length
    ) {
      return false
    }
    if (!isCanonicalDerSequence(table.subarray(cursor + 8, cursor + certificateBytes))) {
      return false
    }
    const alignedBytes = Math.ceil(certificateBytes / 8) * 8
    if (
      cursor + alignedBytes > table.length ||
      !table.subarray(cursor + certificateBytes, cursor + alignedBytes).every((byte) => byte === 0)
    ) {
      return false
    }
    cursor += alignedBytes
  }
  return cursor === table.length
}

async function rangeContainsNonzero(handle, start, end) {
  const buffer = Buffer.alloc(64 * 1024)
  let position = start
  while (position < end) {
    const requested = Math.min(buffer.length, end - position)
    const chunk = await handle.read(buffer, 0, requested, position)
    if (chunk.bytesRead === 0) return true
    if (buffer.subarray(0, chunk.bytesRead).some((byte) => byte !== 0)) return true
    position += chunk.bytesRead
  }
  return false
}

export async function detectContainerKind(file) {
  const handle = await open(file, 'r')
  try {
    const header = Buffer.alloc(512)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    const bytes = header.subarray(0, bytesRead)

    if (
      startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08]) ||
      startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
      startsWithBytes(bytes, [0x1f, 0x8b, 0x08]) ||
      startsWithBytes(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
      (startsWithBytes(bytes, [0x42, 0x5a, 0x68]) && bytes[3] >= 0x31 && bytes[3] <= 0x39) ||
      startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
      startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01]) ||
      startsWithBytes(bytes, [0x4d, 0x53, 0x43, 0x46]) ||
      startsWithBytes(bytes, [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a]) ||
      startsWithBytes(bytes, [0xed, 0xab, 0xee, 0xdb]) ||
      isAsciiCpioHeader(bytes) ||
      isTarHeader(bytes)
    ) {
      return 'archive'
    }
    if (
      startsWithBytes(bytes, [0x68, 0x73, 0x71, 0x73]) ||
      startsWithBytes(bytes, [0x73, 0x71, 0x73, 0x68]) ||
      (startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46]) &&
        startsWithBytes(bytes, [0x41, 0x49, 0x02], 8))
    ) {
      return 'squashfs'
    }
    if (startsWithBytes(bytes, [0x4d, 0x5a])) {
      const peInspection = await inspectPortableExecutable(file)
      if (peInspection.valid) {
        return peInspection.hasUnmappedOverlay ? 'pe' : 'raw'
      }
    }
    return null
  } finally {
    await handle.close()
  }
}

async function maskTrustedElectronVendorSection(file, options) {
  const handle = await open(file, 'r')
  let magic
  try {
    const probe = Buffer.alloc(4)
    const { bytesRead } = await handle.read(probe, 0, 4, 0)
    magic = bytesRead === 4 ? probe : null
  } finally {
    await handle.close()
  }
  if (!magic) return null
  if (magic.readUInt16BE(0) === 0x4d5a) {
    if (basename(file).toLocaleLowerCase('en-US') !== 'sepilotd.exe') return null
    return maskTrustedPortableExecutableSection(
      await readFile(file),
      '.rdata',
      options.trustedElectronRdataHashes ?? TRUSTED_ELECTRON_RDATA_HASHES,
    )
  }
  if (magic.readUInt32BE(0) === 0x7f454c46) {
    return maskTrustedElfSection(
      await readFile(file),
      '.rodata',
      options.trustedElectronElfRodataHashes ?? TRUSTED_ELECTRON_ELF_RODATA_HASHES,
    )
  }
  if (magic.readUInt32LE(0) === 0xfeedfacf) {
    return maskTrustedMachOSection(
      await readFile(file),
      '__TEXT',
      '__cstring',
      options.trustedElectronMachOCstringHashes ?? TRUSTED_ELECTRON_MACHO_CSTRING_HASHES,
    )
  }
  return null
}

export async function scanLooseArtifact(scanArtifact, file, options = {}) {
  const result = scanArtifact(file)
  if (result.ok) return result

  const masked = await maskTrustedElectronVendorSection(file, options)
  if (masked) {
    const scanner = await loadSecretScannerModule()
    if (typeof scanner.scanArtifactBytes !== 'function') {
      throw new Error('release secret scanner does not export scanArtifactBytes')
    }
    return scanner.scanArtifactBytes(masked, file)
  }

  const detailFindings = result.findings.slice(1)
  const pemMarkerOnly =
    detailFindings.length > 0 &&
    detailFindings.every((finding) => finding.startsWith('PEM private key block:'))
  if (!pemMarkerOnly) return result

  const normalizedPath = slash(file)
  const trustedEntry = [...TRUSTED_SSH2_PEM_SOURCE_HASHES.entries()].find(([suffix]) =>
    normalizedPath.endsWith(`/${suffix}`),
  )
  if (!trustedEntry) return result

  const actualHash = createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
  return actualHash === trustedEntry[1] ? { ok: true, findings: [] } : result
}

function findingContext(path) {
  const rel = relative(REPO_ROOT, path)
  return rel.startsWith('..') ? path : rel
}

async function scanAsar(scanArtifact, extractAll, asar, options, depth) {
  if (!extractAll) {
    return [
      `cannot unpack ${findingContext(asar)}: @electron/asar not available (compressed asar cannot be scanned in place)`,
    ]
  }
  if (depth >= MAX_NESTED_CONTAINER_DEPTH) {
    return [`nested ASAR depth exceeds safety limit at ${findingContext(asar)}`]
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'asar-scan-'))
  try {
    await extractAll(asar, temporaryDirectory)
    const hits = await scanTree(
      scanArtifact,
      extractAll,
      temporaryDirectory,
      { ...options, allowInternalLinks: false, inspectLaunchers: false },
      depth + 1,
    )
    return hits.length > 0 ? [`inside ${findingContext(asar)}:`, ...hits] : []
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function scanArchive(scanArtifact, extractAll, archive, options, depth) {
  if (depth >= MAX_NESTED_CONTAINER_DEPTH) {
    return [`nested archive depth exceeds safety limit at ${findingContext(archive)}`]
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'archive-scan-'))
  const privateArchive = join(temporaryDirectory, 'artifact.bin')
  const extractionDirectory = join(temporaryDirectory, 'contents')
  try {
    await copyFile(archive, privateArchive)
    const rawResult = await scanLooseArtifact(scanArtifact, privateArchive)
    if (!rawResult.ok) {
      return [`inside ${findingContext(archive)}:`, ...rawResult.findings]
    }
    let entries
    try {
      entries = await listSevenZipEntries(options.sevenZipPath, privateArchive, {
        timeoutMs: options.sevenZipTimeoutMs,
      })
    } catch (error) {
      throw new Error(
        `cannot safely inspect ${findingContext(archive)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    try {
      await extractSevenZipSafely(options.sevenZipPath, privateArchive, extractionDirectory, {
        timeoutMs: options.sevenZipTimeoutMs,
        entries,
      })
    } catch (error) {
      throw new Error(
        `cannot safely inspect ${findingContext(archive)}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    const hits = await scanTree(
      scanArtifact,
      extractAll,
      extractionDirectory,
      { ...options, allowInternalLinks: true, inspectLaunchers: false },
      depth + 1,
    )
    return hits.length > 0 ? [`inside ${findingContext(archive)}:`, ...hits] : []
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

async function inspectPortableExecutable(file) {
  const handle = await open(file, 'r')
  try {
    const metadata = await handle.stat()
    if (metadata.size < 152 || !Number.isSafeInteger(metadata.size)) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const dosHeader = Buffer.alloc(64)
    const { bytesRead } = await handle.read(dosHeader, 0, dosHeader.length, 0)
    if (bytesRead !== dosHeader.length || dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
      return { valid: false, hasUnmappedOverlay: true }
    }
    const peOffset = dosHeader.readUInt32LE(0x3c)
    if (peOffset < 64 || peOffset > metadata.size - 24) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const peHeader = Buffer.alloc(24)
    const headerRead = await handle.read(peHeader, 0, peHeader.length, peOffset)
    if (
      headerRead.bytesRead !== peHeader.length ||
      !peHeader.subarray(0, 4).equals(Buffer.from('PE\0\0'))
    ) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const numberOfSections = peHeader.readUInt16LE(6)
    const pointerToSymbolTable = peHeader.readUInt32LE(12)
    const numberOfSymbols = peHeader.readUInt32LE(16)
    const optionalHeaderBytes = peHeader.readUInt16LE(20)
    if (
      numberOfSections === 0 ||
      numberOfSections > MAX_PE_SECTIONS ||
      optionalHeaderBytes < 112 ||
      optionalHeaderBytes > MAX_PE_OPTIONAL_HEADER_BYTES
    ) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const optionalHeaderOffset = peOffset + peHeader.length
    const sectionTableOffset = optionalHeaderOffset + optionalHeaderBytes
    const sectionTableBytes = numberOfSections * 40
    if (sectionTableOffset + sectionTableBytes > metadata.size) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const optionalHeader = Buffer.alloc(optionalHeaderBytes)
    const optionalRead = await handle.read(
      optionalHeader,
      0,
      optionalHeader.length,
      optionalHeaderOffset,
    )
    if (optionalRead.bytesRead !== optionalHeader.length) {
      return { valid: false, hasUnmappedOverlay: true }
    }
    const optionalMagic = optionalHeader.readUInt16LE(0)
    const dataDirectoryOffset = optionalMagic === 0x10b ? 96 : optionalMagic === 0x20b ? 112 : -1
    const numberOfRvaAndSizesOffset = optionalMagic === 0x10b ? 92 : 108
    if (
      dataDirectoryOffset < 0 ||
      optionalHeaderBytes < dataDirectoryOffset ||
      optionalHeaderBytes < numberOfRvaAndSizesOffset + 4
    ) {
      return { valid: false, hasUnmappedOverlay: true }
    }

    const sizeOfHeaders = optionalHeader.readUInt32LE(60)
    if (sizeOfHeaders < sectionTableOffset + sectionTableBytes || sizeOfHeaders > metadata.size) {
      return { valid: false, hasUnmappedOverlay: true }
    }
    let mappedEnd = sizeOfHeaders

    const sectionTable = Buffer.alloc(sectionTableBytes)
    const sectionRead = await handle.read(sectionTable, 0, sectionTable.length, sectionTableOffset)
    if (sectionRead.bytesRead !== sectionTable.length) {
      return { valid: false, hasUnmappedOverlay: true }
    }
    for (let index = 0; index < numberOfSections; index += 1) {
      const sectionOffset = index * 40
      const rawSize = sectionTable.readUInt32LE(sectionOffset + 16)
      const rawPointer = sectionTable.readUInt32LE(sectionOffset + 20)
      if (rawSize === 0) continue
      const rawEnd = rawPointer + rawSize
      if (rawPointer === 0 || !Number.isSafeInteger(rawEnd) || rawEnd > metadata.size) {
        return { valid: false, hasUnmappedOverlay: true }
      }
      mappedEnd = Math.max(mappedEnd, rawEnd)
    }

    const allowedAuxiliaryRanges = []
    let suspiciousAuxiliaryData = false
    const numberOfRvaAndSizes = optionalHeader.readUInt32LE(numberOfRvaAndSizesOffset)
    if (numberOfRvaAndSizes > 4 && optionalHeaderBytes >= dataDirectoryOffset + 40) {
      const certificateOffset = optionalHeader.readUInt32LE(dataDirectoryOffset + 32)
      const certificateBytes = optionalHeader.readUInt32LE(dataDirectoryOffset + 36)
      if ((certificateOffset === 0) !== (certificateBytes === 0)) {
        suspiciousAuxiliaryData = true
      }
      if (certificateOffset !== 0 && certificateBytes !== 0) {
        const certificateEnd = certificateOffset + certificateBytes
        if (
          !Number.isSafeInteger(certificateEnd) ||
          !(await inspectAuthenticodeTable(
            handle,
            certificateOffset,
            certificateBytes,
            mappedEnd,
            metadata.size,
          ))
        ) {
          suspiciousAuxiliaryData = true
        } else {
          allowedAuxiliaryRanges.push([certificateOffset, certificateEnd])
        }
      }
    }

    if ((pointerToSymbolTable === 0) !== (numberOfSymbols === 0)) {
      suspiciousAuxiliaryData = true
    }
    if (pointerToSymbolTable !== 0) {
      const symbolsEnd = pointerToSymbolTable + numberOfSymbols * 18
      if (!Number.isSafeInteger(symbolsEnd) || symbolsEnd + 4 > metadata.size) {
        suspiciousAuxiliaryData = true
      } else {
        const stringTableLength = Buffer.alloc(4)
        const stringLengthRead = await handle.read(stringTableLength, 0, 4, symbolsEnd)
        const tableBytes = stringLengthRead.bytesRead === 4 ? stringTableLength.readUInt32LE(0) : 0
        if (tableBytes < 4 || symbolsEnd + tableBytes > metadata.size) {
          suspiciousAuxiliaryData = true
        }
      }
      suspiciousAuxiliaryData = true
    }

    allowedAuxiliaryRanges.sort((left, right) => left[0] - right[0])
    let position = mappedEnd
    for (const [rangeStart, rangeEnd] of allowedAuxiliaryRanges) {
      if (rangeStart < position || (await rangeContainsNonzero(handle, position, rangeStart))) {
        return { valid: true, hasUnmappedOverlay: true }
      }
      position = rangeEnd
    }
    if (suspiciousAuxiliaryData || (await rangeContainsNonzero(handle, position, metadata.size))) {
      return { valid: true, hasUnmappedOverlay: true }
    }
    return { valid: true, hasUnmappedOverlay: false }
  } finally {
    await handle.close()
  }
}

export async function isPortableExecutable(file) {
  return (await inspectPortableExecutable(file)).valid
}

async function scanLauncherPayload(scanArtifact, extractAll, launcher, options) {
  const findings = []
  await verifyLauncherPayload(launcher, {
    sevenZipPath: options.sevenZipPath,
    timeoutMs: options.sevenZipTimeoutMs,
    inspectPayload: async ({ payloadPath, sevenZipPath }) => {
      const temporaryDirectory = await mkdtemp(join(tmpdir(), 'desktop-payload-scan-'))
      try {
        await extractSevenZipSafely(sevenZipPath, payloadPath, temporaryDirectory, {
          timeoutMs: options.sevenZipTimeoutMs,
        })
        const hits = await scanTree(
          scanArtifact,
          extractAll,
          temporaryDirectory,
          { ...options, allowInternalLinks: true, inspectLaunchers: false },
          0,
        )
        if (hits.length > 0) {
          findings.push(`inside verified payload of ${findingContext(launcher)}:`, ...hits)
        }
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true })
      }
    },
  })
  return findings
}

async function scanTree(scanArtifact, extractAll, root, options, depth = 0) {
  const findings = []
  const { files, asars, archives, archiveKinds, looseFiles, launchers, links } =
    await collectTargets(root, {
      allowInternalLinks: options.allowInternalLinks,
    })
  const recursivelyInspectedArchives = new Set(
    archives.filter(
      (archive) =>
        (archiveKinds.get(archive) === 'archive' || archiveKinds.get(archive) === 'pe') &&
        !launchers.includes(archive),
    ),
  )

  if (archives.some((archive) => archiveKinds.get(archive) === 'squashfs')) {
    const entries = await readdir(root, { withFileTypes: true })
    const unpackedRoots = entries
      .filter(
        (entry) => entry.isDirectory() && /^linux(?:-[A-Za-z0-9_]+)?-unpacked$/u.test(entry.name),
      )
      .map((entry) => join(root, entry.name))
    const hasScannableUnpackedTree = unpackedRoots.some((unpackedRoot) =>
      files.includes(join(unpackedRoot, 'resources', 'app.asar')),
    )
    if (!hasScannableUnpackedTree) {
      findings.push(
        'AppImage/Snap requires its electron-builder linux*-unpacked/resources/app.asar tree for deep scanning',
      )
    }
  }

  for (const link of links) {
    const relativePath = slash(relative(root, link))
    if (isForbidden(relativePath)) {
      findings.push(`forbidden source or credential symlink: ${relativePath}`)
    }
  }

  for (const file of looseFiles) {
    const relativePath = slash(relative(root, file))
    if (isForbidden(relativePath)) {
      findings.push(`forbidden source or credential filename: ${relativePath}`)
    }
    if (!recursivelyInspectedArchives.has(file)) {
      const result = await scanLooseArtifact(scanArtifact, file)
      if (!result.ok) {
        findings.push(`inside ${findingContext(file)}:`, ...result.findings)
      }
    }
  }

  for (const asar of asars) {
    findings.push(...(await scanAsar(scanArtifact, extractAll, asar, options, depth)))
  }

  for (const archive of archives) {
    if (recursivelyInspectedArchives.has(archive)) {
      findings.push(...(await scanArchive(scanArtifact, extractAll, archive, options, depth)))
    }
  }

  if (options.inspectLaunchers) {
    for (const launcher of launchers) {
      findings.push(...(await scanLauncherPayload(scanArtifact, extractAll, launcher, options)))
    }
  }
  return findings
}

export async function scanRelease(scanArtifact, extractAll, releaseDir, options = {}) {
  const sevenZipPath = await resolveSevenZipPath(options.sevenZipPath)
  return scanTree(scanArtifact, extractAll, releaseDir, {
    ...options,
    sevenZipPath,
    allowInternalLinks: true,
    inspectLaunchers: options.inspectLaunchers !== false,
  })
}

async function selfTest() {
  const scanArtifact = await loadScanner()
  const dir = await mkdtemp(join(tmpdir(), 'desktop-scan-selftest-'))
  try {
    const planted = join(dir, 'leak.txt')
    await writeFile(
      planted,
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n',
    )
    const clean = join(dir, 'clean.txt')
    await writeFile(clean, 'const token = "test-token" // example.invalid\n')

    const plantedResult = scanArtifact(planted)
    const cleanResult = scanArtifact(clean)
    if (plantedResult.ok) throw new Error('self-test FAILED: planted PEM key not detected')
    if (!cleanResult.ok) throw new Error('self-test FAILED: clean placeholder flagged')
    console.log(
      '[scan-desktop-artifacts] self-test OK — planted secret detected, placeholder ignored',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function printHelp() {
  console.log(
    [
      'Desktop Electron artifact secret scanner',
      '',
      'Usage:',
      '  node scripts/scan-desktop-artifacts.mjs [releaseDir ...]   default: packages/desktop/release',
      '  node scripts/scan-desktop-artifacts.mjs --help',
      '  node scripts/scan-desktop-artifacts.mjs --self-test',
      '',
      'Scans every loose file, unpacks each app.asar and supported archive, and',
      'safely extracts the verified custom Windows EXE payload. Exits 1 on any',
      'incomplete scan or secret/source-policy match.',
    ].join('\n'),
  )
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return 0
  }
  if (args.includes('--self-test')) {
    await selfTest()
    return 0
  }

  const releaseDirs = args.length > 0 ? args : [join(REPO_ROOT, 'packages', 'desktop', 'release')]
  const scanArtifact = await loadScanner()
  const extractAll = await loadAsar()

  const allFindings = []
  let scannedAny = false
  for (const dir of releaseDirs) {
    if (!existsSync(dir)) {
      console.warn(`[scan-desktop-artifacts] release dir not found (skipped): ${dir}`)
      continue
    }
    scannedAny = true
    const findings = await scanRelease(scanArtifact, extractAll, dir)
    allFindings.push(...findings)
  }

  if (!scannedAny) {
    console.error('[scan-desktop-artifacts] no release directories to scan')
    return 2
  }
  if (allFindings.length > 0) {
    console.error(`[scan-desktop-artifacts] FAIL — ${allFindings.length} secret-like finding(s):`)
    for (const line of allFindings) console.error(`  ${line}`)
    return 1
  }
  console.log('[scan-desktop-artifacts] OK — no secrets found in desktop artifacts')
  return 0
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      console.error(
        `[scan-desktop-artifacts] error: ${err instanceof Error ? err.stack : String(err)}`,
      )
      process.exitCode = 1
    })
}
