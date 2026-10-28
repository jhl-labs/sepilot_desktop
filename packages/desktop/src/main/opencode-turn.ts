import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { acquireOpencodeServer } from './opencode-server'
import type { CliConversation } from './cli-chat'
import type { CliAsk, CliChatInput, CliChatOutput } from '../../lib/chat/cli-chat-contract'

type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const str = (value: unknown): string => typeof value === 'string' ? value : ''

export interface OpencodeTurnInput {
  input: CliChatInput
  state: CliConversation
  signal: AbortSignal
  emit: (event: CliChatOutput) => void
  ask: CliAsk
  files: string[]
  timeoutMs: number
}

function parseModel(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) return undefined
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

async function request<T = unknown>(url: string, auth: Readonly<Record<string, string>>, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const response = await fetch(url, {
    ...rest,
    headers: { ...auth, ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!response.ok) throw new Error(`opencode ${rest.method ?? 'GET'} ${new URL(url).pathname} failed (${response.status})`)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

async function* readSse(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<Row> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const onAbort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = chunk.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        try { yield row(JSON.parse(data)) } catch {}
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

export async function runOpencodeServerTurn({ input, state, signal, emit, ask, files, timeoutMs }: OpencodeTurnInput): Promise<void> {
  const server = await acquireOpencodeServer(input.cwd)
  const base = server.baseUrl
  const auth = server.headers
  if (signal.aborted) throw new Error('CLI run cancelled')
  if (!state.threadId) {
    const session = await request<Row>(`${base}/session`, auth, { method: 'POST', json: { title: input.message.trim().slice(0, 80) || 'Sepilot Desktop' } })
    const id = str(session.id)
    if (!id) throw new Error('opencode returned no session id')
    state.threadId = id
  }
  const sessionID = state.threadId
  const abortController = new AbortController()
  const onAbort = () => {
    abortController.abort()
    void request(`${base}/session/${encodeURIComponent(sessionID)}/abort`, auth, { method: 'POST' }).catch(() => {})
  }
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => abortController.abort(new Error('CLI run timed out')), timeoutMs)
  const events = await fetch(`${base}/event`, { signal: abortController.signal, headers: { ...auth, accept: 'text/event-stream' } })
  if (!events.ok || !events.body) throw new Error(`opencode event stream failed (${events.status})`)
  let promptSent = false
  let sawActivity = false
  const textParts = new Map<string, { emitted: number }>()
  const emitText = (text: string) => { if (text) emit({ type: 'text', text }) }
  const pendingAnswers: Promise<void>[] = []
  let failure: unknown
  const answer = (work: () => Promise<void>) => {
    pendingAnswers.push(work().catch((error: unknown) => { failure ??= error; abortController.abort() }))
  }
  try {
    for await (const event of readSse(events.body, abortController.signal)) {
      if (signal.aborted) throw new Error('CLI run cancelled')
      const type = str(event.type)
      const props = row(event.properties)
      if (!promptSent && type === 'server.connected') {
        promptSent = true
        const parts: Row[] = [{ type: 'text', text: input.message }]
        for (const [index, file] of files.entries()) {
          parts.push({ type: 'file', mime: input.images?.[index]?.mediaType ?? 'image/png', filename: basename(file), url: pathToFileURL(file).href })
        }
        const model = parseModel(input.model)
        await request(`${base}/session/${encodeURIComponent(sessionID)}/prompt_async`, auth, { method: 'POST', json: { parts, ...(model ? { model } : {}) } })
        continue
      }
      if (str(props.sessionID) !== sessionID) continue
      if (type === 'message.part.updated') {
        sawActivity = true
        const part = row(props.part)
        const partID = str(part.id)
        if (part.type === 'text' && partID) {
          const known = textParts.get(partID) ?? { emitted: 0 }
          const text = str(part.text)
          if (text.length > known.emitted) emitText(text.slice(known.emitted))
          known.emitted = Math.max(known.emitted, text.length)
          textParts.set(partID, known)
        } else if (part.type === 'tool') {
          const status = str(row(part.state).status)
          emit({ type: 'progress', text: [str(part.tool), status].filter(Boolean).join(' ') })
        }
      } else if (type === 'message.part.delta') {
        sawActivity = true
        const known = textParts.get(str(props.partID))
        if (known && props.field === 'text') {
          const delta = str(props.delta)
          known.emitted += delta.length
          emitText(delta)
        }
      } else if (type === 'message.updated') {
        const info = row(props.info)
        const tokens = row(info.tokens)
        if (info.role === 'assistant' && (tokens.input !== undefined || tokens.output !== undefined)) {
          emit({ type: 'usage', inputTokens: Number(tokens.input) || 0, outputTokens: Number(tokens.output) || 0 })
        }
      } else if (type === 'permission.asked') {
        sawActivity = true
        const permissionID = str(props.id)
        const patterns = Array.isArray(props.patterns) ? props.patterns.map(String) : []
        answer(async () => {
          const reply = await ask({ kind: 'approval', requestId: permissionID, toolName: str(props.permission) || 'permission', args: { patterns, ...row(props.metadata) } })
          const approved = reply.kind === 'approval' && reply.approved
          await request(`${base}/session/${encodeURIComponent(sessionID)}/permissions/${encodeURIComponent(permissionID)}`, auth, { method: 'POST', json: { response: approved ? 'once' : 'reject' } })
        })
      } else if (type === 'question.asked') {
        sawActivity = true
        const questionID = str(props.id)
        const questions = Array.isArray(props.questions) ? props.questions.map(row) : []
        answer(async () => {
          const answers: string[][] = []
          try {
            for (const [index, question] of questions.entries()) {
              const options = Array.isArray(question.options) ? question.options.map((option) => str(row(option).label)).filter(Boolean) : []
              const reply = await ask({ kind: 'question', requestId: `${questionID}:${index}`, prompt: [str(question.header), str(question.question)].filter(Boolean).join(': '), choices: options.length ? options : undefined })
              if (reply.kind !== 'question') throw new Error('Expected a question answer')
              answers.push([reply.answer])
            }
          } catch (error) {
            await request(`${base}/question/${encodeURIComponent(questionID)}/reject`, auth, { method: 'POST' }).catch(() => {})
            throw error
          }
          await request(`${base}/question/${encodeURIComponent(questionID)}/reply`, auth, { method: 'POST', json: { answers } })
        })
      } else if (type === 'session.error') {
        const error = row(props.error)
        throw new Error(str(row(error.data).message) || str(error.name) || 'OpenCode turn failed')
      } else if ((type === 'session.idle' || (type === 'session.status' && row(props.status).type === 'idle')) && promptSent && sawActivity) {
        await Promise.all(pendingAnswers)
        if (failure) throw failure
        return
      }
    }
    if (failure) throw failure
    if (signal.aborted) throw new Error('CLI run cancelled')
    throw new Error(abortController.signal.reason instanceof Error ? abortController.signal.reason.message : 'opencode event stream ended before the turn completed')
  } catch (error) {
    if (failure && failure !== error) throw failure
    if (signal.aborted) throw new Error('CLI run cancelled')
    if (abortController.signal.reason instanceof Error && abortController.signal.aborted) throw abortController.signal.reason
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
    abortController.abort()
  }
}
