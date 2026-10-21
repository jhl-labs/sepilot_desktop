import type { IpcMain } from 'electron'
import { runCliChat, type CliConversation } from './cli-chat'
import { validateCliChatInput, type CliChatInput } from '../../lib/chat/cli-chat-contract'

export function registerCliChatHandlers(ipc: IpcMain): void {
  const runs = new Map<string, { owner: number; controller: AbortController }>()
  const conversations = new Map<string, CliConversation>()
  const busy = new Set<string>()
  ipc.handle('sepilot:cli/chat', async (event, id: string, input: CliChatInput) => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || runs.has(id)) throw new Error('Invalid CLI run id')
    validateCliChatInput(input)
    const owner = event.sender.id
    const key = JSON.stringify([owner, input.backend, input.sessionId || id, input.cwd])
    if (busy.has(key)) throw new Error('A CLI turn is already running in this conversation')
    const controller = new AbortController()
    const state = conversations.get(key) ?? {}
    runs.set(id, { owner, controller })
    busy.add(key)
    conversations.set(key, state)
    const destroy = () => { controller.abort(); conversations.delete(key) }
    event.sender.once('destroyed', destroy)
    try {
      await runCliChat(input, state, controller.signal, (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send(`sepilot:cli/chat:${id}`, payload)
      })
    } finally {
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
}
