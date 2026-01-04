'use client';

import { useEffect, useState, ReactNode } from 'react';
import { loadExtensions } from '@/lib/extensions/loader';
import { logger } from '@/lib/utils/logger';

interface ExtensionProviderProps {
  children: ReactNode;
}

export function ExtensionProvider({ children }: ExtensionProviderProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        logger.info('[ExtensionProvider] Loading extensions...');
        await loadExtensions();
        if (mounted) {
          logger.info('[ExtensionProvider] Extensions loaded successfully');
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('[ExtensionProvider] Failed to load extensions:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Show nothing while loading to prevent rendering before extensions are ready
  if (isLoading) {
    return null;
  }

  return <>{children}</>;
}
