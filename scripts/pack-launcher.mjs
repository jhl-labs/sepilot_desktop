#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rm, open } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith('--')) {
      out[k.slice(2)] = argv[i + 1]
      i++
    }
  }
  return out
}

async function which7za() {
  const mod = await import('7zip-bin')
  return mod.path7za ?? mod.default?.path7za
}

function run(cmd, args, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('error', rejectP)
    p.on('exit', (code) =>
      code === 0 ? resolveP() : rejectP(new Error(`${cmd} exited with code ${code}`)),
    )
  })
}

async function sha256File(path) {
  return await new Promise((resolveP, rejectP) => {
    const h = createHash('sha256')
    const s = createReadStream(path)
    s.on('error', rejectP)
    s.on('data', (chunk) => h.update(chunk))
    s.on('end', () => resolveP(h.digest()))
  })
}

async function dstFdWrite(handle, buf) {
  const { bytesWritten } = await handle.write(buf, 0, buf.length)
  if (bytesWritten !== buf.length) {
    throw new Error(`short write: ${bytesWritten}/${buf.length}`)
  }
}

async function main() {
  const args = parseArgs(process.argv)

  const launcherExe = resolve(
    repoRoot,
    args.launcher ?? 'tools/launcher/target/release/sepilot-launcher.exe',
  )
  const sourceDir = resolve(repoRoot, args.source ?? 'packages/desktop/release/win-unpacked')
  const outExe = resolve(repoRoot, args.out ?? 'packages/desktop/release/sepilot-desktop.exe')

  if (!existsSync(launcherExe)) {
    throw new Error(
      `[pack-launcher] launcher binary not found: ${launcherExe}\n` +
        `  rust toolchain 설치 후 'cd tools/launcher && cargo build --release' 실행 필요.`,
    )
  }
  if (!existsSync(sourceDir)) {
    throw new Error(`[pack-launcher] source dir not found: ${sourceDir}`)
  }

  const stagingDir = resolve(repoRoot, 'packages/desktop/release/.launcher-stage')
  const payload7z = join(stagingDir, 'payload.7z')
  await mkdir(stagingDir, { recursive: true })
  if (existsSync(payload7z)) await rm(payload7z)

  const path7za = await which7za()
  if (!path7za || !existsSync(path7za)) {
    throw new Error(`[pack-launcher] 7za binary not found (path7za=${path7za})`)
  }

  console.log('[pack-launcher] compressing payload with 7z (optimized)...')
  const t0 = Date.now()
  await run(path7za, [
    'a',
    '-t7z',
    '-mx=7',
    '-m0=lzma2',
    '-ms=on',
    '-mmt=on',
    payload7z,
    join(sourceDir, '*'),
  ])
  const compressMs = Date.now() - t0
  const payloadStat = statSync(payload7z)
  console.log(
    `[pack-launcher] payload.7z = ${(payloadStat.size / 1024 / 1024).toFixed(1)} MB (took ${(compressMs / 1000).toFixed(1)}s)`,
  )

  console.log('[pack-launcher] hashing payload...')
  const payloadSha = await sha256File(payload7z)
  console.log(`[pack-launcher] payload sha256 = ${payloadSha.toString('hex')}`)

  if (existsSync(outExe)) await rm(outExe)
  const outHandle = await open(outExe, 'w')
  try {
    const launcherBytes = await readFile(launcherExe)
    await dstFdWrite(outHandle, launcherBytes)

    const payloadHandle = await open(payload7z, 'r')
    try {
      const bufSize = 1024 * 1024
      const buf = Buffer.allocUnsafe(bufSize)
      while (true) {
        const { bytesRead } = await payloadHandle.read(buf, 0, bufSize, null)
        if (bytesRead === 0) break
        await dstFdWrite(outHandle, buf.subarray(0, bytesRead))
      }
    } finally {
      await payloadHandle.close()
    }

    const footer = Buffer.alloc(40)
    payloadSha.copy(footer, 0, 0, 32)
    footer.writeBigUInt64LE(BigInt(payloadStat.size), 32)
    await dstFdWrite(outHandle, footer)
  } finally {
    await outHandle.close()
  }

  const finalStat = statSync(outExe)
  console.log(`[pack-launcher] OK — ${outExe} = ${(finalStat.size / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  ├─ launcher: ${(launcherBytesSize(launcherExe) / 1024).toFixed(0)} KB`)
  console.log(`  ├─ payload:  ${(payloadStat.size / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  └─ footer:   40 B`)

  try {
    await rm(payload7z)
  } catch {
  }
}

function launcherBytesSize(p) {
  return statSync(p).size
}

await main()
