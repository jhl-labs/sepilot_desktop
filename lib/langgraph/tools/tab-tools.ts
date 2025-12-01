/**
 * Tab Management Tools for Editor Agent
 *
 * Agent가 Editor의 탭을 제어할 수 있는 Tool들
 * Note: 이 도구들은 Renderer Process의 Zustand store와 상호작용하므로,
 * Main Process가 아닌 Renderer Process에서 실행되어야 합니다.
 */

import type { EditorTool } from './editor-tools-registry';

/**
 * Tool: 열린 탭 목록 조회
 */
const listOpenTabsTool: EditorTool = {
  name: 'list_open_tabs',
  category: 'tab',
  description: '현재 열려 있는 모든 탭의 목록을 조회합니다',
  icon: '📑',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (_args, _state) => {
    // Renderer Process에서만 실행 (Zustand store 접근)
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'list_open_tabs can only be executed in Renderer Process',
      };
    }

    try {
      // Dynamic import to get Zustand store
      const { useChatStore } = await import('@/lib/store/chat-store');
      const storeState = useChatStore.getState();

      const tabs = storeState.openFiles.map((file) => ({
        path: file.path,
        language: file.language,
        isDirty: file.isDirty,
        isActive: file.path === storeState.activeFilePath,
      }));

      return {
        success: true,
        tabs,
        count: tabs.length,
        activeFilePath: storeState.activeFilePath,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to list open tabs',
      };
    }
  },
};

/**
 * Tool: 파일을 새 탭으로 열기
 */
const openTabTool: EditorTool = {
  name: 'open_tab',
  category: 'tab',
  description: '지정한 파일을 새 탭으로 열거나 기존 탭을 활성화합니다',
  icon: '📂',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '열 파일의 절대 경로',
      },
      cursorPosition: {
        type: 'number',
        description: '커서 위치 (선택사항)',
      },
    },
    required: ['filePath'],
  },
  execute: async (args, _state) => {
    const { filePath, cursorPosition } = args as { filePath: string; cursorPosition?: number };

    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'open_tab can only be executed in Renderer Process',
      };
    }

    try {
      // Read file content from Main Process
      if (!window.electronAPI?.fs) {
        return {
          success: false,
          error: 'Electron API not available',
        };
      }

      const fileResult = await window.electronAPI.fs.readFile(filePath);
      if (!fileResult.success || !fileResult.data) {
        return {
          success: false,
          error: fileResult.error || 'Failed to read file',
        };
      }

      // Detect language from file extension
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        md: 'markdown',
        json: 'json',
        html: 'html',
        css: 'css',
        txt: 'plaintext',
      };
      const language = languageMap[ext] || 'plaintext';

      // Open file in editor
      const { useChatStore } = await import('@/lib/store/chat-store');
      const { openFile } = useChatStore.getState();

      const filename = filePath.split('/').pop() || filePath;

      openFile({
        path: filePath,
        filename,
        content: fileResult.data,
        language,
        initialPosition: cursorPosition ? { lineNumber: cursorPosition, column: 0 } : undefined,
      });

      return {
        success: true,
        filePath,
        language,
        opened: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to open tab',
      };
    }
  },
};

/**
 * Tool: 탭 닫기
 */
const closeTabTool: EditorTool = {
  name: 'close_tab',
  category: 'tab',
  description: '지정한 파일의 탭을 닫습니다',
  icon: '✖️',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '닫을 탭의 파일 경로',
      },
    },
    required: ['filePath'],
  },
  execute: async (args, _state) => {
    const { filePath } = args as { filePath: string };

    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'close_tab can only be executed in Renderer Process',
      };
    }

    try {
      const { useChatStore } = await import('@/lib/store/chat-store');
      const { closeFile, openFiles } = useChatStore.getState();

      // Check if tab exists
      const tabExists = openFiles.some((f) => f.path === filePath);
      if (!tabExists) {
        return {
          success: false,
          error: `Tab not found: ${filePath}`,
        };
      }

      closeFile(filePath);

      return {
        success: true,
        filePath,
        closed: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to close tab',
      };
    }
  },
};

/**
 * Tool: 다른 탭으로 전환
 */
const switchTabTool: EditorTool = {
  name: 'switch_tab',
  category: 'tab',
  description: '지정한 파일의 탭으로 전환합니다',
  icon: '🔄',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '전환할 탭의 파일 경로',
      },
    },
    required: ['filePath'],
  },
  execute: async (args, _state) => {
    const { filePath } = args as { filePath: string };

    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'switch_tab can only be executed in Renderer Process',
      };
    }

    try {
      const { useChatStore } = await import('@/lib/store/chat-store');
      const { setActiveFile, openFiles } = useChatStore.getState();

      // Check if tab exists
      const tabExists = openFiles.some((f) => f.path === filePath);
      if (!tabExists) {
        return {
          success: false,
          error: `Tab not found: ${filePath}`,
        };
      }

      setActiveFile(filePath);

      return {
        success: true,
        filePath,
        switched: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to switch tab',
      };
    }
  },
};

/**
 * Tool: 현재 활성화된 파일 정보 조회
 */
const getActiveFileTool: EditorTool = {
  name: 'get_active_file',
  category: 'tab',
  description: '현재 활성화된 파일의 경로와 내용을 조회합니다',
  icon: '📄',
  parameters: {
    type: 'object',
    properties: {
      includeContent: {
        type: 'boolean',
        description: '파일 내용 포함 여부 (기본값: false)',
      },
    },
    required: [],
  },
  execute: async (args, _state) => {
    const { includeContent = false } = args as { includeContent?: boolean };

    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'get_active_file can only be executed in Renderer Process',
      };
    }

    try {
      const { useChatStore } = await import('@/lib/store/chat-store');
      const { activeFilePath, openFiles } = useChatStore.getState();

      if (!activeFilePath) {
        return {
          success: true,
          activeFile: null,
          message: 'No file is currently active',
        };
      }

      const activeFile = openFiles.find((f) => f.path === activeFilePath);
      if (!activeFile) {
        return {
          success: false,
          error: 'Active file not found in open files',
        };
      }

      return {
        success: true,
        activeFile: {
          path: activeFile.path,
          language: activeFile.language,
          isDirty: activeFile.isDirty,
          ...(includeContent && { content: activeFile.content }),
          lines: activeFile.content.split('\n').length,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get active file',
      };
    }
  },
};

/**
 * 모든 탭 관리 Tools 내보내기
 */
export const tabTools: EditorTool[] = [
  listOpenTabsTool,
  openTabTool,
  closeTabTool,
  switchTabTool,
  getActiveFileTool,
];

/**
 * Registry에 탭 Tools 등록
 */
export function registerTabTools(registry: any): void {
  tabTools.forEach((tool) => registry.register(tool));
  console.log(`[TabTools] Registered ${tabTools.length} tab management tools`);
}
