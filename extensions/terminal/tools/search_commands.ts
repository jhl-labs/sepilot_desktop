/**
 * Terminal Tool: search_commands
 *
 * RAG 기반으로 유사한 명령어를 검색합니다.
 */

import { logger } from '@/lib/utils/logger';
import type { TerminalBlock } from '../types';

/**
 * search_commands Tool 정의
 */
export const searchCommandsTool = {
  name: 'search_commands',
  description: 'Search similar commands from history using semantic search (RAG)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query or keyword to search for',
      },
      topK: {
        type: 'number',
        description: 'Number of results to return (default: 5)',
        default: 5,
      },
    },
    required: ['query'],
  },
};

/**
 * search_commands Tool 실행 함수
 */
export async function executeSearchCommands(args: { query: string; topK?: number }): Promise<{
  success: boolean;
  results?: Array<{
    block: TerminalBlock;
    score: number;
  }>;
  error?: string;
}> {
  const { query, topK = 5 } = args;

  logger.info('[search_commands] Searching for:', query, 'topK:', topK);

  try {
    // Renderer Process: VectorDB 검색 사용
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        // 1. Embedding 생성
        const embeddingsConfig = {
          apiKey: process.env.OPENAI_API_KEY || '',
          model: 'text-embedding-ada-002',
          baseURL: 'https://api.openai.com/v1',
        };

        const embeddingResult = await window.electronAPI.embeddings.generate(
          query,
          embeddingsConfig
        );

        if (!embeddingResult.success || !embeddingResult.data) {
          throw new Error('Failed to generate embedding');
        }

        const queryEmbedding = embeddingResult.data;

        // 2. VectorDB 검색
        const searchResult = await window.electronAPI.vectorDB.search(queryEmbedding, topK, {
          source: 'terminal-block',
        });

        if (!searchResult.success || !searchResult.data) {
          throw new Error('VectorDB search failed');
        }

        // 3. 결과를 TerminalBlock 형태로 변환
        const results = searchResult.data
          .filter((item) => item.metadata?.type === 'terminal-block' && item.metadata)
          .map((item) => {
            const metadata = item.metadata!; // null 체크 완료
            return {
              block: {
                id: metadata.blockId,
                command: metadata.command,
                cwd: metadata.cwd,
                sessionId: metadata.shell,
                timestamp: metadata.timestamp,
                exitCode: metadata.exitCode,
                aiGenerated: metadata.aiGenerated,
                output: item.text || '',
                type: metadata.hasError ? 'error' : 'command',
              } as TerminalBlock,
              score: item.score,
            };
          });

        logger.info('[search_commands] Found', results.length, 'results via VectorDB');

        return {
          success: true,
          results,
        };
      } catch (vectorError: any) {
        logger.warn(
          '[search_commands] VectorDB search failed, falling back to keyword search:',
          vectorError.message
        );
        // Fallback to keyword search
      }

      // Fallback: 키워드 기반 검색
      const { useChatStore } = await import('@/lib/store/chat-store');
      const store = useChatStore.getState();

      const blocks = store.terminalBlocks || [];
      const lowerQuery = query.toLowerCase();

      // 키워드 매칭
      const matches = blocks
        .filter((block) => {
          const commandMatch = block.command.toLowerCase().includes(lowerQuery);
          const naturalInputMatch = block.naturalInput?.toLowerCase().includes(lowerQuery);
          const outputMatch = block.output.toLowerCase().includes(lowerQuery);

          return commandMatch || naturalInputMatch || outputMatch;
        })
        .slice(-topK)
        .reverse()
        .map((block) => ({
          block,
          score: 0.5, // 키워드 매칭 스코어 (낮음)
        }));

      logger.info('[search_commands] Found', matches.length, 'matches (fallback mode)');

      return {
        success: true,
        results: matches,
      };
    }

    // Main Process 또는 Electron 환경 아님
    return {
      success: false,
      error: 'VectorDB search requires Electron environment',
    };
  } catch (error: any) {
    logger.error('[search_commands] Search failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
