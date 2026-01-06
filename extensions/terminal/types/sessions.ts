/**
 * Terminal Session Types
 */

/**
 * Terminal Session - PTY 세션 메타데이터
 */
export interface TerminalSession {
  id: string; // 세션 고유 ID
  name: string; // 사용자 정의 이름 (예: "Main", "Server", "Build")
  ptySessionId: string; // PTY Manager의 실제 세션 ID
  cwd: string; // 현재 작업 디렉토리
  shell: string; // 셸 (bash, zsh, powershell 등)
  createdAt: number; // 생성 시각
  lastActiveAt: number; // 마지막 활동 시각
  environmentVars?: Record<string, string>; // 세션별 환경 변수
}

/**
 * 세션 관리 액션 (Store Actions에 추가될 메서드)
 */
export interface TerminalSessionActions {
  // 다중 세션 관리
  createTerminalSession: (
    session: Omit<TerminalSession, 'id' | 'createdAt' | 'lastActiveAt'>
  ) => string;
  updateTerminalSession: (id: string, updates: Partial<TerminalSession>) => void;
  removeTerminalSession: (id: string) => void;
  setActiveTerminalSession: (id: string) => void;
  getActiveTerminalSession: () => TerminalSession | null;
  getSessionBlocks: (sessionId: string) => any[];
}
