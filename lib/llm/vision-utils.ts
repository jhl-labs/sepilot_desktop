/**
 * Vision Model Utilities
 * LLM 메시지에서 이미지 감지 및 비전 모델 프로바이더 생성
 */

import { Message, LLMConfig, AppConfig } from '@/types';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';
import { BaseLLMProvider } from './base';

// Logger that works in both Electron Main Process and Browser
const log = {
  info: (...args: any[]) => {
    if (typeof process !== 'undefined' && process.versions?.electron) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { logger } = require('../../electron/services/logger');
        logger.info(...args);
      } catch {
        console.log(...args);
      }
    } else {
      console.log(...args);
    }
  },
};

/**
 * Check if any message contains images
 */
export function hasImages(messages: Message[]): boolean {
  return messages.some((msg) => msg.images && msg.images.length > 0);
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
  log.info('[VisionUtils] createVisionProvider called');
  log.info('[VisionUtils] visionConfig:', {
    enabled: visionConfig?.enabled,
    model: visionConfig?.model,
    baseURL: visionConfig?.baseURL,
    provider: visionConfig?.provider,
  });

  // Only use vision model if it's enabled and configured
  if (!visionConfig?.enabled || !visionConfig?.model) {
    log.info('[VisionUtils] Vision provider disabled or not configured, returning null');
    return null;
  }

  const baseURL = visionConfig.baseURL || llmConfig.baseURL;
  const apiKey = visionConfig.apiKey || llmConfig.apiKey || '';

  // Vision 모델용 max_tokens 제한 (Ollama는 큰 값을 처리 못함)
  const maxTokens = visionConfig.maxImageTokens || llmConfig.maxTokens;
  const limitedMaxTokens = Math.min(maxTokens, options?.maxImageTokens || 4096);

  // Detect if using Ollama (default port 11434 or ollama in URL)
  const isOllama =
    baseURL.includes(':11434') ||     // Any IP/hostname with Ollama default port
    baseURL.includes('/api/chat') ||  // Ollama native API endpoint
    baseURL.includes('ollama');       // 'ollama' in hostname/URL

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

    log.info('[VisionUtils] Detected Ollama, using OllamaProvider');
    log.info('[VisionUtils] Original baseURL:', baseURL);
    log.info('[VisionUtils] Normalized baseURL:', ollamaBaseURL);

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
    log.info('[VisionUtils] Using OpenAIProvider for vision model');
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
  (provider as any).streamingEnabled = visionConfig.enableStreaming ?? options?.enableStreaming ?? false;

  return provider;
}

/**
 * Get vision provider from app config (Web/Electron renderer)
 * Loads config from localStorage or Electron API
 */
export async function getVisionProviderFromConfig(): Promise<BaseLLMProvider | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    let llmConfig: LLMConfig | null = null;

    if (window.electronAPI) {
      // Electron: SQLite에서 로드
      const result = await window.electronAPI.config.load();
      if (result.success && result.data?.llm) {
        llmConfig = result.data.llm;
      }
    } else {
      // Web: localStorage에서 로드
      const savedConfig = localStorage.getItem('sepilot_llm_config');
      if (savedConfig) {
        llmConfig = JSON.parse(savedConfig);
      }
    }

    if (!llmConfig) {
      return null;
    }

    return createVisionProvider(llmConfig);
  } catch (error) {
    console.error('[VisionUtils] Error getting vision provider:', error);
    return null;
  }
}
