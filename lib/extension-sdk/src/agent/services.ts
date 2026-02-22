/**
 * AgentGraphServices - Agent가 사용할 서비스 인터페이스
 *
 * Host App이 런타임에 실제 구현체를 주입합니다.
 * Extension은 이 인터페이스만 의존합니다.
 */

import type { Message, ToolCall } from '../types/message';
import type { ToolResult } from '../types/graph';
import type { LLMOptions, LLMResponse } from '../types/llm';
import type { Logger } from '../types/extension';

/**
 * Agent가 사용하는 LLM 서비스 인터페이스
 */
export interface AgentLLMService {
  /** LLM 스트리밍 호출 */
  streamChat(messages: Message[], options?: LLMOptions): AsyncGenerator<string>;
  /** LLM 동기 호출 */
  chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  /** LLM 클라이언트 직접 접근 (Main Process) */
  getLLMClient?(): any;
  /** Web LLM 클라이언트 직접 접근 (Renderer) */
  getWebLLMClient?(): any;
}

/**
 * Agent가 사용하는 스트리밍 서비스 인터페이스
 */
export interface AgentStreamingService {
  /** 스트리밍 청크 전송 */
  emitChunk(chunk: string, conversationId?: string): void;
  /** 중단 여부 확인 */
  isAborted(conversationId?: string): boolean;
}

/**
 * Agent가 사용하는 도구 서비스 인터페이스
 */
export interface AgentToolsService {
  /** 도구 사용 여부 판단 */
  shouldUseTool(state: any): 'tools' | 'end';
  /** 도구 실행 */
  executeTools(state: any): Promise<any>;
}

/**
 * Agent가 사용하는 MCP 서비스 인터페이스
 */
export interface AgentMCPService {
  /** Built-in MCP 도구 실행 */
  executeBuiltinTool(name: string, args: any): Promise<any>;
}

/**
 * Agent가 사용하는 언어 서비스 인터페이스
 */
export interface AgentLanguageService {
  /** 사용자 언어 가져오기 */
  getUserLanguage(): Promise<string>;
  /** 언어 지시문 가져오기 */
  getLanguageInstruction(lang: string): string;
}

/**
 * Agent가 사용하는 Skills 서비스 인터페이스
 */
export interface AgentSkillsService {
  /** Skills 주입 */
  injectSkills(content: string, conversationId: string): Promise<Message[]>;
}

/**
 * AgentGraphServices - Agent가 사용할 모든 서비스의 통합 인터페이스
 *
 * Host App이 `setServices()`로 주입합니다.
 */
export interface AgentGraphServices {
  llm: AgentLLMService;
  streaming: AgentStreamingService;
  tools: AgentToolsService;
  mcp?: AgentMCPService;
  language: AgentLanguageService;
  skills?: AgentSkillsService;
  logger: Logger;
}
