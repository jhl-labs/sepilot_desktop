'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

const ExtensionReadyContext = createContext(false);

/**
 * Extension 로딩 상태를 확인하는 훅
 *
 * Extension UI를 사용하는 컴포넌트에서 로딩 상태를 확인할 때 사용합니다.
 * @returns Extension 로딩 완료 여부
 */
export const useExtensionsReady = () => useContext(ExtensionReadyContext);

interface ExtensionProviderProps {
  children: ReactNode;
}

export function ExtensionProvider({ children }: ExtensionProviderProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds

    const init = async () => {
      const electronEnv =
        typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';

      if (!electronEnv) {
        logger.info('[ExtensionProvider] Not in Electron, skipping extension loading');
        if (mounted) {
          setReady(true);
        }
        return;
      }

      // Retry logic for extension loading
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          logger.info(
            `[ExtensionProvider] Loading extensions... (attempt ${attempt}/${MAX_RETRIES})`
          );
          const { loadExtensions } = await import('@/lib/extensions/loader');
          await loadExtensions();
          if (mounted) {
            logger.info('[ExtensionProvider] ✅ Extensions loaded successfully');
            setReady(true);
          }
          return; // Success, exit retry loop
        } catch (error) {
          logger.error(
            `[ExtensionProvider] Failed to load extensions (attempt ${attempt}/${MAX_RETRIES}):`,
            error
          );

          if (attempt < MAX_RETRIES && mounted) {
            logger.info(`[ExtensionProvider] Retrying in ${RETRY_DELAY}ms...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          } else if (mounted) {
            // Final attempt failed, set ready anyway to not block UI
            logger.warn(
              '[ExtensionProvider] ⚠️ All retry attempts exhausted, continuing without extensions'
            );
            setReady(true);
          }
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // 항상 children을 렌더링 (비차단) — Extension 상태는 Context로 제공
  return <ExtensionReadyContext.Provider value={ready}>{children}</ExtensionReadyContext.Provider>;
}
