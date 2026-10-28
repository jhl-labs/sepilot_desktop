import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { resolveLocalCommandLaunch } from './local-command'
import { runOpencodeServerTurn } from './opencode-turn'
import {
  validateCliChatInput,
  validateCliImage,
  type CliAsk,
  type CliChatInput,
  type CliChatOutput,
} from '../../lib/chat/cli-chat-contract'

type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const str = (value: unknown): string => typeof value === 'string' ? value : ''
export interface CliConversation { threadId?: string }

const noInteractiveHost: CliAsk = async () => {
  throw new Error('Desktop CLI chat has no interactive host for this request')
}

const TURN_TIMEOUT_MS = 20 * 60_000

export async function runCliChat(input: CliChatInput, state: CliConversation, signal: AbortSignal, emit: (event: CliChatOutput) => void, ask: CliAsk = noInteractiveHost): Promise<void> {
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
    if (input.backend === 'opencode-cli') {
      await runOpencodeServerTurn({ input, state, signal, emit, ask, files, timeoutMs: TURN_TIMEOUT_MS })
      return
    }
    const model = input.model ? ['--model', input.model] : []
    const command = input.backend === 'codex-cli' ? ['codex', 'app-server']
      : ['claude', '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompts', 'host', ...model, ...(state.threadId ? ['--resume', state.threadId] : [])]
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
      const timer = setTimeout(() => finish(new Error('CLI run timed out')), TURN_TIMEOUT_MS)
      signal.addEventListener('abort', abort, { once: true })
      const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`)
      const text = (value: unknown) => { if (typeof value === 'string' && value) emit({ type: 'text', text: value }) }
      const answer = (work: () => Promise<void>) => { void work().catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error)))) }
      const askApproval = async (request: { requestId: string; toolName: string; args: Record<string, unknown>; context?: string }): Promise<boolean> => {
        const reply = await ask({ kind: 'approval', ...request })
        return reply.kind === 'approval' && reply.approved
      }
      const askQuestion = async (requestId: string, prompt: string, choices?: string[]): Promise<string> => {
        const reply = await ask({ kind: 'question', requestId, prompt, choices })
        if (reply.kind !== 'question') throw new Error('Expected a question answer')
        return reply.answer
      }
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
              approvalPolicy: 'on-request',
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
          if (event.id !== undefined && typeof event.method === 'string') {
            const requestId = String(event.id)
            const reply = (result: unknown) => { if (!finished) send({ id: event.id, result }) }
            if (event.method === 'item/commandExecution/requestApproval' || event.method === 'item/fileChange/requestApproval' || event.method === 'item/permissions/requestApproval') {
              const toolName = event.method === 'item/commandExecution/requestApproval' ? 'command'
                : event.method === 'item/fileChange/requestApproval' ? 'file_change' : 'permissions'
              const { threadId: _thread, turnId: _turn, startedAtMs: _started, ...args } = params
              answer(async () => {
                const approved = await askApproval({ requestId, toolName, args, context: str(params.reason) || undefined })
                reply({ decision: approved ? 'accept' : 'decline' })
              })
            } else if (event.method === 'item/tool/requestUserInput') {
              const questions = Array.isArray(params.questions) ? params.questions.map(row) : []
              answer(async () => {
                const answers: Record<string, { answers: string[] }> = {}
                for (const question of questions) {
                  const id = str(question.id)
                  if (!id) continue
                  const options = Array.isArray(question.options) ? question.options.map((option) => str(row(option).label)).filter(Boolean) : []
                  const text = await askQuestion(`${requestId}:${id}`, [str(question.header), str(question.question)].filter(Boolean).join(': '), options.length ? options : undefined)
                  answers[id] = { answers: [text] }
                }
                reply({ answers })
              })
            } else {
              send({ id: event.id, error: { code: -32601, message: 'Desktop CLI chat does not support this interactive request' } })
            }
          }
        } else if (input.backend === 'claude-cli') {
          if (typeof event.session_id === 'string') state.threadId = event.session_id
          if (event.type === 'control_request') {
            const requestId = str(event.request_id)
            const request = row(event.request)
            const respond = (response: unknown) => { if (!finished) send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }) }
            if (request.subtype === 'can_use_tool' && requestId) {
              const toolName = str(request.tool_name)
              const toolInput = row(request.input)
              if (toolName === 'AskUserQuestion') {
                const questions = Array.isArray(toolInput.questions) ? toolInput.questions.map(row) : []
                answer(async () => {
                  const answers: Record<string, string> = {}
                  for (const [index, question] of questions.entries()) {
                    const prompt = str(question.question)
                    const options = Array.isArray(question.options) ? question.options.map((option) => str(row(option).label)).filter(Boolean) : []
                    answers[prompt] = await askQuestion(`${requestId}:${index}`, [str(question.header), prompt].filter(Boolean).join(': '), options.length ? options : undefined)
                  }
                  respond({ behavior: 'allow', updatedInput: { ...toolInput, answers } })
                })
              } else {
                answer(async () => {
                  const approved = await askApproval({ requestId, toolName, args: toolInput, context: str(request.description) || undefined })
                  respond(approved ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: 'The user declined this action in Sepilot Desktop.' })
                })
              }
            } else if (requestId) {
              send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: 'Desktop CLI chat does not support this control request' } })
            }
            return
          }
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
      else send({ type: 'user', message: { role: 'user', content: [
        { type: 'text', text: input.message }, ...(input.images ?? []).map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })),
      ] } })
    })
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}
