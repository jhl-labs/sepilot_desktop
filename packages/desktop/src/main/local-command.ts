import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { platform } from 'node:process'

export interface LocalCommandLaunch {
  file: string
  args: string[]
  command: string
}

const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com'] as const
const WINDOWS_COMMAND_SCRIPT_EXTENSIONS = new Set(['.cmd', '.bat'])

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\')
}

function hasExecutableExtension(value: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(value)
}

function windowsExtension(value: string): string {
  return extname(value).toLowerCase()
}

function formatCommand(command: readonly string[]): string {
  return command
    .map((part) => (/[\s"]/u.test(part) ? JSON.stringify(part) : part))
    .join(' ')
}

export function selectWindowsExecutableCandidate(
  candidates: readonly string[],
  fallback: string,
): string {
  const normalized = candidates.map((line) => line.trim()).filter(Boolean)
  for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
    const match = normalized.find((candidate) => windowsExtension(candidate) === extension)
    if (match) return match
  }
  return normalized[0] || fallback
}

function resolveWindowsExecutable(file: string): string {
  if (platform !== 'win32' || hasExecutableExtension(file)) {
    return file
  }

  if (hasPathSeparator(file)) {
    const sibling = WINDOWS_EXECUTABLE_EXTENSIONS
      .map((extension) => `${file}${extension}`)
      .find((candidate) => existsSync(candidate))
    return sibling || file
  }

  try {
    const output = execFileSync('where.exe', [file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return selectWindowsExecutableCandidate(output.split(/\r?\n/), file)
  } catch {
    return file
  }
}

function shouldRunViaWindowsCommandShell(file: string): boolean {
  if (platform !== 'win32') return false
  const extension = windowsExtension(file)
  return !extension || WINDOWS_COMMAND_SCRIPT_EXTENSIONS.has(extension)
}

function windowsCommandShell(): string {
  return process.env.COMSPEC || process.env.ComSpec || 'cmd.exe'
}

export function resolveLocalCommandLaunch(command: readonly string[]): LocalCommandLaunch {
  const executable = command[0]
  if (!executable) {
    return { file: '', args: [], command: '' }
  }

  const args = command.slice(1)
  const file = resolveWindowsExecutable(executable)
  if (shouldRunViaWindowsCommandShell(file)) {
    const shell = windowsCommandShell()
    const shellArgs = ['/d', '/c', 'call', file, ...args]
    return {
      file: shell,
      args: shellArgs,
      command: formatCommand([shell, ...shellArgs]),
    }
  }

  return {
    file,
    args,
    command: formatCommand([file, ...args]),
  }
}
