export interface ShellCommandContext {
  proposalId: string
  sessionId: string
  tabId: string
  tabTitle: string
  workspaceRoot?: string
  cwd?: string
}

export interface ShellCommandRuntimeContext {
  activeTabId: string | null
  sessionId?: string
  workspaceRoot?: string
  terminalSnapshot?: {
    tabId: string
    cwd?: string
  } | null
}

export type ShellCommandContextFailure =
  | 'proposal-invalidated'
  | 'tab-changed'
  | 'terminal-unavailable'
  | 'conversation-changed'
  | 'workspace-unavailable'
  | 'workspace-changed'
  | 'cwd-unavailable'
  | 'cwd-changed'
  | 'outside-workspace'

export type ShellCommandContextValidation =
  | { ok: true }
  | { ok: false; code: ShellCommandContextFailure; reason: string }

interface CanonicalShellPath {
  display: string
  comparison: string
}

function canonicalShellPath(value: string | undefined): CanonicalShellPath | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.includes('\0')) return null

  const slashPath = trimmed.replace(/\\/g, '/')
  let root: string
  let rest: string
  let caseInsensitive = false

  const drive = /^([a-zA-Z]):\/(.*)$/.exec(slashPath)
  if (drive) {
    root = `${drive[1].toUpperCase()}:/`
    rest = drive[2]
    caseInsensitive = true
  } else if (slashPath.startsWith('//')) {
    const parts = slashPath.slice(2).split('/').filter(Boolean)
    if (parts.length < 2) return null
    root = `//${parts[0]}/${parts[1]}`
    rest = parts.slice(2).join('/')
    caseInsensitive = true
  } else if (slashPath.startsWith('/')) {
    root = '/'
    rest = slashPath.slice(1)
  } else {
    return null
  }

  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  const suffix = segments.join('/')
  const display =
    root === '/' || root.endsWith('/')
      ? `${root}${suffix}` || root
      : suffix
        ? `${root}/${suffix}`
        : root
  return {
    display,
    comparison: caseInsensitive ? display.toLowerCase() : display,
  }
}

export function normalizeShellWorkspacePath(value: string | undefined): string | undefined {
  return canonicalShellPath(value)?.display
}

export function shellWorkspaceLabel(value: string | undefined): string {
  return normalizeShellWorkspacePath(value) ?? 'workspace 미지정'
}

export function isShellPathInsideWorkspace(
  cwd: string | undefined,
  workspaceRoot: string | undefined,
): boolean {
  const current = canonicalShellPath(cwd)
  const root = canonicalShellPath(workspaceRoot)
  if (!current || !root) return false
  if (current.comparison === root.comparison) return true
  if (root.comparison === '/') return current.comparison.startsWith('/')
  const childPrefix = root.comparison.endsWith('/') ? root.comparison : `${root.comparison}/`
  return current.comparison.startsWith(childPrefix)
}

function sameShellPath(left: string | undefined, right: string | undefined): boolean {
  const leftPath = canonicalShellPath(left)
  const rightPath = canonicalShellPath(right)
  return Boolean(leftPath && rightPath && leftPath.comparison === rightPath.comparison)
}

export function validateShellCommandContext(
  proposal: ShellCommandContext,
  current: ShellCommandRuntimeContext,
): ShellCommandContextValidation {
  if (current.activeTabId !== proposal.tabId) {
    return {
      ok: false,
      code: 'tab-changed',
      reason: '제안이 만들어진 터미널 탭이 더 이상 활성 탭이 아닙니다.',
    }
  }
  if (!current.terminalSnapshot || current.terminalSnapshot.tabId !== proposal.tabId) {
    return {
      ok: false,
      code: 'terminal-unavailable',
      reason: '제안 대상 터미널의 최신 상태를 확인할 수 없습니다.',
    }
  }
  if (current.sessionId !== undefined && current.sessionId !== proposal.sessionId) {
    return {
      ok: false,
      code: 'conversation-changed',
      reason: '명령 제안 이후 Shell AI 대화가 바뀌었습니다.',
    }
  }
  if (!canonicalShellPath(proposal.workspaceRoot)) {
    return {
      ok: false,
      code: 'workspace-unavailable',
      reason: '명령 제안에 고정된 절대 workspace 경로가 없습니다.',
    }
  }
  if (!sameShellPath(current.workspaceRoot, proposal.workspaceRoot)) {
    return {
      ok: false,
      code: 'workspace-changed',
      reason: '명령 제안 이후 Shell AI workspace가 바뀌었습니다.',
    }
  }
  if (!canonicalShellPath(proposal.cwd) || !canonicalShellPath(current.terminalSnapshot.cwd)) {
    return {
      ok: false,
      code: 'cwd-unavailable',
      reason: '제안 당시 또는 현재 터미널의 절대 작업 폴더를 확인할 수 없습니다.',
    }
  }
  if (
    !isShellPathInsideWorkspace(proposal.cwd, proposal.workspaceRoot) ||
    !isShellPathInsideWorkspace(current.terminalSnapshot.cwd, proposal.workspaceRoot)
  ) {
    return {
      ok: false,
      code: 'outside-workspace',
      reason: '제안 당시 또는 현재 작업 폴더가 고정된 workspace 밖에 있습니다.',
    }
  }
  if (!sameShellPath(current.terminalSnapshot.cwd, proposal.cwd)) {
    return {
      ok: false,
      code: 'cwd-changed',
      reason: '명령 제안 이후 터미널 작업 폴더가 바뀌었습니다.',
    }
  }
  return { ok: true }
}
