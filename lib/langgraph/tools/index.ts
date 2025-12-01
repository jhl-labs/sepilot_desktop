/**
 * Editor Tools Entry Point
 *
 * 모든 Tool을 등록하고 초기화
 */

import { editorToolsRegistry } from './editor-tools-registry';
import { registerFileTools } from './file-tools';

/**
 * 모든 Tool 등록
 */
export function registerAllEditorTools(): void {
  console.log('[EditorTools] Registering all tools...');

  // Phase 2: 파일 관리 Tools 등록
  registerFileTools(editorToolsRegistry);

  // TODO: Phase 3에서 탭 제어 Tools 등록
  // import { registerTabTools } from './tab-tools';
  // registerTabTools(editorToolsRegistry);

  // TODO: Phase 4에서 터미널 & Git Tools 등록
  // import { registerTerminalTools } from './terminal-tools';
  // import { registerGitTools } from './git-tools';
  // registerTerminalTools(editorToolsRegistry);
  // registerGitTools(editorToolsRegistry);

  // TODO: Phase 5에서 코드 분석 Tools 등록
  // import { registerCodeTools } from './code-tools';
  // registerCodeTools(editorToolsRegistry);

  // Placeholder: RAG Tool은 이미 editor-agent.ts에 구현되어 있음
  editorToolsRegistry.register({
    name: 'search_documents',
    category: 'rag',
    description: '벡터 DB에서 관련 문서를 검색합니다 (자동으로 실행됨)',
    icon: '🧠',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색 쿼리',
        },
        limit: {
          type: 'number',
          description: '검색 결과 개수 (기본값: 3)',
        },
      },
      required: ['query'],
    },
    execute: async () => {
      // RAG는 editor-agent.ts에서 자동으로 실행
      return { message: 'RAG search is executed automatically' };
    },
  });

  console.log(`[EditorTools] Registered ${editorToolsRegistry.getAll().length} tools`);
}

// Export registry
export { editorToolsRegistry } from './editor-tools-registry';
export type { EditorTool, ToolCategory, CategoryMeta } from './editor-tools-registry';
export { getAllCategories, getToolCountByCategory } from './editor-tools-registry';
