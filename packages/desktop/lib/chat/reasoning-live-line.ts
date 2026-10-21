import type { ReasoningEntry } from '@/lib/store/chat-store'

const LIVE_LINE_MAX_CHARS = 96

export function summarizeLatestReasoningStep(steps: ReasoningEntry[]): string | null {
  const latest = steps[steps.length - 1]
  if (!latest || latest.kind !== 'step') return null
  return truncateLine(latest.label)
}

function truncateLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > LIVE_LINE_MAX_CHARS ? `${flat.slice(0, LIVE_LINE_MAX_CHARS - 1)}…` : flat
}
