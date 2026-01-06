/**
 * Terminal Extension Manifest
 */

import type { ExtensionManifest } from '@/lib/extensions/types';

export const manifest: ExtensionManifest = {
  id: 'terminal',
  name: 'AI Terminal',
  description:
    'AI 기반 인텔리전트 터미널. 자연어 명령어 변환, 컨텍스트 이해, 블록 기반 UI를 제공하여 개발 생산성을 극대화합니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Terminal',
  mode: 'terminal',
  showInSidebar: true,
  order: 5, // Chat(1), Editor(2), Presentation(3), Browser(4), Terminal(5)
  dependencies: [],
  enabled: true,
  settingsSchema: {
    enableAISuggestions: {
      type: 'boolean',
      default: true,
      description: 'AI 명령어 제안 활성화',
    },
    enableAutoAnalysis: {
      type: 'boolean',
      default: true,
      description: '에러 자동 분석 활성화',
    },
    defaultViewMode: {
      type: 'string',
      enum: ['blocks', 'traditional'],
      default: 'blocks',
      description: '기본 뷰 모드',
    },
    maxHistoryBlocks: {
      type: 'number',
      default: 100,
      description: '최대 히스토리 블록 수',
    },
    enableRAG: {
      type: 'boolean',
      default: false,
      description: 'RAG 기반 명령어 검색 활성화',
    },
  },
  settingsTab: {
    id: 'terminal',
    label: 'settings.terminal.title',
    description: 'settings.terminal.description',
    icon: 'Terminal',
  },
};

export default manifest;
