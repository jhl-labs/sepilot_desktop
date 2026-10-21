import { StringDecoder } from 'node:string_decoder'
import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { resolveLocalCommandLaunch } from './local-command'
import { isCliModelBackend, validateCliModel, type CliModel, type CliModelBackend } from '../../lib/chat/cli-models'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}
export function normalizeCliModels(backend: CliModelBackend, value: unknown): CliModel[] {
  if (!Array.isArray(value)) throw new Error('CLI returned an invalid model catalog')
  const models = new Map<string, CliModel>()
  for (const item of value) {
    const row = record(item)
    if (row.hidden === true) continue
    const id = validateCliModel(backend === 'claude-cli' ? row.value : backend === 'codex-cli' ? row.model : item)
    if (!id) continue
    models.set(id, { id, label: typeof row.displayName === 'string' ? row.displayName : id,
      ...(typeof row.description === 'string' ? { description: row.description } : {}) })
  }
  if (!models.size) throw new Error('CLI returned no available models')
  return [...models.values()]
}

export async function listCliModels(backend: unknown, cwd?: unknown): Promise<CliModel[]> {
  if (!isCliModelBackend(backend)) throw new Error('Unsupported CLI backend')
  if (cwd !== undefined && (typeof cwd !== 'string' || !isAbsolute(cwd))) throw new Error('Invalid working directory')
  const command = backend === 'codex-cli' ? ['codex', 'app-server']
    : backend === 'claude-cli' ? ['claude', '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']
      : ['opencode', 'models']
  const launch = resolveLocalCommandLaunch(command)
  return new Promise((resolve, reject) => {
    const child = spawn(launch.file, launch.args, { cwd: cwd as string | undefined, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let buffer = '', output = '', done = false, bytes = 0
    const decoder = new StringDecoder('utf8')
    const models: CliModel[] = []
    const cursors = new Set<string>()
    const finish = (error?: Error, result?: CliModel[]) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.stdin.end()
      child.kill()
      if (child.exitCode === null && child.signalCode === null) {
        const force = setTimeout(() => child.kill('SIGKILL'), 1000)
        force.unref()
        child.once('exit', () => clearTimeout(force))
      }
      if (error) reject(error)
      else resolve(result ?? [])
    }
    const timer = setTimeout(() => finish(new Error('CLI model discovery timed out')), 20_000)
    const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`)
    child.on('error', (error) => finish(error))
    child.stdin.on('error', (error) => finish(error))
    child.stderr.on('data', () => {})
    child.stdout.on('data', (chunk: Buffer) => {
      if (done) return
      bytes += chunk.length
      if (bytes > 4 * 1024 * 1024) { finish(new Error('CLI model catalog exceeded size limit')); return }
      if (backend === 'opencode-cli') { output += decoder.write(chunk); return }
      buffer += decoder.write(chunk)
      let newline: number
      while (!done && (newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        try {
          const event = record(JSON.parse(line))
          if (backend === 'codex-cli') {
            if (event.error) throw new Error(String(record(event.error).message ?? 'CLI model discovery failed'))
            if (event.id === 1) {
              send({ method: 'initialized' })
              send({ id: 2, method: 'model/list', params: { limit: 100 } })
            } else if (event.id === 2) {
              const result = record(event.result)
              if (Array.isArray(result.data) && result.data.length) models.push(...normalizeCliModels(backend, result.data))
              if (typeof result.nextCursor === 'string' && result.nextCursor) {
                if (cursors.has(result.nextCursor)) throw new Error('CLI repeated a model catalog page')
                cursors.add(result.nextCursor)
                send({ id: 2, method: 'model/list', params: { limit: 100, cursor: result.nextCursor } })
              } else {
                if (!models.length) throw new Error('CLI returned no available models')
                finish(undefined, [...new Map(models.map((model) => [model.id, model])).values()])
              }
            }
          } else if (event.type === 'control_response') {
            const response = record(event.response)
            if (response.request_id !== 'models') continue
            if (response.subtype !== 'success') throw new Error('Claude model discovery failed')
            finish(undefined, normalizeCliModels(backend, record(response.response).models))
          }
        } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
      }
    })
    child.on('close', (code) => {
      if (done) return
      if (backend === 'opencode-cli' && code === 0) {
        try { finish(undefined, normalizeCliModels(backend, output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))) }
        catch (error) { finish(error as Error) }
      } else finish(new Error(`CLI model discovery exited with code ${code ?? 'unknown'}. Check installation and login.`))
    })
    if (backend === 'codex-cli') send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'sepilot', version: '1.0.2' } } })
    else if (backend === 'claude-cli') send({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } })
    else child.stdin.end()
  })
}
