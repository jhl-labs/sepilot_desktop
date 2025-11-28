import { EmbeddingProvider } from './interface';
import { OpenAIEmbeddings } from './openai';
import { EmbeddingConfig } from '../types';

/**
 * Embedding Client Singleton
 */
class EmbeddingClientClass {
  private provider: EmbeddingProvider | null = null;
  private config: EmbeddingConfig | null = null;

  initialize(config: EmbeddingConfig) {
    this.config = config;

    console.log('[EmbeddingClient] Initializing with config:', {
      provider: config.provider,
      model: config.model,
      baseURL: config.baseURL,
    });

    switch (config.provider) {
      case 'openai': {
        if (!config.apiKey) {
          throw new Error('OpenAI API key is required');
        }

        // 모델 명시적 처리 - 설정된 모델 우선, 없으면 기본값
        const model = config.model && config.model.trim() ? config.model : 'text-embedding-3-small';
        const baseURL = config.baseURL && config.baseURL.trim() ? config.baseURL : 'https://api.openai.com/v1';

        this.provider = new OpenAIEmbeddings({
          apiKey: config.apiKey,
          model,
          baseURL,
          networkConfig: config.networkConfig, // Network Config 전달 (proxy, SSL, headers)
        });
        break;
      }

      case 'local':
        // TODO: 로컬 임베딩 모델 구현 (예: transformers.js)
        throw new Error('Local embeddings not yet implemented');

      default:
        throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  }

  getProvider(): EmbeddingProvider {
    if (!this.provider) {
      throw new Error('Embedding client not initialized');
    }
    return this.provider;
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }

  getConfig(): EmbeddingConfig | null {
    return this.config;
  }
}

export const EmbeddingClient = new EmbeddingClientClass();

/**
 * Embedding 초기화 헬퍼
 */
export function initializeEmbedding(config: EmbeddingConfig) {
  EmbeddingClient.initialize(config);
}

/**
 * Embedding Provider 가져오기
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  return EmbeddingClient.getProvider();
}
