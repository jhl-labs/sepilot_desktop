export interface LateServiceReadinessOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs)
    timer.unref?.()
  })
}

export async function waitForLateServiceReadiness(
  check: () => Promise<boolean>,
  options: LateServiceReadinessOptions = {},
): Promise<boolean> {
  const attempts = Math.max(1, Math.min(20, Math.floor(options.attempts ?? 8)))
  const baseDelayMs = Math.max(50, Math.floor(options.baseDelayMs ?? 500))
  const maxDelayMs = Math.max(
    baseDelayMs,
    Math.floor(options.maxDelayMs ?? 5_000),
  )
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await check()) return true
    } catch {
    }
    if (attempt >= attempts - 1) break
    await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt))
  }
  return false
}
