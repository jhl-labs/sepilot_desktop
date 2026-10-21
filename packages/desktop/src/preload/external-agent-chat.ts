import { ipcRenderer } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ChatStreamOptions, DaemonChatRunController, DaemonChatStreamPayload } from '@sepilotd/api-client'
import { CHAT_BACKENDS } from '../../lib/chat/chat-backends'
import { validateCliImage, type CliChatImage, type CliChatOutput } from '../../lib/chat/cli-chat-contract'
import { isCliModelBackend } from '../../lib/chat/cli-models'

interface StreamExternalAgentChatInput {
  message: string
  sessionId?: string
  options?: ChatStreamOptions
  onEvent: (event: DaemonChatStreamPayload) => void
  persistTurn?: (turn: {
    sessionId: string
    userContent: string
    assistantContent?: string
    provider: string
    model: string
    cwd?: string
    title?: string
    tags?: string[]
  }) => Promise<void>
  loadImage: (id: string) => Promise<CliChatImage>
  saveImage: (image: CliChatImage) => Promise<string>
  beginActiveRun: () => DaemonChatRunController
  clearActiveRun: (controller: DaemonChatRunController) => void
}


export function isExternalAgentMode(mode: unknown): boolean {
  return CHAT_BACKENDS.some((entry) => entry.mode !== undefined && entry.mode === mode)
}

export async function streamExternalAgentChat(input: StreamExternalAgentChatInput): Promise<boolean> {
  if (!isExternalAgentMode(input.options?.mode)) return false
  const backend = CHAT_BACKENDS.find((entry) => entry.mode === input.options?.mode)
  if (!backend?.available || !isCliModelBackend(backend.id)) {
    input.onEvent({ type: 'error', error: { code: 'INVALID_REQUEST', message: 'This CLI chat adapter is unavailable.' } })
    return true
  }
  const id = randomUUID()
  const channel = `sepilot:cli/chat:${id}`
  const controller = input.beginActiveRun()
  const cwd = input.options?.workspaceRoot?.trim() || input.options?.cwd?.trim() || undefined
  let content = '', outputError: unknown
  let usage = { inputTokens: 0, outputTokens: 0 }
  let queue = Promise.resolve()
  const append = (text: string) => {
    content += text
    input.onEvent({ type: 'text_delta', text })
  }
  const onData = (_event: unknown, output: CliChatOutput) => {
    controller.markActivity()
    queue = queue.then(async () => {
      if (controller.signal.aborted) return
      if (output.type === 'usage') usage = { inputTokens: output.inputTokens, outputTokens: output.outputTokens }
      else if (output.type === 'text') append(output.text)
      else if (output.type === 'image') {
        const url = await input.saveImage(validateCliImage(output.image))
        append(`\n\n![Generated image](${url})\n\n`)
      } else input.onEvent({ type: 'reasoning_step', label: backend.label, detail: output.text })
    }).catch((error: unknown) => { outputError = error })
  }
  const cancel = () => { void ipcRenderer.invoke('sepilot:cli/cancel', id).catch(() => {}) }
  ipcRenderer.on(channel, onData)
  controller.signal.addEventListener('abort', cancel, { once: true })
  try {
    const images: CliChatImage[] = []
    if ((input.options?.fileIds?.length ?? 0) > 8) throw new Error('Attach at most 8 images per turn')
    for (const fileId of input.options?.fileIds ?? []) {
      if (controller.signal.aborted) throw new Error('CLI run cancelled')
      images.push(validateCliImage(await input.loadImage(fileId)))
    }
    if (controller.signal.aborted) throw new Error('CLI run cancelled')
    if (input.sessionId) input.onEvent({ sessionId: input.sessionId })
    input.onEvent({ type: 'state_change', state: 'thinking' })
    const running = ipcRenderer.invoke('sepilot:cli/chat', id, {
      backend: backend.id, message: input.message, sessionId: input.sessionId,
      cwd, model: input.options?.model, images,
    })
    if (controller.signal.aborted) cancel()
    await running
    await queue
    if (outputError) throw outputError
    if (controller.signal.aborted) throw new Error('CLI run cancelled')
    input.onEvent({ type: 'message', content })
    if (input.sessionId && input.persistTurn) await input.persistTurn({
      sessionId: input.sessionId,
      userContent: input.message + (input.options?.fileIds ?? []).map((fileId) => `\n\n![Attached image](/api/v1/files/${encodeURIComponent(fileId)}/download)`).join(''),
      assistantContent: content, provider: 'external-cli', model: input.options?.model || backend.id,
      cwd, title: input.message.trim().slice(0, 80) || backend.label, tags: ['external-cli', `agent:${backend.id.replace('-cli', '')}`],
    })
    input.onEvent({ type: 'done', usage })
  } catch (error) {
    await queue
    input.onEvent({ type: 'error', error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) } })
  } finally {
    controller.signal.removeEventListener('abort', cancel)
    ipcRenderer.removeListener(channel, onData)
    input.clearActiveRun(controller)
  }
  return true
}
