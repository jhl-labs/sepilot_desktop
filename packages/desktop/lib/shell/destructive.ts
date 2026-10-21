const DESTRUCTIVE_PATTERNS: Array<[RegExp, string]> = [
  [
    /(^|\n)rm\s+(-[^\n]*[rf][^\n]*|-[^\n]*[fr][^\n]*)\s+(\/|\*|~|\$HOME)(\s|$)/i,
    'rm -rf on a broad path',
  ],
  [/(^|\n)git\s+clean\s+-[^\n]*[fdx]/i, 'git clean with force/delete flags'],
  [/(^|\n)docker\s+system\s+prune\s+-[^\n]*f/i, 'docker system prune force'],
  [/(^|\n)kubectl\s+delete\s+(\S+\s+)?(--all|all)\b/i, 'kubectl delete all'],
  [/(^|\n)terraform\s+destroy\b/i, 'terraform destroy'],
  [/(^|\n)(shutdown|reboot|poweroff)\b/i, 'system shutdown command'],
  [/(^|\n)mkfs(\.\S+)?\b/i, 'filesystem format command'],
  [/(^|\n)dd\s+.*\bof=\/dev\//i, 'raw disk write'],
  [/(^|\n)chmod\s+-R\s+777\s+(\/|~|\$HOME)(\s|$)/i, 'recursive chmod on broad path'],
  [/(^|\n)chown\s+-R\s+\S+\s+(\/|~|\$HOME)(\s|$)/i, 'recursive chown on broad path'],
]

export function looksDestructiveCommand(text: string): string | null {
  const normalized = text
    .replace(/\x1b\[200~|\x1b\[201~/g, '')
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  return DESTRUCTIVE_PATTERNS.find(([pattern]) => pattern.test(normalized))?.[1] ?? null
}
