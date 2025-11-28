import { Message, LLMConfig, AppConfig } from '@/types';
import { getLLMClient } from './client';
import { BaseLLMProvider, StreamChunk } from './base';
import { hasImages, getVisionProviderFromConfig, createVisionProvider } from './vision-utils';
import { isAborted, getCurrentConversationId } from './streaming-callback';

// Main Process에서 databaseService 사용 (동적 import로 브라우저 호환성 유지)
let databaseServiceModule: any = null;
async function getDatabaseService() {
  if (!databaseServiceModule && typeof window === 'undefined') {
    try {
      // Dynamic import for Main Process only
      databaseServiceModule = await import('../../electron/services/database');
    } catch (e) {
      // Not in Electron main process
    }
  }
  return databaseServiceModule?.databaseService;
}

/**
 * Get vision provider for Main Process (from database)
 */
async function getVisionProviderForMainProcess(): Promise<BaseLLMProvider | null> {
  try {
    const databaseService = await getDatabaseService();
    if (!databaseService) {
      return null;
    }

    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return null;
    }

    const config = JSON.parse(configStr) as AppConfig;
    if (!config?.llm?.vision) {
      return null;
    }

    console.log('[LLMService] Main Process - Creating vision provider');
    return createVisionProvider(config.llm);
  } catch (error) {
    console.error('[LLMService] Error getting vision provider in Main Process:', error);
    return null;
  }
}

export class LLMService {
  /**
   * Send messages and get a streaming response
   */
  static async *streamChat(
    messages: Message[],
    options?: any
  ): AsyncGenerator<string> {
    // Electron 환경: IPC를 통해 메인 프로세스에서 API 호출 (CORS 문제 해결)
    if (typeof window !== 'undefined' && window.electronAPI?.llm) {
      const hasVisionContent = hasImages(messages);
      console.log('[LLMService] Starting Electron IPC stream, hasImages:', hasVisionContent);

      // 이전 스트리밍 세션의 리스너를 모두 제거 (macOS 호환성)
      if (window.electronAPI.llm.removeAllStreamListeners) {
        console.log('[LLMService] Cleaning up previous stream listeners');
        window.electronAPI.llm.removeAllStreamListeners();
      }

      // Promise 기반 이벤트 큐 - 즉시 yield 가능
      const eventQueue: Array<{ type: 'chunk' | 'done' | 'error'; data?: string }> = [];
      let resolveNext: (() => void) | null = null;
      let isActive = true; // 스트리밍 세션 활성화 플래그

      // 스트리밍 이벤트 핸들러 등록
      const chunkHandler = window.electronAPI.llm.onStreamChunk((chunk: string) => {
        if (!isActive) {
          console.log('[LLMService] Ignoring chunk from inactive stream');
          return;
        }
        // 로그 제거: 매 청크마다 찍으면 렉 발생
        eventQueue.push({ type: 'chunk', data: chunk });
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      });

      const doneHandler = window.electronAPI.llm.onStreamDone(() => {
        if (!isActive) {
          console.log('[LLMService] Ignoring done signal from inactive stream');
          return;
        }
        console.log('[LLMService] Stream done');
        eventQueue.push({ type: 'done' });
        if (resolveNext) {
          resolveNext();
          resolveNext = null;
        }
      });

      const errorHandler = window.electronAPI.llm.onStreamError((error: string) => {
        if (!isActive) {
          console.log('[LLMService] Ignoring error from inactive stream');
          return;
        }
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
          // Check if streaming was aborted
          const conversationId = getCurrentConversationId();
          if (conversationId && isAborted(conversationId)) {
            console.log('[LLMService] Streaming aborted in IPC mode, breaking loop');
            throw new Error('Streaming aborted by user');
          }

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
        // 스트리밍 세션 비활성화
        isActive = false;

        // 이벤트 리스너 제거
        console.log('[LLMService] Removing stream listeners');
        window.electronAPI.llm.removeStreamListener('llm-stream-chunk', chunkHandler);
        window.electronAPI.llm.removeStreamListener('llm-stream-done', doneHandler);
        window.electronAPI.llm.removeStreamListener('llm-stream-error', errorHandler);

        // 추가로 모든 리스너 제거 (확실하게)
        if (window.electronAPI.llm.removeAllStreamListeners) {
          window.electronAPI.llm.removeAllStreamListeners();
        }
      }

      return;
    }

    // Main Process 또는 웹 환경: 직접 LLM 호출
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client is not configured. Please set up your API key in settings.');
    }

    // Check if messages contain images and use vision model if available
    let provider = client.getProvider();
    const isMainProcess = typeof window === 'undefined';
    const containsImages = hasImages(messages);

    if (containsImages) {
      console.log('[LLMService] Images detected in stream, attempting to use vision model');

      // Main Process에서는 databaseService에서 직접 설정 로드
      const visionProvider = isMainProcess
        ? await getVisionProviderForMainProcess()
        : await getVisionProviderFromConfig();

      if (visionProvider) {
        console.log('[LLMService] Using vision model for streaming image analysis');
        provider = visionProvider;
      } else {
        console.warn('[LLMService] Images present but vision model not configured');
        // Vision 모델이 설정되지 않았으면 에러 발생 (이미지는 일반 모델로 처리 불가)
        throw new Error('Vision model is not configured. Please enable and configure a vision model in Settings > LLM > Vision Model to analyze images.');
      }
    }

    try {
      for await (const chunk of provider.stream(messages, options)) {
        // Check if streaming was aborted
        const conversationId = getCurrentConversationId();
        if (conversationId && isAborted(conversationId)) {
          console.log('[LLMService] Streaming aborted, breaking loop');
          throw new Error('Streaming aborted by user');
        }

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
   * Send messages and get streaming response with full chunk info (including toolCalls)
   */
  static async *streamChatWithChunks(
    messages: Message[],
    options?: any
  ): AsyncGenerator<StreamChunk> {
    // Main Process 또는 웹 환경: 직접 LLM 호출
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client is not configured. Please set up your API key in settings.');
    }

    // Check if messages contain images and use vision model if available
    let provider = client.getProvider();
    const isMainProcess = typeof window === 'undefined';
    const containsImages = hasImages(messages);

    if (containsImages) {
      console.log('[LLMService] Images detected in stream, attempting to use vision model');

      // Main Process에서는 databaseService에서 직접 설정 로드
      const visionProvider = isMainProcess
        ? await getVisionProviderForMainProcess()
        : await getVisionProviderFromConfig();

      if (visionProvider) {
        console.log('[LLMService] Using vision model for streaming image analysis');
        provider = visionProvider;
      } else {
        console.warn('[LLMService] Images present but vision model not configured');
        throw new Error('Vision model is not configured. Please enable and configure a vision model in Settings > LLM > Vision Model to analyze images.');
      }
    }

    try {
      for await (const chunk of provider.stream(messages, options)) {
        // Check if streaming was aborted
        const conversationId = getCurrentConversationId();
        if (conversationId && isAborted(conversationId)) {
          console.log('[LLMService] Streaming aborted, breaking loop');
          throw new Error('Streaming aborted by user');
        }

        yield chunk;
      }
    } catch (error) {
      console.error('Stream chat with chunks error:', error);
      throw error;
    }
  }

  /**
   * Send messages and get a complete response
   */
  static async chat(messages: Message[], options?: any): Promise<any> {
    const isMainProcess = typeof window === 'undefined';
    const containsImages = hasImages(messages);

    console.log('[LLMService] chat() called:', {
      isMainProcess,
      containsImages,
      messageCount: messages.length,
    });

    // Electron Renderer 환경: IPC를 통해 메인 프로세스에서 API 호출 (CORS 문제 해결)
    if (!isMainProcess && window.electronAPI?.llm) {
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

    // Main Process 또는 웹 환경: 직접 LLM 호출
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client is not configured. Please set up your API key in settings.');
    }

    // Check if messages contain images and use vision model if available
    // NOTE: Don't use vision model when tools are provided (tool calling requires regular LLM)
    let provider = client.getProvider();
    const hasTools = options?.tools && options.tools.length > 0;

    if (containsImages && !hasTools) {
      console.log('[LLMService] Images detected, attempting to use vision model');

      // Main Process에서는 databaseService에서 직접 설정 로드
      const visionProvider = isMainProcess
        ? await getVisionProviderForMainProcess()
        : await getVisionProviderFromConfig();

      if (visionProvider) {
        console.log('[LLMService] Using vision model for image analysis');
        provider = visionProvider;
      } else {
        console.warn('[LLMService] Images present but vision model not configured, using regular model');
        // Vision 모델이 설정되지 않았으면 에러 발생 (이미지는 일반 모델로 처리 불가)
        throw new Error('Vision model is not configured. Please enable and configure a vision model in Settings > LLM > Vision Model to analyze images.');
      }
    } else if (containsImages && hasTools) {
      console.log('[LLMService] Images detected but tools are provided - using regular LLM for tool calling (Vision models typically do not support tool calling)');
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
