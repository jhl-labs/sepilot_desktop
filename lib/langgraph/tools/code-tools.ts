/**
 * Code Analysis Tools for Editor Agent
 *
 * Agent가 코드 컨텍스트를 분석하고 관련 코드를 검색할 수 있는 Tool들
 */

import type { EditorTool } from './editor-tools-registry';
import type { EditorAgentState } from '../graphs/editor-agent';

/**
 * Tool: 파일 컨텍스트 가져오기
 */
const getFileContextTool: EditorTool = {
  name: 'get_file_context',
  category: 'code',
  description: '현재 파일의 imports, types, 주변 코드를 분석합니다',
  icon: '🔍',
  parameters: {
    type: 'object',
    properties: {
      includeImports: {
        type: 'boolean',
        description: 'import 구문 포함 여부 (기본값: true)',
      },
      includeTypes: {
        type: 'boolean',
        description: 'type/interface 정의 포함 여부 (기본값: true)',
      },
      linesBefore: {
        type: 'number',
        description: '커서 이전 라인 수 (기본값: 10)',
      },
      linesAfter: {
        type: 'number',
        description: '커서 이후 라인 수 (기본값: 5)',
      },
    },
    required: [],
  },
  execute: async (args, state) => {
    const { includeImports = true, includeTypes = true, linesBefore = 10, linesAfter = 5 } =
      args as {
        includeImports?: boolean;
        includeTypes?: boolean;
        linesBefore?: number;
        linesAfter?: number;
      };

    const context = state.editorContext;

    if (!context?.filePath) {
      return {
        success: false,
        error: 'No file path in editor context',
      };
    }

    // Main Process 환경 확인
    if (typeof window !== 'undefined') {
      throw new Error('get_file_context can only be executed in Main Process');
    }

    try {
      const fs = await import('fs/promises');

      // 파일 읽기
      const content = await fs.readFile(context.filePath, 'utf-8');
      const lines = content.split('\n');

      // Import 구문 추출
      let imports: string[] = [];
      if (includeImports) {
        imports = lines.filter(
          (line) =>
            line.trim().startsWith('import ') ||
            line.trim().startsWith('from ') ||
            line.trim().startsWith('require(')
        );
      }

      // Type/Interface 정의 추출
      let types: string[] = [];
      if (includeTypes) {
        types = lines.filter(
          (line) =>
            line.trim().startsWith('type ') ||
            line.trim().startsWith('interface ') ||
            line.trim().startsWith('class ') ||
            line.trim().startsWith('enum ')
        );
      }

      // 커서 주변 코드 추출
      let surroundingCode: string[] = [];
      if (context.cursorPosition !== undefined) {
        // cursorPosition은 character offset이므로, line number로 변환
        let currentPos = 0;
        let cursorLine = 0;
        for (let i = 0; i < lines.length; i++) {
          currentPos += lines[i].length + 1; // +1 for newline
          if (currentPos >= context.cursorPosition) {
            cursorLine = i;
            break;
          }
        }

        const startLine = Math.max(0, cursorLine - linesBefore);
        const endLine = Math.min(lines.length, cursorLine + linesAfter + 1);
        surroundingCode = lines.slice(startLine, endLine);
      }

      return {
        success: true,
        filePath: context.filePath,
        language: context.language,
        imports: imports.length > 0 ? imports : undefined,
        types: types.length > 0 ? types : undefined,
        surroundingCode: surroundingCode.length > 0 ? surroundingCode.join('\n') : undefined,
        totalLines: lines.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get file context',
      };
    }
  },
};

/**
 * Tool: 유사한 코드 패턴 검색
 */
const searchSimilarCodeTool: EditorTool = {
  name: 'search_similar_code',
  category: 'code',
  description: '프로젝트에서 유사한 코드 패턴을 검색합니다 (ripgrep 사용)',
  icon: '🔎',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '검색할 코드 패턴 (정규식 가능)',
      },
      language: {
        type: 'string',
        description: '프로그래밍 언어 (예: typescript, javascript, python)',
      },
      contextLines: {
        type: 'number',
        description: '전후 컨텍스트 라인 수 (기본값: 2)',
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수 (기본값: 20)',
      },
    },
    required: ['pattern'],
  },
  execute: async (args, state) => {
    const { pattern, language, contextLines = 2, maxResults = 20 } = args as {
      pattern: string;
      language?: string;
      contextLines?: number;
      maxResults?: number;
    };

    if (typeof window !== 'undefined') {
      throw new Error('search_similar_code can only be executed in Main Process');
    }

    try {
      const path = await import('path');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Working directory 결정
      const workingDir = state.editorContext?.filePath
        ? path.dirname(state.editorContext.filePath)
        : process.cwd();

      // 언어별 파일 패턴 매핑
      const languagePatterns: Record<string, string> = {
        typescript: '*.{ts,tsx}',
        javascript: '*.{js,jsx}',
        python: '*.py',
        java: '*.java',
        go: '*.go',
        rust: '*.rs',
        cpp: '*.{cpp,cc,cxx,h,hpp}',
        c: '*.{c,h}',
      };

      // ripgrep 명령 구성
      let rgCommand = `rg --json -C ${contextLines}`;
      if (language && languagePatterns[language.toLowerCase()]) {
        rgCommand += ` -g "${languagePatterns[language.toLowerCase()]}"`;
      }
      rgCommand += ` --max-count ${maxResults}`;
      rgCommand += ` "${pattern}" "${workingDir}"`;

      console.log('[search_similar_code] Running:', rgCommand);

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
          } else if (data.type === 'context') {
            // Context lines
            const lastResult = results[results.length - 1];
            if (lastResult && !lastResult.context) {
              lastResult.context = [];
            }
            if (lastResult) {
              lastResult.context.push(data.data.lines.text.trim());
            }
          }
        } catch {
          // JSON 파싱 실패한 라인 무시
        }
      }

      return {
        success: true,
        pattern,
        language,
        results,
        totalMatches: results.length,
        workingDir,
      };
    } catch (error: any) {
      // ripgrep이 아무것도 찾지 못하면 exit code 1
      if (error.code === 1) {
        return {
          success: true,
          pattern,
          results: [],
          totalMatches: 0,
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to search similar code',
      };
    }
  },
};

/**
 * Tool: 문서 검색 (웹 API 문서 등)
 */
const getDocumentationTool: EditorTool = {
  name: 'get_documentation',
  category: 'code',
  description: '함수나 라이브러리의 문서를 검색합니다',
  icon: '📚',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 함수명 또는 라이브러리명',
      },
      source: {
        type: 'string',
        description: '문서 소스 (mdn, npm, github 등)',
      },
    },
    required: ['query'],
  },
  execute: async (args, state) => {
    const { query, source } = args as { query: string; source?: string };

    if (typeof window !== 'undefined') {
      throw new Error('get_documentation can only be executed in Main Process');
    }

    try {
      // 간단한 구현: 검색 URL 제공
      const documentationSources: Record<string, string> = {
        mdn: `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(query)}`,
        npm: `https://www.npmjs.com/search?q=${encodeURIComponent(query)}`,
        github: `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`,
        devdocs: `https://devdocs.io/#q=${encodeURIComponent(query)}`,
      };

      const selectedSource = source?.toLowerCase() || 'devdocs';
      const url = documentationSources[selectedSource] || documentationSources.devdocs;

      return {
        success: true,
        query,
        source: selectedSource,
        url,
        message: `Documentation search URL for "${query}". Open this URL in a browser to view results.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get documentation',
      };
    }
  },
};

/**
 * Tool: 함수/클래스 정의 찾기
 */
const findDefinitionTool: EditorTool = {
  name: 'find_definition',
  category: 'code',
  description: '함수, 클래스, 변수의 정의를 찾습니다',
  icon: '🎯',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: '찾을 심볼 이름 (함수명, 클래스명 등)',
      },
      filePattern: {
        type: 'string',
        description: '검색할 파일 패턴 (예: "*.ts")',
      },
    },
    required: ['symbol'],
  },
  execute: async (args, state) => {
    const { symbol, filePattern } = args as { symbol: string; filePattern?: string };

    if (typeof window !== 'undefined') {
      throw new Error('find_definition can only be executed in Main Process');
    }

    try {
      const path = await import('path');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const workingDir = state.editorContext?.filePath
        ? path.dirname(state.editorContext.filePath)
        : process.cwd();

      // 정의를 찾기 위한 패턴들
      const definitionPatterns = [
        `function ${symbol}`,
        `const ${symbol} =`,
        `let ${symbol} =`,
        `var ${symbol} =`,
        `class ${symbol}`,
        `interface ${symbol}`,
        `type ${symbol} =`,
        `enum ${symbol}`,
        `export.*${symbol}`,
      ];

      const pattern = `(${definitionPatterns.join('|')})`;

      let rgCommand = `rg --json -i`;
      if (filePattern) {
        rgCommand += ` -g "${filePattern}"`;
      }
      rgCommand += ` "${pattern}" "${workingDir}"`;

      console.log('[find_definition] Running:', rgCommand);

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
              text: data.data.lines.text.trim(),
            });
          }
        } catch {
          // JSON 파싱 실패한 라인 무시
        }
      }

      return {
        success: true,
        symbol,
        results,
        totalMatches: results.length,
        workingDir,
      };
    } catch (error: any) {
      if (error.code === 1) {
        return {
          success: true,
          symbol,
          results: [],
          totalMatches: 0,
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to find definition',
      };
    }
  },
};

/**
 * 모든 코드 분석 Tools 내보내기
 */
export const codeTools: EditorTool[] = [
  getFileContextTool,
  searchSimilarCodeTool,
  getDocumentationTool,
  findDefinitionTool,
];

/**
 * Registry에 코드 분석 Tools 등록
 */
export function registerCodeTools(registry: any): void {
  codeTools.forEach((tool) => registry.register(tool));
  console.log(`[CodeTools] Registered ${codeTools.length} code analysis tools`);
}
