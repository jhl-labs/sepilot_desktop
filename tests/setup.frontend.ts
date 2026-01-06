/**
 * Frontend-specific test setup
 * This file contains mocks that are only needed for frontend tests (React components, etc.)
 */

// Mock i18n provider context (frontend only)
jest.mock('@/components/providers/i18n-provider', () => ({
  I18nProvider: ({ children }: any) => children,
  useI18nContext: () => ({
    language: 'ko' as const,
    setLanguage: jest.fn(),
    isLoading: false,
    supportedLanguages: ['ko', 'en', 'ja', 'zh-CN'] as const,
  }),
  useLanguage: () => ({
    language: 'ko' as const,
    setLanguage: jest.fn(),
    supportedLanguages: ['ko', 'en', 'ja', 'zh-CN'] as const,
  }),
}));
