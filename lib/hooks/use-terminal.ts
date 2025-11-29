/**
 * Terminal Hook
 *
 * Terminal IPC 통신을 위한 React Hook
 */

import { useEffect, useCallback, useRef } from 'react';

export interface TerminalSession {
  sessionId: string;
  cwd: string;
  shell: string;
}

export interface UseTerminalReturn {
  createSession: (cwd?: string, cols?: number, rows?: number) => Promise<TerminalSession | null>;
  write: (sessionId: string, data: string) => Promise<boolean>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
  killSession: (sessionId: string) => Promise<boolean>;
  getSessions: () => Promise<TerminalSession[]>;
}

export interface UseTerminalOptions {
  onData?: (data: { sessionId: string; data: string }) => void;
  onExit?: (data: { sessionId: string; exitCode: number; signal?: number }) => void;
}

/**
 * Terminal IPC Hook
 *
 * @param options - 터미널 이벤트 핸들러
 * @returns Terminal API 함수들
 */
export function useTerminal(options?: UseTerminalOptions): UseTerminalReturn {
  const onDataRef = useRef(options?.onData);
  const onExitRef = useRef(options?.onExit);

  // Ref 업데이트
  useEffect(() => {
    onDataRef.current = options?.onData;
  }, [options?.onData]);

  useEffect(() => {
    onExitRef.current = options?.onExit;
  }, [options?.onExit]);

  // IPC 이벤트 리스너 등록
  useEffect(() => {
    const handleData = (data: { sessionId: string; data: string }) => {
      onDataRef.current?.(data);
    };

    const handleExit = (data: { sessionId: string; exitCode: number; signal?: number }) => {
      onExitRef.current?.(data);
    };

    const dataHandler = window.electronAPI.terminal.onData(handleData);
    const exitHandler = window.electronAPI.terminal.onExit(handleExit);

    return () => {
      window.electronAPI.terminal.removeListener('terminal:data', dataHandler);
      window.electronAPI.terminal.removeListener('terminal:exit', exitHandler);
    };
  }, []);

  // 세션 생성
  const createSession = useCallback(async (cwd?: string, cols?: number, rows?: number): Promise<TerminalSession | null> => {
    try {
      const response = await window.electronAPI.terminal.createSession(cwd, cols, rows);

      if (response.success && response.data) {
        return response.data;
      } else {
        console.error('[Terminal] Failed to create session:', response.error);
        return null;
      }
    } catch (error) {
      console.error('[Terminal] Error creating session:', error);
      return null;
    }
  }, []);

  // 데이터 쓰기
  const write = useCallback(async (sessionId: string, data: string): Promise<boolean> => {
    try {
      const response = await window.electronAPI.terminal.write(sessionId, data);
      return response.success;
    } catch (error) {
      console.error('[Terminal] Error writing data:', error);
      return false;
    }
  }, []);

  // 리사이즈
  const resize = useCallback(async (sessionId: string, cols: number, rows: number): Promise<boolean> => {
    try {
      const response = await window.electronAPI.terminal.resize(sessionId, cols, rows);
      return response.success;
    } catch (error) {
      console.error('[Terminal] Error resizing terminal:', error);
      return false;
    }
  }, []);

  // 세션 종료
  const killSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await window.electronAPI.terminal.killSession(sessionId);
      return response.success;
    } catch (error) {
      console.error('[Terminal] Error killing session:', error);
      return false;
    }
  }, []);

  // 세션 목록 조회
  const getSessions = useCallback(async (): Promise<TerminalSession[]> => {
    try {
      const response = await window.electronAPI.terminal.getSessions();

      if (response.success && response.data) {
        return response.data;
      } else {
        console.error('[Terminal] Failed to get sessions:', response.error);
        return [];
      }
    } catch (error) {
      console.error('[Terminal] Error getting sessions:', error);
      return [];
    }
  }, []);

  return {
    createSession,
    write,
    resize,
    killSession,
    getSessions,
  };
}
