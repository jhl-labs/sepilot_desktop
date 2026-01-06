/**
 * Terminal History Persistent Storage
 *
 * localStorage를 사용하여 터미널 블록 히스토리를 저장하고 복원합니다.
 */

import type { TerminalBlock } from '../types';
import { logger } from '@/lib/utils/logger';

const STORAGE_KEY = 'sepilot_terminal_history';
const STORAGE_VERSION = '1.0';

interface StoredHistory {
  version: string;
  timestamp: number;
  blocks: TerminalBlock[];
}

/**
 * localStorage에서 터미널 히스토리 로드
 */
export function loadTerminalHistory(): TerminalBlock[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const data: StoredHistory = JSON.parse(stored);

    // 버전 체크
    if (data.version !== STORAGE_VERSION) {
      logger.warn('[TerminalStorage] Version mismatch, clearing old data', {
        stored: data.version,
        expected: STORAGE_VERSION,
      });
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    logger.info('[TerminalStorage] Loaded terminal history', {
      count: data.blocks.length,
      timestamp: new Date(data.timestamp).toISOString(),
    });

    return data.blocks;
  } catch (error) {
    logger.error('[TerminalStorage] Failed to load terminal history', { error });
    return [];
  }
}

/**
 * localStorage에 터미널 히스토리 저장
 */
export function saveTerminalHistory(blocks: TerminalBlock[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const data: StoredHistory = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      blocks,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    logger.debug('[TerminalStorage] Saved terminal history', {
      count: blocks.length,
    });
  } catch (error) {
    logger.error('[TerminalStorage] Failed to save terminal history', { error });
  }
}

/**
 * localStorage에서 터미널 히스토리 삭제
 */
export function clearTerminalHistory(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    logger.info('[TerminalStorage] Cleared terminal history');
  } catch (error) {
    logger.error('[TerminalStorage] Failed to clear terminal history', { error });
  }
}

/**
 * 자동 저장 디바운싱 헬퍼
 *
 * 블록 변경 시마다 저장하지 않고, 일정 시간 후 한 번만 저장합니다.
 */
export function createAutoSaveDebouncer(delay: number = 1000) {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debouncedSave(blocks: TerminalBlock[]) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      saveTerminalHistory(blocks);
      timeoutId = null;
    }, delay);
  };
}
