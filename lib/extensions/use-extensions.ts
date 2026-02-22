/**
 * Extension Hooks
 *
 * Extension system을 React 컴포넌트에서 사용하기 위한 훅
 */

'use client';

import { useEffect, useState } from 'react';
import { loadExtensions } from './loader';
import { extensionRegistry } from './registry';
import type { ExtensionDefinition } from './types';
import { logger } from '@/lib/utils/logger';

/**
 * Extension 초기화 훅
 *
 * 앱 시작 시 모든 extension을 로드하고 초기화합니다.
 */
export function useExtensionsInit() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await loadExtensions();
        if (mounted) {
          setIsLoaded(true);
          logger.info('[useExtensionsInit] Extensions loaded successfully');
        }
      } catch (err) {
        logger.error('[useExtensionsInit] Failed to load extensions', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        if (mounted) {
          setError(err as Error);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return { isLoaded, error };
}

/**
 * Extension 조회 훅
 *
 * 특정 모드에 해당하는 extension을 조회합니다.
 *
 * @param mode - 앱 모드 (예: 'presentation', 'diagram')
 */
export function useExtension(mode: string): ExtensionDefinition | null {
  const [extension, setExtension] = useState<ExtensionDefinition | null>(null);

  useEffect(() => {
    const ext = extensionRegistry.getByMode(mode);
    setExtension(ext || null);
  }, [mode]);

  return extension;
}

/**
 * 모든 Extension 조회 훅
 *
 * Zustand store와 통합되어 Extension 상태 변경 시 자동으로 리렌더링됩니다.
 */
export function useExtensions(): {
  activeExtensions: ExtensionDefinition[];
  isExtensionActive: (extensionId: string) => boolean;
} {
  const [extensions, setExtensions] = useState<ExtensionDefinition[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 초기 로드
    const initialExts = extensionRegistry.getActive();
    setExtensions(initialExts);

    // Store 구독 (Client-side only)
    if (typeof window === 'undefined') {
      return;
    }

    let unsubscribe: (() => void) | null = null;

    import('@/lib/store/chat-store')
      .then((module) => {
        let previousVersion = module.useChatStore.getState().extensionsVersion;

        // Store 구독: extensionsVersion이 변경되면 업데이트
        unsubscribe = module.useChatStore.subscribe((state) => {
          if (state.extensionsVersion !== previousVersion) {
            previousVersion = state.extensionsVersion;
            const updatedExts = extensionRegistry.getActive();
            setExtensions(updatedExts);
            logger.info('[useExtensions] Extensions updated from store', {
              count: updatedExts.length,
            });
          }
        });

        // Store에 초기 Extension 목록 설정
        module.useChatStore.getState().updateActiveExtensions(initialExts);
      })
      .catch((error) => {
        logger.error('[useExtensions] Failed to subscribe to store', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const isExtensionActive = (extensionId: string) =>
    extensions.some((ext) => ext.manifest.id === extensionId);

  return {
    activeExtensions: mounted ? extensions : [],
    isExtensionActive,
  };
}
