import type { ChatMessage } from '@/lib/store/chat-store'

const TOKENS_PER_MESSAGE = 3
const TOKENS_REPLY_PRIMER = 3
const CHARS_PER_TOKEN = 3

const DEFAULT_CONTEXT_LIMIT = 128_000

const MODEL_CONTEXT_LIMITS: ReadonlyArray<readonly [string, number]> = [
  ['gpt-4o-mini', 128_000],
  ['gpt-4o', 128_000],
  ['gpt-4-turbo', 128_000],
  ['gpt-4-32k', 32_768],
  ['gpt-4', 8_192],
  ['gpt-3.5-turbo-16k', 16_385],
  ['gpt-3.5-turbo', 16_385],
  ['gpt-5', 200_000],
  ['claude-3-5-sonnet', 200_000],
  ['claude-3-5-haiku', 200_000],
  ['claude-3-opus', 200_000],
  ['claude-3-sonnet', 200_000],
  ['claude-3-haiku', 200_000],
  ['claude-2.1', 200_000],
  ['claude-2', 100_000],
  ['claude', 200_000],
  ['gemini-1.5-pro', 2_000_000],
  ['gemini-1.5-flash', 1_000_000],
  ['gemini', 1_000_000],
] as const

export function modelContextLimit(model: string | null | undefined): number {
  if (!model) return DEFAULT_CONTEXT_LIMIT
  for (const [prefix, limit] of MODEL_CONTEXT_LIMITS) {
    if (model.startsWith(prefix)) return limit
  }
  return DEFAULT_CONTEXT_LIMIT
}

export function estimateTokenCount(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateMessagesTokens(
  messages: readonly ChatMessage[] | undefined,
): number {
  if (!messages || messages.length === 0) return 0
  let total = 0
  for (const m of messages) {
    total += TOKENS_PER_MESSAGE
    total += estimateTokenCount(m.role)
    total += estimateTokenCount(m.content)
    if (m.toolName) total += estimateTokenCount(m.toolName)
  }
  return total + TOKENS_REPLY_PRIMER
}

export interface ContextUsage {
  used: number
  max: number
  percentage: number
}

export function calculateContextUsage(
  messages: readonly ChatMessage[] | undefined,
  composer: string,
  model: string | null | undefined,
  customMax?: number | null,
): ContextUsage {
  const used = estimateMessagesTokens(messages) + estimateTokenCount(composer)
  const max =
    typeof customMax === 'number' && customMax > 0
      ? customMax
      : modelContextLimit(model)
  return {
    used,
    max,
    percentage: Math.min(100, (used / max) * 100),
  }
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}
