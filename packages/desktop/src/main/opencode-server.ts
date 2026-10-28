import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { resolveLocalCommandLaunch } from './local-command'

export interface OpencodeServerHandle {
  readonly baseUrl: string
  readonly cwd: string | undefined
  readonly headers: Readonly<Record<string, string>>
}

interface ManagedServer {
  child: ChildProcess
  handle: OpencodeServerHandle
}

const READY_TIMEOUT_MS = 30_000
const servers = new Map<string, Promise<ManagedServer>>()

function serverKey(cwd: string | undefined): string {
  return cwd ?? ''
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => (port ? resolve(port) : reject(new Error('No free port for opencode serve'))))
    })
  })
}

async function startServer(cwd: string | undefined): Promise<ManagedServer> {
  const port = await freePort()
  const launch = resolveLocalCommandLaunch(['opencode', 'serve', '--hostname', '127.0.0.1', '--port', String(port)])
  const password = randomBytes(32).toString('base64url')
  const child = spawn(launch.file, launch.args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
  })
  const baseUrl = await new Promise<string>((resolve, reject) => {
    let output = ''
    let settled = false
    const settle = (error?: Error, url?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        child.kill()
        reject(error)
      } else resolve(url!)
    }
    const timer = setTimeout(() => settle(new Error('opencode serve did not report a listening address in time')), READY_TIMEOUT_MS)
    const onData = (data: Buffer) => {
      output = (output + data.toString()).slice(-8192)
      const match = /listening on (https?:\/\/\S+)/i.exec(output)
      if (match) settle(undefined, match[1].replace(/\/+$/, ''))
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', (error) => settle(error))
    child.once('exit', (code) => settle(new Error(`opencode serve exited (${code ?? 'unknown'}) before it was ready.${output ? `\n${output.trim().slice(-1000)}` : ''}`)))
  })
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  const headers = { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }
  return { child, handle: { baseUrl, cwd, headers } }
}

export async function acquireOpencodeServer(cwd: string | undefined): Promise<OpencodeServerHandle> {
  const key = serverKey(cwd)
  let pending = servers.get(key)
  if (!pending) {
    pending = startServer(cwd)
    servers.set(key, pending)
    pending
      .then(({ child }) => {
        child.once('exit', () => {
          if (servers.get(key) === pending) servers.delete(key)
        })
      })
      .catch(() => {
        if (servers.get(key) === pending) servers.delete(key)
      })
  }
  return (await pending).handle
}

export function disposeOpencodeServers(): void {
  for (const [key, pending] of servers) {
    servers.delete(key)
    pending.then(({ child }) => child.kill()).catch(() => {})
  }
}
