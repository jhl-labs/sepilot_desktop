import { logger } from '@/lib/utils/logger';
/**
 * Vision Model Utilities
 * LLM 메시지에서 이미지 감지 및 비전 모델 프로바이더 생성
 */

import { Message, LLMConfig } from '@/types';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';
import { BaseLLMProvider } from './base';

/**
 * Check if any message contains images
 */
export function hasImages(messages: Message[]): boolean {
  const result = messages.some((msg) => msg.images && msg.images.length > 0);
  if (result) {
    logger.info('[VisionUtils] hasImages: true', {
      messageCount: messages.length,
      messagesWithImages: messages.filter((msg) => msg.images && msg.images.length > 0).length,
      imageCounts: messages
        .filter((msg) => msg.images && msg.images.length > 0)
        .map((msg) => ({ role: msg.role, imageCount: msg.images?.length || 0 })),
    });
  }
  return result;
}

/**
 * Vision provider configuration options
 */
export interface VisionProviderOptions {
  enableStreaming?: boolean;
  maxImageTokens?: number;
}

/**
 * Create a vision provider from LLM config
 * Returns null if vision is not configured or disabled
 */
export function createVisionProvider(
  llmConfig: LLMConfig,
  options?: VisionProviderOptions
): BaseLLMProvider | null {
  const visionConfig = llmConfig.vision;

  // Debug: Log what we received
  logger.info('[VisionUtils] createVisionProvider called');
  logger.info('[VisionUtils] visionConfig:', {
    enabled: visionConfig?.enabled,
    model: visionConfig?.model,
    baseURL: visionConfig?.baseURL,
    provider: visionConfig?.provider,
    hasVisionConfig: !!visionConfig,
    visionConfigKeys: visionConfig ? Object.keys(visionConfig) : [],
  });

  // Only use vision model if it's enabled and configured
  if (!visionConfig?.enabled || !visionConfig?.model) {
    logger.warn('[VisionUtils] Vision provider disabled or not configured, returning null', {
      hasVisionConfig: !!visionConfig,
      enabled: visionConfig?.enabled,
      model: visionConfig?.model,
      modelType: typeof visionConfig?.model,
      modelLength: visionConfig?.model?.length,
      fullVisionConfig: JSON.stringify(visionConfig, null, 2),
    });
    return null;
  }

  const baseURL = visionConfig.baseURL || llmConfig.baseURL;
  const apiKey = visionConfig.apiKey || llmConfig.apiKey || '';

  // Vision 모델용 max_tokens 제한 (Ollama는 큰 값을 처리 못함)
  const maxTokens = visionConfig.maxImageTokens || llmConfig.maxTokens;
  const limitedMaxTokens = Math.min(maxTokens, options?.maxImageTokens || 4096);

  // Detect if using Ollama (default port 11434 or ollama in URL)
  const isOllama =
    baseURL.includes(':11434') || // Any IP/hostname with Ollama default port
    baseURL.includes('/api/chat') || // Ollama native API endpoint
    baseURL.includes('ollama'); // 'ollama' in hostname/URL

  let provider: BaseLLMProvider;

  if (isOllama) {
    // Use native Ollama provider for better image support
    // Normalize baseURL: remove /v1 or /v1/chat/completions suffix for native API
    let ollamaBaseURL = baseURL;
    if (ollamaBaseURL.endsWith('/v1/chat/completions')) {
      ollamaBaseURL = ollamaBaseURL.replace('/v1/chat/completions', '');
    } else if (ollamaBaseURL.endsWith('/v1')) {
      ollamaBaseURL = ollamaBaseURL.replace('/v1', '');
    }

    logger.info('[VisionUtils] Detected Ollama, using OllamaProvider');
    logger.info('[VisionUtils] Original baseURL:', baseURL);
    logger.info('[VisionUtils] Normalized baseURL:', ollamaBaseURL);

    provider = new OllamaProvider(
      ollamaBaseURL,
      apiKey,
      visionConfig.model,
      {
        temperature: llmConfig.temperature,
        maxTokens: limitedMaxTokens,
      },
      llmConfig
    );
  } else {
    // Use OpenAI-compatible provider for other services
    logger.info('[VisionUtils] Using OpenAIProvider for vision model');
    provider = new OpenAIProvider(
      baseURL,
      apiKey,
      visionConfig.model,
      {
        temperature: llmConfig.temperature,
        maxTokens: limitedMaxTokens,
      },
      llmConfig
    );
  }

  // Set streaming capability based on config
  (provider as BaseLLMProvider & { streamingEnabled?: boolean }).streamingEnabled =
    visionConfig.enableStreaming ?? options?.enableStreaming ?? false;

  return provider;
}

/**
 * Get vision provider from app config (Web/Electron renderer)
 * Loads config from localStorage or Electron API
 */
export async function getVisionProviderFromConfig(): Promise<BaseLLMProvider | null> {
  if (typeof window === 'undefined') {
    logger.warn('[VisionUtils] getVisionProviderFromConfig called in non-window context');
    return null;
  }

  try {
    let llmConfig: LLMConfig | null = null;

    if (window.electronAPI) {
      // Electron: SQLite에서 로드
      logger.info('[VisionUtils] Loading config from Electron API');
      const result = await window.electronAPI.config.load();
      logger.info('[VisionUtils] Electron API result:', {
        success: result.success,
        hasData: !!result.data,
        hasLLM: !!result.data?.llm,
        hasVision: !!result.data?.llm?.vision,
      });
      if (result.success && result.data?.llm) {
        llmConfig = result.data.llm;
      }
    } else {
      // Web: localStorage에서 로드
      logger.info('[VisionUtils] Loading config from localStorage');
      const savedConfig = localStorage.getItem('sepilot_llm_config');
      if (savedConfig) {
        llmConfig = JSON.parse(savedConfig);
        logger.info('[VisionUtils] Loaded from localStorage:', {
          hasVision: !!llmConfig?.vision,
        });
      }
    }

    if (!llmConfig) {
      logger.warn('[VisionUtils] No LLM config found');
      return null;
    }

    logger.info('[VisionUtils] LLM config loaded, vision config:', {
      hasVision: !!llmConfig.vision,
      enabled: llmConfig.vision?.enabled,
      model: llmConfig.vision?.model,
    });

    const provider = createVisionProvider(llmConfig);
    if (!provider) {
      logger.error(
        '[VisionUtils] createVisionProvider returned null - check logs above for details'
      );
    }
    return provider;
  } catch (error) {
    logger.error('[VisionUtils] Error getting vision provider:', error);
    return null;
  }
}
