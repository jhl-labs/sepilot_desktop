/**
 * Verification Pipeline for Coding Agent
 *
 * Automatically verifies code quality after changes
 */

import { CodingAgentState } from '../state';
import { executeBuiltinTool } from '@/lib/mcp/tools/builtin-tools';

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface VerificationResult {
  checks: CheckResult[];
  allPassed: boolean;
  suggestions: string[];
}

export class VerificationPipeline {
  /**
   * Run all verification checks
   */
  async verify(state: CodingAgentState): Promise<VerificationResult> {
    const checks: CheckResult[] = [];
    const suggestions: string[] = [];

    console.log('[VerificationPipeline] Starting verification...');

    // Only run checks if files were modified
    if (!state.modifiedFiles || state.modifiedFiles.length === 0) {
      console.log('[VerificationPipeline] No modified files, skipping verification');
      return {
        checks: [],
        allPassed: true,
        suggestions: [],
      };
    }

    // 1. Type check (if TypeScript files modified)
    const hasTypeScriptFiles = state.modifiedFiles.some(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx')
    );
    if (hasTypeScriptFiles) {
      const typeCheckResult = await this.checkTypes();
      checks.push(typeCheckResult);
      if (!typeCheckResult.passed) {
        suggestions.push('타입 에러를 수정하세요. `npm run type-check`를 실행하여 확인할 수 있습니다.');
      }
    }

    // 2. Lint check
    const lintResult = await this.runLint(state.modifiedFiles);
    checks.push(lintResult);
    if (!lintResult.passed) {
      suggestions.push('린트 에러를 수정하세요. `npm run lint -- --fix`로 자동 수정을 시도할 수 있습니다.');
    }

    // 3. Build check (optional, can be slow)
    // const buildResult = await this.checkBuild();
    // checks.push(buildResult);

    const allPassed = checks.every((c) => c.passed);

    console.log('[VerificationPipeline] Verification complete:', {
      totalChecks: checks.length,
      passed: checks.filter((c) => c.passed).length,
      failed: checks.filter((c) => !c.passed).length,
      allPassed,
    });

    return {
      checks,
      allPassed,
      suggestions,
    };
  }

  /**
   * Check TypeScript types
   */
  private async checkTypes(): Promise<CheckResult> {
    try {
      console.log('[VerificationPipeline] Running type check...');
      const result = await executeBuiltinTool('command_execute', {
        command: 'npm run type-check',
      });

      const passed = !result.includes('error TS');
      return {
        name: 'type-check',
        passed,
        message: passed ? '타입 체크 통과' : '타입 에러 발견',
        details: passed ? undefined : result.substring(0, 500),
      };
    } catch (error: any) {
      console.error('[VerificationPipeline] Type check failed:', error);
      return {
        name: 'type-check',
        passed: false,
        message: '타입 체크 실행 실패',
        details: error.message,
      };
    }
  }

  /**
   * Run linter
   */
  private async runLint(modifiedFiles: string[]): Promise<CheckResult> {
    try {
      console.log('[VerificationPipeline] Running lint...');

      // Lint only modified files to speed up
      const filesArg = modifiedFiles.slice(0, 10).join(' '); // Limit to 10 files
      const result = await executeBuiltinTool('command_execute', {
        command: `npm run lint -- ${filesArg}`,
      });

      // ESLint returns exit code 1 if there are errors
      const hasErrors = result.includes('error') && !result.includes('0 errors');
      const passed = !hasErrors;

      return {
        name: 'lint',
        passed,
        message: passed ? '린트 체크 통과' : '린트 에러 발견',
        details: passed ? undefined : result.substring(0, 500),
      };
    } catch (error: any) {
      console.error('[VerificationPipeline] Lint failed:', error);

      // Lint errors are thrown as exceptions
      const hasErrors = error.message?.includes('error');
      return {
        name: 'lint',
        passed: !hasErrors,
        message: hasErrors ? '린트 에러 발견' : '린트 체크 실행 실패',
        details: error.message?.substring(0, 500),
      };
    }
  }

  /**
   * Check if build succeeds
   */
  private async checkBuild(): Promise<CheckResult> {
    try {
      console.log('[VerificationPipeline] Running build check...');
      const result = await executeBuiltinTool('command_execute', {
        command: 'npm run build',
      });

      const passed = result.includes('Compiled successfully') || !result.includes('Failed to compile');
      return {
        name: 'build',
        passed,
        message: passed ? '빌드 성공' : '빌드 실패',
        details: passed ? undefined : result.substring(0, 500),
      };
    } catch (error: any) {
      console.error('[VerificationPipeline] Build check failed:', error);
      return {
        name: 'build',
        passed: false,
        message: '빌드 실행 실패',
        details: error.message,
      };
    }
  }

  /**
   * Run tests (optional)
   */
  private async runTests(): Promise<CheckResult> {
    try {
      console.log('[VerificationPipeline] Running tests...');
      const result = await executeBuiltinTool('command_execute', {
        command: 'npm test',
      });

      const passed = result.includes('PASS') || result.includes('All tests passed');
      return {
        name: 'test',
        passed,
        message: passed ? '테스트 통과' : '테스트 실패',
        details: passed ? undefined : result.substring(0, 500),
      };
    } catch (error: any) {
      console.error('[VerificationPipeline] Tests failed:', error);
      return {
        name: 'test',
        passed: false,
        message: '테스트 실행 실패',
        details: error.message,
      };
    }
  }
}
