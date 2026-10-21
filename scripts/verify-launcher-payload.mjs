#!/usr/bin/env node

import { createHash, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdtemp, open, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSevenZipPath, testSevenZipArchive } from './lib/seven-zip-archive.mjs'

export const LAUNCHER_FOOTER_BYTES = 40
const PAYLOAD_SHA256_BYTES = 32
const COPY_BUFFER_BYTES = 1024 * 1024

function parseArgs(argv) {
  let executablePath
  let sevenZipPath

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--7za') {
      sevenZipPath = argv[index + 1]
      if (!sevenZipPath || sevenZipPath.startsWith('--')) {
        throw new Error('[verify-launcher-payload] --7za requires a path')
      }
      index += 1
      continue
    }
    if (argument === '--file' || argument === '--exe') {
      executablePath = argv[index + 1]
      if (!executablePath || executablePath.startsWith('--')) {
        throw new Error(`[verify-launcher-payload] ${argument} requires a path`)
      }
      index += 1
      continue
    }
    if (argument.startsWith('--')) {
      throw new Error(`[verify-launcher-payload] unknown option: ${argument}`)
    }
    if (executablePath) {
      throw new Error('[verify-launcher-payload] exactly one executable path is required')
    }
    executablePath = argument
  }

  if (!executablePath) {
    throw new Error(
      'Usage: node scripts/verify-launcher-payload.mjs <sepilot-desktop.exe> [--7za <path>]',
    )
  }

  return { executablePath, sevenZipPath }
}

async function assertRegularFile(path, label) {
  try {
    await access(path, constants.R_OK)
  } catch {
    throw new Error(`[verify-launcher-payload] ${label} is not readable: ${path}`)
  }

  const info = await stat(path, { bigint: true })
  if (!info.isFile()) {
    throw new Error(`[verify-launcher-payload] ${label} is not a regular file: ${path}`)
  }
  return info
}

async function writeAll(handle, buffer) {
  let offset = 0
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, null)
    if (bytesWritten === 0) {
      throw new Error('[verify-launcher-payload] short write while extracting payload')
    }
    offset += bytesWritten
  }
}

async function extractAndHashPayload(inputHandle, payloadPath, payloadOffset, payloadLength) {
  const outputHandle = await open(payloadPath, 'wx')
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(Math.min(COPY_BUFFER_BYTES, payloadLength))
  let position = payloadOffset
  let remaining = payloadLength

  try {
    while (remaining > 0) {
      const requested = Math.min(buffer.length, remaining)
      const { bytesRead } = await inputHandle.read(buffer, 0, requested, position)
      if (bytesRead === 0) {
        throw new Error('[verify-launcher-payload] unexpected EOF while reading payload')
      }
      const chunk = buffer.subarray(0, bytesRead)
      hash.update(chunk)
      await writeAll(outputHandle, chunk)
      position += bytesRead
      remaining -= bytesRead
    }
  } finally {
    await outputHandle.close()
  }

  return hash.digest()
}

export async function verifyLauncherPayload(executablePath, options = {}) {
  const resolvedExecutablePath = resolve(executablePath)
  const executableInfo = await assertRegularFile(resolvedExecutablePath, 'launcher executable')
  const footerBytes = BigInt(LAUNCHER_FOOTER_BYTES)

  if (executableInfo.size <= footerBytes) {
    throw new Error(
      `[verify-launcher-payload] file is too small to contain launcher, payload, and ${LAUNCHER_FOOTER_BYTES}-byte footer`,
    )
  }
  if (executableInfo.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('[verify-launcher-payload] file is too large for safe positional I/O')
  }

  const fileSize = Number(executableInfo.size)
  const footerOffset = fileSize - LAUNCHER_FOOTER_BYTES
  const inputHandle = await open(resolvedExecutablePath, 'r')
  let tempDirectory

  try {
    const footer = Buffer.alloc(LAUNCHER_FOOTER_BYTES)
    const { bytesRead } = await inputHandle.read(footer, 0, LAUNCHER_FOOTER_BYTES, footerOffset)
    if (bytesRead !== LAUNCHER_FOOTER_BYTES) {
      throw new Error(
        `[verify-launcher-payload] truncated footer: ${bytesRead}/${LAUNCHER_FOOTER_BYTES} bytes`,
      )
    }

    const expectedSha256 = footer.subarray(0, PAYLOAD_SHA256_BYTES)
    const payloadLengthBigInt = footer.readBigUInt64LE(PAYLOAD_SHA256_BYTES)
    const maximumPayloadLength = executableInfo.size - footerBytes - 1n
    if (payloadLengthBigInt === 0n || payloadLengthBigInt > maximumPayloadLength) {
      throw new Error(
        `[verify-launcher-payload] invalid payload length in footer: ${payloadLengthBigInt.toString()}`,
      )
    }
    if (payloadLengthBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('[verify-launcher-payload] payload length exceeds safe integer range')
    }

    const payloadLength = Number(payloadLengthBigInt)
    const payloadOffset = footerOffset - payloadLength
    if (payloadOffset <= 0) {
      throw new Error('[verify-launcher-payload] launcher section is empty or invalid')
    }

    tempDirectory = await mkdtemp(join(tmpdir(), 'sepilot-launcher-verify-'))
    const payloadPath = join(tempDirectory, 'payload.7z')
    const actualSha256 = await extractAndHashPayload(
      inputHandle,
      payloadPath,
      payloadOffset,
      payloadLength,
    )

    if (!timingSafeEqual(actualSha256, expectedSha256)) {
      throw new Error(
        `[verify-launcher-payload] payload SHA-256 mismatch ` +
          `(expected=${expectedSha256.toString('hex')}, actual=${actualSha256.toString('hex')})`,
      )
    }

    const sevenZipPath = await resolveSevenZipPath(options.sevenZipPath)
    await assertRegularFile(sevenZipPath, '7za binary')
    await testSevenZipArchive(sevenZipPath, payloadPath, {
      timeoutMs: options.timeoutMs,
    })

    const payloadSha256 = actualSha256.toString('hex')
    const inspection =
      typeof options.inspectPayload === 'function'
        ? await options.inspectPayload({
            payloadPath,
            sevenZipPath,
            payloadLength,
            payloadSha256,
          })
        : undefined

    return {
      ok: true,
      executablePath: resolvedExecutablePath,
      fileSize,
      launcherLength: payloadOffset,
      payloadLength,
      payloadSha256,
      inspection,
    }
  } finally {
    await inputHandle.close()
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const result = await verifyLauncherPayload(args.executablePath, {
    sevenZipPath: args.sevenZipPath,
  })
  console.log(
    `[verify-launcher-payload] OK — ${basename(result.executablePath)} ` +
      `(launcher=${result.launcherLength} B, payload=${result.payloadLength} B, ` +
      `sha256=${result.payloadSha256})`,
  )
}

const isMain = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isMain) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
