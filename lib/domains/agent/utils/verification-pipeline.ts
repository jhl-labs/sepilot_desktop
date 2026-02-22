import { logger } from '@/lib/utils/logger';
/**
 * Verification Pipeline for Coding Agent
 *
 * Automatically verifies code quality after changes
 */

import { CodingAgentState } from '../state';
import { executeBuiltinTool } from '@/lib/domains/mcp/tools/builtin-tools';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
  command?: string;
}

export interface VerificationResult {
  checks: CheckResult[];
  allPassed: boolean;
  suggestions: string[];
  executedCommands: string[];
}

type PackageRunner = 'pnpm' | 'npm' | 'yarn';

interface ProjectProfile {
  runner: PackageRunner;
  scripts: Record<string, string>;
  workingDirectory: string;
}

export class VerificationPipeline {
  private async detectProjectProfile(): Promise<ProjectProfile> {
    const workingDirectory = process.cwd();
    const packageJsonPath = path.join(workingDirectory, 'package.json');

    let scripts: Record<string, string> = {};
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      scripts = packageJson?.scripts || {};
    } catch {
      scripts = {};
    }

    let runner: PackageRunner = 'npm';
    try {
      await fs.access(path.join(workingDirectory, 'pnpm-lock.yaml'));
      runner = 'pnpm';
    } catch {
      try {
        await fs.access(path.join(workingDirectory, 'yarn.lock'));
        runner = 'yarn';
      } catch {
        runner = 'npm';
      }
    }

    return { runner, scripts, workingDirectory };
  }

  private toScriptCommand(scriptName: string, profile: ProjectProfile): string | null {
    if (!profile.scripts[scriptName]) {
      return null;
    }
    if (profile.runner === 'pnpm') {
      return `pnpm -s ${scriptName}`;
    }
    if (profile.runner === 'yarn') {
      return `yarn ${scriptName}`;
    }
    return `npm run ${scriptName}`;
  }

  private async runCommandCheck(
    name: string,
    command: string,
    passPredicate: (output: string) => boolean,
    passMessage: string,
    failMessage: string
  ): Promise<CheckResult> {
    try {
      const output = await executeBuiltinTool('command_execute', { command });
      const passed = passPredicate(output);
      return {
        name,
        passed,
        message: passed ? passMessage : failMessage,
        details: passed ? undefined : output.substring(0, 1200),
        command,
      };
    } catch (error: any) {
      return {
        name,
        passed: false,
        message: `${name} 실행 실패`,
        details: error?.message?.substring(0, 1200) || String(error),
        command,
      };
    }
  }

  private shouldRunBackendTests(modifiedFiles: string[]): boolean {
    return modifiedFiles.some(
      (file) => file.startsWith('lib/domains/agent/') || file.startsWith('tests/lib/langgraph/')
    );
  }

  private buildRelatedBackendTestCommand(
    profile: ProjectProfile,
    modifiedFiles: string[]
  ): string | null {
    if (!profile.scripts['test:backend']) {
      return null;
    }

    const targetFiles = modifiedFiles
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))
      .slice(0, 8)
      .map((file) => `"${file.replace(/"/g, '\\"')}"`);

    if (targetFiles.length === 0) {
      return this.toScriptCommand('test:backend', profile);
    }

    const base = this.toScriptCommand('test:backend', profile);
    if (!base) {
      return null;
    }

    return `${base} -- --runInBand --passWithNoTests --findRelatedTests ${targetFiles.join(' ')}`;
  }

  /**
   * Run all verification checks
   */
  async verify(state: CodingAgentState): Promise<VerificationResult> {
    const checks: CheckResult[] = [];
    const suggestions: string[] = [];
    const executedCommands: string[] = [];

    logger.info('[VerificationPipeline] Starting verification...');

    // Only run checks if files were modified
    if (!state.modifiedFiles || state.modifiedFiles.length === 0) {
      logger.info('[VerificationPipeline] No modified files, skipping verification');
      return {
        checks: [],
        allPassed: true,
        suggestions: [],
        executedCommands: [],
      };
    }

    const profile = await this.detectProjectProfile();

    // 1. Type check (if TypeScript files modified)
    const hasTypeScriptFiles = state.modifiedFiles.some(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx')
    );
    if (hasTypeScriptFiles) {
      const typeCheckCommand = this.toScriptCommand('type-check', profile);
      if (typeCheckCommand) {
        const typeCheckResult = await this.runCommandCheck(
          'type-check',
          typeCheckCommand,
          (output) => !output.includes('error TS'),
          '타입 체크 통과',
          '타입 에러 발견'
        );
        checks.push(typeCheckResult);
        executedCommands.push(typeCheckCommand);
        if (!typeCheckResult.passed) {
          suggestions.push(
            `타입 에러를 수정하세요. \`${typeCheckCommand}\`를 실행하여 확인할 수 있습니다.`
          );
        }
      }
    }

    // 2. Lint check
    const lintCommand = this.toScriptCommand('lint', profile);
    if (lintCommand) {
      const lintResult = await this.runLint(lintCommand, state.modifiedFiles);
      checks.push(lintResult);
      executedCommands.push(lintResult.command || lintCommand);
      if (!lintResult.passed) {
        suggestions.push(
          `린트 에러를 수정하세요. \`${lintCommand} -- --fix\`로 자동 수정을 시도할 수 있습니다.`
        );
      }
    }

    // 3. Focused test gate (agent-related changes)
    if (this.shouldRunBackendTests(state.modifiedFiles)) {
      const testCommand = this.buildRelatedBackendTestCommand(profile, state.modifiedFiles);
      if (testCommand) {
        const testResult = await this.runCommandCheck(
          'test-gate',
          testCommand,
          (output) => !/(\bFAIL\b|Test Suites:\s+\d+\s+failed)/i.test(output),
          '테스트 게이트 통과',
          '테스트 게이트 실패'
        );
        checks.push(testResult);
        executedCommands.push(testCommand);
        if (!testResult.passed) {
          suggestions.push(
            '관련 테스트를 통과해야 합니다. 실패 테스트를 수정하거나 테스트 선택 범위를 조정하세요.'
          );
        }
      }
    }

    const allPassed = checks.every((c) => c.passed);

    logger.info('[VerificationPipeline] Verification complete:', {
      totalChecks: checks.length,
      passed: checks.filter((c) => c.passed).length,
      failed: checks.filter((c) => !c.passed).length,
      allPassed,
    });

    return {
      checks,
      allPassed,
      suggestions,
      executedCommands,
    };
  }

  /**
   * Run linter
   */
  private async runLint(baseCommand: string, modifiedFiles: string[]): Promise<CheckResult> {
    try {
      logger.info('[VerificationPipeline] Running lint...');

      // Lint only modified files to speed up
      const filesArg = modifiedFiles
        .slice(0, 10)
        .map((file) => `"${file.replace(/"/g, '\\"')}"`)
        .join(' '); // Limit to 10 files
      const command = filesArg ? `${baseCommand} -- ${filesArg}` : baseCommand;
      const result = await executeBuiltinTool('command_execute', { command });

      // ESLint returns exit code 1 if there are errors
      const hasErrors = result.includes('error') && !result.includes('0 errors');
      const passed = !hasErrors;

      return {
        name: 'lint',
        passed,
        message: passed ? '린트 체크 통과' : '린트 에러 발견',
        details: passed ? undefined : result.substring(0, 1200),
        command,
      };
    } catch (error: any) {
      console.error('[VerificationPipeline] Lint failed:', error);

      // Lint errors are thrown as exceptions
      const hasErrors = error.message?.includes('error');
      return {
        name: 'lint',
        passed: !hasErrors,
        message: hasErrors ? '린트 에러 발견' : '린트 체크 실행 실패',
        details: error.message?.substring(0, 1200),
        command: baseCommand,
      };
    }
  }
}
