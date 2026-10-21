import { parentPort, workerData } from 'node:worker_threads'
import { hardenJavaScriptFile } from './lib/release-hardening.mjs'

if (!parentPort) {
  throw new Error('release hardening worker requires a parent port')
}

const stats = {
  hardened: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheCorrupt: 0,
  cacheUnavailable: 0,
  cacheDisabled: 0,
  cacheWarnings: 0,
  elapsedTaskMs: 0,
  byRoot: {},
}

try {
  for (const task of workerData.tasks) {
    const result = await hardenJavaScriptFile(task, workerData.options)
    if (result.hardened) stats.hardened += 1
    stats.elapsedTaskMs += result.elapsedMs
    if (result.cacheStatus === 'hit') stats.cacheHits += 1
    else if (result.cacheStatus === 'miss') stats.cacheMisses += 1
    else if (result.cacheStatus === 'corrupt') stats.cacheCorrupt += 1
    else if (result.cacheStatus === 'unavailable') stats.cacheUnavailable += 1
    else stats.cacheDisabled += 1
    if (result.cacheWarning) stats.cacheWarnings += 1

    const rootStats = stats.byRoot[task.rootIndex] ?? { hardened: 0, cacheHits: 0 }
    if (result.hardened) rootStats.hardened += 1
    if (result.cacheStatus === 'hit') rootStats.cacheHits += 1
    stats.byRoot[task.rootIndex] = rootStats
  }
  parentPort.postMessage({ type: 'done', stats })
} catch (error) {
  parentPort.postMessage({
    type: 'error',
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  })
  process.exitCode = 1
}
