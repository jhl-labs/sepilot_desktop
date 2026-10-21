import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { readStagedRuntimeNames } from '../packages/desktop/scripts/runtime-manifest.mjs'

const args = process.argv.slice(2)

function valueAfter(flag, fallback) {
  const index = args.indexOf(flag)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const requestedPlatform = valueAfter('--platform', process.platform)
if (requestedPlatform !== process.platform) {
  throw new Error(
    `Packaged Desktop smoke test must run natively (${requestedPlatform} requested on ${process.platform}).`,
  )
}

const packageDirInput = valueAfter('--dir', 'packages/desktop/release/win-unpacked')
const packageDir = isAbsolute(packageDirInput)
  ? resolve(packageDirInput)
  : resolve(process.cwd(), packageDirInput)
const executableName = process.platform === 'win32'
  ? 'sepilotd.exe'
  : process.platform === 'darwin'
    ? 'sepilotd.app/Contents/MacOS/sepilotd'
    : 'sepilotd'
const executable = join(packageDir, ...executableName.split('/'))

await stat(executable).catch(() => {
  throw new Error(`Packaged Desktop executable is missing: ${executable}`)
})

const requiredRuntimePaths = [
  join(packageDir, 'resources', 'daemon', 'dist', 'embedded.js'),
  join(
    packageDir,
    'resources',
    'daemon',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  ),
  ...(await readStagedRuntimeNames(resolve(packageDir, '..', '..')))
    .filter((name) => name !== 'daemon')
    .map((name) => join(packageDir, 'resources', name, 'node_modules')),
]
for (const requiredPath of requiredRuntimePaths) {
  await stat(requiredPath).catch(() => {
    throw new Error(`Packaged Desktop runtime dependency is missing: ${requiredPath}`)
  })
}

async function reserveAvailablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()))
  })
  if (!port) throw new Error('Could not allocate a packaged Desktop smoke-test port.')
  return port
}

const userDataDir = await mkdtemp(join(tmpdir(), 'sepilotd-desktop-smoke-'))
const daemonDataDir = join(userDataDir, 'daemon-data')
const daemonPort = await reserveAvailablePort()
const timeoutMs = 45_000
const smokeEnv = { ...process.env }
delete smokeEnv.SEPILOTD_HOME

try {
  const result = await new Promise((resolveResult, reject) => {
    const output = []
    const child = spawn(
      executable,
      ['--packaged-smoke-test', `--user-data-dir=${userDataDir}`],
      {
        cwd: packageDir,
        env: {
          ...smokeEnv,
          SEPILOTD_DESKTOP_RENDERER: 'next',
          SEPILOTD_DATA_DIR: daemonDataDir,
          SEPILOTD_PORT: String(daemonPort),
          SEPILOT_DESKTOP_DAEMON_ORIGIN: `http://127.0.0.1:${daemonPort}`,
          SEPILOT_DESKTOP_DISABLE_GATEWAY_AUTOSTART: '1',
          SEPILOT_DESKTOP_DISABLE_TRAY: '1',
          SEPILOT_DESKTOP_DISABLE_AUTO_UPDATES: '1',
          SEPILOT_DESKTOP_DISABLE_NOTIFICATION_WATCH: '1',
          SEPILOT_DESKTOP_DISABLE_NATIVE_NOTIFICATIONS: '1',
          SEPILOT_DESKTOP_DISABLE_GLOBAL_SHORTCUTS: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Packaged Desktop smoke test timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        output.push(String(chunk))
        if (output.join('').length > 32_000) output.shift()
      })
    }
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolveResult({ code, signal, output: output.join('') })
    })
  })

  if (result.code !== 0) {
    throw new Error(
      `Packaged Desktop smoke test failed (code=${result.code}, signal=${result.signal ?? 'none'}).\n${result.output}`,
    )
  }
  if (!result.output.includes('[desktop-smoke] renderer and daemon loaded successfully')) {
    throw new Error(
      `Packaged Desktop exited without renderer and daemon success markers.\n${result.output}`,
    )
  }
  process.stdout.write(result.output)
} finally {
  await rm(userDataDir, { recursive: true, force: true })
}
