import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { resolveLocalCommandLaunch } from './local-command'
import { validateCliChatInput, validateCliImage, type CliChatInput, type CliChatOutput } from '../../lib/chat/cli-chat-contract'

type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const str = (value: unknown): string => typeof value === 'string' ? value : ''
export interface CliConversation { threadId?: string }

export async function runCliChat(input: CliChatInput, state: CliConversation, signal: AbortSignal, emit: (event: CliChatOutput) => void): Promise<void> {
  validateCliChatInput(input)
  if (input.cwd !== undefined && (typeof input.cwd !== 'string' || !isAbsolute(input.cwd))) throw new Error('CLI working directory must be absolute')
  if (signal.aborted) throw new Error('CLI run cancelled')
  let directory: string | undefined
  try {
    const files: string[] = []
    if (input.backend === 'opencode-cli' && input.images?.length) {
      directory = await mkdtemp(join(tmpdir(), 'sepilot-cli-images-'))
      for (const [index, image] of input.images.entries()) {
        const path = join(directory, `${index}.${image.mediaType.split('/')[1]}`)
        await writeFile(path, Buffer.from(image.data, 'base64'), { mode: 0o600 })
        files.push(path)
      }
    }
    if (signal.aborted) throw new Error('CLI run cancelled')
    const model = input.model ? ['--model', input.model] : []
    const command = input.backend === 'codex-cli' ? ['codex', 'app-server']
      : input.backend === 'claude-cli' ? ['claude', '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk', ...model, ...(state.threadId ? ['--resume', state.threadId] : [])]
        : ['opencode', 'run', '--format', 'json', ...model, ...(state.threadId ? ['--session', state.threadId] : []), ...files.flatMap((file) => ['--file', file])]
    const launch = resolveLocalCommandLaunch(command)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(launch.file, launch.args, { cwd: input.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      let finished = false, sawCompletion = false, buffer = '', stderr = ''
      const decoder = new StringDecoder('utf8')
      const seen = new Set<string>()
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        child.stdin.end()
        child.kill()
        if (child.exitCode === null && child.signalCode === null) {
          const force = setTimeout(() => child.kill('SIGKILL'), 1000)
          force.unref()
          child.once('exit', () => clearTimeout(force))
        }
        if (error) reject(error)
        else resolve()
      }
      const abort = () => finish(new Error('CLI run cancelled'))
      const timer = setTimeout(() => finish(new Error('CLI run timed out')), 20 * 60_000)
      signal.addEventListener('abort', abort, { once: true })
      const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`)
      const text = (value: unknown) => { if (typeof value === 'string' && value) emit({ type: 'text', text: value }) }
      const parse = (line: string) => {
        if (!line.trim() || finished) return
        if (!line.trimStart().startsWith('{')) { emit({ type: 'progress', text: line.slice(0, 1000) }); return }
        const event = row(JSON.parse(line))
        if (input.backend === 'codex-cli') {
          if (event.error) throw new Error(str(row(event.error).message) || 'Codex request failed')
          if (event.id === 1) {
            send({ method: 'initialized' })
            send({ id: 2, method: state.threadId ? 'thread/resume' : 'thread/start', params: {
              ...(state.threadId ? { threadId: state.threadId } : {}), cwd: input.cwd, model: input.model,
              approvalPolicy: 'never',
            } })
          } else if (event.id === 2) {
            const threadId = str(row(row(event.result).thread).id)
            if (!threadId) throw new Error('Codex returned no thread id')
            state.threadId = threadId
            send({ id: 3, method: 'turn/start', params: { threadId, model: input.model, input: [
              { type: 'text', text: input.message, text_elements: [] },
              ...(input.images ?? []).map((image) => ({ type: 'image', url: `data:${image.mediaType};base64,${image.data}` })),
            ] } })
          }
          const params = row(event.params)
          if (params.threadId && params.threadId !== state.threadId) return
          if (event.method === 'thread/tokenUsage/updated') {
            const usage = row(row(params.tokenUsage).last)
            emit({ type: 'usage', inputTokens: Number(usage.inputTokens) || 0, outputTokens: Number(usage.outputTokens) || 0 })
          }
          if (event.method === 'item/completed') {
            const item = row(params.item)
            if (typeof item.id === 'string' && seen.has(item.id)) return
            if (typeof item.id === 'string') seen.add(item.id)
            if (item.type === 'agentMessage') text(item.text)
            if (item.type === 'imageGeneration') {
              if (item.failure || item.status === 'failed') throw new Error(str(row(item.failure).message) || 'Codex image generation failed')
              const result = str(item.result)
              if (!result) throw new Error('Codex returned an image without image data. Update the CLI to a version that includes image results.')
              const match = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(result)
              emit({ type: 'image', image: validateCliImage({ mediaType: match?.[1] ?? 'image/png', data: match?.[2] ?? result }) })
            }
          }
          if (event.method === 'item/started') emit({ type: 'progress', text: str(row(params.item).type) })
          if (event.method === 'turn/completed') {
            const turn = row(params.turn)
            if (turn.status !== 'completed') throw new Error(str(row(turn.error).message) || `Codex turn ${str(turn.status)}`)
            sawCompletion = true
            finish()
          }
          if (event.id !== undefined && typeof event.method === 'string') send({ id: event.id, error: { code: -32601, message: 'Desktop CLI chat does not support this interactive request' } })
        } else if (input.backend === 'claude-cli') {
          if (typeof event.session_id === 'string') state.threadId = event.session_id
          if (event.type === 'assistant') {
            const content = row(event.message).content
            if (Array.isArray(content)) for (const part of content) if (row(part).type === 'text') text(row(part).text)
          }
          if (event.type === 'result') {
            const usage = row(event.usage)
            emit({ type: 'usage', inputTokens: (Number(usage.input_tokens) || 0) + (Number(usage.cache_read_input_tokens) || 0) + (Number(usage.cache_creation_input_tokens) || 0), outputTokens: Number(usage.output_tokens) || 0 })
            if (event.is_error || event.subtype !== 'success') throw new Error(Array.isArray(event.errors) ? event.errors.join('\n') : str(event.result) || 'Claude turn failed')
            sawCompletion = true
            finish()
          }
        } else {
          if (typeof event.sessionID === 'string') state.threadId = event.sessionID
          if (event.type === 'error') throw new Error(str(row(row(event.error).data).message) || 'OpenCode turn failed')
          if (event.type === 'text') text(row(event.part).text)
          if (event.type === 'step_finish') sawCompletion = true
        }
      }
      child.on('error', finish)
      child.stdin.on('error', finish)
      child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4096) })
      child.stdout.on('data', (data: Buffer) => {
        if (finished) return
        buffer += decoder.write(data)
        if (buffer.length > 24 * 1024 * 1024) { finish(new Error('CLI event exceeded size limit')); return }
        try {
          let newline: number
          while (!finished && (newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
            parse(line)
          }
        } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
      })
      child.on('close', (code) => {
        if (finished) return
        try { parse(buffer + decoder.end()) } catch (error) { finish(error as Error); return }
        if (finished) return
        finish(code === 0 && sawCompletion ? undefined : new Error(`CLI exited (${code ?? 'unknown'}) before a successful turn completed.${stderr ? `\n${stderr}` : ''}`))
      })
      if (signal.aborted) { abort(); return }
      if (input.backend === 'codex-cli') send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'sepilot', version: '1.0.2' } } })
      else if (input.backend === 'claude-cli') child.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content: [
        { type: 'text', text: input.message }, ...(input.images ?? []).map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })),
      ] } })}\n`)
      else child.stdin.end(input.message)
    })
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
