/**
 * Browser Agent 실행 과정 가시성을 위한 타입 정의
 */

export type BrowserAgentLogLevel = 'info' | 'success' | 'warning' | 'error' | 'thinking';

/**
 * Browser Agent LLM 설정
 */
export interface BrowserAgentLLMConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
  maxIterations: number;
}

/**
 * Browser 채팅 폰트 설정
 */
export interface BrowserChatFontConfig {
  fontFamily: string;
  fontSize: number; // px 단위
}

export interface BrowserAgentLogEntry {
  id: string;
  timestamp: number;
  level: BrowserAgentLogLevel;
  phase: 'thinking' | 'tool_call' | 'tool_result' | 'decision' | 'completion' | 'error';
  message: string;
  details?: {
    // Thinking phase
    reasoning?: string;

    // Tool call phase
    toolName?: string;
    toolArgs?: Record<string, any>;

    // Tool result phase
    toolResult?: string;
    toolError?: string;

    // Decision phase
    decision?: 'continue' | 'end';
    nextAction?: string;

    // Iteration info
    iteration?: number;
    maxIterations?: number;
  };
}

export interface BrowserAgentState {
  isRunning: boolean;
  currentIteration: number;
  maxIterations: number;
  logs: BrowserAgentLogEntry[];
}
