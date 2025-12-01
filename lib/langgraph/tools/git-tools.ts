/**
 * Git Tools for Editor Agent
 *
 * Agent가 Git 저장소 정보를 조회할 수 있는 Tool들
 * Main Process에서 child_process를 통해 git 명령 실행
 */

import type { EditorTool } from './editor-tools-registry';

/**
 * Git 명령 실행 헬퍼 함수
 */
async function executeGitCommand(
  command: string,
  cwd: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(`git ${command}`, {
      cwd,
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 5, // 5MB
    });

    return {
      success: true,
      output: stdout.trim(),
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout?.trim() || '',
      error: error.stderr?.trim() || error.message,
    };
  }
}

/**
 * Tool: Git 상태 확인
 */
const gitStatusTool: EditorTool = {
  name: 'git_status',
  category: 'git',
  description: 'Git 저장소의 현재 상태를 확인합니다 (변경된 파일, 스테이징 등)',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Git 저장소 경로 (선택사항, 기본값: working directory)',
      },
      short: {
        type: 'boolean',
        description: '간단한 형식으로 출력 (기본값: true)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const { cwd, short = true } = args as { cwd?: string; short?: boolean };

    if (typeof window !== 'undefined') {
      throw new Error('git_status can only be executed in Main Process');
    }

    try {
      const path = await import('path');

      const workingDir = cwd
        ? cwd
        : state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd();

      const command = short ? 'status --short --branch' : 'status';
      const result = await executeGitCommand(command, workingDir);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to get git status',
        };
      }

      return {
        success: true,
        cwd: workingDir,
        status: result.output,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get git status',
      };
    }
  },
};

/**
 * Tool: Git diff 확인
 */
const gitDiffTool: EditorTool = {
  name: 'git_diff',
  category: 'git',
  description: '변경된 내용의 diff를 확인합니다',
  icon: '📝',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Git 저장소 경로 (선택사항)',
      },
      filePath: {
        type: 'string',
        description: '특정 파일의 diff만 보기 (선택사항)',
      },
      staged: {
        type: 'boolean',
        description: '스테이징된 변경사항만 보기 (기본값: false)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const {
      cwd,
      filePath,
      staged = false,
    } = args as {
      cwd?: string;
      filePath?: string;
      staged?: boolean;
    };

    if (typeof window !== 'undefined') {
      throw new Error('git_diff can only be executed in Main Process');
    }

    try {
      const path = await import('path');

      const workingDir = cwd
        ? cwd
        : state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd();

      let command = staged ? 'diff --cached' : 'diff';
      if (filePath) {
        command += ` -- ${filePath}`;
      }

      const result = await executeGitCommand(command, workingDir);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to get git diff',
        };
      }

      return {
        success: true,
        cwd: workingDir,
        diff: result.output,
        empty: result.output.length === 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get git diff',
      };
    }
  },
};

/**
 * Tool: Git log 확인
 */
const gitLogTool: EditorTool = {
  name: 'git_log',
  category: 'git',
  description: '최근 커밋 히스토리를 확인합니다',
  icon: '📜',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Git 저장소 경로 (선택사항)',
      },
      limit: {
        type: 'number',
        description: '표시할 커밋 개수 (기본값: 10)',
      },
      filePath: {
        type: 'string',
        description: '특정 파일의 히스토리만 보기 (선택사항)',
      },
      oneline: {
        type: 'boolean',
        description: '한 줄로 표시 (기본값: true)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const {
      cwd,
      limit = 10,
      filePath,
      oneline = true,
    } = args as {
      cwd?: string;
      limit?: number;
      filePath?: string;
      oneline?: boolean;
    };

    if (typeof window !== 'undefined') {
      throw new Error('git_log can only be executed in Main Process');
    }

    try {
      const path = await import('path');

      const workingDir = cwd
        ? cwd
        : state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd();

      let command = oneline
        ? `log --oneline -n ${limit}`
        : `log --pretty=format:"%h - %an, %ar : %s" -n ${limit}`;

      if (filePath) {
        command += ` -- ${filePath}`;
      }

      const result = await executeGitCommand(command, workingDir);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to get git log',
        };
      }

      const commits = result.output.split('\n').filter((line) => line.trim());

      return {
        success: true,
        cwd: workingDir,
        commits,
        count: commits.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get git log',
      };
    }
  },
};

/**
 * Tool: Git branch 목록 확인
 */
const gitBranchTool: EditorTool = {
  name: 'git_branch',
  category: 'git',
  description: '브랜치 목록과 현재 브랜치를 확인합니다',
  icon: '🌿',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Git 저장소 경로 (선택사항)',
      },
      all: {
        type: 'boolean',
        description: '원격 브랜치 포함 (기본값: false)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const { cwd, all = false } = args as { cwd?: string; all?: boolean };

    if (typeof window !== 'undefined') {
      throw new Error('git_branch can only be executed in Main Process');
    }

    try {
      const path = await import('path');

      const workingDir = cwd
        ? cwd
        : state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd();

      const command = all ? 'branch -a' : 'branch';
      const result = await executeGitCommand(command, workingDir);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to get git branch',
        };
      }

      const branches = result.output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line);

      const currentBranch = branches.find((b) => b.startsWith('*'))?.replace('* ', '');

      return {
        success: true,
        cwd: workingDir,
        branches: branches.map((b) => b.replace('* ', '')),
        currentBranch,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get git branch',
      };
    }
  },
};

/**
 * 모든 Git Tools 내보내기
 */
export const gitTools: EditorTool[] = [gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool];

/**
 * Registry에 Git Tools 등록
 */
export function registerGitTools(registry: any): void {
  gitTools.forEach((tool) => registry.register(tool));
  console.log(`[GitTools] Registered ${gitTools.length} git tools`);
}
