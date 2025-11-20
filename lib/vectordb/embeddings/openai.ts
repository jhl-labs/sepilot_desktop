import { EmbeddingProvider } from './interface';
import { LLMConfig } from '@/types';

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
    this.baseURL = config.baseURL && config.baseURL.trim() ? config.baseURL : 'https://api.openai.com/v1';
    this.networkConfig = config.networkConfig;

    console.log('[OpenAIEmbeddings] Constructor called with model:', this.model, 'from config.model:', config.model);

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

      // 브라우저 환경: 직접 fetch (CORS 주의 필요)
      console.warn('[OpenAI Embeddings] Running in browser mode - CORS may occur');
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error: any) {
      console.error('Embedding error:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
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

      // 브라우저 환경: 직접 fetch (CORS 주의 필요)
      console.warn('[OpenAI Embeddings] Running in browser mode - CORS may occur');
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.map((item: any) => item.embedding);
    } catch (error: any) {
      console.error('Batch embedding error:', error);
      throw new Error(`Failed to generate embeddings: ${error.message}`);
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
