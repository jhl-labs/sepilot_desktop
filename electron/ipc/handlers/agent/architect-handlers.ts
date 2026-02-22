import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Architect Extension IPC Handlers
 */

export function registerArchitectHandlers() {
  /**
   * Run cloc analysis on a target path
   */
  ipcMain.handle(
    'architect:run-cloc',
    async (
      _event,
      params: { targetPath: string; excludePatterns?: string[] }
    ): Promise<{ success: boolean; data?: any; error?: string }> => {
      const { targetPath, excludePatterns = [] } = params;

      try {
        // Check if cloc is installed
        try {
          await execFileAsync('cloc', ['--version']);
        } catch {
          return {
            success: false,
            error:
              'cloc is not installed. Please install it first:\n' +
              '  macOS: brew install cloc\n' +
              '  Linux: sudo apt-get install cloc\n' +
              '  Windows: choco install cloc',
          };
        }

        // Build cloc arguments
        const clocArgs = [targetPath, '--json', '--quiet'];

        // Add exclude patterns
        if (excludePatterns.length > 0) {
          for (const pattern of excludePatterns) {
            clocArgs.push(`--exclude-dir=${pattern}`);
          }
        }

        // Execute cloc (안전하게 execFile 사용, Command Injection 방지)
        const { stdout, stderr } = await execFileAsync('cloc', clocArgs, {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large projects
        });

        if (stderr && !stdout) {
          throw new Error(stderr);
        }

        // Parse JSON output
        const stats = JSON.parse(stdout);

        return { success: true, data: stats };
      } catch (error) {
        console.error('Architect: cloc execution failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  /**
   * Run ESLint analysis on a target path
   */
  ipcMain.handle(
    'architect:run-eslint',
    async (
      _event,
      params: { targetPath: string }
    ): Promise<{ success: boolean; data?: any; error?: string }> => {
      const { targetPath } = params;

      try {
        // Check if ESLint config exists
        const eslintConfigPath = path.join(targetPath, '.eslintrc.json');
        const eslintConfigExists =
          fs.existsSync(eslintConfigPath) ||
          fs.existsSync(path.join(targetPath, '.eslintrc.js')) ||
          fs.existsSync(path.join(targetPath, '.eslintrc.cjs')) ||
          fs.existsSync(path.join(targetPath, 'eslint.config.js'));

        if (!eslintConfigExists) {
          return {
            success: false,
            error: 'No ESLint configuration found in the project',
          };
        }

        // Run ESLint (npx를 안전하게 실행)
        try {
          const { stdout } = await execFileAsync(
            'npx',
            ['eslint', '.', '--format', 'json', '--ext', '.ts,.tsx,.js,.jsx'],
            {
              cwd: targetPath, // 작업 디렉토리 변경 (cd 대신)
              maxBuffer: 10 * 1024 * 1024,
            }
          );

          const results = JSON.parse(stdout);
          const errorCount = results.reduce((sum: number, r: any) => sum + r.errorCount, 0);
          const warningCount = results.reduce((sum: number, r: any) => sum + r.warningCount, 0);

          return {
            success: true,
            data: {
              results,
              errorCount,
              warningCount,
              fileCount: results.length,
            },
          };
        } catch (error: any) {
          // ESLint returns non-zero exit code when there are errors
          // But still outputs JSON to stdout
          if (error.stdout) {
            const results = JSON.parse(error.stdout);
            const errorCount = results.reduce((sum: number, r: any) => sum + r.errorCount, 0);
            const warningCount = results.reduce((sum: number, r: any) => sum + r.warningCount, 0);

            return {
              success: true,
              data: {
                results,
                errorCount,
                warningCount,
                fileCount: results.length,
              },
            };
          }
          throw error;
        }
      } catch (error) {
        console.error('Architect: ESLint execution failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  /**
   * Run TypeScript compiler analysis
   */
  ipcMain.handle(
    'architect:run-tsc',
    async (
      _event,
      params: { targetPath: string }
    ): Promise<{ success: boolean; data?: any; error?: string }> => {
      const { targetPath } = params;

      try {
        // Check if tsconfig.json exists
        const tsconfigPath = path.join(targetPath, 'tsconfig.json');
        if (!fs.existsSync(tsconfigPath)) {
          return {
            success: false,
            error: 'No tsconfig.json found in the project',
          };
        }

        // Run tsc --noEmit (npx를 안전하게 실행)
        try {
          await execFileAsync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
            cwd: targetPath, // 작업 디렉토리 변경 (cd 대신)
            maxBuffer: 10 * 1024 * 1024,
          });

          // No errors
          return {
            success: true,
            data: {
              errors: [],
              errorCount: 0,
              warningCount: 0,
            },
          };
        } catch (error: any) {
          // Parse TypeScript errors from stderr
          const errors = parseTypeScriptErrors(error.stderr || '');

          return {
            success: true,
            data: {
              errors,
              errorCount: errors.filter((e) => e.category === 'error').length,
              warningCount: errors.filter((e) => e.category === 'warning').length,
            },
          };
        }
      } catch (error) {
        console.error('Architect: TypeScript compilation check failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  /**
   * Check if cloc is installed
   */
  ipcMain.handle(
    'architect:check-cloc',
    async (): Promise<{ success: boolean; installed: boolean; version?: string }> => {
      try {
        const { stdout } = await execFileAsync('cloc', ['--version']);
        const version = stdout.trim().split('\n')[0];
        return { success: true, installed: true, version };
      } catch {
        return { success: true, installed: false };
      }
    }
  );

  /**
   * Run dependency analysis with madge
   */
  ipcMain.handle(
    'architect:run-madge',
    async (
      _event,
      params: { targetPath: string }
    ): Promise<{
      success: boolean;
      data?: {
        graph: Record<string, string[]>;
        circular: Array<{ cycle: string[] }>;
        fileCount: number;
        totalDependencies: number;
      };
      error?: string;
    }> => {
      try {
        const madge = require('madge');

        console.log('[Architect] Running madge analysis on:', params.targetPath);

        // Run madge
        const result = await madge(params.targetPath, {
          fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
          excludeRegExp: [/node_modules/, /dist/, /build/, /.next/, /out/],
          tsConfig: require('path').join(params.targetPath, 'tsconfig.json'),
        });

        const graph = result.obj();
        const circular = result.circular();

        // Calculate stats
        const fileCount = Object.keys(graph).length;
        const totalDependencies = Object.values(graph).reduce<number>(
          (sum: number, deps) => sum + (deps as string[]).length,
          0
        );

        const circularDependencies = circular.map((cycle: string[]) => ({ cycle }));

        console.log('[Architect] Madge analysis complete:', {
          fileCount,
          totalDependencies,
          circularCount: circularDependencies.length,
        });

        return {
          success: true,
          data: {
            graph,
            circular: circularDependencies,
            fileCount,
            totalDependencies,
          },
        };
      } catch (error) {
        console.error('Architect: Madge analysis failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  /**
   * Run AI-powered refactoring analysis
   */
  ipcMain.handle(
    'architect:run-ai-refactor',
    async (
      _event,
      params: {
        targetPath: string;
        clocStats: any;
        eslintStats: any;
        tscStats: any;
        dependencyStats: any;
      }
    ): Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }> => {
      try {
        console.log('[Architect] AI refactoring analysis requested for:', params.targetPath);

        // TODO: RefactorAgent 구현 필요
        // RefactorAgent는 아직 구현되지 않음
        console.warn('[Architect] RefactorAgent not implemented yet');

        return {
          success: false,
          error: 'AI refactoring analysis is not implemented yet. This feature is coming soon.',
        };

        // // RefactorAgent 동적 import (구현 후 활성화)
        // const { RefactorAgent } =
        //   await import('@sepilot/extension-architect/agents/refactor-agent');
        //
        // const agent = new RefactorAgent();
        //
        // // 분석 실행
        // const result = await agent.analyze({
        //   targetPath: params.targetPath,
        //   clocStats: params.clocStats,
        //   eslintStats: params.eslintStats,
        //   tscStats: params.tscStats,
        //   dependencyStats: params.dependencyStats,
        // });
        //
        // console.log('[Architect] AI analysis complete, suggestions:', result.suggestions.length);
        //
        // return {
        //   success: true,
        //   data: result,
        // };
      } catch (error) {
        console.error('Architect: AI refactoring analysis failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  console.log('[IPC] Architect handlers registered');
}

/**
 * Parse TypeScript error output
 */
function parseTypeScriptErrors(stderr: string): Array<{
  file: string;
  line: number;
  column: number;
  code: number;
  message: string;
  category: 'error' | 'warning' | 'suggestion' | 'message';
}> {
  const errors: Array<{
    file: string;
    line: number;
    column: number;
    code: number;
    message: string;
    category: 'error' | 'warning' | 'suggestion' | 'message';
  }> = [];

  // TypeScript error format: file(line,column): error TSxxxx: message
  const errorRegex = /^(.+?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.+)$/gm;

  let match;
  while ((match = errorRegex.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      code: parseInt(match[5]),
      message: match[6],
      category: match[4] as 'error' | 'warning',
    });
  }

  return errors;
}
