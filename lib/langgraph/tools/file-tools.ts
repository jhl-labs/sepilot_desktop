import { logger } from '@/lib/utils/logger';
/**
 * File Management Tools for Editor Agent
 *
 * Agent가 파일 시스템을 조작할 수 있는 Tool들
 */

import type { EditorTool } from './editor-tools-registry';

/**
 * Tool: 파일 읽기
 */
const readFileTool: EditorTool = {
  name: 'read_file',
  category: 'file',
  description: '지정한 경로의 파일 내용을 읽습니다',
  icon: '📖',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '읽을 파일의 절대 경로 또는 working directory 기준 상대 경로',
      },
    },
    required: ['filePath'],
  },
  execute: async (args, state) => {
    const { filePath } = args as { filePath: string };

    // Main Process 환경 확인
    if (typeof window !== 'undefined') {
      throw new Error('read_file can only be executed in Main Process');
    }

    try {
      // Dynamic import to avoid bundling issues
      const fs = await import('fs/promises');
      const path = await import('path');

      // Working directory 기준으로 절대 경로 계산
      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workingDir, filePath);

      // Security Check
      const relative = path.relative(workingDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${filePath}`);
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n').length;

      return {
        success: true,
        filePath: absolutePath,
        content,
        lines,
        size: Buffer.byteLength(content, 'utf-8'),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to read file',
      };
    }
  },
};

/**
 * Tool: 파일 쓰기 (새 파일 생성 또는 덮어쓰기)
 */
const writeFileTool: EditorTool = {
  name: 'write_file',
  category: 'file',
  description:
    '새 파일을 생성하거나 기존 파일을 덮어씁니다. 파일 생성 요청 시 전체 내용을 content에 포함하여 즉시 실행하세요. 디렉토리가 없으면 자동으로 생성됩니다.',
  icon: '✍️',
  dangerous: true, // 파일 덮어쓰기는 위험할 수 있음
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description:
          '쓸 파일의 절대 경로 또는 working directory 기준 상대 경로 (예: "TEST.md", "docs/README.md")',
      },
      content: {
        type: 'string',
        description:
          '파일에 쓸 전체 내용. 마크다운, 코드, 텍스트 등 모든 형식 지원. 완전한 내용을 작성하세요.',
      },
    },
    required: ['filePath', 'content'],
  },
  execute: async (args, state) => {
    const { filePath, content } = args as { filePath: string; content: string };

    if (typeof window !== 'undefined') {
      throw new Error('write_file can only be executed in Main Process');
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workingDir, filePath);

      // Security Check
      const relative = path.relative(workingDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${filePath}`);
      }

      // 디렉토리가 없으면 생성
      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(absolutePath, content, 'utf-8');

      return {
        success: true,
        filePath: absolutePath,
        size: Buffer.byteLength(content, 'utf-8'),
        lines: content.split('\n').length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to write file',
      };
    }
  },
};

/**
 * Tool: 파일 수정 (특정 라인 범위 교체)
 */
const editFileTool: EditorTool = {
  name: 'edit_file',
  category: 'file',
  description: '파일의 특정 라인 범위를 새 내용으로 교체합니다',
  icon: '📝',
  dangerous: true,
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '수정할 파일의 경로',
      },
      startLine: {
        type: 'number',
        description: '교체 시작 라인 번호 (1부터 시작)',
      },
      endLine: {
        type: 'number',
        description: '교체 종료 라인 번호 (포함)',
      },
      newContent: {
        type: 'string',
        description: '교체할 새 내용',
      },
    },
    required: ['filePath', 'startLine', 'endLine', 'newContent'],
  },
  execute: async (args, state) => {
    const { filePath, startLine, endLine, newContent } = args as {
      filePath: string;
      startLine: number;
      endLine: number;
      newContent: string;
    };

    if (typeof window !== 'undefined') {
      throw new Error('edit_file can only be executed in Main Process');
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workingDir, filePath);

      // Security Check
      const relative = path.relative(workingDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${filePath}`);
      }

      // 파일 읽기
      const content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      // 라인 번호 검증 (1-based index)
      if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        return {
          success: false,
          error: `Invalid line range: ${startLine}-${endLine} (file has ${lines.length} lines)`,
        };
      }

      // 라인 교체 (1-based -> 0-based)
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      const newLines = [...before, newContent, ...after];

      const newFileContent = newLines.join('\n');
      await fs.writeFile(absolutePath, newFileContent, 'utf-8');

      return {
        success: true,
        filePath: absolutePath,
        linesReplaced: endLine - startLine + 1,
        newLines: newContent.split('\n').length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to edit file',
      };
    }
  },
};

/**
 * Tool: 디렉토리 파일 목록
 */
const listFilesTool: EditorTool = {
  name: 'list_files',
  category: 'file',
  description: '지정한 디렉토리의 파일 및 폴더 목록을 조회합니다',
  icon: '📋',
  parameters: {
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        description: '조회할 디렉토리 경로 (기본값: working directory)',
      },
      recursive: {
        type: 'boolean',
        description: '하위 디렉토리도 포함할지 여부 (기본값: false)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const { dirPath, recursive } = args as { dirPath?: string; recursive?: boolean };

    if (typeof window !== 'undefined') {
      throw new Error('list_files can only be executed in Main Process');
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const absolutePath = dirPath
        ? path.isAbsolute(dirPath)
          ? dirPath
          : path.join(workingDir, dirPath)
        : workingDir;

      // Security Check
      const relative = path.relative(workingDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${dirPath || '.'}`);
      }

      // 재귀적 목록 조회 함수
      async function listRecursive(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(absolutePath, fullPath);

          if (entry.isDirectory()) {
            files.push(`${relativePath}/`);
            if (recursive) {
              const subFiles = await listRecursive(fullPath);
              files.push(...subFiles);
            }
          } else {
            files.push(relativePath);
          }
        }

        return files;
      }

      const files = await listRecursive(absolutePath);

      return {
        success: true,
        dirPath: absolutePath,
        files,
        count: files.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to list files',
      };
    }
  },
};

/**
 * Tool: 파일 검색 (ripgrep)
 */
const searchFilesTool: EditorTool = {
  name: 'search_files',
  category: 'file',
  description: '파일 내용에서 텍스트를 검색합니다 (ripgrep 사용)',
  icon: '🔎',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 텍스트 또는 정규식',
      },
      dirPath: {
        type: 'string',
        description: '검색할 디렉토리 (기본값: working directory)',
      },
      filePattern: {
        type: 'string',
        description: '파일 패턴 (예: "*.ts", "*.{js,jsx}")',
      },
      caseSensitive: {
        type: 'boolean',
        description: '대소문자 구분 여부 (기본값: false)',
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수 (기본값: 50)',
      },
    },
    required: ['query'],
  },
  execute: async (args, state) => {
    const { query, dirPath, filePattern, caseSensitive, maxResults } = args as {
      query: string;
      dirPath?: string;
      filePattern?: string;
      caseSensitive?: boolean;
      maxResults?: number;
    };

    if (typeof window !== 'undefined') {
      throw new Error('search_files can only be executed in Main Process');
    }

    try {
      const path = await import('path');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const searchDir = dirPath
        ? path.isAbsolute(dirPath)
          ? dirPath
          : path.join(workingDir, dirPath)
        : workingDir;

      // Security Check
      const relative = path.relative(workingDir, searchDir);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${dirPath || '.'}`);
      }

      // ripgrep 명령 구성
      let rgCommand = 'rg --json';
      if (!caseSensitive) {
        rgCommand += ' -i';
      }
      if (filePattern) {
        rgCommand += ` -g "${filePattern}"`;
      }
      if (maxResults) {
        rgCommand += ` --max-count ${maxResults}`;
      }
      rgCommand += ` "${query}" "${searchDir}"`;

      logger.info('[search_files] Running:', rgCommand);

      const { stdout } = await execAsync(rgCommand);
      const lines = stdout.trim().split('\n');
      const results: any[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'match') {
            results.push({
              path: data.data.path.text,
              line: data.data.line_number,
              column: data.data.submatches[0]?.start || 0,
              text: data.data.lines.text.trim(),
            });
          }
        } catch {
          // JSON 파싱 실패한 라인 무시
        }
      }

      return {
        success: true,
        query,
        results,
        totalMatches: results.length,
      };
    } catch (error: any) {
      // ripgrep이 아무것도 찾지 못하면 exit code 1
      if (error.code === 1) {
        return {
          success: true,
          query,
          results: [],
          totalMatches: 0,
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to search files',
      };
    }
  },
};

/**
 * Tool: 파일 삭제
 */
const deleteFileTool: EditorTool = {
  name: 'delete_file',
  category: 'file',
  description: '파일 또는 디렉토리를 삭제합니다 (디렉토리는 재귀적으로 삭제)',
  icon: '🗑️',
  dangerous: true,
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '삭제할 파일 또는 디렉토리 경로',
      },
    },
    required: ['filePath'],
  },
  execute: async (args, state) => {
    const { filePath } = args as { filePath: string };

    if (typeof window !== 'undefined') {
      throw new Error('delete_file can only be executed in Main Process');
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Working directory 우선순위: state.workingDirectory > editorContext.filePath의 dirname > process.cwd()
      const workingDir =
        state.workingDirectory ||
        (state.editorContext?.filePath
          ? path.dirname(state.editorContext.filePath)
          : process.cwd());
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workingDir, filePath);

      // Security Check
      const relative = path.relative(workingDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Access denied: Path is outside the working directory: ${filePath}`);
      }

      // 파일/디렉토리 확인
      const stats = await fs.stat(absolutePath);
      const isDirectory = stats.isDirectory();

      // 삭제
      if (isDirectory) {
        await fs.rm(absolutePath, { recursive: true, force: true });
      } else {
        await fs.unlink(absolutePath);
      }

      return {
        success: true,
        filePath: absolutePath,
        type: isDirectory ? 'directory' : 'file',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete file',
      };
    }
  },
};

/**
 * 모든 파일 관리 Tools 내보내기
 */
export const fileTools: EditorTool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
  searchFilesTool,
  deleteFileTool,
];

/**
 * Registry에 파일 Tools 등록
 */
export function registerFileTools(registry: any): void {
  fileTools.forEach((tool) => registry.register(tool));
  logger.info(`[FileTools] Registered ${fileTools.length} file management tools`);
}
