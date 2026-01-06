/**
 * Terminal VectorDB Integration
 *
 * 터미널 블록을 VectorDB에 인덱싱하여 RAG 기반 검색을 지원합니다.
 */

import type { TerminalBlock } from '../types';
import { logger } from '@/lib/utils/logger';

/**
 * 터미널 블록을 VectorDB 문서로 변환
 */
export function terminalBlockToDocument(block: TerminalBlock) {
  // 검색 가능한 텍스트 생성: 명령어 + 자연어 입력 + 출력 + AI 분석
  const parts: string[] = [];

  // 명령어 (가장 중요)
  parts.push(`Command: ${block.command}`);

  // 자연어 입력 (있는 경우)
  if (block.naturalInput) {
    parts.push(`Natural Input: ${block.naturalInput}`);
  }

  // 출력 (최대 1000자로 제한)
  if (block.output) {
    const truncatedOutput = block.output.slice(0, 1000);
    parts.push(`Output: ${truncatedOutput}`);
  }

  // AI 분석 (있는 경우)
  if (block.aiAnalysis) {
    if (block.aiAnalysis.summary) {
      parts.push(`Analysis: ${block.aiAnalysis.summary}`);
    }
    if (block.aiAnalysis.suggestions && block.aiAnalysis.suggestions.length > 0) {
      parts.push(`Suggestions: ${block.aiAnalysis.suggestions.join(', ')}`);
    }
  }

  const content = parts.join('\n\n');

  // 메타데이터
  const metadata = {
    type: 'terminal-block',
    blockId: block.id,
    command: block.command,
    cwd: block.cwd,
    shell: block.sessionId,
    timestamp: block.timestamp,
    exitCode: block.exitCode ?? -1,
    hasError: (block.exitCode ?? 0) !== 0,
    aiGenerated: block.aiGenerated,
    hasNaturalInput: !!block.naturalInput,
    hasAiAnalysis: !!block.aiAnalysis,
  };

  return {
    id: `terminal-${block.id}`,
    content,
    metadata,
  };
}

/**
 * 단일 블록을 VectorDB에 인덱싱
 */
export async function indexTerminalBlock(block: TerminalBlock): Promise<void> {
  try {
    // Electron 환경에서만 동작
    if (typeof window === 'undefined' || !window.electronAPI) {
      logger.debug('[TerminalVectorDB] Not in Electron environment, skipping indexing');
      return;
    }

    const document = terminalBlockToDocument(block);

    // VectorDB에 문서 추가 (백그라운드)
    const result = await window.electronAPI.vectorDB.insert([document]);

    if (result.success) {
      logger.debug('[TerminalVectorDB] Indexed terminal block', {
        blockId: block.id,
        command: block.command,
      });
    } else {
      logger.warn('[TerminalVectorDB] Failed to index terminal block', {
        blockId: block.id,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('[TerminalVectorDB] Error indexing terminal block', {
      blockId: block.id,
      error,
    });
  }
}

/**
 * 여러 블록을 배치로 인덱싱
 */
export async function indexTerminalBlocks(blocks: TerminalBlock[]): Promise<void> {
  try {
    // Electron 환경에서만 동작
    if (typeof window === 'undefined' || !window.electronAPI) {
      logger.debug('[TerminalVectorDB] Not in Electron environment, skipping batch indexing');
      return;
    }

    if (blocks.length === 0) {
      return;
    }

    const documents = blocks.map(terminalBlockToDocument);

    // VectorDB에 문서 배치 추가
    const result = await window.electronAPI.vectorDB.insert(documents);

    if (result.success) {
      logger.info('[TerminalVectorDB] Indexed terminal blocks batch', {
        count: blocks.length,
      });
    } else {
      logger.warn('[TerminalVectorDB] Failed to index terminal blocks batch', {
        count: blocks.length,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('[TerminalVectorDB] Error indexing terminal blocks batch', {
      count: blocks.length,
      error,
    });
  }
}

/**
 * 블록 삭제 시 VectorDB에서도 삭제
 */
export async function deleteTerminalBlockFromVectorDB(blockId: string): Promise<void> {
  try {
    // Electron 환경에서만 동작
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    const result = await window.electronAPI.vectorDB.delete([`terminal-${blockId}`]);

    if (result.success) {
      logger.debug('[TerminalVectorDB] Deleted terminal block from VectorDB', { blockId });
    } else {
      logger.warn('[TerminalVectorDB] Failed to delete terminal block from VectorDB', {
        blockId,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('[TerminalVectorDB] Error deleting terminal block from VectorDB', {
      blockId,
      error,
    });
  }
}

/**
 * 모든 터미널 블록을 VectorDB에서 삭제
 */
export async function clearAllTerminalBlocksFromVectorDB(): Promise<void> {
  try {
    // Electron 환경에서만 동작
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    // type='terminal-block'인 모든 문서 조회
    const allDocs = await window.electronAPI.vectorDB.getAll();

    if (!allDocs.success || !allDocs.data) {
      logger.warn('[TerminalVectorDB] Failed to get all documents for clearing');
      return;
    }

    // terminal-block 타입 필터링
    const terminalBlockIds = allDocs.data
      .filter((doc) => doc.metadata?.type === 'terminal-block')
      .map((doc) => doc.id);

    if (terminalBlockIds.length === 0) {
      logger.debug('[TerminalVectorDB] No terminal blocks to clear');
      return;
    }

    // 삭제 실행
    const result = await window.electronAPI.vectorDB.delete(terminalBlockIds);

    if (result.success) {
      logger.info('[TerminalVectorDB] Cleared all terminal blocks from VectorDB', {
        count: terminalBlockIds.length,
      });
    } else {
      logger.warn('[TerminalVectorDB] Failed to clear terminal blocks from VectorDB', {
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('[TerminalVectorDB] Error clearing terminal blocks from VectorDB', { error });
  }
}
