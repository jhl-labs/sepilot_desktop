/**
 * Terminal Tool: run_command
 *
 * PTY Manager를 통해 shell 명령어를 실행하고 결과를 반환합니다.
 */

import { logger } from '@/lib/utils/logger';
import type { ToolExecutionResult } from '../types';

/**
 * run_command Tool 정의
 */
export const runCommandTool = {
  name: 'run_command',
  description: 'Execute a shell command in the terminal and return the output',
  inputSchema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (optional, defaults to current working directory)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        default: 30000,
      },
    },
    required: ['command'],
  },
};

/**
 * run_command Tool 실행 함수
 *
 * Main Process에서만 실행 가능합니다.
 */
export async function executeRunCommand(args: {
  command: string;
  cwd?: string;
  timeout?: number;
}): Promise<ToolExecutionResult> {
  const { command, cwd, timeout = 30000 } = args;

  logger.info('[run_command] Executing command:', command, 'in', cwd || 'current directory');

  // Main Process 환경 확인
  if (typeof window !== 'undefined') {
    return {
      success: false,
      error: 'run_command can only be executed in Main Process',
    };
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const path = await import('path');
    const execAsync = promisify(exec);

    // Working directory 결정
    const workingDir = cwd || process.cwd();

    const startTime = Date.now();

    // 명령어 실행
    let finalCommand = command;
    let shellOption: string | undefined = undefined;

    if (process.platform === 'win32') {
      // Windows: Use PowerShell with full path to avoid ENOENT errors
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const powershellPath = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

      // Escape command for PowerShell
      const escapedCommand = command.replace(/"/g, '`"').replace(/\$/g, '`$');
      finalCommand = `"${powershellPath}" -NoProfile -NonInteractive -Command "${escapedCommand}"`;

      // Use cmd.exe as the shell to execute the full command
      shellOption = `${systemRoot}\\System32\\cmd.exe`;
    }

    const { stdout, stderr } = await execAsync(finalCommand, {
      cwd: workingDir,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB
      shell: shellOption,
      env: {
        ...process.env,
        // Terminal-specific env vars can be added here
      },
    });

    const duration = Date.now() - startTime;

    logger.info('[run_command] Command completed in', duration, 'ms');

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - (error.startTime || Date.now());

    logger.error('[run_command] Command failed:', error.message);

    return {
      success: false,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
      exitCode: error.code || 1,
      duration,
      error: error.message,
    };
  }
}
