/**
 * Editor Built-in Tools
 *
 * Editor Agent에서 사용하는 전용 도구들:
 * - get_file_context: 파일 컨텍스트 분석
 * - search_similar_code: 유사 코드 검색
 * - get_documentation: 문서 검색
 * - analyze_imports: Import 문 분석
 * - get_type_info: 타입 정보 조회
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileContext {
  filePath: string;
  language: string;
  imports: string[];
  types: string[];
  contextBefore: string;
  contextAfter: string;
  fullContent?: string;
}

/**
 * Get file context including imports, types, and surrounding code
 */
export async function getFileContext(params: {
  filePath: string;
  cursorPosition: number;
  includeImports?: boolean;
  includeTypes?: boolean;
  linesBefore?: number;
  linesAfter?: number;
}): Promise<FileContext> {
  const {
    filePath,
    cursorPosition,
    includeImports = true,
    includeTypes = true,
    linesBefore = 20,
    linesAfter = 5,
  } = params;

  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Calculate line number from cursor position
    let currentPos = 0;
    let currentLineNumber = 0;
    for (let i = 0; i < lines.length; i++) {
      if (currentPos + lines[i].length >= cursorPosition) {
        currentLineNumber = i;
        break;
      }
      currentPos += lines[i].length + 1; // +1 for newline
    }

    // Extract imports
    const imports: string[] = [];
    if (includeImports) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith('import ') ||
          trimmed.startsWith('from ') ||
          trimmed.startsWith('using ') ||
          trimmed.startsWith('#include') ||
          trimmed.startsWith('require(')
        ) {
          imports.push(line);
        }
      }
    }

    // Extract type definitions (simplified - would need proper parsing)
    const types: string[] = [];
    if (includeTypes) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('type ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('enum ') ||
          trimmed.startsWith('struct ')
        ) {
          types.push(line);
        }
      }
    }

    // Get surrounding context
    const startLine = Math.max(0, currentLineNumber - linesBefore);
    const endLine = Math.min(lines.length, currentLineNumber + linesAfter + 1);

    const contextBefore = lines.slice(startLine, currentLineNumber).join('\n');
    const contextAfter = lines.slice(currentLineNumber + 1, endLine).join('\n');

    // Detect language from file extension
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.md': 'markdown',
      '.json': 'json',
    };
    const language = languageMap[ext] || 'plaintext';

    return {
      filePath,
      language,
      imports,
      types,
      contextBefore,
      contextAfter,
    };
  } catch (error: any) {
    throw new Error(`Failed to get file context: ${error.message}`);
  }
}

/**
 * Search for similar code patterns in the project
 */
export async function searchSimilarCode(params: {
  pattern: string;
  language?: string;
  workingDirectory?: string;
  maxResults?: number;
}): Promise<{ file: string; line: number; match: string }[]> {
  const { pattern, language, workingDirectory = process.cwd(), maxResults = 10 } = params;

  try {
    // This would use ripgrep in production
    // For now, return placeholder
    console.log('[searchSimilarCode] Searching for:', pattern, 'in', language || 'all', 'files', 'workingDirectory:', workingDirectory, 'maxResults:', maxResults);

    // Placeholder implementation
    return [
      {
        file: 'example.ts',
        line: 42,
        match: `Example match for pattern: ${pattern}`,
      },
    ];
  } catch (error: any) {
    throw new Error(`Failed to search similar code: ${error.message}`);
  }
}

/**
 * Get documentation for a function or library
 */
export async function getDocumentation(params: {
  query: string;
  language?: string;
  source?: 'mdn' | 'devdocs' | 'local';
}): Promise<{ title: string; summary: string; url?: string }> {
  const { query, language, source = 'devdocs' } = params;

  try {
    console.log('[getDocumentation] Searching docs for:', query, 'language:', language, 'source:', source);

    // Placeholder - would fetch from actual sources
    return {
      title: query,
      summary: `Documentation for ${query} not yet implemented. Would fetch from ${source}.`,
      url: `https://devdocs.io/${language || 'javascript'}/${query}`,
    };
  } catch (error: any) {
    throw new Error(`Failed to get documentation: ${error.message}`);
  }
}

/**
 * Analyze imports in a file
 */
export async function analyzeImports(params: {
  filePath: string;
}): Promise<{ imports: string[]; exports: string[]; dependencies: string[] }> {
  const { filePath } = params;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const imports: string[] = [];
    const exports: string[] = [];
    const dependencies: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect imports
      if (trimmed.startsWith('import ')) {
        imports.push(line);

        // Extract package name
        const match = trimmed.match(/from ['"]([^'"]+)['"]/);
        if (match) {
          const pkg = match[1];
          if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
            dependencies.push(pkg.split('/')[0]); // Get package name without subpath
          }
        }
      }

      // Detect exports
      if (trimmed.startsWith('export ')) {
        exports.push(line);
      }
    }

    return {
      imports,
      exports,
      dependencies: [...new Set(dependencies)], // Remove duplicates
    };
  } catch (error: any) {
    throw new Error(`Failed to analyze imports: ${error.message}`);
  }
}

/**
 * Get type information for a symbol
 */
export async function getTypeInfo(params: {
  symbol: string;
  filePath: string;
}): Promise<{ symbol: string; type: string; definition: string }> {
  const { symbol, filePath } = params;

  try {
    // This would use TypeScript compiler API in production
    console.log('[getTypeInfo] Getting type for:', symbol, 'in', filePath);

    // Placeholder
    return {
      symbol,
      type: 'unknown',
      definition: `Type information for ${symbol} not yet implemented.`,
    };
  } catch (error: any) {
    throw new Error(`Failed to get type info: ${error.message}`);
  }
}

/**
 * Editor Tools Definition for MCP-style interface
 */
export const EDITOR_TOOLS = {
  get_file_context: {
    name: 'get_file_context',
    description: 'Get context about the current file including imports, types, and surrounding code',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string' as const,
          description: 'Path to the file',
        },
        cursorPosition: {
          type: 'number' as const,
          description: 'Cursor position in the file (character offset)',
        },
        includeImports: {
          type: 'boolean' as const,
          description: 'Include import statements',
        },
        includeTypes: {
          type: 'boolean' as const,
          description: 'Include type definitions',
        },
        linesBefore: {
          type: 'number' as const,
          description: 'Number of lines before cursor to include',
        },
        linesAfter: {
          type: 'number' as const,
          description: 'Number of lines after cursor to include',
        },
      },
      required: ['filePath', 'cursorPosition'],
    },
    handler: getFileContext,
  },

  search_similar_code: {
    name: 'search_similar_code',
    description: 'Search for similar code patterns in the project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string' as const,
          description: 'Code pattern to search for',
        },
        language: {
          type: 'string' as const,
          description: 'Programming language filter',
        },
        workingDirectory: {
          type: 'string' as const,
          description: 'Directory to search in',
        },
        maxResults: {
          type: 'number' as const,
          description: 'Maximum number of results to return',
        },
      },
      required: ['pattern'],
    },
    handler: searchSimilarCode,
  },

  get_documentation: {
    name: 'get_documentation',
    description: 'Get documentation for a function or library',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string' as const,
          description: 'Function name or library to search documentation for',
        },
        language: {
          type: 'string' as const,
          description: 'Programming language',
        },
        source: {
          type: 'string' as const,
          description: 'Documentation source (mdn, devdocs, local)',
          enum: ['mdn', 'devdocs', 'local'],
        },
      },
      required: ['query'],
    },
    handler: getDocumentation,
  },

  analyze_imports: {
    name: 'analyze_imports',
    description: 'Analyze imports and exports in a file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string' as const,
          description: 'Path to the file to analyze',
        },
      },
      required: ['filePath'],
    },
    handler: analyzeImports,
  },

  get_type_info: {
    name: 'get_type_info',
    description: 'Get type information for a symbol',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string' as const,
          description: 'Symbol name to get type for',
        },
        filePath: {
          type: 'string' as const,
          description: 'File path where the symbol is defined or used',
        },
      },
      required: ['symbol', 'filePath'],
    },
    handler: getTypeInfo,
  },
};
