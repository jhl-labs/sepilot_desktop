/**
 * Terminal Session Management (Store Extension)
 *
 * 기존 terminal store에 다중 세션 기능 추가
 */

import type { TerminalSession } from '../types/sessions';
import type { TerminalBlock } from '../types';

/**
 * 세션 관리 State
 */
export interface SessionStoreState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
}

/**
 * 세션 관리 State 초기값
 */
export const initialSessionState: SessionStoreState = {
  sessions: [],
  activeSessionId: null,
};

/**
 * 세션 관리 액션 생성
 */
export function createSessionActions(
  set: (partial: any | ((state: any) => any)) => void,
  get: () => any,
  autoSave: (blocks: TerminalBlock[]) => void
) {
  return {
    /**
     * 새 터미널 세션 생성
     */
    createTerminalSession: (
      session: Omit<TerminalSession, 'id' | 'createdAt' | 'lastActiveAt'>
    ): string => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const newSession: TerminalSession = {
        ...session,
        id,
        createdAt: now,
        lastActiveAt: now,
      };

      set((state: any) => ({
        sessions: [...state.sessions, newSession],
        activeSessionId: id,
        // 레거시 필드 동기화 (하위 호환성)
        terminalSessionId: newSession.ptySessionId,
        currentCwd: newSession.cwd,
        currentShell: newSession.shell,
      }));

      return id;
    },

    /**
     * 세션 정보 업데이트
     */
    updateTerminalSession: (id: string, updates: Partial<TerminalSession>): void => {
      set((state: any) => {
        const updatedSessions = state.sessions.map((session: TerminalSession) =>
          session.id === id ? { ...session, ...updates, lastActiveAt: Date.now() } : session
        );

        // 활성 세션 업데이트 시 레거시 필드 동기화
        if (state.activeSessionId === id) {
          const activeSession = updatedSessions.find((s: TerminalSession) => s.id === id);
          return {
            sessions: updatedSessions,
            terminalSessionId: activeSession?.ptySessionId,
            currentCwd: activeSession?.cwd || state.currentCwd,
            currentShell: activeSession?.shell || state.currentShell,
          };
        }

        return {
          sessions: updatedSessions,
        };
      });
    },

    /**
     * 세션 삭제
     */
    removeTerminalSession: (id: string): void => {
      set((state: any) => {
        const sessions = state.sessions.filter((session: TerminalSession) => session.id !== id);
        const wasActive = state.activeSessionId === id;

        // 활성 세션이 삭제되면 다른 세션 활성화
        const newActiveSessionId = wasActive
          ? sessions.length > 0
            ? sessions[sessions.length - 1].id
            : null
          : state.activeSessionId;

        const newActiveSession =
          sessions.find((s: TerminalSession) => s.id === newActiveSessionId) || null;

        // 해당 세션의 블록들도 삭제
        const blocks = state.terminalBlocks.filter(
          (block: TerminalBlock) => block.sessionId !== id
        );
        autoSave(blocks);

        return {
          sessions,
          activeSessionId: newActiveSessionId,
          terminalBlocks: blocks,
          // 레거시 필드 동기화
          terminalSessionId: newActiveSession?.ptySessionId || null,
          currentCwd: newActiveSession?.cwd || '',
          currentShell: newActiveSession?.shell || '',
        };
      });
    },

    /**
     * 활성 세션 변경
     */
    setActiveTerminalSession: (id: string): void => {
      set((state: any) => {
        const activeSession = state.sessions.find((s: TerminalSession) => s.id === id);
        if (!activeSession) {
          return {};
        }

        // 세션 활동 시각 업데이트
        const updatedSessions = state.sessions.map((session: TerminalSession) =>
          session.id === id ? { ...session, lastActiveAt: Date.now() } : session
        );

        return {
          activeSessionId: id,
          sessions: updatedSessions,
          // 레거시 필드 동기화
          terminalSessionId: activeSession.ptySessionId,
          currentCwd: activeSession.cwd,
          currentShell: activeSession.shell,
        };
      });
    },

    /**
     * 현재 활성 세션 조회
     */
    getActiveTerminalSession: (): TerminalSession | null => {
      const state = get();
      return state.sessions.find((s: TerminalSession) => s.id === state.activeSessionId) || null;
    },

    /**
     * 특정 세션의 블록들만 조회
     */
    getSessionBlocks: (sessionId: string): TerminalBlock[] => {
      const state = get();
      return state.terminalBlocks.filter((block: TerminalBlock) => block.sessionId === sessionId);
    },
  };
}
