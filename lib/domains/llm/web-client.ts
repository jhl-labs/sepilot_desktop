import { logger } from '@/lib/utils/logger';
import { httpFetchStream } from '@/lib/http';
/**
 * 웹 브라우저 환경에서 사용할 LLM 클라이언트
 * OpenAI Compatible API를 호출
 *
 * httpFetchStream을 사용하여 NetworkConfig (프록시, SSL, 커스텀 헤더)가 자동 적용됩니다.
 */

import { LLMConfig } from '@/types';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * 웹 환경용 LLM 클라이언트
 */
export class WebLLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * API URL 가져오기
   */
  private getAPIURL(): string {
    if (this.config.baseURL) {
      return `${this.config.baseURL}/chat/completions`;
    }

    switch (this.config.provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      case 'ollama':
        return 'http://localhost:11434/v1/chat/completions';
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * 스트리밍 응답 생성
   */
  async *stream(messages: Message[]): AsyncGenerator<StreamChunk> {
    const url = this.getAPIURL();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Auth headers
    if (this.config.provider === 'anthropic') {
      headers['x-api-key'] = this.config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Custom headers - Moved to NetworkConfig
    // customHeaders is now managed in NetworkConfig, not LLMConfig

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2000,
      stream: true,
    };

    try {
      const response = await httpFetchStream(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        networkConfig: this.config.network,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { content: '', done: true };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') {
            continue;
          }

          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();

            // Skip empty or non-JSON content
            if (!jsonStr || !jsonStr.startsWith('{')) {
              if (jsonStr && jsonStr !== '{}') {
                logger.warn(
                  '[WebLLMClient] Skipping non-JSON SSE data:',
                  jsonStr.substring(0, 100)
                );
              }
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);

              if (this.config.provider === 'anthropic') {
                // Anthropic 응답 처리
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  yield { content: data.delta.text, done: false };
                }
              } else {
                // OpenAI Compatible 응답 처리
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  yield { content, done: false };
                }
              }
            } catch (error) {
              // Log error but continue streaming
              logger.warn('[WebLLMClient] Failed to parse SSE data (continuing):', {
                error: error instanceof Error ? error.message : String(error),
                rawData: jsonStr.substring(0, 200),
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Stream error:', error);
      throw error;
    }
  }

  /**
   * 단일 응답 생성 (non-streaming)
   */
  async generate(messages: Message[]): Promise<string> {
    let result = '';
    for await (const chunk of this.stream(messages)) {
      if (!chunk.done) {
        result += chunk.content;
      }
    }
    return result;
  }
}

/**
 * 웹 환경용 LLM 클라이언트 싱글톤 인스턴스
 */
let webLLMClient: WebLLMClient | null = null;

/**
 * 웹 LLM 클라이언트 가져오기
 */
export function getWebLLMClient(): WebLLMClient {
  if (!webLLMClient) {
    // 기본 설정으로 초기화 (나중에 설정으로 덮어쓸 수 있음)
    webLLMClient = new WebLLMClient({
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
    });
  }
  return webLLMClient;
}

/**
 * 웹 LLM 클라이언트 설정
 */
export function configureWebLLMClient(config: LLMConfig): void {
  webLLMClient = new WebLLMClient(config);
}
