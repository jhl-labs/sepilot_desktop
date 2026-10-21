#!/usr/bin/env node

import { readdir, lstat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN = [
  /\.map$/i,
  /\.pdb$/i,
  /\.d\.[cm]?ts$/i,
  /\.tsx?$/i,
  /\.[cm]ts$/i,
  /\.flow(\.js)?$/i,
  /\.coffee$/i,
  /\.litcoffee$/i,
  /(?:^|[\\/])\.env(?:$|\.|[\\/])/i,
  /(?:^|[\\/])\.npmrc$/i,
  /(?:^|[\\/])\.yarnrc(?:\.yml)?$/i,
  /(?:^|[\\/])config\.ya?ml$/i,
  /(?:^|[\\/])\.sepilotd(?:$|[\\/])/i,
  /^(?:security|sessions|memory)(?:$|[\\/])/i,
  /^(?:(?:win-unpacked|linux(?:-[A-Za-z0-9_]+)?-unpacked)[\\/])?resources[\\/](?:security|sessions|memory)(?:$|[\\/])/i,
  /(?:^|[\\/])Contents[\\/]Resources[\\/](?:security|sessions|memory)(?:$|[\\/])/i,
  /\.token$/i,
  /(?:^|[\\/])credentials?\.json$/i,
  /(?:^|[\\/])service-account[^\\/]*\.json$/i,
  /(?:^|[\\/])id_(?:rsa|ed25519|ecdsa|dsa)$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /\.jks$/i,
  /\.log(?:\.(?:\d+|old|bak|gz|zip|\d{4}[-_.]\d{2}[-_.]\d{2}(?:[-_.T][^\\/]*)?))?$/i,
  /(?:^|[\\/])(?:[^\\/]*[-_.])?audit(?:[-_.][^\\/]*)?\.(?:jsonl?|ndjson|txt|csv|db(?:-(?:wal|shm))?|sqlite3?(?:-(?:wal|shm))?)$/i,
  /\.(?:dmp|mdmp|dump|crash)(?:\.(?:\d+|old|bak|gz|zip))?$/i,
  /(?:^|[\\/])(?:crash|debug)[-_.](?:dump|report)(?:[-_.][^\\/]*)?\.(?:jsonl?|txt|zip)$/i,
  /(?:^|[\\/])core\.\d+(?:\.[^\\/]*)?$/i,
]

const ALLOWED = [
]

export function isForbidden(relPath) {
  if (ALLOWED.some((re) => re.test(relPath))) return false
  return FORBIDDEN.some((re) => re.test(relPath))
}

export async function walkFs(root, hits, options = {}) {
  const readEntries = options.readEntries ?? readdir
  const entries = await readEntries(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      await walkFs(full, hits, options)
    } else if (entry.isFile()) {
      const relPath = relative(options.releaseDir ?? root, full)
      if (isForbidden(relPath)) hits.push(full)
    }
  }
}

export async function resolveAsarLister(importModule = (specifier) => import(specifier)) {
  let asar
  let electronAsarError
  try {
    asar = await importModule('@electron/asar')
  } catch (error) {
    electronAsarError = error
    try {
      asar = await importModule('asar')
    } catch (fallbackError) {
      throw new Error(
        `ASAR 검사 모듈을 불러올 수 없습니다: @electron/asar=${formatError(electronAsarError)}; asar=${formatError(fallbackError)}`,
      )
    }
  }

  const lister = asar?.listPackage ?? asar?.default?.listPackage
  if (typeof lister !== 'function') {
    throw new Error('ASAR 검사 모듈이 listPackage API를 제공하지 않습니다')
  }
  return lister
}

export function listAsar(asarPath, lister) {
  let entries
  try {
    entries = lister(asarPath)
  } catch (error) {
    throw new Error(`app.asar 목록 검사 실패(${asarPath}): ${formatError(error)}`)
  }
  if (!Array.isArray(entries)) {
    throw new Error(`app.asar 목록 검사 실패(${asarPath}): listPackage 결과가 배열이 아닙니다`)
  }
  return entries.filter((path) => isForbidden(path))
}

async function assertRegularFile(path, label) {
  let info
  try {
    info = await lstat(path)
  } catch (error) {
    throw new Error(`${label}을 찾거나 읽을 수 없습니다: ${path}: ${formatError(error)}`)
  }
  if (!info.isFile()) {
    throw new Error(`${label}이 일반 파일이 아닙니다: ${path}`)
  }
}

export async function verifyNoSourceLeak(releaseDir, options = {}) {
  const resolvedReleaseDir = resolve(releaseDir)
  let releaseInfo
  try {
    releaseInfo = await lstat(resolvedReleaseDir)
  } catch (error) {
    throw new Error(
      `release 디렉토리를 찾거나 읽을 수 없습니다: ${resolvedReleaseDir}: ${formatError(error)}`,
    )
  }
  if (!releaseInfo.isDirectory()) {
    throw new Error(`release 경로가 디렉토리가 아닙니다: ${resolvedReleaseDir}`)
  }

  const fsHits = []
  await walkFs(resolvedReleaseDir, fsHits, {
    readEntries: options.readEntries,
    releaseDir: resolvedReleaseDir,
  })

  const asarPaths = await packagedAsarPaths(resolvedReleaseDir, options.readEntries ?? readdir)
  for (const asarPath of asarPaths) await assertRegularFile(asarPath, 'app.asar')
  const lister = options.asarLister ?? (await resolveAsarLister(options.importModule))
  const asarHits = asarPaths.flatMap((asarPath) => {
    const hits = listAsar(asarPath, lister)
    return asarPaths.length === 1 ? hits : hits.map((hit) => `${relative(resolvedReleaseDir, asarPath)}:${hit}`)
  })

  return { fsHits, asarHits, asarPath: asarPaths[0], asarPaths, releaseDir: resolvedReleaseDir }
}

async function packagedAsarPaths(releaseDir, readEntries) {
  const entries = await readEntries(releaseDir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (/-unpacked$/u.test(entry.name)) {
      paths.push(join(releaseDir, entry.name, 'resources', 'app.asar'))
    } else if (/^mac(?:-[A-Za-z0-9_]+)?$/u.test(entry.name)) {
      for (const bundle of await readEntries(join(releaseDir, entry.name), { withFileTypes: true })) {
        if (bundle.isDirectory() && bundle.name.endsWith('.app')) {
          paths.push(join(releaseDir, entry.name, bundle.name, 'Contents', 'Resources', 'app.asar'))
        }
      }
    }
  }
  if (paths.length === 0) {
    throw new Error(`app.asar을 찾을 수 없습니다: ${releaseDir}에 <platform>-unpacked 또는 mac 앱 번들이 없습니다`)
  }
  return paths.sort()
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}

function printFindings(result) {
  const total = result.fsHits.length + result.asarHits.length
  if (total === 0) {
    console.log(
      '[verify-no-source-leak] OK — release 산출물에서 sourcemap/원본TS/타입정의 발견 안 됨.',
    )
    return 0
  }

  console.error(`[verify-no-source-leak] FAIL — ${total}건 누출 발견`)
  if (result.fsHits.length) {
    console.error(`\n파일 시스템 (${result.fsHits.length}):`)
    for (const path of result.fsHits.slice(0, 50)) {
      console.error(`  - ${relative(result.releaseDir, path)}`)
    }
    if (result.fsHits.length > 50) {
      console.error(`  ... (+${result.fsHits.length - 50})`)
    }
  }
  if (result.asarHits.length) {
    console.error(`\napp.asar 내부 (${result.asarHits.length}):`)
    for (const path of result.asarHits.slice(0, 50)) console.error(`  - ${path}`)
    if (result.asarHits.length > 50) {
      console.error(`  ... (+${result.asarHits.length - 50})`)
    }
  }
  return 1
}

export async function main(argv = process.argv.slice(2)) {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const releaseDir = argv[0] ?? join(here, '..', 'packages', 'desktop', 'release')
  const result = await verifyNoSourceLeak(releaseDir)
  return printFindings(result)
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`[verify-no-source-leak] error: ${formatError(error)}`)
      process.exitCode = 1
    })
}
