/**
 * Editor Tools Registry
 *
 * 중앙화된 Tool 관리 시스템
 * - Tool 정의, 등록, 조회
 * - Category별 분류
 * - 메타데이터 관리 (이름, 설명, 아이콘)
 */

import type { EditorAgentState } from '../graphs/editor-agent';

/**
 * Tool Category
 */
export type ToolCategory = 'file' | 'tab' | 'terminal' | 'git' | 'code' | 'rag';

/**
 * Tool 정의 인터페이스
 */
export interface EditorTool {
  /** Tool 이름 (고유 식별자) */
  name: string;

  /** Tool 카테고리 */
  category: ToolCategory;

  /** Tool 설명 (사용자에게 표시) */
  description: string;

  /** UI 표시용 아이콘 (emoji) */
  icon: string;

  /** OpenAI Function Calling 포맷의 파라미터 스키마 */
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };

  /** Tool 실행 함수 */
  execute: (args: Record<string, unknown>, state: EditorAgentState) => Promise<any>;

  /** 위험한 Tool 여부 (실행 전 승인 필요) */
  dangerous?: boolean;
}

/**
 * Tool Category 메타데이터
 */
export interface CategoryMeta {
  id: ToolCategory;
  label: string;
  icon: string;
  description: string;
}

/**
 * Tool Registry
 */
class EditorToolsRegistry {
  private tools: Map<string, EditorTool> = new Map();

  /**
   * Tool 등록
   */
  register(tool: EditorTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool already exists: ${tool.name}, overwriting...`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name} (${tool.category})`);
  }

  /**
   * 여러 Tool 일괄 등록
   */
  registerAll(tools: EditorTool[]): void {
    tools.forEach((tool) => this.register(tool));
  }

  /**
   * Tool 조회
   */
  get(name: string): EditorTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 모든 Tool 조회
   */
  getAll(): EditorTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Category별 Tool 조회
   */
  getByCategory(category: ToolCategory): EditorTool[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  /**
   * OpenAI Function Calling 포맷으로 변환
   */
  toOpenAIFormat(toolNames?: string[]): any[] {
    const tools = toolNames
      ? toolNames.map((name) => this.get(name)).filter((t): t is EditorTool => !!t)
      : this.getAll();

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Tool 실행
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    state: EditorAgentState
  ): Promise<any> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    console.log(`[ToolRegistry] Executing tool: ${name}`);
    return tool.execute(args, state);
  }

  /**
   * Tool이 위험한지 확인
   */
  isDangerous(name: string): boolean {
    const tool = this.get(name);
    return tool?.dangerous || false;
  }

  /**
   * Registry 초기화 (테스트용)
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Category 메타데이터
 */
export const CATEGORY_META: Record<ToolCategory, CategoryMeta> = {
  file: {
    id: 'file',
    label: '파일 관리',
    icon: '📂',
    description: '파일 읽기, 쓰기, 수정, 삭제, 검색',
  },
  tab: {
    id: 'tab',
    label: '탭 제어',
    icon: '📑',
    description: '탭 열기, 닫기, 전환, 목록 조회',
  },
  terminal: {
    id: 'terminal',
    label: '터미널',
    icon: '💻',
    description: '터미널 명령 실행 및 출력 조회',
  },
  git: {
    id: 'git',
    label: 'Git',
    icon: '🔀',
    description: 'Git 상태, diff, log 확인',
  },
  code: {
    id: 'code',
    label: '코드 분석',
    icon: '🔍',
    description: '코드 컨텍스트, 정의, 참조 찾기',
  },
  rag: {
    id: 'rag',
    label: 'RAG 검색',
    icon: '🧠',
    description: '벡터 DB에서 관련 문서 검색',
  },
};

/**
 * Singleton instance
 */
export const editorToolsRegistry = new EditorToolsRegistry();

/**
 * Helper: 모든 카테고리 가져오기
 */
export function getAllCategories(): CategoryMeta[] {
  return Object.values(CATEGORY_META);
}

/**
 * Helper: 카테고리별 Tool 개수
 */
export function getToolCountByCategory(): Record<ToolCategory, number> {
  const counts: Record<ToolCategory, number> = {
    file: 0,
    tab: 0,
    terminal: 0,
    git: 0,
    code: 0,
    rag: 0,
  };

  editorToolsRegistry.getAll().forEach((tool) => {
    counts[tool.category]++;
  });

  return counts;
}
