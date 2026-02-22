'use client';

import { useEffect, useState } from 'react';
import { githubOAuth } from './github-oauth';
import { GitHubUser } from './types';

/**
 * 앱 시작 시 저장된 GitHub 토큰을 자동으로 복원하는 훅
 *
 * 사용법:
 * ```tsx
 * const { user, isLoading, error } = useSessionRestore();
 * ```
 */
export function useSessionRestore() {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Electron 환경이 아니면 스킵
    if (typeof window === 'undefined' || !window.electronAPI) {
      setIsLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        console.warn('[SessionRestore] Checking for saved token...');

        // 저장된 토큰 가져오기
        const result = await window.electronAPI.auth.getToken();

        if (!result.success || !result.data) {
          console.warn('[SessionRestore] No saved token found');
          setIsLoading(false);
          return;
        }

        const token = result.data;
        console.warn('[SessionRestore] Found saved token, validating...');

        // 토큰 유효성 검증 (사용자 정보 가져오기)
        const userInfo = await githubOAuth.getUserInfo(token);

        console.warn('[SessionRestore] Session restored successfully:', userInfo.login);
        setUser(userInfo);
        setError(null);
      } catch (err: unknown) {
        const error = err as Error;
        console.error('[SessionRestore] Failed to restore session:', error);

        // 토큰이 유효하지 않으면 삭제
        if (typeof window !== 'undefined' && window.electronAPI) {
          try {
            await window.electronAPI.auth.logout();
            console.warn('[SessionRestore] Invalid token removed');
          } catch (logoutErr) {
            console.error('[SessionRestore] Failed to remove invalid token:', logoutErr);
          }
        }

        setError(error.message || 'Failed to restore session');
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  return {
    user,
    isLoading,
    error,
  };
}
