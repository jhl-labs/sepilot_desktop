'use client';

import { useThemePersistence } from '@/hooks/use-theme-persistence';

/**
 * 테마 지속성 제공자
 * AppConfig에서 테마를 로드하고, 변경 시 저장하는 역할
 */
export function ThemePersistenceProvider({ children }: { children: React.ReactNode }) {
  useThemePersistence();
  return <>{children}</>;
}
