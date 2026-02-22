import { LLMConfig } from '@/types';
import { BaseLLMProvider } from './base';
import { OpenAIProvider } from './providers/openai';

export class LLMClient {
  private provider: BaseLLMProvider | null = null;

  constructor(config?: LLMConfig) {
    if (config) {
      this.setConfig(config);
    }
  }

  setConfig(config: LLMConfig): void {
    console.log('[LLMClient] setConfig called with:', {
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
    });
    switch (config.provider) {
      case 'openai':
      case 'anthropic':
      case 'gemini':
      case 'ollama':
      case 'custom': {
        // Determine default baseURL if not provided
        let baseURL = config.baseURL;
        if (!baseURL || !baseURL.trim()) {
          console.log(
            '[LLMClient] No baseURL provided, using default for provider:',
            config.provider
          );
          if (config.provider === 'openai') {
            baseURL = 'https://api.openai.com/v1';
          } else if (config.provider === 'anthropic') {
            baseURL = 'https://api.anthropic.com/v1';
          }
        }

        // OpenAI Compatible API를 사용 (Gemini, Ollama, Custom 모두 OpenAI Compatible API 지원)
        this.provider = new OpenAIProvider(
          baseURL || '', // Ensure string
          config.apiKey,
          config.model,
          {
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          },
          config // Pass full config for network settings
        );
        console.log(
          '[LLMClient] OpenAIProvider initialized for model:',
          config.model,
          'baseURL:',
          baseURL
        );
        break;
      }
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  getProvider(): BaseLLMProvider {
    if (!this.provider) {
      throw new Error('LLM provider not initialized. Call setConfig() first.');
    }
    return this.provider;
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }
}

// Singleton instance
let llmClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!llmClient) {
    console.log('[LLMClient] Creating new LLMClient singleton instance');
    llmClient = new LLMClient();
  } else {
    // console.log('[LLMClient] Returning existing LLMClient singleton instance');
  }
  return llmClient;
}

export function initializeLLMClient(config: LLMConfig): void {
  const client = getLLMClient();
  client.setConfig(config);
}

/**
 * Create a standalone LLM provider instance (for autocomplete, editor actions, etc.)
 */
export function createProvider(config: LLMConfig): BaseLLMProvider {
  switch (config.provider) {
    case 'openai':
    case 'anthropic':
    case 'gemini':
    case 'ollama': {
      // Determine default baseURL if not provided
      let providerBaseURL = config.baseURL;
      if (!providerBaseURL || !providerBaseURL.trim()) {
        if (config.provider === 'openai') {
          providerBaseURL = 'https://api.openai.com/v1';
        } else if (config.provider === 'anthropic') {
          providerBaseURL = 'https://api.anthropic.com/v1';
        }
      }

      // OpenAI Compatible API를 사용 (Gemini, Ollama 모두 OpenAI Compatible API 지원)
      return new OpenAIProvider(
        providerBaseURL || '',
        config.apiKey,
        config.model,
        {
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        config
      );
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
