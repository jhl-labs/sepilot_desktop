import type { IpcMain } from 'electron'
import { runCliChat, type CliConversation } from './cli-chat'
import {
  validateCliChatInput,
  validateCliChatReply,
  type CliChatInput,
  type CliChatOutput,
  type CliInteractiveAnswer,
  type CliInteractiveRequest,
} from '../../lib/chat/cli-chat-contract'

interface PendingInteractiveRequest {
  kind: CliInteractiveRequest['kind']
  resolve: (answer: CliInteractiveAnswer) => void
  reject: (error: Error) => void
}

export function registerCliChatHandlers(ipc: IpcMain): void {
  const runs = new Map<string, { owner: number; controller: AbortController; pending: Map<string, PendingInteractiveRequest> }>()
  const conversations = new Map<string, CliConversation>()
  const busy = new Set<string>()
  ipc.handle('sepilot:cli/chat', async (event, id: string, input: CliChatInput) => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || runs.has(id)) throw new Error('Invalid CLI run id')
    validateCliChatInput(input)
    const owner = event.sender.id
    const key = JSON.stringify([owner, input.backend, input.sessionId || id, input.cwd])
    if (busy.has(key)) throw new Error('A CLI turn is already running in this conversation')
    const controller = new AbortController()
    const pending = new Map<string, PendingInteractiveRequest>()
    const state = conversations.get(key) ?? {}
    runs.set(id, { owner, controller, pending })
    busy.add(key)
    conversations.set(key, state)
    const destroy = () => { controller.abort(); conversations.delete(key) }
    event.sender.once('destroyed', destroy)
    const emit = (payload: CliChatOutput) => {
      if (!event.sender.isDestroyed()) event.sender.send(`sepilot:cli/chat:${id}`, payload)
    }
    const ask = (request: CliInteractiveRequest): Promise<CliInteractiveAnswer> => new Promise((resolve, reject) => {
      if (controller.signal.aborted) { reject(new Error('CLI run cancelled')); return }
      pending.set(request.requestId, { kind: request.kind, resolve, reject })
      const { kind: _kind, ...payload } = request
      emit(request.kind === 'approval' ? { type: 'approval_request', ...(payload as Omit<Extract<CliInteractiveRequest, { kind: 'approval' }>, 'kind'>) } : { type: 'question_request', ...(payload as Omit<Extract<CliInteractiveRequest, { kind: 'question' }>, 'kind'>) })
    })
    const cancelPending = () => {
      for (const [requestId, entry] of pending) {
        pending.delete(requestId)
        entry.reject(new Error('CLI run cancelled'))
      }
    }
    controller.signal.addEventListener('abort', cancelPending, { once: true })
    try {
      await runCliChat(input, state, controller.signal, emit, ask)
    } finally {
      controller.signal.removeEventListener('abort', cancelPending)
      cancelPending()
      event.sender.removeListener('destroyed', destroy)
      runs.delete(id)
      busy.delete(key)
      if (!input.sessionId) conversations.delete(key)
    }
  })
  ipc.handle('sepilot:cli/cancel', (event, id: string) => {
    const run = runs.get(id)
    if (run?.owner === event.sender.id) run.controller.abort()
  })
  ipc.handle('sepilot:cli/respond', (event, id: string, reply: unknown) => {
    const run = runs.get(id)
    if (!run || run.owner !== event.sender.id) return false
    const parsed = validateCliChatReply(reply)
    const entry = run.pending.get(parsed.requestId)
    if (!entry || entry.kind !== parsed.kind) return false
    run.pending.delete(parsed.requestId)
    entry.resolve(parsed.kind === 'approval' ? { kind: 'approval', approved: parsed.approved } : { kind: 'question', answer: parsed.answer })
    return true
  })
}
