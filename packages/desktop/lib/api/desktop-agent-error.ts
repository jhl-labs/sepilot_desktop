export type TerminalStreamErrorKind = 'network' | 'missing' | 'other'

export function classifyTerminalStreamError(error: unknown): TerminalStreamErrorKind {
  const message = error instanceof Error ? error.message : String(error)
  if (/(?:^|\D)404(?:\D|$)/u.test(message)) return 'missing'
  if (
    error instanceof TypeError ||
    /failed to fetch|fetch failed|networkerror|econnrefused|econnreset|socket hang up/iu.test(message)
  )
    return 'network'
  return 'other'
}
