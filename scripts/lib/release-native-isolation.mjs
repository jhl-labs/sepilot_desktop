import { cp, rm, rename } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export async function isolateNativePackageTree(packagePath) {
  const parent = dirname(packagePath)
  const isolatedPath = join(parent, `.${basename(packagePath)}.sepilotd-isolated`)

  await rm(isolatedPath, { recursive: true, force: true })
  try {
    await cp(packagePath, isolatedPath, {
      recursive: true,
      dereference: true,
      force: true,
    })
    await rm(packagePath, { recursive: true, force: true })
    await rename(isolatedPath, packagePath)
  } catch (error) {
    await rm(isolatedPath, { recursive: true, force: true })
    throw error
  }
}
