import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type DesktopServiceKind = 'daemon' | 'gateway'

export interface ResolveDesktopServiceTokenOptions {
  kind: DesktopServiceKind
  origin: string
  savedToken: string | null
  dataDir: string
  managedLocally: boolean
  waitForLocalService?: () => Promise<void>
}

export interface WaitForDesktopServiceTokenOptions {
  kind: DesktopServiceKind
  dataDir: string
  timeoutMs?: number
  pollIntervalMs?: number
}

function normalizeToken(value: string | Buffer | null | undefined): string | null {
  const normalized = typeof value === 'string'
    ? value.trim()
    : Buffer.isBuffer(value)
      ? value.toString('utf-8').trim()
      : ''
  return normalized ? normalized : null
}

async function readLocalServiceToken(
  kind: DesktopServiceKind,
  dataDir: string,
): Promise<string | null> {
  try {
    return normalizeToken(
      await readFile(join(dataDir, 'security', `${kind}.token`), 'utf-8'),
    )
  } catch (error) {
    if (
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    const timer = setTimeout(resolveDelay, ms)
    timer.unref?.()
  })
}

export async function waitForDesktopServiceToken(
  options: WaitForDesktopServiceTokenOptions,
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 90_000
  const pollIntervalMs = options.pollIntervalMs ?? 250
  const deadline = Date.now() + timeoutMs

  do {
    if (await readLocalServiceToken(options.kind, options.dataDir)) return true
    if (Date.now() >= deadline) return false
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))
  } while (true)
}

export async function resolveDesktopServiceToken(
  options: ResolveDesktopServiceTokenOptions,
): Promise<string | null> {
  const savedToken = normalizeToken(options.savedToken)

  if (!options.managedLocally) {
    if (!savedToken) return null
    const managedToken = await readLocalServiceToken(options.kind, options.dataDir)
    return managedToken && managedToken === savedToken ? null : savedToken
  }

  let localToken = await readLocalServiceToken(options.kind, options.dataDir)
  if (!localToken && options.waitForLocalService) {
    try {
      await options.waitForLocalService()
    } catch {
    }
    localToken = await readLocalServiceToken(options.kind, options.dataDir)
  }

  return localToken ?? savedToken
}
