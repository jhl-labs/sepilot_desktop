import { cp, lstat, readdir, realpath, rm } from 'node:fs/promises'
import { isAbsolute, resolve, join, relative, sep } from 'node:path'

function isWithinRoot(root, target) {
  const rel = relative(root, target)
  return (
    rel === ''
    || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  )
}

async function materializeSymlink(path, root) {
  const target = await realpath(path)
  const pathSegments = path.split(sep)
  const shouldMaterialize = pathSegments.includes('.pnpm') && pathSegments.includes('@sepilotd')
  if (!shouldMaterialize) {
    return
  }
  if (!isWithinRoot(root, target)) {
    return
  }
  await rm(path, { recursive: true, force: true })
  await cp(target, path, {
    recursive: true,
    force: true,
    dereference: true,
  })
}

async function materializeTree(root, currentDir = root) {
  const entries = await readdir(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = join(currentDir, entry.name)
    const stats = await lstat(entryPath)

    if (stats.isSymbolicLink()) {
      await materializeSymlink(entryPath, root)
      const copiedStats = await lstat(entryPath)
      if (copiedStats.isDirectory()) {
        await materializeTree(root, entryPath)
      }
      continue
    }

    if (stats.isDirectory()) {
      await materializeTree(root, entryPath)
    }
  }
}

async function main() {
  const targetRoot = process.argv[2]
  if (!targetRoot) {
    throw new Error('usage: node scripts/materialize-node-symlinks.mjs <node_modules_dir>')
  }

  await materializeTree(resolve(targetRoot))
}

await main()
