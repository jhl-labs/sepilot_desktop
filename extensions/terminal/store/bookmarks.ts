/**
 * Terminal Bookmarks Management (Store Extension)
 *
 * 자주 사용하는 명령어 북마크 기능
 */

import type { CommandBookmark } from '../types/bookmarks';
import { logger } from '@/lib/utils/logger';

const STORAGE_KEY = 'terminal_bookmarks';

/**
 * 북마크 관리 State
 */
export interface BookmarkStoreState {
  bookmarks: CommandBookmark[];
}

/**
 * 북마크 관리 State 초기값
 */
export const initialBookmarkState: BookmarkStoreState = {
  bookmarks: [],
};

/**
 * LocalStorage에서 북마크 로드
 */
function loadBookmarksFromStorage(): CommandBookmark[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    logger.error('[Bookmarks] Failed to load from storage:', error);
  }
  return [];
}

/**
 * LocalStorage에 북마크 저장
 */
function saveBookmarksToStorage(bookmarks: CommandBookmark[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    logger.error('[Bookmarks] Failed to save to storage:', error);
  }
}

/**
 * 북마크 관리 액션 생성
 */
export function createBookmarkActions(
  set: (partial: any | ((state: any) => any)) => void,
  get: () => any
) {
  return {
    /**
     * Storage에서 북마크 로드
     */
    loadBookmarks: (): void => {
      const bookmarks = loadBookmarksFromStorage();
      set({ bookmarks });
      logger.info('[Bookmarks] Loaded from storage:', bookmarks.length);
    },

    /**
     * 새 북마크 추가
     */
    addBookmark: (
      bookmark: Omit<CommandBookmark, 'id' | 'createdAt' | 'usageCount' | 'lastUsedAt'>
    ): string => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const newBookmark: CommandBookmark = {
        ...bookmark,
        id,
        createdAt: now,
        usageCount: 0,
      };

      set((state: any) => {
        const bookmarks = [...state.bookmarks, newBookmark];
        saveBookmarksToStorage(bookmarks);
        return { bookmarks };
      });

      logger.info('[Bookmarks] Added:', newBookmark.name);
      return id;
    },

    /**
     * 북마크 업데이트
     */
    updateBookmark: (id: string, updates: Partial<CommandBookmark>): void => {
      set((state: any) => {
        const bookmarks = state.bookmarks.map((b: CommandBookmark) =>
          b.id === id ? { ...b, ...updates } : b
        );
        saveBookmarksToStorage(bookmarks);
        return { bookmarks };
      });

      logger.info('[Bookmarks] Updated:', id);
    },

    /**
     * 북마크 삭제
     */
    removeBookmark: (id: string): void => {
      set((state: any) => {
        const bookmarks = state.bookmarks.filter((b: CommandBookmark) => b.id !== id);
        saveBookmarksToStorage(bookmarks);
        return { bookmarks };
      });

      logger.info('[Bookmarks] Removed:', id);
    },

    /**
     * 북마크 실행 (사용 횟수 증가)
     */
    executeBookmark: async (id: string): Promise<string | null> => {
      const state = get();
      const bookmark = state.bookmarks.find((b: CommandBookmark) => b.id === id);

      if (!bookmark) {
        logger.error('[Bookmarks] Bookmark not found:', id);
        return null;
      }

      // 사용 횟수 및 마지막 사용 시각 업데이트
      set((state: any) => {
        const bookmarks = state.bookmarks.map((b: CommandBookmark) =>
          b.id === id
            ? {
                ...b,
                usageCount: b.usageCount + 1,
                lastUsedAt: Date.now(),
              }
            : b
        );
        saveBookmarksToStorage(bookmarks);
        return { bookmarks };
      });

      logger.info('[Bookmarks] Executed:', bookmark.name);
      return bookmark.command;
    },

    /**
     * 북마크 검색
     */
    searchBookmarks: (query: string): CommandBookmark[] => {
      const state = get();
      const lowerQuery = query.toLowerCase();

      return state.bookmarks.filter(
        (b: CommandBookmark) =>
          b.name.toLowerCase().includes(lowerQuery) ||
          b.command.toLowerCase().includes(lowerQuery) ||
          b.description?.toLowerCase().includes(lowerQuery) ||
          b.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
      );
    },

    /**
     * 인기 북마크 조회 (사용 횟수 기준)
     */
    getPopularBookmarks: (limit: number = 10): CommandBookmark[] => {
      const state = get();
      return [...state.bookmarks].sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
    },

    /**
     * 최근 사용 북마크 조회
     */
    getRecentBookmarks: (limit: number = 10): CommandBookmark[] => {
      const state = get();
      return [...state.bookmarks]
        .filter((b) => b.lastUsedAt !== undefined)
        .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .slice(0, limit);
    },
  };
}
