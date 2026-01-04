/**
 * Browser Extension Manifest
 */

import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'browser',
  name: 'Web Browser',
  description:
    '통합 웹 브라우저. AI Agent를 통한 자동화된 웹 탐색, 스냅샷, 북마크, 페이지 캡처 기능을 제공합니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Globe',
  mode: 'browser',
  showInSidebar: true,
  order: 4, // Chat(1), Editor(2), Presentation(3), Browser(4)
  dependencies: [],
  enabled: true, // 기본 활성화 (베타 아님)
  settingsSchema: {
    defaultSearchEngine: {
      type: 'string',
      enum: ['google', 'bing', 'duckduckgo'],
      default: 'google',
      description: 'Default search engine',
    },
    autoCapture: {
      type: 'boolean',
      default: false,
      description: 'Auto capture page snapshots',
    },
  },
  settingsTab: {
    id: 'browser',
    label: 'settings.browser.title',
    description: 'settings.browser.description',
    icon: 'Globe',
  },
};

export default manifest;
