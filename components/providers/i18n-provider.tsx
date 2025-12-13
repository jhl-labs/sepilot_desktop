'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n as I18nInstance } from 'i18next';
import {
  initI18n,
  changeLanguage,
  getCurrentLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
  isLoading: boolean;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
}

const I18nContext = createContext<I18nContextType | null>(null);

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguageState] = useState<SupportedLanguage>('ko');
  const [i18n, setI18n] = useState<I18nInstance | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const instance = await initI18n();
        if (mounted) {
          setI18n(instance);
          setLanguageState(getCurrentLanguage());
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('Failed to initialize i18n:', error);
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

  // Listen for language changes from other sources (e.g., settings)
  useEffect(() => {
    const handleLanguageChange = (event: CustomEvent<{ language: SupportedLanguage }>) => {
      setLanguageState(event.detail.language);
    };

    window.addEventListener('sepilot:language-changed', handleLanguageChange as EventListener);
    return () => {
      window.removeEventListener('sepilot:language-changed', handleLanguageChange as EventListener);
    };
  }, []);

  const setLanguage = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
    setLanguageState(lang);
  };

  const contextValue: I18nContextType = {
    language,
    setLanguage,
    isLoading,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };

  // Show nothing while loading to prevent hydration mismatch
  if (isLoading || !i18n) {
    return null;
  }

  return (
    <I18nContext.Provider value={contextValue}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}

/**
 * Hook to access i18n context
 */
export function useI18nContext() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18nContext must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook for language switching (convenience wrapper)
 */
export function useLanguage() {
  const { language, setLanguage, supportedLanguages } = useI18nContext();
  return { language, setLanguage, supportedLanguages };
}
