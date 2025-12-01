'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { isElectron } from '@/lib/platform';

/**
 * 테마 변경을 감지하고 AppConfig에 저장하는 훅
 * Electron 환경에서 SQLite에 저장하여 앱 재시작 후에도 테마가 유지됨
 */
export function useThemePersistence() {
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    // 초기 로드: AppConfig에서 테마 불러오기
    const loadTheme = async () => {
      if (!isElectron() || !window.electronAPI) {
        return;
      }

      try {
        const result = await window.electronAPI.config.load();
        if (result.success && result.data?.theme) {
          const savedTheme = result.data.theme;
          // theme가 실제로 변경되었을 때만 설정
          if (savedTheme !== theme) {
            // localStorage에 직접 설정
            if (typeof window !== 'undefined') {
              localStorage.setItem('sepilot-theme', savedTheme);
              // 페이지 리로드 없이 테마 적용을 위해 HTML attribute 변경
              document.documentElement.className =
                savedTheme === 'system' ? systemTheme || 'light' : savedTheme;
            }
          }
        }
      } catch (error) {
        console.error('Failed to load theme from AppConfig:', error);
      }
    };

    loadTheme();
  }, []); // 초기 로드만 실행

  useEffect(() => {
    // 테마 변경 감지 및 저장
    const saveTheme = async () => {
      if (!isElectron() || !window.electronAPI || !theme) {
        return;
      }

      try {
        // 현재 전체 config 로드
        const result = await window.electronAPI.config.load();
        if (result.success && result.data) {
          // theme 필드만 업데이트
          const updatedConfig = {
            ...result.data,
            theme: theme as 'light' | 'dark' | 'system',
          };

          await window.electronAPI.config.save(updatedConfig);
        }
      } catch (error) {
        console.error('Failed to save theme to AppConfig:', error);
      }
    };

    saveTheme();
  }, [theme]); // theme 변경 시마다 저장
}
