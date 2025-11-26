/**
 * Vision Model Utilities
 * LLM 메시지에서 이미지 감지 및 비전 모델 프로바이더 생성
 */

import { Message, LLMConfig, AppConfig } from '@/types';
import { OpenAIProvider } from './providers/openai';

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
): OpenAIProvider | null {
  const visionConfig = llmConfig.vision;

  // Only use vision model if it's enabled and configured
  if (!visionConfig?.enabled || !visionConfig?.model) {
    return null;
  }

  const baseURL = visionConfig.baseURL || llmConfig.baseURL;
  const apiKey = visionConfig.apiKey || llmConfig.apiKey || '';

  // Vision 모델용 max_tokens 제한 (Ollama는 큰 값을 처리 못함)
  const maxTokens = visionConfig.maxImageTokens || llmConfig.maxTokens;
  const limitedMaxTokens = Math.min(maxTokens, options?.maxImageTokens || 4096);

  // Always use OpenAI-compatible provider (supports Ollama's OpenAI-compatible API)
  const provider = new OpenAIProvider(
    baseURL,
    apiKey,
    visionConfig.model,
    {
      temperature: llmConfig.temperature,
      maxTokens: limitedMaxTokens,
    },
    llmConfig
  );

  // Set streaming capability based on config
  (provider as any).streamingEnabled = visionConfig.enableStreaming ?? options?.enableStreaming ?? false;

  return provider;
}

/**
 * Get vision provider from app config (Web/Electron renderer)
 * Loads config from localStorage or Electron API
 */
export async function getVisionProviderFromConfig(): Promise<OpenAIProvider | null> {
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
