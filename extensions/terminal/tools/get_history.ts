/**
 * Terminal Tool: get_history
 *
 * Store에서 최근 명령어 히스토리를 조회합니다.
 */

import { logger } from '@/lib/utils/logger';
import type { TerminalBlock } from '../types';

/**
 * get_history Tool 정의
 */
export const getHistoryTool = {
  name: 'get_history',
  description: 'Retrieve recent command history from the terminal',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of history entries to return (default: 10)',
        default: 10,
      },
      cwd: {
        type: 'string',
        description: 'Filter by working directory (optional)',
      },
      includeOutput: {
        type: 'boolean',
        description: 'Include command output in results (default: false)',
        default: false,
      },
    },
  },
};

/**
 * get_history Tool 실행 함수
 */
export async function executeGetHistory(args: {
  limit?: number;
  cwd?: string;
  includeOutput?: boolean;
}): Promise<{ success: boolean; history?: TerminalBlock[]; error?: string }> {
  const { limit = 10, cwd, includeOutput = false } = args;

  logger.info('[get_history] Retrieving history, limit:', limit, 'cwd:', cwd);

  try {
    // Renderer Process (브라우저)에서 실행되는 경우
    if (typeof window !== 'undefined') {
      // useChatStore를 동적으로 import
      const { useChatStore } = await import('@/lib/store/chat-store');
      const store = useChatStore.getState();

      // terminalBlocks 조회
      let blocks = store.terminalBlocks || [];

      // CWD 필터링
      if (cwd) {
        blocks = blocks.filter((block) => block.cwd === cwd);
      }

      // 최근 limit개만 선택
      const recentBlocks = blocks.slice(-limit);

      // Output 제거 (옵션)
      const result = includeOutput
        ? recentBlocks
        : recentBlocks.map((block) => ({
            ...block,
            output: block.output ? `[${block.output.length} chars]` : '',
          }));

      return {
        success: true,
        history: result,
      };
    }

    // Main Process에서는 직접 접근 불가
    return {
      success: false,
      error: 'get_history should be called from Renderer Process',
    };
  } catch (error: any) {
    logger.error('[get_history] Failed to retrieve history:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
