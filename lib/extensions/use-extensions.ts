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
        logger.error('[useExtensionsInit] Failed to load extensions', { err });
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
 */
export function useExtensions(): ExtensionDefinition[] {
  const [extensions, setExtensions] = useState<ExtensionDefinition[]>([]);

  useEffect(() => {
    const exts = extensionRegistry.getActive();
    setExtensions(exts);
  }, []);

  return extensions;
}
