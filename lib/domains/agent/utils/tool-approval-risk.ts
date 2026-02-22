import type { InputTrustLevel } from '../types';

export type ToolApprovalRiskLevel = 'low' | 'medium' | 'high';
export type ToolApprovalRiskReason =
  | 'dangerous_command'
  | 'network_install_command'
  | 'sensitive_file_change'
  | 'bulk_file_change'
  | 'large_file_write'
  | 'outside_workdir_command'
  | 'http_request_command';

export interface ToolCallLike {
  id?: string;
  name?: string;
  arguments?: unknown;
}

export interface ToolApprovalRiskItem<T extends ToolCallLike = ToolCallLike> {
  call: T;
  reason: ToolApprovalRiskReason;
  summary: string;
  severity: ToolApprovalRiskLevel;
  command?: string;
  filePath?: string;
}

export interface ToolApprovalRiskAnalysis<T extends ToolCallLike = ToolCallLike> {
  dangerous: ToolApprovalRiskItem<T>[];
  mandatoryApproval: ToolApprovalRiskItem<T>[];
  requiresExplicitApproval: ToolApprovalRiskItem<T>[];
  riskLevel: ToolApprovalRiskLevel;
}

export interface ToolApprovalDecision<T extends ToolCallLike = ToolCallLike> {
  status: 'approved' | 'feedback' | 'denied';
  note: string;
  risk: ToolApprovalRiskAnalysis<T>;
  riskyToolCalls: T[];
  alwaysApproveTools: boolean;
  oneTimeApprove: boolean;
}

export const UNTRUSTED_APPROVAL_MARKER = '[UNTRUSTED_INPUT]';
export const SECURITY_GUARDRAIL_MARKER = '[SECURITY_GUARDRAIL]';

export const HTTP_REQUEST_PATTERNS = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bhttpie\b/i,
  /\bhttp\s+(GET|POST|PUT|DELETE|PATCH|HEAD)\b/i,
  /\bfetch\b.*https?:\/\//i,
  /\bInvoke-WebRequest\b/i,
  /\bInvoke-RestMethod\b/i,
];

export const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+-rf/i,
  /del\s+\/s/i,
  /rd\s+\/s/i,
  /format\s+/i,
  /mkfs/i,
  /shutdown/i,
  /poweroff/i,
  /dd\s+if=/i,
];

export const NETWORK_INSTALL_COMMAND_PATTERNS = [
  /\bnpm\s+(install|i)\b/i,
  /\byarn\s+add\b/i,
  /\bpnpm\s+(add|install)\b/i,
  /\bpip\s+install\b/i,
  /\bapt(-get)?\s+install\b/i,
  /\bbrew\s+install\b/i,
  /\bcurl\b.*https?:\/\//i,
  /\bwget\b.*https?:\/\//i,
];

export const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..*)?$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)(id_rsa|id_ed25519|known_hosts)$/i,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
];

export const FILE_MUTATION_TOOL_NAMES = new Set(['file_write', 'file_edit']);
const BULK_FILE_CHANGE_THRESHOLD = 5;
const LARGE_FILE_WRITE_THRESHOLD = 50000;

function normalizeFilePath(input: string): string {
  return input.trim().replace(/\\/g, '/');
}

export function getToolPathFromArguments(args: unknown): string | null {
  if (!args || typeof args !== 'object') {
    return null;
  }

  const record = args as Record<string, unknown>;
  const pathArg = record.path;
  const filePathArg = record.file_path;

  if (typeof pathArg === 'string' && pathArg.trim().length > 0) {
    return normalizeFilePath(pathArg);
  }
  if (typeof filePathArg === 'string' && filePathArg.trim().length > 0) {
    return normalizeFilePath(filePathArg);
  }

  return null;
}

export function getCommandFromToolCall(call: ToolCallLike | null | undefined): string | null {
  if (call?.name !== 'command_execute') {
    return null;
  }
  if (!call.arguments || typeof call.arguments !== 'object') {
    return null;
  }

  const command = (call.arguments as Record<string, unknown>).command;
  if (typeof command !== 'string' || command.trim().length === 0) {
    return null;
  }

  return command;
}

function getFileWriteContentLength(call: ToolCallLike): number {
  if (!call.arguments || typeof call.arguments !== 'object') {
    return 0;
  }
  const content = (call.arguments as Record<string, unknown>).content;
  return typeof content === 'string' ? content.length : 0;
}

function getFileMutationCalls<T extends ToolCallLike>(toolCalls: T[]): T[] {
  return toolCalls.filter((call) => FILE_MUTATION_TOOL_NAMES.has(call.name || ''));
}

function isSensitiveFilePath(filePath: string): boolean {
  const normalized = normalizeFilePath(filePath);
  const basename = normalized.split('/').pop() || normalized;
  return SENSITIVE_FILE_PATTERNS.some(
    (pattern) => pattern.test(normalized) || pattern.test(basename)
  );
}

function isOutsideWorkingDirectory(command: string, workingDirectory?: string): boolean {
  if (!workingDirectory) {
    return false;
  }
  const normalizedWd = workingDirectory.replace(/\/$/, '');

  const absolutePathRegex = /(?:^|\s)(\/[^\s;|&>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = absolutePathRegex.exec(command)) !== null) {
    const targetPath = match[1];
    if (!targetPath.startsWith(`${normalizedWd}/`) && targetPath !== normalizedWd) {
      return true;
    }
  }

  const cdRegex = /\bcd\s+([^\s;|&]+)/g;
  while ((match = cdRegex.exec(command)) !== null) {
    const target = match[1];
    if (
      target.startsWith('/') &&
      !target.startsWith(`${normalizedWd}/`) &&
      target !== normalizedWd
    ) {
      return true;
    }
    if (target === '~' || target.startsWith('~/') || target === '/' || target === '..') {
      return true;
    }
  }

  return false;
}

function dedupeRiskItems<T extends ToolCallLike>(
  items: ToolApprovalRiskItem<T>[]
): ToolApprovalRiskItem<T>[] {
  const byCallId = new Map<string, ToolApprovalRiskItem<T>>();
  const noIdItems: ToolApprovalRiskItem<T>[] = [];

  for (const item of items) {
    const key = item.call?.id;
    if (!key) {
      noIdItems.push(item);
      continue;
    }

    const existing = byCallId.get(key);
    if (!existing) {
      byCallId.set(key, item);
      continue;
    }

    const existingWeight =
      existing.severity === 'high' ? 2 : existing.severity === 'medium' ? 1 : 0;
    const currentWeight = item.severity === 'high' ? 2 : item.severity === 'medium' ? 1 : 0;
    if (currentWeight > existingWeight) {
      byCallId.set(key, item);
    }
  }

  return [...byCallId.values(), ...noIdItems];
}

function dedupeToolCalls<T extends ToolCallLike>(toolCalls: T[]): T[] {
  const withId = new Map<string, T>();
  const withoutId: T[] = [];

  for (const call of toolCalls) {
    const id = call?.id;
    if (!id) {
      withoutId.push(call);
      continue;
    }
    if (!withId.has(id)) {
      withId.set(id, call);
    }
  }

  return [...withId.values(), ...withoutId];
}

export function analyzeToolApprovalRisk<T extends ToolCallLike>(
  toolCalls: T[] | null | undefined,
  context?: { workingDirectory?: string }
): ToolApprovalRiskAnalysis<T> {
  const dangerous: ToolApprovalRiskItem<T>[] = [];
  const mandatoryApproval: ToolApprovalRiskItem<T>[] = [];
  const requiresExplicitApproval: ToolApprovalRiskItem<T>[] = [];
  const calls = (toolCalls || []) as T[];
  const fileMutationCalls = getFileMutationCalls(calls);
  const isBulkFileChange = fileMutationCalls.length >= BULK_FILE_CHANGE_THRESHOLD;

  for (const call of calls) {
    const command = getCommandFromToolCall(call);
    if (!command) {
      const isFileMutation = FILE_MUTATION_TOOL_NAMES.has(call.name || '');
      if (!isFileMutation) {
        continue;
      }

      const filePath = getToolPathFromArguments(call.arguments);
      if (filePath && isSensitiveFilePath(filePath)) {
        requiresExplicitApproval.push({
          call,
          reason: 'sensitive_file_change',
          summary: `${call.name}: ${filePath}`,
          severity: 'high',
          filePath,
        });
        continue;
      }

      if (isBulkFileChange) {
        requiresExplicitApproval.push({
          call,
          reason: 'bulk_file_change',
          summary: `${call.name}: 대량 파일 변경 배치 (${fileMutationCalls.length}건)`,
          severity: 'medium',
          filePath: filePath || undefined,
        });
        continue;
      }

      if (
        call.name === 'file_write' &&
        getFileWriteContentLength(call) >= LARGE_FILE_WRITE_THRESHOLD
      ) {
        requiresExplicitApproval.push({
          call,
          reason: 'large_file_write',
          summary: `file_write: 대용량 파일 쓰기 (${Math.round(getFileWriteContentLength(call) / 1024)}KB)`,
          severity: 'medium',
          filePath: filePath || undefined,
        });
      }
      continue;
    }

    if (DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
      dangerous.push({
        call,
        reason: 'dangerous_command',
        summary: command,
        severity: 'high',
        command,
      });
      continue;
    }

    // Working directory 이탈 감지
    if (isOutsideWorkingDirectory(command, context?.workingDirectory)) {
      mandatoryApproval.push({
        call,
        reason: 'outside_workdir_command',
        summary: command,
        severity: 'high',
        command,
      });
    }

    // HTTP 요청 감지
    if (HTTP_REQUEST_PATTERNS.some((pattern) => pattern.test(command))) {
      mandatoryApproval.push({
        call,
        reason: 'http_request_command',
        summary: command,
        severity: 'high',
        command,
      });
    }

    // 네트워크/패키지 설치 (mandatoryApproval에 잡히지 않은 경우만)
    const alreadyMandatory = mandatoryApproval.some((item) => item.call === call);
    if (
      !alreadyMandatory &&
      NETWORK_INSTALL_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
    ) {
      requiresExplicitApproval.push({
        call,
        reason: 'network_install_command',
        summary: command,
        severity: 'medium',
        command,
      });
    }
  }

  const dedupedDangerous = dedupeRiskItems(dangerous);
  const dedupedMandatory = dedupeRiskItems(mandatoryApproval);
  const dedupedRequiresApproval = dedupeRiskItems(requiresExplicitApproval);
  const hasHighRiskApprovalItem = dedupedRequiresApproval.some((item) => item.severity === 'high');

  return {
    dangerous: dedupedDangerous,
    mandatoryApproval: dedupedMandatory,
    requiresExplicitApproval: dedupedRequiresApproval,
    riskLevel:
      dedupedDangerous.length > 0 || dedupedMandatory.length > 0 || hasHighRiskApprovalItem
        ? 'high'
        : dedupedRequiresApproval.length > 0
          ? 'medium'
          : 'low',
  };
}

export function buildToolApprovalNote<T extends ToolCallLike>(
  toolCalls: T[] | null | undefined,
  context?: { workingDirectory?: string }
): string {
  const risk = analyzeToolApprovalRisk(toolCalls, context);
  const dangerousSummaries = risk.dangerous.map((item) => item.summary);
  const approvalSummaries = risk.requiresExplicitApproval.map((item) => item.summary);
  const hasSensitiveFileChange = risk.requiresExplicitApproval.some(
    (item) => item.reason === 'sensitive_file_change'
  );
  const hasNetworkInstall = risk.requiresExplicitApproval.some(
    (item) => item.reason === 'network_install_command'
  );

  if (dangerousSummaries.length > 0) {
    const preview = dangerousSummaries
      .slice(0, 2)
      .map((summary) => `- ${summary}`)
      .join('\n');
    return `위험 명령이 포함되어 있습니다. 실행 전 검토가 필요합니다.\n${preview}`;
  }

  if (risk.mandatoryApproval.length > 0) {
    const hasOutsideWorkdir = risk.mandatoryApproval.some(
      (item) => item.reason === 'outside_workdir_command'
    );
    const hasHttpRequest = risk.mandatoryApproval.some(
      (item) => item.reason === 'http_request_command'
    );
    const preview = risk.mandatoryApproval
      .slice(0, 2)
      .map((item) => `- ${item.summary}`)
      .join('\n');

    let msg = `${SECURITY_GUARDRAIL_MARKER}\n`;
    if (hasOutsideWorkdir && hasHttpRequest) {
      msg += '작업 디렉토리 외부 접근 및 HTTP 요청이 감지되었습니다.';
    } else if (hasOutsideWorkdir) {
      msg += '작업 디렉토리 외부에 대한 명령이 감지되었습니다.';
    } else {
      msg += '외부 HTTP 요청이 감지되었습니다.';
    }
    msg += ` 반드시 사용자 검토가 필요합니다.\n${preview}`;
    return msg;
  }

  if (approvalSummaries.length > 0) {
    const preview = approvalSummaries
      .slice(0, 2)
      .map((summary) => `- ${summary}`)
      .join('\n');
    if (hasSensitiveFileChange) {
      return `민감한 파일 변경이 포함되어 있습니다. 승인 후 실행됩니다.\n${preview}`;
    }
    if (hasNetworkInstall) {
      return `네트워크/패키지 설치 명령이 포함되어 있습니다. 승인 후 실행됩니다.\n${preview}`;
    }
    return `리스크가 있는 도구 실행이 포함되어 있습니다. 승인 후 실행됩니다.\n${preview}`;
  }

  return '도구 실행 전 사용자 승인이 필요합니다.';
}

export function resolveToolApprovalDecision<T extends ToolCallLike>(
  toolCalls: T[] | null | undefined,
  options?: {
    alwaysApproveTools?: boolean;
    userText?: string;
    inputTrustLevel?: InputTrustLevel;
    workingDirectory?: string;
  }
): ToolApprovalDecision<T> {
  const calls = (toolCalls || []) as T[];
  const userText = options?.userText || '';
  const inputTrustLevel = options?.inputTrustLevel || 'trusted';
  const isUntrustedInput = inputTrustLevel === 'untrusted';
  const wantsAlwaysApprove = !isUntrustedInput && /항상\s*승인/.test(userText);
  const oneTimeApprove = !isUntrustedInput && /(^|\s)(승인|허용)(\s|$)/.test(userText);
  const alwaysApproveTools =
    !isUntrustedInput && Boolean(options?.alwaysApproveTools || wantsAlwaysApprove);
  const riskContext = { workingDirectory: options?.workingDirectory };
  const risk = analyzeToolApprovalRisk(calls, riskContext);
  const riskyToolCalls = dedupeToolCalls([
    ...risk.mandatoryApproval.map((item) => item.call as T),
    ...risk.requiresExplicitApproval.map((item) => item.call as T),
  ]);
  const baseNote = buildToolApprovalNote(calls, riskContext);
  const note =
    isUntrustedInput &&
    (risk.requiresExplicitApproval.length > 0 || risk.mandatoryApproval.length > 0)
      ? `${UNTRUSTED_APPROVAL_MARKER}\n비신뢰 입력 모드: 자동 승인 없이 사용자 확인이 필요합니다.\n${baseNote}`
      : baseNote;

  if (risk.dangerous.length > 0) {
    return {
      status: 'denied',
      note,
      risk,
      riskyToolCalls,
      alwaysApproveTools,
      oneTimeApprove,
    };
  }

  // mandatoryApproval: auto-approve/oneTimeApprove 관계없이 반드시 feedback
  if (risk.mandatoryApproval.length > 0) {
    return {
      status: 'feedback',
      note,
      risk,
      riskyToolCalls,
      alwaysApproveTools,
      oneTimeApprove: false,
    };
  }

  if (risk.requiresExplicitApproval.length > 0 && !alwaysApproveTools && !oneTimeApprove) {
    return {
      status: 'feedback',
      note,
      risk,
      riskyToolCalls,
      alwaysApproveTools,
      oneTimeApprove,
    };
  }

  return {
    status: 'approved',
    note,
    risk,
    riskyToolCalls,
    alwaysApproveTools,
    oneTimeApprove,
  };
}
