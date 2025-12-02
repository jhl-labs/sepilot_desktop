/**
 * Terminal Tools for Editor Agent
 *
 * Agent가 터미널 명령을 실행할 수 있는 Tool들
 * Main Process에서 child_process를 통해 실행
 */

import type { EditorTool } from './editor-tools-registry';

/**
 * Tool: 터미널 명령 실행
 */
const runCommandTool: EditorTool = {
  name: 'run_command',
  category: 'terminal',
  description: '터미널에서 명령을 실행하고 결과를 반환합니다',
  icon: '💻',
  dangerous: true, // 임의 명령 실행은 위험할 수 있음
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '실행할 명령어',
      },
      cwd: {
        type: 'string',
        description: '작업 디렉토리 (선택사항, 기본값: working directory)',
      },
      timeout: {
        type: 'number',
        description: '타임아웃 (밀리초, 기본값: 30000)',
      },
    },
    required: ['command'],
  },
  execute: async (args, state) => {
    const {
      command,
      cwd,
      timeout = 30000,
    } = args as {
      command: string;
      cwd?: string;
      timeout?: number;
    };

    // Main Process 환경 확인
    if (typeof window !== 'undefined') {
      throw new Error('run_command can only be executed in Main Process');
    }

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const path = await import('path');
      const execAsync = promisify(exec);

      // Working directory 결정 (우선순위: 명시적 cwd > state.workingDirectory > editorContext.filePath의 dirname > process.cwd())
      const workingDir =
        cwd ||
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());

      console.log('[run_command] Executing:', command, 'in', workingDir);

      // 명령 실행
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      return {
        success: true,
        command,
        cwd: workingDir,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      // execAsync는 exit code가 0이 아니면 에러를 던짐
      return {
        success: false,
        command,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1,
        error: error.message,
      };
    }
  },
};

/**
 * 모든 터미널 Tools 내보내기
 */
export const terminalTools: EditorTool[] = [runCommandTool];

/**
 * Registry에 터미널 Tools 등록
 */
export function registerTerminalTools(registry: any): void {
  terminalTools.forEach((tool) => registry.register(tool));
  console.log(`[TerminalTools] Registered ${terminalTools.length} terminal tools`);
}
