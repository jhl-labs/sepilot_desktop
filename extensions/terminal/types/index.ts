/**
 * Terminal Extension Types
 */

import type { Message } from '@/types';

/**
 * Terminal Block - 각 명령어 실행을 블록 단위로 관리
 */
export interface TerminalBlock {
  id: string;
  type: 'command' | 'ai-suggestion' | 'error';
  timestamp: number;

  // 입력
  naturalInput?: string; // 사용자가 입력한 자연어
  command: string; // 실제 실행된 명령어
  aiGenerated: boolean; // AI가 생성한 명령어인지

  // 출력
  output: string; // 명령어 실행 결과
  exitCode?: number; // 종료 코드
  isRunning?: boolean; // 명령어 실행 중 여부

  // AI 분석
  aiAnalysis?: {
    summary: string; // 실행 결과 요약
    suggestions: string[]; // 다음 작업 제안
    error?: {
      message: string;
      cause: string;
      solutions: string[];
    };
  };

  // 메타데이터
  cwd: string; // 작업 디렉토리
  sessionId: string; // PTY 세션 ID
  duration?: number; // 실행 시간(ms)
}

/**
 * Terminal Agent Log
 */
export interface TerminalAgentLog {
  id: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
}

/**
 * Terminal Agent State (LangGraph용)
 */
export interface TerminalAgentState {
  messages: Message[];
  conversationId: string;
  toolCalls?: any[];
  toolResults?: any[];

  // Terminal 특화 필드
  recentBlocks?: TerminalBlock[]; // 최근 명령어 블록 (컨텍스트)
  currentCwd?: string; // 현재 작업 디렉토리
  currentShell?: string; // 현재 셸
  platform?: string; // 플랫폼 (linux, darwin, win32)
  environmentVars?: Record<string, string>; // 환경 변수

  // RAG
  ragDocuments?: any[];
  useRag?: boolean;
}

/**
 * Terminal Store State
 */
export interface TerminalStoreState {
  // 블록 관리
  terminalBlocks: TerminalBlock[];
  activeBlockId: string | null;

  // 세션 관리
  terminalSessionId: string | null;
  currentCwd: string;
  currentShell: string;

  // AI 상태
  terminalAgentIsRunning: boolean;
  terminalAgentLogs: TerminalAgentLog[];

  // UI 상태
  terminalViewMode: 'blocks' | 'traditional'; // 블록 모드 vs 전통적 터미널
  showAISuggestions: boolean;
  showHistory: boolean;

  // 설정
  enableAutoAnalysis: boolean; // 에러 자동 분석
  maxHistoryBlocks: number;
}

/**
 * Terminal Store Actions
 */
export interface TerminalStoreActions {
  // 블록 관리
  addTerminalBlock: (block: Omit<TerminalBlock, 'id' | 'timestamp'>) => string;
  updateTerminalBlock: (id: string, updates: Partial<TerminalBlock>) => void;
  removeTerminalBlock: (id: string) => void;
  clearTerminalBlocks: () => void;
  getRecentTerminalBlocks: (limit: number) => TerminalBlock[];
  loadTerminalHistoryFromStorage: () => void;

  // 세션 관리
  setTerminalSessionId: (sessionId: string) => void;
  setCurrentCwd: (cwd: string) => void;
  setCurrentShell: (shell: string) => void;

  // Agent 제어
  setTerminalAgentIsRunning: (isRunning: boolean) => void;
  addTerminalAgentLog: (log: Omit<TerminalAgentLog, 'id' | 'timestamp'>) => void;
  clearTerminalAgentLogs: () => void;

  // UI
  setTerminalViewMode: (mode: 'blocks' | 'traditional') => void;
  toggleAISuggestions: () => void;
  toggleHistory: () => void;
  setEnableAutoAnalysis: (enable: boolean) => void;
  setMaxHistoryBlocks: (max: number) => void;
}

/**
 * Tool 실행 결과
 */
export interface ToolExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  duration?: number;
  error?: string;
}
