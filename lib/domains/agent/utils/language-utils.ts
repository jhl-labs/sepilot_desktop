import type { SupportedLanguage } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';

/**
 * 사용자 언어 설정 가져오기
 */
export async function getUserLanguage(context = 'Graph'): Promise<SupportedLanguage> {
  try {
    // Main Process에서만 동작
    if (typeof window !== 'undefined') {
      // Renderer 프로세스에서는 localStorage에서 가져오기
      try {
        const saved = localStorage.getItem('sepilot_language');
        if (saved && ['ko', 'en', 'zh'].includes(saved)) {
          return saved as SupportedLanguage;
        }
      } catch {
        // localStorage 접근 실패 시 기본값
      }
      return 'ko';
    }

    const { databaseService } = await import('../../../../electron/services/database');
    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return 'ko';
    }

    const appConfig = JSON.parse(configStr);
    if (appConfig?.general?.language && ['ko', 'en', 'zh'].includes(appConfig.general.language)) {
      return appConfig.general.language as SupportedLanguage;
    }
  } catch (error) {
    logger.error(`[${context}] Failed to get user language:`, error);
  }
  return 'ko';
}

/**
 * 언어에 따른 답변 언어 지시 메시지 생성
 */
export function getLanguageInstruction(language: SupportedLanguage): string {
  switch (language) {
    case 'ko':
      return '반드시 한국어로 답변하세요.';
    case 'en':
      return 'Please respond in English.';
    case 'zh':
      return '请用中文回答。';
    default:
      return '반드시 한국어로 답변하세요.';
  }
}

/**
 * 언어에 따른 후속 질문 언어 지시 메시지 생성
 */
export function getFollowUpLanguageInstruction(language: SupportedLanguage): string {
  switch (language) {
    case 'ko':
      return '한국어로';
    case 'en':
      return 'in English';
    case 'zh':
      return '用中文';
    default:
      return '한국어로';
  }
}
