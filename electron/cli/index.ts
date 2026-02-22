/**
 * CLI 진입점
 * VSCode 스타일 명령줄 인터페이스
 */

import { Command, Option } from 'commander';
import { app } from 'electron';
import { setJsonMode, setColorMode } from './utils/output';
import { handleError, ExitCode } from './utils/cli-error';
import packageJson from '../../package.json';
import type { ThinkingMode, InputTrustLevel } from '../../lib/domains/agent/types';
import { detectCLIModeFromArgv } from './mode';

const SUPPORTED_MODES: ThinkingMode[] = [
  'instant',
  'sequential',
  'tree-of-thought',
  'deep',
  'deep-web-research',
  'coding',
  'cowork',
  'browser-agent',
  'editor-agent',
  'terminal-agent',
];

const SUPPORTED_TRUST_LEVELS: InputTrustLevel[] = ['trusted', 'untrusted'];

/**
 * CLI 모드 감지
 * @param argv - process.argv
 * @returns CLI 모드 여부
 */
export function isCLIMode(argv: string[]): boolean {
  return detectCLIModeFromArgv(argv);
}

/**
 * CLI 실행
 * @param argv - process.argv
 * @returns Exit code
 */
export async function runCLI(argv: string[]): Promise<ExitCode> {
  try {
    // Electron app.whenReady() 필요 (app.getPath() 사용)
    await app.whenReady();

    const program = new Command();

    program
      .name('sepilot')
      .description('SEPilot Desktop CLI')
      .version(packageJson.version)
      .option('--json', 'JSON 형식 출력')
      .option('--verbose', '상세 출력')
      .option('--no-color', '색상 비활성화')
      .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts.json) {
          setJsonMode(true);
        }
        if (opts.noColor) {
          setColorMode(false);
        }
        if (opts.verbose) {
          process.env.VERBOSE = 'true';
        }
      });

    // ext 명령어 (Extension 관리)
    const extCommand = program.command('ext').description('Extension 관리');

    extCommand
      .command('diagnostics')
      .description('Extension 진단 정보 출력 (통합)')
      .option('--detailed', 'IPC, Store, Agent 등 상세 정보 포함')
      .action(async (options: { detailed?: boolean }) => {
        const { runDiagnostics } = await import('./commands/diagnostics');
        await runDiagnostics(options.detailed ?? false);
      });

    extCommand
      .command('diagnose [id]')
      .description('Extension 개별 진단 (id 없으면 전체)')
      .option('--all', '모든 Extension 개별 진단')
      .option('--renderer', 'Renderer 환경 진단 (GUI 필요)')
      .action(async (extId?: string, options?: { all?: boolean; renderer?: boolean }) => {
        const { runDiagnose } = await import('./commands/extension');
        await runDiagnose(extId, options);
      });

    extCommand
      .command('list')
      .description('설치된 Extension 목록')
      .action(async () => {
        const { runList } = await import('./commands/extension');
        await runList();
      });

    extCommand
      .command('install <path>')
      .description('.sepx 파일 설치')
      .action(async (sepxPath: string) => {
        const { runInstall } = await import('./commands/extension');
        await runInstall(sepxPath);
      });

    extCommand
      .command('uninstall <id>')
      .description('Extension 제거')
      .action(async (extId: string) => {
        const { runUninstall } = await import('./commands/extension');
        await runUninstall(extId);
      });

    // config 명령어
    const configCommand = program.command('config').description('설정 관리');

    configCommand
      .command('get <key>')
      .description('설정 값 조회')
      .action(async (key: string) => {
        const { runGetConfig } = await import('./commands/config');
        await runGetConfig(key);
      });

    configCommand
      .command('path')
      .description('설정 파일 경로 출력')
      .action(async () => {
        const { runConfigPath } = await import('./commands/config');
        await runConfigPath();
      });

    // logs 명령어
    const logsCommand = program.command('logs').description('로그 관리');

    logsCommand
      .command('show')
      .description('로그 출력')
      .option('--lines <n>', '출력할 라인 수', '100')
      .action(async (options: { lines: string }) => {
        const { runShowLogs } = await import('./commands/logs');
        await runShowLogs(parseInt(options.lines, 10));
      });

    logsCommand
      .command('path')
      .description('로그 디렉토리 경로 출력')
      .action(async () => {
        const { runLogsPath } = await import('./commands/logs');
        await runLogsPath();
      });

    // info 명령어
    program
      .command('info')
      .description('시스템 정보 출력')
      .action(async () => {
        const { runInfo } = await import('./commands/info');
        await runInfo();
      });

    // build 명령어
    const buildCommand = program.command('build').description('빌드 관리');

    buildCommand
      .command('check')
      .description('TypeScript 빌드 체크')
      .action(async () => {
        const { runBuildCheck } = await import('./commands/build');
        await runBuildCheck();
      });

    // agent 명령어 (Headless/TUI 지원)
    program
      .command('agent')
      .description('Headless Agent 실행 (CI 단일 실행 또는 TUI 인터랙티브)')
      .option('-p, --prompt <text>', '단일 프롬프트 실행 (CI/E2E 권장)')
      .addOption(
        new Option('-m, --mode <mode>', 'thinking mode').choices(SUPPORTED_MODES).default('coding')
      )
      .option('--rag', 'RAG 활성화', false)
      .option('--no-tools', 'Tool 사용 비활성화 (기본값: 활성화)')
      .addOption(
        new Option('--trust <level>', '입력 신뢰도')
          .choices(SUPPORTED_TRUST_LEVELS)
          .default('untrusted')
      )
      .option('--cwd <path>', '에이전트 작업 디렉토리 (기본: 현재 디렉토리)')
      .action(
        async (options: {
          prompt?: string;
          mode?: string;
          rag?: boolean;
          tools?: boolean;
          trust?: 'trusted' | 'untrusted';
          cwd?: string;
        }) => {
          const { runAgent } = await import('./commands/agent');
          await runAgent({
            prompt: options.prompt,
            mode: options.mode as ThinkingMode,
            rag: options.rag,
            tools: options.tools,
            trust: options.trust,
            cwd: options.cwd,
          });
        }
      );

    // 파싱 및 실행
    await program.parseAsync(argv);

    return ExitCode.SUCCESS;
  } catch (error) {
    return handleError(error);
  } finally {
    // CLI 모드에서는 앱 종료
    app.quit();
  }
}
