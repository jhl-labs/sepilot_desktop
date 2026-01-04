/**
 * Editor Extension Manifest
 */

import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'editor',
  name: 'Code Editor',
  description:
    'Monaco 기반 코드 에디터. VS Code와 동일한 편집 경험, 파일 탐색, 통합 터미널, AI 코딩 어시스턴트를 제공합니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Code',
  mode: 'editor',
  showInSidebar: true,
  order: 2, // Chat(1), Editor(2), Presentation(3), Browser(4)
  dependencies: [],
  enabled: true, // 기본 활성화 (베타 아님)
  settingsSchema: {
    fontSize: {
      type: 'number',
      default: 14,
      description: 'Editor font size',
    },
    tabSize: {
      type: 'number',
      default: 2,
      description: 'Tab size',
    },
    wordWrap: {
      type: 'boolean',
      default: false,
      description: 'Word wrap',
    },
  },
};

export default manifest;
