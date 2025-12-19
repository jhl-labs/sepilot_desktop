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
import { isLLMConfigV2, convertV2ToV1 } from '../../../lib/config/llm-config-migration';
import { getLLMErrorMessage, getErrorMessage } from '../../../lib/utils/error-handler';
import { HttpError } from '../../../lib/http';

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

    let config = JSON.parse(configStr) as AppConfig;

    if (!config?.llm) {
      logger.info('[LLM IPC] No LLM config found in app_config');
      return null;
    }

    // Convert V2 to V1 if needed
    if (isLLMConfigV2(config.llm)) {
      logger.info('[LLM IPC] Converting V2 config to V1 for vision provider');
      config.llm = convertV2ToV1(config.llm);
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
          logger.info(
            '[LLM IPC] Using vision model for image analysis, streaming:',
            streamingEnabled
          );

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
          logger.warn(
            '[LLM IPC] Images present but vision model not configured, using regular model'
          );
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
        // HttpError인 경우 상세 로깅
        if (streamError instanceof HttpError) {
          logger.error('[LLM IPC] Stream HTTP error:', {
            type: streamError.type,
            message: streamError.message,
            userMessage: streamError.getUserMessage(),
            debugInfo: streamError.getDebugInfo(),
          });
        } else {
          logger.error('[LLM IPC] Stream error details:', {
            message: streamError.message,
            stack: streamError.stack,
            name: streamError.name,
          });
        }
        throw streamError;
      }

      // 완료 신호 전송
      event.sender.send('llm-stream-done');

      return {
        success: true,
        content: chunks.join(''),
      };
    } catch (error: any) {
      // 사용자 친화적 에러 메시지 생성
      const userMessage = getLLMErrorMessage(error);

      // 상세 로깅
      if (error instanceof HttpError) {
        logger.error('[LLM IPC] Stream chat HTTP error:', {
          type: error.type,
          url: error.url,
          statusCode: error.statusCode,
          message: error.message,
          userMessage,
          debugInfo: error.getDebugInfo(),
        });
      } else {
        logger.error('[LLM IPC] Stream chat error:', {
          message: getErrorMessage(error),
          userMessage,
          stack: error.stack,
        });
      }

      event.sender.send('llm-stream-error', userMessage);
      return {
        success: false,
        error: userMessage,
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
          logger.warn(
            '[LLM IPC] Images present but vision model not configured, using regular model'
          );
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
      // 사용자 친화적 에러 메시지 생성
      const userMessage = getLLMErrorMessage(error);

      // 상세 로깅
      if (error instanceof HttpError) {
        logger.error('[LLM IPC] Chat HTTP error:', {
          type: error.type,
          url: error.url,
          statusCode: error.statusCode,
          message: error.message,
          userMessage,
          debugInfo: error.getDebugInfo(),
        });
      } else {
        logger.error('[LLM IPC] Chat error:', {
          message: getErrorMessage(error),
          userMessage,
          stack: error.stack,
        });
      }

      return {
        success: false,
        error: userMessage,
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

        // Log environment variables for debugging
        const envInfo = {
          HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy,
          HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy,
          NO_PROXY: process.env.NO_PROXY || process.env.no_proxy,
          NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
        };

        logger.info('[LLM IPC] Fetch models request:', {
          provider,
          baseURL: baseURL || 'default',
          hasApiKey: !!apiKey,
          hasCustomHeaders: !!customHeaders && Object.keys(customHeaders).length > 0,
          networkConfig: {
            proxyEnabled: networkConfig?.proxy?.enabled,
            proxyMode: networkConfig?.proxy?.mode,
            proxyUrl: networkConfig?.proxy?.enabled ? networkConfig?.proxy?.url : undefined,
            sslVerify: networkConfig?.ssl?.verify,
          },
          environment: envInfo,
        });

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

        logger.info('[LLM IPC] Fetching models from:', endpoint);

        // Use httpFetch with network config support
        const { httpFetch } = await import('../../../lib/http/fetch');
        const response = await httpFetch(endpoint, {
          method: 'GET',
          headers,
          networkConfig: networkConfig || undefined,
          timeout: 30000, // 30 seconds timeout
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          const errorDetails = {
            status: response.status,
            statusText: response.statusText,
            url: endpoint,
            provider,
            responseBody: errorText.substring(0, 500), // Limit to first 500 chars
          };

          logger.error('[LLM IPC] Fetch models HTTP error:', errorDetails);

          throw new Error(
            `모델 목록을 가져오는데 실패했습니다.\n\nHTTP ${response.status} ${response.statusText}\n응답: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`
          );
        }

        const payload = await response.json();

        // Extract model IDs from response
        const models = extractModelIds(payload);

        logger.info('[LLM IPC] Successfully fetched models:', {
          count: models.length,
          provider,
        });

        return {
          success: true,
          data: Array.from(new Set(models)).sort(),
        };
      } catch (error: any) {
        // HttpError인 경우 상세 정보 로깅
        if (error instanceof HttpError) {
          const errorDetails = {
            type: error.type,
            message: error.message,
            url: error.url,
            statusCode: error.statusCode,
            userMessage: error.getUserMessage(),
            debugInfo: error.getDebugInfo(),
          };

          logger.error('[LLM IPC] Fetch models HttpError:', errorDetails);

          // 사용자에게 자세한 오류 메시지 반환
          let detailedError = `모델 목록을 가져오는데 실패했습니다.\n\n`;
          detailedError += `오류 유형: ${error.type}\n`;
          if (error.statusCode) {
            detailedError += `HTTP 상태 코드: ${error.statusCode}\n`;
          }
          detailedError += `URL: ${error.url}\n\n`;
          detailedError += `상세 정보:\n${error.getUserMessage()}\n\n`;

          // 네트워크 설정 정보 추가
          if (config.networkConfig) {
            detailedError += `네트워크 설정:\n`;
            if (config.networkConfig.proxy?.enabled) {
              detailedError += `- 프록시: ${config.networkConfig.proxy.mode} (${config.networkConfig.proxy.url})\n`;
            }
            detailedError += `- SSL 검증: ${config.networkConfig.ssl?.verify !== false ? '활성화' : '비활성화'}\n`;
          }

          // 환경 변수 정보 추가
          const envProxy =
            process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.HTTP_PROXY ||
            process.env.http_proxy;
          if (envProxy) {
            detailedError += `\n시스템 프록시 환경 변수: ${envProxy}`;
          }

          return {
            success: false,
            error: detailedError,
          };
        }

        // 일반 에러 처리 (네트워크 에러 등)
        logger.error('[LLM IPC] Fetch models error:', {
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          stack: error.stack,
          provider: config.provider,
          baseURL: config.baseURL,
        });

        // Build structured error message with error code for frontend i18n
        let errorMessage = '';

        if (error.code === 'ENOTFOUND') {
          errorMessage += `ENOTFOUND: DNS lookup failed\n`;
          errorMessage += `URL: ${config.baseURL}\n`;
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage += `ECONNREFUSED: Connection refused\n`;
          errorMessage += `URL: ${config.baseURL}\n`;
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
          errorMessage += `ETIMEDOUT: Request timed out\n`;
          errorMessage += `URL: ${config.baseURL}\n`;
        } else if (
          error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          error.code === 'CERT_HAS_EXPIRED'
        ) {
          errorMessage += `SSL_ERROR: Certificate verification failed\n`;
          errorMessage += `URL: ${config.baseURL}\n`;
        } else {
          // Generic error with full debugging info
          const errorCode = error.code || 'UNKNOWN';
          errorMessage += `${errorCode}: ${error.message || 'Unknown error'}\n`;
          errorMessage += `URL: ${config.baseURL}\n`;

          // Debugging section
          errorMessage += `\nDebug Info:\n`;
          if (error.errno) errorMessage += `- Errno: ${error.errno}\n`;
          if (error.syscall) errorMessage += `- Syscall: ${error.syscall}\n`;
          if (error.name) errorMessage += `- Name: ${error.name}\n`;

          // Additional error properties
          try {
            const errorKeys = Object.keys(error).filter(
              (key) => !['stack', 'message', 'code', 'errno', 'syscall', 'name'].includes(key)
            );
            if (errorKeys.length > 0) {
              errorMessage += `- Additional Info: ${JSON.stringify(
                errorKeys.reduce((acc, key) => ({ ...acc, [key]: error[key] }), {}),
                null,
                2
              )}\n`;
            }
          } catch (e) {
            // Continue even if JSON.stringify fails
          }
        }

        // Configuration info
        errorMessage += `\nConfiguration:\n`;
        errorMessage += `- Provider: ${config.provider}\n`;
        errorMessage += `- Base URL: ${config.baseURL || 'default'}\n`;
        errorMessage += `- API Key: ${config.apiKey ? 'Set (' + config.apiKey.substring(0, 10) + '...)' : 'Not set'}\n`;

        if (config.networkConfig) {
          errorMessage += `\nNetwork Settings:\n`;
          if (config.networkConfig.proxy?.enabled) {
            errorMessage += `- Proxy: ${config.networkConfig.proxy.mode} (${config.networkConfig.proxy.url})\n`;
          } else {
            errorMessage += `- Proxy: Disabled\n`;
          }
          errorMessage += `- SSL Verify: ${config.networkConfig.ssl?.verify !== false ? 'Enabled' : 'Disabled'}\n`;
        }

        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );

  /**
   * LLM 대화 제목 생성 (CORS 없이 Main Process에서 실행)
   */
  ipcMain.handle(
    'llm-generate-title',
    async (_event, params: { messages: Message[]; language: string }) => {
      try {
        const { messages, language = 'en' } = params;
        const client = getLLMClient();

        if (!client.isConfigured()) {
          throw new Error('LLM client is not configured');
        }

        const provider = client.getProvider();

        // 언어 코드 -> 언어 이름 매핑
        const languageMap: Record<string, string> = {
          ko: 'Korean',
          en: 'English',
          zh: 'Chinese',
          ja: 'Japanese',
        };
        const targetLanguage = languageMap[language] || 'English';

        // 제목 생성을 위한 프롬프트
        const titlePrompt: Message[] = [
          {
            id: 'system',
            role: 'system',
            content: `You are a helpful assistant that generates concise, descriptive titles for conversations.
Generate a short title (max 5-7 words) that captures the main topic of the conversation.
The title MUST be in ${targetLanguage} language.
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

        logger.info('[LLM IPC] Generated title:', {
          title: generatedTitle,
          language: targetLanguage,
        });

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
    }
  );

  /**
   * 에디터 자동완성 (Editor Agent 사용)
   */
  ipcMain.handle(
    'llm-editor-autocomplete',
    async (
      _event,
      context: {
        code: string;
        cursorPosition: number;
        language?: string;
        filePath?: string;
        useRag?: boolean;
        useTools?: boolean;
        metadata?: {
          currentLine: string;
          previousLine: string;
          nextLine: string;
          lineNumber: number;
          hasContextBefore: boolean;
          hasContextAfter: boolean;
        };
      }
    ) => {
      try {
        logger.info('[EditorAgent/Autocomplete] Handler called:', {
          codeLength: context.code.length,
          cursorPosition: context.cursorPosition,
          language: context.language,
          filePath: context.filePath,
          useRag: context.useRag,
          useTools: context.useTools,
          hasMetadata: !!context.metadata,
        });

        // Get autocomplete config from database
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          logger.error('[EditorAgent/Autocomplete] App config not found in database');
          throw new Error('App config not found');
        }

        let config = JSON.parse(configStr) as AppConfig;

        // Convert V2 to V1 if needed
        if (config.llm && isLLMConfigV2(config.llm)) {
          logger.info('[EditorAgent/Autocomplete] Converting V2 config to V1');
          config.llm = convertV2ToV1(config.llm);
        }

        logger.info('[EditorAgent/Autocomplete] Autocomplete config:', {
          enabled: config.llm?.autocomplete?.enabled,
          provider: config.llm?.autocomplete?.provider,
          model: config.llm?.autocomplete?.model,
          hasApiKey: !!config.llm?.autocomplete?.apiKey,
        });

        if (!config.llm?.autocomplete?.enabled) {
          logger.warn('[EditorAgent/Autocomplete] Autocomplete is not enabled in settings');
          return {
            success: false,
            error: 'Autocomplete is not enabled',
          };
        }

        const autocompleteConfig = config.llm.autocomplete;
        const baseConfig = config.llm;

        // Initialize LLM client with autocomplete config
        const providerConfig: LLMConfig = {
          provider: autocompleteConfig.provider || baseConfig.provider,
          baseURL: autocompleteConfig.baseURL || baseConfig.baseURL,
          apiKey: autocompleteConfig.apiKey || baseConfig.apiKey,
          model: autocompleteConfig.model,
          temperature: autocompleteConfig.temperature || 0.2,
          maxTokens: autocompleteConfig.maxTokens || 500,
        };

        logger.info('[EditorAgent/Autocomplete] Provider config:', {
          provider: providerConfig.provider,
          model: providerConfig.model,
          temperature: providerConfig.temperature,
          maxTokens: providerConfig.maxTokens,
        });

        // Initialize LLM client with autocomplete config
        const { initializeLLMClient } = await import('../../../lib/llm/client');
        initializeLLMClient(providerConfig);

        // IMPORTANT: Clear EditorAgent graph cache to use new LLM client
        // EditorAgent graph는 getLLMClient()를 통해 현재 LLM client를 가져오므로
        // initializeLLMClient() 호출 후 캐시를 클리어해야 새 설정이 반영됨
        const { GraphFactory } = await import('../../../lib/langgraph');
        (GraphFactory as any)._editorAgentGraph = null;

        // Extract context for autocomplete
        const textBeforeCursor = context.code.substring(0, context.cursorPosition);
        const textAfterCursor = context.code.substring(context.cursorPosition);

        // Get current line being typed
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];

        // Get a few lines before for context (max 3 lines)
        const contextLinesBefore = lines.slice(-4, -1).join('\n');

        // Get a few lines after for context (max 2 lines)
        const linesAfter = textAfterCursor.split('\n').slice(0, 2).join('\n');

        // Prepare initial state for Editor Agent
        // TODO: RAG와 Tools 기능을 Editor Agent 그래프에 통합하여 실제로 사용하도록 구현
        // 현재는 설정만 전달하고 있으며, 실제 구현은 추후 진행 필요
        const initialState = {
          messages: [
            {
              id: 'system',
              role: 'system' as const,
              content: `You are an autocomplete assistant. Your task is to continue writing from the cursor position (marked with █).

CRITICAL RULES:
- DO NOT repeat any text that comes before █
- Write ONLY what comes AFTER █
- Return raw text without quotes, markdown, or explanations
- Keep completion concise (1-3 lines max)
- Match the writing style and context${context.useRag ? '\n- You can reference uploaded documents if needed' : ''}${context.useTools ? '\n- You can use available tools if needed' : ''}`,
              created_at: Date.now(),
            },
            {
              id: 'user',
              role: 'user' as const,
              content: `${contextLinesBefore ? `Context:\n${contextLinesBefore}\n\n` : ''}Current line: ${currentLine}█${linesAfter ? `\n\nNext lines:\n${linesAfter}` : ''}\n\nComplete from █:`,
              created_at: Date.now(),
            },
          ],
          toolResults: [],
          editorContext: {
            filePath: context.filePath,
            language: context.language,
            cursorPosition: context.cursorPosition,
            action: 'autocomplete' as const,
            useRag: context.useRag,
            useTools: context.useTools,
          },
        };

        logger.info('[EditorAgent/Autocomplete] Calling Editor Agent');

        let completion = '';
        for await (const event of GraphFactory.streamEditorAgent(initialState)) {
          logger.info('[EditorAgent/Autocomplete] Event:', event.type);

          if (event.type === 'message' && event.message) {
            completion = event.message.content || '';
            logger.info('[EditorAgent/Autocomplete] Got message:', completion.substring(0, 100));
          }

          if (event.type === 'error') {
            throw new Error(event.error);
          }
        }

        // Clean completion
        completion = completion.trim();

        // Remove markdown code blocks
        completion = completion.replace(/```[\w]*\n?/g, '').replace(/```$/g, '');

        // Remove quotes
        if (
          (completion.startsWith('"') && completion.endsWith('"')) ||
          (completion.startsWith("'") && completion.endsWith("'"))
        ) {
          completion = completion.slice(1, -1);
        }

        // Remove any text that repeats the current line
        // If completion starts with the current line text, remove it
        if (currentLine && completion.startsWith(currentLine)) {
          completion = completion.substring(currentLine.length);
        }

        // Remove leading █ if present
        completion = completion.replace(/^█+/, '');

        // Trim again after cleanup
        completion = completion.trim();

        // Limit to 3 lines
        const completionLines = completion.split('\n');
        if (completionLines.length > 3) {
          completion = completionLines.slice(0, 3).join('\n');
        }

        logger.info('[EditorAgent/Autocomplete] Final completion:', {
          length: completion.length,
          preview: completion.substring(0, 100),
        });

        return {
          success: true,
          data: {
            completion: completion,
          },
        };
      } catch (error: any) {
        logger.error('[Autocomplete] Error occurred:', {
          message: error.message,
          stack: error.stack,
        });
        return {
          success: false,
          error: error.message || 'Failed to generate autocomplete',
        };
      } finally {
        // Restore default LLM client for other operations
        // Autocomplete 완료 후 기본 LLM 설정으로 복원
        try {
          const configStr = databaseService.getSetting('app_config');
          if (configStr) {
            let config = JSON.parse(configStr) as AppConfig;
            if (config.llm && isLLMConfigV2(config.llm)) {
              config.llm = convertV2ToV1(config.llm);
            }
            if (config.llm) {
              const { initializeLLMClient } = await import('../../../lib/llm/client');
              initializeLLMClient(config.llm);

              // Clear graph cache again to use default LLM
              const { GraphFactory } = await import('../../../lib/langgraph');
              (GraphFactory as any)._editorAgentGraph = null;

              logger.info('[EditorAgent/Autocomplete] Restored default LLM client');
            }
          }
        } catch (restoreError) {
          logger.error('[EditorAgent/Autocomplete] Failed to restore default LLM:', restoreError);
        }
      }
    }
  );

  /**
   * 에디터 액션 (요약, 번역, 완성 등 - 기본 모델 사용)
   * EditorAgent를 사용하여 처리
   */
  ipcMain.handle(
    'llm-editor-action',
    async (
      _event,
      params: {
        action:
          | 'summarize'
          | 'translate'
          | 'complete'
          | 'explain'
          | 'fix'
          | 'improve'
          | 'continue'
          | 'make-shorter'
          | 'make-longer'
          | 'simplify'
          | 'fix-grammar'
          | 'change-tone-professional'
          | 'change-tone-casual'
          | 'change-tone-friendly'
          | 'find-action-items'
          | 'create-outline';
        text: string;
        language?: string;
        targetLanguage?: string; // for translate
        context?: {
          before: string;
          after: string;
          fullCode?: string;
          filePath?: string;
          lineStart: number;
          lineEnd: number;
          useRag?: boolean;
          useTools?: boolean;
        };
      }
    ) => {
      try {
        logger.info('[EditorAgent/Action] Handler called:', {
          action: params.action,
          textLength: params.text.length,
          language: params.language,
          hasContext: !!params.context,
        });

        // Get config from database
        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          logger.error('[EditorAgent/Action] App config not found in database');
          throw new Error('App config not found');
        }

        let config = JSON.parse(configStr) as AppConfig;

        // Convert V2 to V1 if needed
        if (config.llm && isLLMConfigV2(config.llm)) {
          logger.info('[EditorAgent/Action] Converting V2 config to V1');
          config.llm = convertV2ToV1(config.llm);
        }

        // Initialize LLM client with main config (not autocomplete)
        const { initializeLLMClient } = await import('../../../lib/llm/client');
        initializeLLMClient(config.llm);

        const client = getLLMClient();
        if (!client.isConfigured()) {
          throw new Error('LLM client is not configured');
        }

        // Create prompt based on action
        let systemPrompt = '';
        let userPrompt = '';
        let returnCodeOnly = false;

        // Prepare context information if available
        const contextInfo = params.context
          ? `

CONTEXT INFORMATION:
- File: ${params.context.filePath || 'unknown'}
- Lines: ${params.context.lineStart}-${params.context.lineEnd}

Text before selection:
\`\`\`
${params.context.before.slice(-500)}
\`\`\`

Text after selection:
\`\`\`
${params.context.after.slice(0, 500)}
\`\`\`
${params.context.fullCode ? '\n(Full code context available)' : ''}
`
          : '';

        switch (params.action) {
          case 'summarize':
            systemPrompt = `You are a text summarization expert.

Rules:
- Summarize in 2-4 concise sentences
- Focus on the main points and key takeaways
- Use plain text, NO markdown formatting
- Be clear and direct${params.context ? '\n- Consider the surrounding context when summarizing' : ''}`;

            userPrompt = `Summarize this text:${contextInfo}\n\nSelected text:\n${params.text}`;
            break;

          case 'translate':
            systemPrompt = `You are a professional translator.

Rules:
- Translate accurately while preserving meaning and tone
- Keep technical terms and code unchanged
- Maintain formatting (line breaks, indentation)
- Return ONLY the translated text, no explanations`;

            userPrompt = `Translate to ${params.targetLanguage || 'English'}:\n\n${params.text}`;
            break;

          case 'complete':
            systemPrompt = `You are an expert ${params.language || 'code'} completion AI.

Rules:
- Complete the code naturally and logically
- Match the existing code style and patterns
- Return ONLY the completed code, NO explanations or markdown
- Keep it concise and relevant${params.context ? '\n- Use surrounding context to understand the code structure and purpose' : ''}`;

            userPrompt = `Complete this ${params.language || 'code'}:${contextInfo}\n\nSelected code:\n\`\`\`${params.language || ''}\n${params.text}\n\`\`\``;
            returnCodeOnly = true;
            break;

          case 'explain':
            systemPrompt = `You are a code explanation expert.

Rules:
- Explain in 3-5 clear, concise sentences
- Focus on WHAT it does, not line-by-line details
- Mention key patterns, algorithms, or potential issues
- Use plain text, NO code blocks or markdown
- Be technical but understandable${params.context ? '\n- Consider the surrounding code context to provide a comprehensive explanation' : ''}`;

            userPrompt = `Explain this ${params.language || 'code'}:${contextInfo}\n\nSelected code:\n\`\`\`${params.language || ''}\n${params.text}\n\`\`\``;
            break;

          case 'fix':
            systemPrompt = `You are a code debugging expert for ${params.language || 'code'}.

Rules:
- Fix syntax errors, type errors, logical bugs, and potential issues
- Return ONLY the corrected code, NO explanations
- Preserve variable names, structure, and style
- Add brief inline comments ONLY for significant fixes${params.context ? '\n- Use surrounding context to understand dependencies and requirements' : ''}`;

            userPrompt = `Fix this ${params.language || 'code'}:${contextInfo}\n\nSelected code:\n\`\`\`${params.language || ''}\n${params.text}\n\`\`\``;
            returnCodeOnly = true;
            break;

          case 'improve':
            systemPrompt = `You are a code quality expert for ${params.language || 'code'}.

Rules:
- Improve readability, performance, and best practices
- Return ONLY the improved code, NO explanations
- Preserve functionality and behavior
- Add brief comments for significant changes
- Follow modern ${params.language || 'code'} conventions${params.context ? '\n- Consider the surrounding code to maintain consistency' : ''}`;

            userPrompt = `Improve this ${params.language || 'code'}:${contextInfo}\n\nSelected code:\n\`\`\`${params.language || ''}\n${params.text}\n\`\`\``;
            returnCodeOnly = true;
            break;

          // === Writing Tools (Notion style) ===
          case 'continue':
            systemPrompt = `You are a writing assistant that continues text naturally.

Rules:
- Continue the text maintaining the same style, tone, and voice
- Write 2-4 additional sentences that flow naturally
- Match the subject matter and context
- DO NOT repeat what's already written
- Keep it relevant and coherent`;

            userPrompt = `Continue this text:\n\n${params.text}`;
            break;

          case 'make-shorter':
            systemPrompt = `You are a writing assistant that makes text more concise.

Rules:
- Reduce length by 30-50% while preserving key information
- Remove redundancy and unnecessary details
- Keep the main message and tone
- Maintain clarity and readability
- Return ONLY the shortened text, no explanations`;

            userPrompt = `Make this text shorter:\n\n${params.text}`;
            break;

          case 'make-longer':
            systemPrompt = `You are a writing assistant that expands text.

Rules:
- Add relevant details, examples, or elaboration
- Increase length by 30-50% naturally
- Maintain the original tone and style
- Add substance, not just filler
- Keep it coherent and well-structured`;

            userPrompt = `Make this text longer:\n\n${params.text}`;
            break;

          case 'simplify':
            systemPrompt = `You are a writing assistant that simplifies complex text.

Rules:
- Use simpler words and shorter sentences
- Break down complex ideas into clear explanations
- Maintain the original meaning
- Make it accessible to a general audience
- Keep it concise and easy to understand`;

            userPrompt = `Simplify this text:\n\n${params.text}`;
            break;

          case 'fix-grammar':
            systemPrompt = `You are a grammar and spelling expert.

Rules:
- Fix all spelling, grammar, and punctuation errors
- Improve sentence structure where needed
- Preserve the original meaning and tone
- Keep technical terms and proper nouns unchanged
- Return ONLY the corrected text, no explanations`;

            userPrompt = `Fix spelling and grammar:\n\n${params.text}`;
            break;

          case 'change-tone-professional':
            systemPrompt = `You are a writing assistant that adjusts tone to be professional.

Rules:
- Rewrite in a formal, business-appropriate tone
- Use professional language and vocabulary
- Remove casual expressions and slang
- Maintain clarity and directness
- Keep the core message intact`;

            userPrompt = `Change tone to professional:\n\n${params.text}`;
            break;

          case 'change-tone-casual':
            systemPrompt = `You are a writing assistant that adjusts tone to be casual.

Rules:
- Rewrite in a friendly, conversational tone
- Use everyday language and expressions
- Make it approachable and relatable
- Avoid overly formal language
- Keep the core message intact`;

            userPrompt = `Change tone to casual:\n\n${params.text}`;
            break;

          case 'change-tone-friendly':
            systemPrompt = `You are a writing assistant that adjusts tone to be friendly.

Rules:
- Rewrite in a warm, welcoming tone
- Use positive and encouraging language
- Make it personable and empathetic
- Add warmth without being overly casual
- Keep the core message intact`;

            userPrompt = `Change tone to friendly:\n\n${params.text}`;
            break;

          case 'find-action-items':
            systemPrompt = `You are an assistant that extracts action items from text.

Rules:
- Identify all tasks, to-dos, and action items
- Present as a clear bulleted list
- Use action verbs (e.g., "Create", "Review", "Send")
- Be specific and concise
- If no action items found, say "No action items found"`;

            userPrompt = `Find action items in this text:\n\n${params.text}`;
            break;

          case 'create-outline':
            systemPrompt = `You are an assistant that creates structured outlines.

Rules:
- Create a hierarchical outline with main points and sub-points
- Use clear headings and nested structure
- Capture all key topics and ideas
- Organize logically and coherently
- Keep it concise but comprehensive`;

            userPrompt = `Create an outline for this text:\n\n${params.text}`;
            break;

          default:
            throw new Error(`Unknown action: ${params.action}`);
        }

        // Determine action type for EditorAgent context
        const codeActions = ['complete', 'fix', 'improve', 'explain'];
        const isCodeAction = codeActions.includes(params.action);
        const actionCategory = isCodeAction ? 'code-action' : 'writing-tool';

        // Use Editor Agent
        const { GraphFactory } = await import('../../../lib/langgraph');

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

        const initialState = {
          messages,
          toolResults: [],
          editorContext: {
            language: params.language,
            selectedText: params.text,
            action: actionCategory as 'code-action' | 'writing-tool',
            actionType: params.action,
            useRag: params.context?.useRag,
            useTools: params.context?.useTools,
          },
        };

        let result = '';
        for await (const event of GraphFactory.streamEditorAgent(initialState)) {
          if (event.type === 'message' && event.message) {
            result = event.message.content || '';
          }
          if (event.type === 'error') {
            throw new Error(event.error);
          }
        }

        // Parse and clean the response
        result = result.trim();

        // If expecting code only, remove markdown code blocks
        if (returnCodeOnly) {
          // Remove markdown code blocks
          result = result
            .replace(/```[\w]*\n?/g, '')
            .replace(/```$/g, '')
            .trim();

          // Remove leading/trailing quotes if present
          if (
            (result.startsWith('"') && result.endsWith('"')) ||
            (result.startsWith("'") && result.endsWith("'"))
          ) {
            result = result.slice(1, -1);
          }
        }

        return {
          success: true,
          data: {
            result: result,
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
