/**
 * Terminal Extension - Zustand Store Slice
 */

import type {
  TerminalBlock,
  TerminalAgentLog,
  TerminalStoreState,
  TerminalStoreActions,
} from '../types';

/**
 * Terminal Extension 초기 상태
 */
export const initialTerminalState: TerminalStoreState = {
  // 블록 관리
  terminalBlocks: [],
  activeBlockId: null,

  // 세션 관리
  terminalSessionId: null,
  currentCwd: '',
  currentShell: '',

  // AI 상태
  terminalAgentIsRunning: false,
  terminalAgentLogs: [],

  // UI 상태
  terminalViewMode: 'blocks',
  showAISuggestions: true,
  showHistory: false,

  // 설정
  enableAutoAnalysis: true,
  maxHistoryBlocks: 100,
};

/**
 * Terminal Store Slice 생성 함수
 *
 * 메인 앱의 chat-store.ts에서 이 함수를 호출하여
 * extension의 상태와 액션을 통합합니다.
 */
export function createTerminalSlice(
  set: (
    partial:
      | Partial<TerminalStoreState>
      | ((state: TerminalStoreState) => Partial<TerminalStoreState>)
  ) => void,
  get: () => TerminalStoreState
): TerminalStoreState & TerminalStoreActions {
  return {
    // 초기 상태
    ...initialTerminalState,

    // 블록 관리 액션
    addTerminalBlock: (block) => {
      const id = crypto.randomUUID();
      const newBlock: TerminalBlock = {
        ...block,
        id,
        timestamp: Date.now(),
      };

      set((state) => {
        const blocks = [...state.terminalBlocks, newBlock];

        // maxHistoryBlocks 제한 적용
        const limitedBlocks =
          blocks.length > state.maxHistoryBlocks
            ? blocks.slice(blocks.length - state.maxHistoryBlocks)
            : blocks;

        return {
          terminalBlocks: limitedBlocks,
          activeBlockId: id,
        };
      });

      return id;
    },

    updateTerminalBlock: (id, updates) => {
      set((state) => ({
        terminalBlocks: state.terminalBlocks.map((block) =>
          block.id === id ? { ...block, ...updates } : block
        ),
      }));
    },

    removeTerminalBlock: (id) => {
      set((state) => {
        const blocks = state.terminalBlocks.filter((block) => block.id !== id);
        const activeId = state.activeBlockId === id ? null : state.activeBlockId;
        return {
          terminalBlocks: blocks,
          activeBlockId: activeId,
        };
      });
    },

    clearTerminalBlocks: () => {
      set({
        terminalBlocks: [],
        activeBlockId: null,
      });
    },

    getRecentTerminalBlocks: (limit) => {
      const state = get();
      const blocks = state.terminalBlocks;
      return blocks.slice(-limit);
    },

    // 세션 관리 액션
    setTerminalSessionId: (sessionId) => {
      set({ terminalSessionId: sessionId });
    },

    setCurrentCwd: (cwd) => {
      set({ currentCwd: cwd });
    },

    setCurrentShell: (shell) => {
      set({ currentShell: shell });
    },

    // Agent 제어 액션
    setTerminalAgentIsRunning: (isRunning) => {
      set({ terminalAgentIsRunning: isRunning });
    },

    addTerminalAgentLog: (log) => {
      const newLog: TerminalAgentLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      set((state) => ({
        terminalAgentLogs: [...state.terminalAgentLogs, newLog],
      }));
    },

    clearTerminalAgentLogs: () => {
      set({ terminalAgentLogs: [] });
    },

    // UI 액션
    setTerminalViewMode: (mode) => {
      set({ terminalViewMode: mode });
    },

    toggleAISuggestions: () => {
      set((state) => ({
        showAISuggestions: !state.showAISuggestions,
      }));
    },

    toggleHistory: () => {
      set((state) => ({
        showHistory: !state.showHistory,
      }));
    },

    setEnableAutoAnalysis: (enable) => {
      set({ enableAutoAnalysis: enable });
    },
  };
}

// 타입 재내보내기
export type {
  TerminalBlock,
  TerminalAgentLog,
  TerminalStoreState,
  TerminalStoreActions,
} from '../types';
