import { getErrorMessage } from '@/lib/utils/error-handler';
import { EmbeddingProvider } from './interface';
import { LLMConfig } from '@/types';
import { httpPost } from '@/lib/http';

import { logger } from '@/lib/utils/logger';
export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  networkConfig?: LLMConfig['network']; // Network settings for proxy, SSL, headers
}

/**
 * Check if running in Electron environment
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
}

/**
 * OpenAI Embeddings Provider
 * CORS-safe: Uses Electron IPC in Electron environment
 */
interface OpenAIEmbeddingApiResponse {
  data: Array<{
    embedding: number[];
  }>;
}

export class OpenAIEmbeddings extends EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;
  private dimension: number;
  private networkConfig?: LLMConfig['network'];

  constructor(config: OpenAIEmbeddingConfig) {
    super();
    this.apiKey = config.apiKey;
    // 명시적으로 모델 처리 - 빈 문자열도 기본값으로 처리
    this.model = config.model && config.model.trim() ? config.model : 'text-embedding-3-small';
    this.baseURL =
      config.baseURL && config.baseURL.trim() ? config.baseURL : 'https://api.openai.com/v1';
    this.networkConfig = config.networkConfig;

    logger.info('[OpenAIEmbeddings] Constructor called', {
      model: this.model,
      configuredModel: config.model,
    });

    // 모델별 차원 설정
    this.dimension = this.model === 'text-embedding-3-large' ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    try {
      // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 문제 없음)
      if (isElectron() && window.electronAPI?.embeddings) {
        const result = await window.electronAPI.embeddings.generate(text, {
          apiKey: this.apiKey,
          model: this.model,
          baseURL: this.baseURL,
          networkConfig: this.networkConfig,
        });

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to generate embedding');
        }

        return result.data;
      }

      // 브라우저 환경: httpPost 사용 (NetworkConfig 자동 적용)
      logger.warn('[OpenAI Embeddings] Running in browser mode - using httpPost');
      const response = await httpPost(
        `${this.baseURL}/embeddings`,
        {
          model: this.model,
          input: text,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          networkConfig: this.networkConfig,
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingApiResponse;
      const embedding = data.data[0]?.embedding;
      if (!embedding) {
        throw new Error('Embedding data is missing in API response');
      }
      return embedding;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Embedding error', { message, error });
      throw new Error(`Failed to generate embedding: ${message}`);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 문제 없음)
      if (isElectron() && window.electronAPI?.embeddings) {
        const result = await window.electronAPI.embeddings.generateBatch(texts, {
          apiKey: this.apiKey,
          model: this.model,
          baseURL: this.baseURL,
          networkConfig: this.networkConfig,
        });

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to generate embeddings');
        }

        return result.data;
      }

      // 브라우저 환경: httpPost 사용 (NetworkConfig 자동 적용)
      logger.warn('[OpenAI Embeddings] Running in browser mode - using httpPost');
      const response = await httpPost(
        `${this.baseURL}/embeddings`,
        {
          model: this.model,
          input: texts,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          networkConfig: this.networkConfig,
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingApiResponse;
      return data.data.map((item) => item.embedding);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Batch embedding error', { message, error });
      throw new Error(`Failed to generate embeddings: ${message}`);
    }
  }

  getDimension(): number {
    return this.dimension;
  }

  async validate(): Promise<boolean> {
    try {
      // Electron 환경: IPC를 통해 검증
      if (isElectron() && window.electronAPI?.embeddings) {
        const result = await window.electronAPI.embeddings.validate({
          apiKey: this.apiKey,
          model: this.model,
          baseURL: this.baseURL,
          networkConfig: this.networkConfig,
        });
        return result.success;
      }

      // 브라우저 환경: 직접 테스트
      await this.embed('test');
      return true;
    } catch {
      return false;
    }
  }
}
