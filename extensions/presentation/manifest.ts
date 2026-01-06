/**
 * Presentation Extension Manifest
 *
 * SEPilot Extension System에서 사용되는 확장 기능 정의 파일입니다.
 * 새 extension을 만들 때 이 파일을 참고하세요.
 */

import type { ExtensionManifest } from '@/lib/extensions/types';

/**
 * Presentation Extension Manifest
 */
export const manifest: ExtensionManifest = {
  id: 'presentation',
  name: 'AI Presentation Designer',
  description:
    'AI 기반 프레젠테이션 생성 도구. 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Presentation',
  mode: 'presentation',
  showInSidebar: true,
  order: 3, // Chat(1), Editor(2), Presentation(3), Browser(4)
  betaFlag: 'enablePresentationMode',
  dependencies: [],
  ipcChannels: {
    handlers: ['presentation:export'],
  },
  settingsTab: {
    id: 'presentation',
    label: 'settings.presentation.title',
    description: 'settings.presentation.description',
    icon: 'Presentation',
  },
  settingsSchema: {
    webSearchEnabled: {
      type: 'boolean',
      default: false,
      description: '웹검색을 통한 최신 정보 활용',
    },
    ragEnabled: {
      type: 'boolean',
      default: false,
      description: 'RAG(Personal/Team Docs) 활용',
    },
    defaultSlideCount: {
      type: 'number',
      default: 8,
      description: '기본 슬라이드 수',
    },
    defaultLanguage: {
      type: 'string',
      enum: ['ko', 'en', 'ja', 'zh'],
      default: 'ko',
      description: '기본 언어',
    },
  },
};

export default manifest;
