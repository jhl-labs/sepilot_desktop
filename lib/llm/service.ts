import { Message, LLMConfig } from '@/types';
import { getLLMClient } from './client';
import { OpenAIProvider } from './providers/openai';

/**
 * Check if any message contains images
 */
function hasImages(messages: Message[]): boolean {
  return messages.some((msg) => msg.images && msg.images.length > 0);
}

/**
 * Get vision provider if vision config is available
 */
async function getVisionProvider(): Promise<OpenAIProvider | null> {
  // Load config from database (Electron) or localStorage (Web)
  let config: LLMConfig | null = null;

  if (typeof window !== 'undefined' && window.electronAPI) {
    const result = await window.electronAPI.config.load();
    if (result.success && result.data?.llm?.vision) {
      const visionConfig = result.data.llm.vision;

      // Only use vision model if it's enabled and configured
      if (visionConfig.enabled && visionConfig.model) {
        const baseURL = visionConfig.baseURL || result.data.llm.baseURL;
        const apiKey = visionConfig.apiKey || result.data.llm.apiKey || '';

        console.log('[LLMService] Vision provider config:', {
          baseURL,
          model: visionConfig.model,
          provider: visionConfig.provider,
        });

        // Always use OpenAI-compatible provider (supports Ollama's OpenAI-compatible API)
        return new OpenAIProvider(
          baseURL,
          apiKey,
          visionConfig.model,
          {
            temperature: result.data.llm.temperature,
            maxTokens: visionConfig.maxImageTokens || result.data.llm.maxTokens,
          },
          result.data.llm
        );
      }
    }
  } else if (typeof window !== 'undefined') {
    // Web environment: try localStorage
    const savedConfig = localStorage.getItem('sepilot_llm_config');
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
      if (parsedConfig.vision?.enabled && parsedConfig.vision?.model) {
        const visionConfig = parsedConfig.vision;
        const baseURL = visionConfig.baseURL || parsedConfig.baseURL;
        const apiKey = visionConfig.apiKey || parsedConfig.apiKey || '';

        return new OpenAIProvider(
          baseURL,
          apiKey,
          visionConfig.model,
          {
            temperature: parsedConfig.temperature,
            maxTokens: visionConfig.maxImageTokens || parsedConfig.maxTokens,
          },
          parsedConfig
        );
      }
    }
  }

  return null;
}

export class LLMService {
  /**
   * Send messages and get a streaming response
   */
  static async *streamChat(
    messages: Message[]
  ): AsyncGenerator<string> {
    // Electron 환경: IPC를 통해 메인 프로세스에서 API 호출 (CORS 문제 해결)
    if (typeof window !== 'undefined' && window.electronAPI?.llm) {
      const hasVisionContent = hasImages(messages);
      console.log('[LLMService] Starting Electron IPC stream, hasImages:', hasVisionContent);

      // Promise 기반 이벤트 큐 - 즉시 yield 가능
      const eventQueue: Array<{ type: 'chunk' | 'done' | 'error'; data?: string }> = [];
      let resolveNext: (() => void) | null = null;

      // 스트리밍 이벤트 핸들러 등록
      const chunkHandler = window.electronAPI.llm.onStreamChunk((chunk: string) => {
        // 로그 제거: 매 청크마다 찍으면 렉 발생
        eventQueue.push({ type: 'chunk', data: chunk });
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      });

      const doneHandler = window.electronAPI.llm.onStreamDone(() => {
        console.log('[LLMService] Stream done');
        eventQueue.push({ type: 'done' });
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      });

      const errorHandler = window.electronAPI.llm.onStreamError((error: string) => {
        console.error('[LLMService] Stream error:', error);
        eventQueue.push({ type: 'error', data: error });
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      });

      try {
        // IPC를 통해 스트리밍 시작 (Promise는 백그라운드에서 실행)
        const streamPromise = window.electronAPI.llm.streamChat(messages);

        // 이벤트가 도착할 때마다 즉시 처리 (IPC 호출과 동시에 실행)
        let streamDone = false;
        while (!streamDone) {
          // 큐가 비어있으면 대기
          if (eventQueue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }

          // 큐에서 이벤트 하나씩 처리
          while (eventQueue.length > 0) {
            const event = eventQueue.shift()!;

            if (event.type === 'chunk' && event.data) {
              yield event.data;
            } else if (event.type === 'error') {
              throw new Error(event.data || 'Stream error');
            } else if (event.type === 'done') {
              streamDone = true;
              break;
            }
          }
        }

        // 스트리밍 완료 후 결과 확인
        const result = await streamPromise;
        if (!result.success && result.error) {
          throw new Error(result.error);
        }
      } finally {
        // 이벤트 리스너 제거
        window.electronAPI.llm.removeStreamListener('llm-stream-chunk', chunkHandler);
        window.electronAPI.llm.removeStreamListener('llm-stream-done', doneHandler);
        window.electronAPI.llm.removeStreamListener('llm-stream-error', errorHandler);
      }

      return;
    }

    // 웹 환경 또는 Electron이 아닌 경우: 기존 로직 사용
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client is not configured. Please set up your API key in settings.');
    }

    const provider = client.getProvider();

    try {
      for await (const chunk of provider.stream(messages)) {
        if (!chunk.done && chunk.content) {
          yield chunk.content;
        }
      }
    } catch (error) {
      console.error('Stream chat error:', error);
      throw error;
    }
  }

  /**
   * Send messages and get a complete response
   */
  static async chat(messages: Message[], options?: any): Promise<any> {
    // Electron 환경: IPC를 통해 메인 프로세스에서 API 호출 (CORS 문제 해결)
    if (typeof window !== 'undefined' && window.electronAPI?.llm) {
      console.log('[LLMService] Using Electron IPC for chat');
      const result = await window.electronAPI.llm.chat(messages, options);

      console.log('[LLMService] IPC result:', {
        success: result.success,
        hasData: !!result.data,
        error: result.error,
        data: result.data,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to chat');
      }

      if (!result.data) {
        throw new Error('IPC returned success but no data');
      }

      return result.data;
    }

    // 웹 환경 또는 Electron이 아닌 경우: 기존 로직 사용
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client is not configured. Please set up your API key in settings.');
    }

    // Check if messages contain images and use vision model if available
    let provider = client.getProvider();

    if (hasImages(messages)) {
      console.log('[LLMService] Images detected, attempting to use vision model');
      const visionProvider = await getVisionProvider();
      if (visionProvider) {
        console.log('[LLMService] Using vision model for image analysis');
        provider = visionProvider;
      } else {
        console.warn('[LLMService] Images present but vision model not configured, using regular model');
      }
    }

    try {
      const response = await provider.chat(messages, options);
      return response;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  /**
   * Validate API configuration
   */
  static async validate(): Promise<boolean> {
    const client = getLLMClient();

    if (!client.isConfigured()) {
      return false;
    }

    const provider = client.getProvider();
    return await provider.validate();
  }
}
