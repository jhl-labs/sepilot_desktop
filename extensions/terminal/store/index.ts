/**
 * Terminal Extension - Zustand Store Slice
 */

import type {
  TerminalBlock,
  TerminalAgentLog,
  TerminalStoreState,
  TerminalStoreActions,
} from '../types';
import {
  loadTerminalHistory,
  saveTerminalHistory,
  clearTerminalHistory,
  createAutoSaveDebouncer,
} from './storage';
import {
  indexTerminalBlock,
  deleteTerminalBlockFromVectorDB,
  clearAllTerminalBlocksFromVectorDB,
} from './vectordb';
import { initialSessionState, createSessionActions } from './sessions';

// 자동 저장 디바운서 (1초 후 저장)
const autoSave = createAutoSaveDebouncer(1000);

/**
 * Terminal Extension 초기 상태
 */
export const initialTerminalState: TerminalStoreState & {
  sessions?: any[];
  activeSessionId?: string | null;
} = {
  // 블록 관리
  terminalBlocks: [],
  activeBlockId: null,

  // 다중 세션 (새로 추가)
  ...initialSessionState,

  // 세션 관리 (레거시 - 하위 호환성)
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

        // 자동 저장
        autoSave(limitedBlocks);

        // VectorDB 인덱싱 (백그라운드)
        indexTerminalBlock(newBlock).catch(() => {
          // VectorDB 인덱싱 실패는 무시 (블록 생성은 계속)
        });

        return {
          terminalBlocks: limitedBlocks,
          activeBlockId: id,
        };
      });

      return id;
    },

    updateTerminalBlock: (id, updates) => {
      set((state) => {
        const updatedBlocks = state.terminalBlocks.map((block) =>
          block.id === id ? { ...block, ...updates } : block
        );

        // 자동 저장
        autoSave(updatedBlocks);

        // VectorDB 재인덱싱 (백그라운드)
        const updatedBlock = updatedBlocks.find((block) => block.id === id);
        if (updatedBlock) {
          indexTerminalBlock(updatedBlock).catch(() => {
            // VectorDB 재인덱싱 실패는 무시
          });
        }

        return {
          terminalBlocks: updatedBlocks,
        };
      });
    },

    removeTerminalBlock: (id) => {
      set((state) => {
        const blocks = state.terminalBlocks.filter((block) => block.id !== id);
        const activeId = state.activeBlockId === id ? null : state.activeBlockId;

        // 자동 저장
        autoSave(blocks);

        // VectorDB에서 삭제 (백그라운드)
        deleteTerminalBlockFromVectorDB(id).catch(() => {
          // VectorDB 삭제 실패는 무시
        });

        return {
          terminalBlocks: blocks,
          activeBlockId: activeId,
        };
      });
    },

    clearTerminalBlocks: () => {
      // 스토리지 완전 삭제
      clearTerminalHistory();

      // VectorDB에서 모든 터미널 블록 삭제 (백그라운드)
      clearAllTerminalBlocksFromVectorDB().catch(() => {
        // VectorDB 삭제 실패는 무시
      });

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

    loadTerminalHistoryFromStorage: () => {
      const blocks = loadTerminalHistory();
      const state = get();

      // maxHistoryBlocks 제한 적용
      const limitedBlocks =
        blocks.length > state.maxHistoryBlocks
          ? blocks.slice(blocks.length - state.maxHistoryBlocks)
          : blocks;

      set({
        terminalBlocks: limitedBlocks,
      });
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

    setMaxHistoryBlocks: (max) => {
      set((state) => {
        const newMax = Math.max(10, Math.min(1000, max)); // 10-1000 범위로 제한
        const blocks = state.terminalBlocks;

        // 새 제한보다 많은 블록이 있으면 잘라냄
        const trimmedBlocks =
          blocks.length > newMax ? blocks.slice(blocks.length - newMax) : blocks;

        // 자동 저장
        autoSave(trimmedBlocks);

        return {
          maxHistoryBlocks: newMax,
          terminalBlocks: trimmedBlocks,
        };
      });
    },

    // 다중 세션 관리 액션
    ...createSessionActions(set, get, autoSave),
  };
}

// 타입 재내보내기
export type {
  TerminalBlock,
  TerminalAgentLog,
  TerminalStoreState,
  TerminalStoreActions,
} from '../types';
export type { TerminalSession } from '../types/sessions';
