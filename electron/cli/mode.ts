/**
 * CLI mode detection utilities
 */

const VALID_CLI_COMMANDS = new Set([
  'ext',
  'config',
  'logs',
  'info',
  'build',
  'agent',
  'version',
  'help',
]);

/**
 * argv를 기준으로 CLI 모드 여부를 판별
 */
export function detectCLIModeFromArgv(argv: string[]): boolean {
  // OAuth 프로토콜로 실행된 경우는 GUI 모드
  if (argv[1]?.startsWith('sepilot://')) {
    return false;
  }

  const args = argv.slice(2);
  if (args.length === 0) {
    return false;
  }

  // 도움말/버전 플래그는 위치와 상관없이 CLI로 간주
  const hasHelpOrVersion =
    args.includes('--version') ||
    args.includes('-v') ||
    args.includes('--help') ||
    args.includes('-h');

  if (hasHelpOrVersion) {
    return true;
  }

  // 글로벌 옵션(--json/--verbose/--no-color 등) 이후의 첫 명령어 탐색
  const firstCommand = args.find((arg) => !arg.startsWith('-'));
  return firstCommand ? VALID_CLI_COMMANDS.has(firstCommand) : false;
}
