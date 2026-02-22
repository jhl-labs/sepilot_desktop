/**
 * Embeddings IPC Handlers
 * Main Process에서 임베딩 API를 호출하여 CORS 문제 해결
 * Network Config (프록시, SSL 검증, 커스텀 헤더) 지원
 */

import { ipcMain } from 'electron';
import { logger } from '../../../services/logger';
import { fetchWithConfig } from '@/lib/domains/llm/http-utils';
import { LLMConfig } from '@/types';
import { ErrorRecovery } from '@/lib/domains/agent/utils/error-recovery';

/**
 * OpenAI Embeddings API 호출 (내부 구현)
 */
async function generateEmbeddingInternal(
  text: string,
  config: {
    apiKey: string;
    model: string;
    baseURL: string;
    networkConfig?: LLMConfig['network'];
  }
): Promise<number[]> {
  const url = `${config.baseURL}/embeddings`;

  // LLMConfig 형태로 변환하여 fetchWithConfig 사용
  const llmConfig: LLMConfig = {
    provider: 'openai',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0.7,
    maxTokens: 2000,
    network: config.networkConfig,
  };

  const response = await fetchWithConfig(url, llmConfig, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embeddings API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * OpenAI Embeddings API 호출
 * 10초 타임아웃 with 2회 재시도 추가
 */
async function generateEmbedding(
  text: string,
  config: {
    apiKey: string;
    model: string;
    baseURL: string;
    networkConfig?: LLMConfig['network'];
  }
): Promise<number[]> {
  try {
    // 🔄 타임아웃 래핑 추가 (10초)
    const result = await ErrorRecovery.withTimeoutAndRetry(
      async () => generateEmbeddingInternal(text, config),
      10000, // 10초 타임아웃
      {
        maxRetries: 2, // 2회 재시도 (네트워크 이슈 대응)
        initialDelayMs: 500,
      },
      'Embedding Generation'
    );

    if (!result.success) {
      const error = result.error || new Error('Embedding generation failed');
      logger.error('Embedding generation failed:', {
        attempts: result.attempts,
        duration: result.totalDurationMs,
        error: error.message,
      });
      throw error;
    }

    return result.result || [];
  } catch (error: any) {
    logger.error('Embedding generation error:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Batch Embeddings API 호출 (내부 구현)
 */
async function generateEmbeddingBatchInternal(
  texts: string[],
  config: {
    apiKey: string;
    model: string;
    baseURL: string;
    networkConfig?: LLMConfig['network'];
  }
): Promise<number[][]> {
  const url = `${config.baseURL}/embeddings`;

  const llmConfig: LLMConfig = {
    provider: 'openai',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0.7,
    maxTokens: 2000,
    network: config.networkConfig,
  };

  const response = await fetchWithConfig(url, llmConfig, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embeddings API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.data.map((item: any) => item.embedding);
}

/**
 * Batch Embeddings API 호출
 * 10초 타임아웃 with 2회 재시도 추가
 */
async function generateEmbeddingBatch(
  texts: string[],
  config: {
    apiKey: string;
    model: string;
    baseURL: string;
    networkConfig?: LLMConfig['network'];
  }
): Promise<number[][]> {
  try {
    // 🔄 타임아웃 래핑 추가 (10초)
    const result = await ErrorRecovery.withTimeoutAndRetry(
      async () => generateEmbeddingBatchInternal(texts, config),
      10000, // 10초 타임아웃
      {
        maxRetries: 2, // 2회 재시도 (네트워크 이슈 대응)
        initialDelayMs: 500,
      },
      'Batch Embedding Generation'
    );

    if (!result.success) {
      const error = result.error || new Error('Batch embedding generation failed');
      logger.error('Batch embedding generation failed:', {
        attempts: result.attempts,
        duration: result.totalDurationMs,
        error: error.message,
      });
      throw error;
    }

    return result.result || [];
  } catch (error: any) {
    logger.error('Batch embedding generation error:', error);
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

export function setupEmbeddingsHandlers() {
  /**
   * 단일 텍스트 임베딩 생성
   */
  ipcMain.handle(
    'embeddings-generate',
    async (
      _event,
      text: string,
      config: {
        apiKey: string;
        model: string;
        baseURL: string;
        networkConfig?: LLMConfig['network'];
      }
    ) => {
      try {
        logger.info('[Embeddings IPC] Generating embedding for text length:', text.length);
        const embedding = await generateEmbedding(text, config);
        return {
          success: true,
          data: embedding,
        };
      } catch (error: any) {
        logger.error('[Embeddings IPC] Failed to generate embedding:', error);
        return {
          success: false,
          error: error.message || 'Failed to generate embedding',
        };
      }
    }
  );

  /**
   * 배치 임베딩 생성
   */
  ipcMain.handle(
    'embeddings-generate-batch',
    async (
      _event,
      texts: string[],
      config: {
        apiKey: string;
        model: string;
        baseURL: string;
        networkConfig?: LLMConfig['network'];
      }
    ) => {
      try {
        logger.info('[Embeddings IPC] Generating embeddings for batch size:', texts.length);
        const embeddings = await generateEmbeddingBatch(texts, config);
        return {
          success: true,
          data: embeddings,
        };
      } catch (error: any) {
        logger.error('[Embeddings IPC] Failed to generate batch embeddings:', error);
        return {
          success: false,
          error: error.message || 'Failed to generate embeddings',
        };
      }
    }
  );

  /**
   * Embeddings API 검증
   */
  ipcMain.handle(
    'embeddings-validate',
    async (
      _event,
      config: {
        apiKey: string;
        model: string;
        baseURL: string;
        networkConfig?: LLMConfig['network'];
      }
    ) => {
      try {
        // 테스트 텍스트로 검증
        await generateEmbedding('test', config);
        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Embeddings IPC] Validation failed:', error);
        return {
          success: false,
          error: error.message || 'Validation failed',
        };
      }
    }
  );

  logger.info('Embeddings IPC handlers registered');
}
