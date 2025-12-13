import type ko from '@/locales/ko.json';

// Type-safe translation keys based on Korean translation file
export type TranslationKeys = typeof ko;

// Flatten nested object keys for type checking
type FlattenKeys<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? FlattenKeys<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

export type TranslationKey = FlattenKeys<TranslationKeys>;

// Language config type for AppConfig
export interface LanguageConfig {
  language: 'ko' | 'en' | 'zh';
}
