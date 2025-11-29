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
    switch (config.provider) {
      case 'openai':
      case 'anthropic':
      case 'custom':
        // OpenAI Compatible API를 사용
        this.provider = new OpenAIProvider(
          config.baseURL,
          config.apiKey,
          config.model,
          {
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          },
          config // Pass full config for network settings
        );
        break;
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
    llmClient = new LLMClient();
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
    case 'custom':
      return new OpenAIProvider(
        config.baseURL,
        config.apiKey,
        config.model,
        {
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        config
      );
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
