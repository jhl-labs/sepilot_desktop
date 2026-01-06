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
    // VectorDB가 비활성화된 경우 fallback
    // NOTE: Phase 5에서 RAG를 완전히 구현할 때 이 부분을 수정
    if (typeof window !== 'undefined') {
      // 간단한 키워드 기반 검색 (Fallback)
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
          score: 1.0, // 임시 스코어
        }));

      logger.info('[search_commands] Found', matches.length, 'matches (fallback mode)');

      return {
        success: true,
        results: matches,
      };
    }

    // Main Process: VectorDB 검색 (Phase 5에서 구현 예정)
    // const embedder = getEmbeddingProvider();
    // const queryEmbedding = await embedder.embed(query);
    // const results = await vectorDBService.searchByVector(queryEmbedding, topK, {
    //   filter: { type: 'terminal-block' },
    // });

    return {
      success: false,
      error: 'VectorDB search not implemented yet (Phase 5)',
    };
  } catch (error: any) {
    logger.error('[search_commands] Search failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
