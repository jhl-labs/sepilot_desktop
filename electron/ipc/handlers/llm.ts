/**
 * LLM IPC Handlers
 * 메인 프로세스에서 LLM API를 호출하여 CORS 문제 해결
 */

import { ipcMain } from 'electron';
import { Message, LLMConfig, AppConfig } from '../../../types';
import { getLLMClient, initializeLLMClient } from '../../../lib/llm/client';
import { hasImages, createVisionProvider } from '../../../lib/llm/vision-utils';
import { logger } from '../../services/logger';
import { databaseService } from '../../services/database';

/**
 * Get vision provider from database config (Electron main process)
 */
function getVisionProviderFromDB() {
  try {
    logger.info('[LLM IPC] getVisionProviderFromDB called');

    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      logger.info('[LLM IPC] No app_config found in database');
      return null;
    }

    const config = JSON.parse(configStr) as AppConfig;

    if (!config?.llm) {
      logger.info('[LLM IPC] No LLM config found in app_config');
      return null;
    }

    logger.info('[LLM IPC] Vision provider config:', {
      baseURL: config.llm.vision?.baseURL || config.llm.baseURL,
      model: config.llm.vision?.model,
      provider: config.llm.vision?.provider,
      enabled: config.llm.vision?.enabled,
      enableStreaming: config.llm.vision?.enableStreaming ?? false,
    });

    logger.info('[LLM IPC] Calling createVisionProvider...');
    const provider = createVisionProvider(config.llm, {
      enableStreaming: config.llm.vision?.enableStreaming ?? false,
      maxImageTokens: 4096, // Ollama 호환을 위해 제한
    });

    if (provider) {
      logger.info('[LLM IPC] Vision provider created successfully');
      logger.info('[LLM IPC] Provider type:', provider.constructor.name);
      logger.info('[LLM IPC] Vision max_tokens:', {
        original: config.llm.vision?.maxImageTokens || config.llm.maxTokens,
        limited: Math.min(config.llm.vision?.maxImageTokens || config.llm.maxTokens, 4096),
      });
    } else {
      logger.info('[LLM IPC] createVisionProvider returned null');
    }

    return provider;
  } catch (error) {
    logger.error('[LLM IPC] Error getting vision provider:', error);
    return null;
  }
}

export function setupLLMHandlers() {
  // 기존 핸들러 제거 (핫 리로드 대비)
  ipcMain.removeHandler('llm-stream-chat');
  ipcMain.removeHandler('llm-chat');
  ipcMain.removeHandler('llm-init');
  ipcMain.removeHandler('llm-validate');
  ipcMain.removeHandler('llm-fetch-models');
  ipcMain.removeHandler('llm-generate-title');

  /**
   * LLM 스트리밍 채팅
   */
  ipcMain.handle('llm-stream-chat', async (event, messages: Message[]) => {
    try {
      // 디버깅: IPC로 받은 메시지 확인
      logger.info('[LLM IPC] Received messages count:', messages.length);
      messages.forEach((msg, idx) => {
        logger.info(`[LLM IPC] Message ${idx}:`, {
          role: msg.role,
          hasImages: !!msg.images,
          imageCount: msg.images?.length || 0,
          contentPreview: msg.content?.substring(0, 50),
        });
        if (msg.images && msg.images.length > 0) {
          msg.images.forEach((img, imgIdx) => {
            logger.info(`[LLM IPC] Image ${imgIdx}:`, {
              id: img.id,
              filename: img.filename,
              mimeType: img.mimeType,
              base64Preview: img.base64?.substring(0, 50) + '...',
            });
          });
        }
      });

      const client = getLLMClient();

      if (!client.isConfigured()) {
        throw new Error('LLM client is not configured. Please set up your API key in settings.');
      }

      // Check if messages contain images and use vision model if available
      let provider = client.getProvider();

      if (hasImages(messages)) {
        logger.info('[LLM IPC] Images detected, attempting to use vision model');
        const visionProvider = getVisionProviderFromDB();
        if (visionProvider) {
          const streamingEnabled = (visionProvider as any).streamingEnabled ?? false;
          logger.info('[LLM IPC] Using vision model for image analysis, streaming:', streamingEnabled);

          // 비전 모델이 스트리밍 비활성화된 경우 non-streaming으로 처리
          if (!streamingEnabled) {
            logger.info('[LLM IPC] Vision streaming disabled, using non-streaming chat');
            const response = await visionProvider.chat(messages);
            event.sender.send('llm-stream-chunk', response.content);
            event.sender.send('llm-stream-done');
            return {
              success: true,
              content: response.content,
            };
          }

          provider = visionProvider;
        } else {
          logger.warn('[LLM IPC] Images present but vision model not configured, using regular model');
        }
      }

      const chunks: string[] = [];

      // 스트리밍으로 받아서 렌더러로 전송
      try {
        for await (const chunk of provider.stream(messages)) {
          if (!chunk.done && chunk.content) {
            // 각 청크를 렌더러로 전송
            event.sender.send('llm-stream-chunk', chunk.content);
            chunks.push(chunk.content);
          }
        }
      } catch (streamError: any) {
        logger.error('[LLM IPC] Stream error details:', {
          message: streamError.message,
          stack: streamError.stack,
          name: streamError.name,
        });
        throw streamError;
      }

      // 완료 신호 전송
      event.sender.send('llm-stream-done');

      return {
        success: true,
        content: chunks.join(''),
      };
    } catch (error: any) {
      logger.error('LLM stream chat error:', error);
      event.sender.send('llm-stream-error', error.message);
      return {
        success: false,
        error: error.message || 'Failed to stream chat',
      };
    }
  });

  /**
   * LLM 일반 채팅 (non-streaming)
   */
  ipcMain.handle('llm-chat', async (event, messages: Message[], options?: any) => {
    console.log('[LLM IPC] ===== llm-chat handler called =====');
    console.log('[LLM IPC] Messages count:', messages.length);
    console.log('[LLM IPC] Has options:', !!options);
    console.log('[LLM IPC] Has tools:', !!options?.tools);

    try {
      logger.info('[LLM IPC] Chat request:', {
        messageCount: messages.length,
        hasOptions: !!options,
        hasTools: !!options?.tools,
        toolCount: options?.tools?.length || 0,
      });

      const client = getLLMClient();

      if (!client.isConfigured()) {
        const error = 'LLM client is not configured. Please set up your API key in settings.';
        logger.error('[LLM IPC]', error);
        throw new Error(error);
      }

      // Check if messages contain images and use vision model if available
      let provider = client.getProvider();

      if (hasImages(messages)) {
        logger.info('[LLM IPC] Images detected in chat, attempting to use vision model');
        const visionProvider = getVisionProviderFromDB();
        if (visionProvider) {
          logger.info('[LLM IPC] Using vision model for chat with images');
          provider = visionProvider;
        } else {
          logger.warn('[LLM IPC] Images present but vision model not configured, using regular model');
        }
      }

      console.log('[LLM IPC] ===== Calling provider.chat =====');
      logger.info('[LLM IPC] Calling provider.chat...');

      const response = await provider.chat(messages, options);

      console.log('[LLM IPC] ===== Provider.chat completed =====');
      console.log('[LLM IPC] Response:', response);
      logger.info('[LLM IPC] Provider.chat completed');
      logger.info('[LLM IPC] Raw response:', response);

      if (!response) {
        const error = 'Provider returned null/undefined response';
        logger.error('[LLM IPC]', error);
        throw new Error(error);
      }

      logger.info('[LLM IPC] Chat response:', {
        hasContent: !!response.content,
        contentLength: response.content?.length || 0,
        hasToolCalls: !!response.toolCalls,
        toolCallsCount: response.toolCalls?.length || 0,
      });

      console.log('[LLM IPC] ===== Returning success response =====');
      console.log('[LLM IPC] Response data:', response);

      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      console.log('[LLM IPC] ===== Error occurred =====');
      console.log('[LLM IPC] Error:', error);
      console.log('[LLM IPC] Error stack:', error.stack);
      logger.error('[LLM IPC] Chat error:', error);
      logger.error('[LLM IPC] Error stack:', error.stack);
      return {
        success: false,
        error: error.message || 'Failed to chat',
      };
    }
  });

  /**
   * LLM 설정 초기화
   */
  ipcMain.handle('llm-init', async (event, config: AppConfig) => {
    try {
      // Extract LLM config from AppConfig
      if (!config.llm) {
        throw new Error('LLM config not found in AppConfig');
      }
      initializeLLMClient(config.llm);
      logger.info('LLM client initialized with config');
      return {
        success: true,
      };
    } catch (error: any) {
      logger.error('Failed to initialize LLM client:', error);
      return {
        success: false,
        error: error.message || 'Failed to initialize LLM client',
      };
    }
  });

  /**
   * LLM 설정 검증
   */
  ipcMain.handle('llm-validate', async () => {
    try {
      const client = getLLMClient();

      if (!client.isConfigured()) {
        return {
          success: false,
          error: 'LLM client is not configured',
        };
      }

      const provider = client.getProvider();
      const isValid = await provider.validate();

      return {
        success: isValid,
        error: isValid ? null : 'API key validation failed',
      };
    } catch (error: any) {
      logger.error('LLM validate error:', error);
      return {
        success: false,
        error: error.message || 'Failed to validate',
      };
    }
  });

  /**
   * LLM 모델 목록 가져오기 (Network Config 포함, CORS 없음)
   */
  ipcMain.handle(
    'llm-fetch-models',
    async (
      _event,
      config: {
        provider: LLMConfig['provider'];
        baseURL?: string;
        apiKey: string;
        customHeaders?: Record<string, string>;
        networkConfig?: LLMConfig['network'];
      }
    ) => {
      try {
        const { provider, baseURL, apiKey, customHeaders, networkConfig } = config;

        if (!apiKey.trim()) {
          return {
            success: false,
            error: 'API key is required',
          };
        }

        // Normalize base URL
        const normalizedBaseURL = baseURL?.trim()
          ? baseURL.trim().replace(/\/+$/, '')
          : provider === 'anthropic'
          ? 'https://api.anthropic.com/v1'
          : 'https://api.openai.com/v1';

        const endpoint = `${normalizedBaseURL}/models`;

        // Build headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (provider === 'anthropic') {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        // Add custom headers for LLM API (separate from network config)
        if (customHeaders) {
          Object.entries(customHeaders).forEach(([key, value]) => {
            headers[key] = value;
          });
        }

        // Build fetch options with network config
        const fetchOptions: RequestInit = {
          method: 'GET',
          headers,
        };

        // Add proxy support if configured
        if (networkConfig?.proxy) {
          // Note: fetch API doesn't support proxy directly
          // In production, you would use a library like node-fetch with proxy support
          // or configure system proxy
          logger.info('[LLM IPC] Proxy configured:', networkConfig.proxy);
        }

        // SSL verification
        if (networkConfig?.ssl?.verify === false) {
          logger.warn('[LLM IPC] SSL verification disabled');
          // Note: In production, you'd need to configure SSL rejection
        }

        logger.info('[LLM IPC] Fetching models from:', endpoint);

        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch models: ${response.status} ${errorText}`);
        }

        const payload = await response.json();

        // Extract model IDs from response
        const models = extractModelIds(payload);

        return {
          success: true,
          data: Array.from(new Set(models)).sort(),
        };
      } catch (error: any) {
        logger.error('[LLM IPC] Fetch models error:', error);
        return {
          success: false,
          error: error.message || 'Failed to fetch models',
        };
      }
    }
  );

  /**
   * LLM 대화 제목 생성 (CORS 없이 Main Process에서 실행)
   */
  ipcMain.handle('llm-generate-title', async (_event, messages: Message[]) => {
    try {
      const client = getLLMClient();

      if (!client.isConfigured()) {
        throw new Error('LLM client is not configured');
      }

      const provider = client.getProvider();

      // 제목 생성을 위한 프롬프트
      const titlePrompt: Message[] = [
        {
          id: 'system',
          role: 'system',
          content: `You are a helpful assistant that generates concise, descriptive titles for conversations.
Generate a short title (max 5-7 words) that captures the main topic of the conversation.
Return ONLY the title, without quotes or additional text.`,
          created_at: Date.now(),
        },
        {
          id: 'user',
          role: 'user',
          content: `Based on this conversation, generate a concise title:\n\n${messages
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n\n')}`,
          created_at: Date.now(),
        },
      ];

      // LLM 호출 (스트리밍)
      let generatedTitle = '';
      for await (const chunk of provider.stream(titlePrompt)) {
        if (chunk.content) {
          generatedTitle += chunk.content;
        }
      }

      // 제목 정제
      generatedTitle = generatedTitle
        .trim()
        .replace(/^["']|["']$/g, '') // 시작/끝의 따옴표 제거
        .replace(/\n/g, ' ') // 개행 제거
        .slice(0, 100); // 최대 100자

      logger.info('[LLM IPC] Generated title:', generatedTitle);

      return {
        success: true,
        data: {
          title: generatedTitle,
        },
      };
    } catch (error: any) {
      logger.error('[LLM IPC] Generate title error:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate title',
      };
    }
  });

  /**
   * 에디터 자동완성 (Autocomplete 모델 사용)
   */
  ipcMain.handle(
    'llm-editor-autocomplete',
    async (
      _event,
      context: {
        code: string;
        cursorPosition: number;
        language?: string;
      }
    ) => {
      try {
        // Get autocomplete config from database
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('App config not found');
        }

        const config = JSON.parse(configStr) as AppConfig;
        if (!config.llm?.autocomplete?.enabled) {
          return {
            success: false,
            error: 'Autocomplete is not enabled',
          };
        }

        const autocompleteConfig = config.llm.autocomplete;
        const baseConfig = config.llm;

        // Create autocomplete provider
        const providerConfig: LLMConfig = {
          provider: autocompleteConfig.provider || baseConfig.provider,
          baseURL: autocompleteConfig.baseURL || baseConfig.baseURL,
          apiKey: autocompleteConfig.apiKey || baseConfig.apiKey,
          model: autocompleteConfig.model,
          temperature: autocompleteConfig.temperature || 0.3,
          maxTokens: autocompleteConfig.maxTokens || 100,
        };

        // Initialize temporary client for autocomplete
        const { createProvider } = await import('../../../lib/llm/client');
        const provider = createProvider(providerConfig);

        if (!provider) {
          throw new Error('Failed to create autocomplete provider');
        }

        // Create prompt for autocomplete
        const messages: Message[] = [
          {
            id: 'system',
            role: 'system',
            content: `You are a code completion assistant. Complete the code based on the context.
Return ONLY the completion text without any explanations or markdown.`,
            created_at: Date.now(),
          },
          {
            id: 'user',
            role: 'user',
            content: `Complete the following ${context.language || 'code'}:

${context.code.substring(0, context.cursorPosition)}█${context.code.substring(context.cursorPosition)}

Complete from the cursor position (█). Return only the completion text.`,
            created_at: Date.now(),
          },
        ];

        const response = await provider.chat(messages);

        return {
          success: true,
          data: {
            completion: response.content.trim(),
          },
        };
      } catch (error: any) {
        logger.error('[LLM IPC] Autocomplete error:', error);
        return {
          success: false,
          error: error.message || 'Failed to generate autocomplete',
        };
      }
    }
  );

  /**
   * 에디터 액션 (요약, 번역, 완성 등 - 기본 모델 사용)
   */
  ipcMain.handle(
    'llm-editor-action',
    async (
      _event,
      params: {
        action: 'summarize' | 'translate' | 'complete' | 'explain' | 'fix' | 'improve';
        text: string;
        language?: string;
        targetLanguage?: string; // for translate
      }
    ) => {
      try {
        const client = getLLMClient();

        if (!client.isConfigured()) {
          throw new Error('LLM client is not configured');
        }

        const provider = client.getProvider();

        // Create prompt based on action
        let systemPrompt = '';
        let userPrompt = '';

        switch (params.action) {
          case 'summarize':
            systemPrompt = 'You are a helpful assistant that summarizes text concisely.';
            userPrompt = `Summarize the following text:\n\n${params.text}`;
            break;
          case 'translate':
            systemPrompt = 'You are a professional translator.';
            userPrompt = `Translate the following text to ${params.targetLanguage || 'English'}:\n\n${params.text}`;
            break;
          case 'complete':
            systemPrompt = 'You are a code completion assistant. Complete the code naturally.';
            userPrompt = `Complete the following ${params.language || 'code'}:\n\n${params.text}`;
            break;
          case 'explain':
            systemPrompt = 'You are a helpful assistant that explains code clearly and concisely.';
            userPrompt = `Explain what the following ${params.language || 'code'} does:\n\n${params.text}`;
            break;
          case 'fix':
            systemPrompt = 'You are a helpful assistant that fixes code issues and errors.';
            userPrompt = `Fix any issues in the following ${params.language || 'code'}:\n\n${params.text}`;
            break;
          case 'improve':
            systemPrompt = 'You are a helpful assistant that improves code quality and readability.';
            userPrompt = `Improve the following ${params.language || 'code'}:\n\n${params.text}`;
            break;
          default:
            throw new Error(`Unknown action: ${params.action}`);
        }

        const messages: Message[] = [
          {
            id: 'system',
            role: 'system',
            content: systemPrompt,
            created_at: Date.now(),
          },
          {
            id: 'user',
            role: 'user',
            content: userPrompt,
            created_at: Date.now(),
          },
        ];

        const response = await provider.chat(messages);

        return {
          success: true,
          data: {
            result: response.content,
          },
        };
      } catch (error: any) {
        logger.error('[LLM IPC] Editor action error:', error);
        return {
          success: false,
          error: error.message || 'Failed to perform editor action',
        };
      }
    }
  );

  logger.info('LLM IPC handlers registered');
}

/**
 * Extract model IDs from API response
 */
function extractModelIds(payload: any): string[] {
  const models: string[] = [];

  if (payload.data && Array.isArray(payload.data)) {
    payload.data.forEach((item: any) => {
      if (item.id) {
        models.push(item.id);
      }
    });
  }

  return models;
}
