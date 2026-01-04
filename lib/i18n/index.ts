'use client';

import i18next, { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import main app translation files
import ko from '@/locales/ko.json';
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

// Import extension translation files
import editorKo from '@/extensions/editor/locales/ko.json';
import editorEn from '@/extensions/editor/locales/en.json';
import editorZh from '@/extensions/editor/locales/zh.json';

import browserKo from '@/extensions/browser/locales/ko.json';
import browserEn from '@/extensions/browser/locales/en.json';
import browserZh from '@/extensions/browser/locales/zh.json';

import presentationKo from '@/extensions/presentation/locales/ko.json';
import presentationEn from '@/extensions/presentation/locales/en.json';
import presentationZh from '@/extensions/presentation/locales/zh.json';

// Supported languages
import { logger } from '@/lib/utils/logger';
export const SUPPORTED_LANGUAGES = [
  { code: 'ko', name: '한국어', nativeName: '한국어' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Default language
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ko';

// Language storage key
export const LANGUAGE_STORAGE_KEY = 'sepilot_language';

/**
 * Deep merge two objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Merge extension translations with main app translations
const mergedKo = deepMerge(deepMerge(deepMerge(ko, editorKo), browserKo), presentationKo);
const mergedEn = deepMerge(deepMerge(deepMerge(en, editorEn), browserEn), presentationEn);
const mergedZh = deepMerge(deepMerge(deepMerge(zh, editorZh), browserZh), presentationZh);

// Translation resources
export const resources = {
  ko: { translation: mergedKo },
  en: { translation: mergedEn },
  zh: { translation: mergedZh },
};

/**
 * Get saved language from localStorage or return default
 */
export function getSavedLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((lang) => lang.code === saved)) {
      return saved as SupportedLanguage;
    }

    // Try to detect browser language
    const browserLang = navigator.language.split('-')[0];
    if (SUPPORTED_LANGUAGES.some((lang) => lang.code === browserLang)) {
      return browserLang as SupportedLanguage;
    }
  } catch {
    // Ignore localStorage errors
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Save language preference to localStorage
 */
export function saveLanguage(language: SupportedLanguage): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore localStorage errors
    }
  }
}

// Singleton i18n instance
let i18nInstance: I18nInstance | null = null;
let initPromise: Promise<I18nInstance> | null = null;

/**
 * Initialize and get the i18n instance
 */
export async function initI18n(): Promise<I18nInstance> {
  // Return existing instance if already initialized
  if (i18nInstance && i18nInstance.isInitialized) {
    return i18nInstance;
  }

  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise;
  }

  // Create and initialize new instance
  initPromise = (async () => {
    const instance = i18next.createInstance();

    const lng = getSavedLanguage();
    logger.info('[i18n] Initializing with language:', lng);
    logger.info('[i18n] Resources loaded:', Object.keys(resources));
    logger.info('[i18n] Korean keys sample:', Object.keys(resources.ko.translation).slice(0, 5));

    await instance.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
      debug: false,
    });

    logger.info('[i18n] Initialized successfully, language:', instance.language);
    logger.info('[i18n] Test translation:', instance.t('settings.title'));

    i18nInstance = instance;
    return instance;
  })();

  return initPromise;
}

/**
 * Get the i18n instance (must call initI18n first)
 */
export function getI18nInstance(): I18nInstance | null {
  return i18nInstance;
}

/**
 * Change the current language
 */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  if (!i18nInstance) {
    await initI18n();
  }

  await i18nInstance!.changeLanguage(language);
  saveLanguage(language);

  // Dispatch custom event for components that need to react to language changes
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sepilot:language-changed', {
        detail: { language },
      })
    );
  }
}

/**
 * Get current language
 */
export function getCurrentLanguage(): SupportedLanguage {
  if (!i18nInstance) {
    return getSavedLanguage();
  }
  return (i18nInstance.language as SupportedLanguage) || DEFAULT_LANGUAGE;
}
