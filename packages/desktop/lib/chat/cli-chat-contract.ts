import { isCliModelBackend, validateCliModel, type CliModelBackend } from './cli-models'
export const CLI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const MAX_CLI_IMAGE_BYTES = 10 * 1024 * 1024
export interface CliChatImage { mediaType: string; data: string }
export interface CliChatInput { backend: CliModelBackend; message: string; sessionId?: string; cwd?: string; model?: string; images?: CliChatImage[] }
export type CliChatOutput =
  | { type: 'text'; text: string }
  | { type: 'image'; image: CliChatImage }
  | { type: 'progress'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'approval_request'; requestId: string; toolName: string; args: Record<string, unknown>; context?: string }
  | { type: 'question_request'; requestId: string; prompt: string; choices?: string[] }
export type CliChatReply =
  | { requestId: string; kind: 'approval'; approved: boolean }
  | { requestId: string; kind: 'question'; answer: string }
export type CliInteractiveRequest =
  | { kind: 'approval'; requestId: string; toolName: string; args: Record<string, unknown>; context?: string }
  | { kind: 'question'; requestId: string; prompt: string; choices?: string[] }
export type CliInteractiveAnswer = { kind: 'approval'; approved: boolean } | { kind: 'question'; answer: string }
export type CliAsk = (request: CliInteractiveRequest) => Promise<CliInteractiveAnswer>
export function validateCliChatReply(value: unknown): CliChatReply {
  const reply = value as CliChatReply | undefined
  if (!reply || typeof reply.requestId !== 'string' || !reply.requestId || reply.requestId.length > 256) throw new Error('Invalid CLI reply')
  if (reply.kind === 'approval' && typeof reply.approved === 'boolean') return { requestId: reply.requestId, kind: 'approval', approved: reply.approved }
  if (reply.kind === 'question' && typeof reply.answer === 'string' && reply.answer.length <= 100_000) return { requestId: reply.requestId, kind: 'question', answer: reply.answer }
  throw new Error('Invalid CLI reply')
}
export function validateCliImage(value: unknown): CliChatImage {
  const image = value as CliChatImage | undefined
  if (!image || !CLI_IMAGE_TYPES.some((type) => type === image.mediaType) || typeof image.data !== 'string' || !image.data.length || image.data.length > Math.ceil(MAX_CLI_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new Error('CLI attachments must be PNG, JPEG, WebP or GIF images up to 10 MiB.')
  return image
}
export function validateCliChatInput(input: CliChatInput): CliChatInput {
  if (!input || !isCliModelBackend(input.backend) || typeof input.message !== 'string' || input.message.length > 1_000_000 || (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || input.sessionId.length > 256))) throw new Error('Invalid CLI chat request')
  validateCliModel(input.model)
  if (input.images !== undefined && (!Array.isArray(input.images) || input.images.length > 8)) throw new Error('Attach at most 8 images per turn')
  input.images?.forEach(validateCliImage)
  return input
}
