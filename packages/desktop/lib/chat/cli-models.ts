export const CLI_MODEL_BACKENDS = ['codex-cli', 'claude-cli', 'opencode-cli'] as const
export type CliModelBackend = typeof CLI_MODEL_BACKENDS[number]
export interface CliModel { id: string; label: string; description?: string }
export function isCliModelBackend(value: unknown): value is CliModelBackend {
  return CLI_MODEL_BACKENDS.some((id) => id === value)
}
export function validateCliModel(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 256 || /[^a-zA-Z0-9._:/\[\]-]/u.test(value) || value.startsWith('-')) {
    throw new Error('Invalid CLI model identifier')
  }
  return value
}
