/**
 * LLM 관련 타입 정의
 *
 * Extension에서 사용하는 LLM 호출 옵션, 응답, 도구 정의 타입
 */

/**
 * LLM 호출 옵션
 */
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  stop?: string[];
  stream?: boolean;
  model?: string;
}

/**
 * LLM 도구 정의
 */
export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * LLM 응답
 */
export interface LLMResponse {
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/**
 * 스트리밍 청크
 */
export interface StreamChunk {
  content?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string; // JSON string (partial)
  }>;
  finishReason?: string;
}
