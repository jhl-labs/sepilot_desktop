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
  name: 'PPT Designer',
  description:
    'AI 기반 프레젠테이션 생성 도구. 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Presentation',
  mode: 'presentation',
  showInSidebar: true,
  order: 3, // Chat(1), Editor(2), Presentation(3), Browser(4)
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
};

export default manifest;
