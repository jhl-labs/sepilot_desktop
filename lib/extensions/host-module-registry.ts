/**
 * Host Module Registry
 *
 * Extension이 사용하는 모든 external 의존성을 글로벌 레지스트리에 등록합니다.
 * Extension CJS 번들의 custom require()가 이 레지스트리를 조회합니다.
 *
 * ⚠️ 중요: 이 목록은 tsup.config.ts의 external 목록과 동기화되어야 합니다.
 * 새로운 의존성 추가 시 scripts/sync-module-registry.js로 자동 동기화할 수 있습니다.
 */

// Core dependencies
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import dynamic from 'next/dynamic';

// UI libraries
import * as LucideReact from 'lucide-react';
import * as Zustand from 'zustand';
import * as ReactI18next from 'react-i18next';
import i18next from 'i18next';
import * as ReactFlow from 'reactflow';

// Editor dependencies
import * as MonacoEditorReact from '@monaco-editor/react';
import MarkdownToJsx from 'markdown-to-jsx';
import * as NextThemes from 'next-themes';

// Terminal dependencies
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// Date utilities
import * as DateFns from 'date-fns';
import * as DateFnsLocale from 'date-fns/locale';

// GitHub Actions dependencies
import AnsiToHtml from 'ansi-to-html';
import * as OctokitRest from '@octokit/rest';

// GitHub Project dependencies (Drag and Drop)
import * as DndKitCore from '@dnd-kit/core';
import * as DndKitSortable from '@dnd-kit/sortable';
import * as DndKitUtilities from '@dnd-kit/utilities';

// Utility libraries
import { cva } from 'class-variance-authority';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast, Toaster } from 'sonner';

// Extension SDK
import * as ExtensionSDK from '@sepilot/extension-sdk';
import * as ExtensionSDKStore from '@sepilot/extension-sdk/store';
import * as ExtensionSDKUI from '@sepilot/extension-sdk/ui';
import * as ExtensionSDKUtils from '@sepilot/extension-sdk/utils';
import * as ExtensionSDKTypes from '@sepilot/extension-sdk/types';
import * as ExtensionSDKIPC from '@sepilot/extension-sdk/ipc';
import * as ExtensionSDKRuntime from '@sepilot/extension-sdk/runtime';
import * as ExtensionSDKHooks from '@sepilot/extension-sdk/hooks';
import * as ExtensionSDKChat from '@sepilot/extension-sdk/chat';
import * as ExtensionSDKServices from '@sepilot/extension-sdk/services';

import { logger } from '@/lib/utils/logger';

/**
 * 글로벌 모듈 레지스트리 타입
 */
interface ModuleRegistry {
  [moduleName: string]: any;
}

declare global {
  interface Window {
    __SEPILOT_MODULES__?: ModuleRegistry;
    __SEPILOT_EXTENSIONS__?: Record<string, any>;
  }
}

/**
 * Deep Freeze 유틸리티 (현재 미사용)
 *
 * 객체와 모든 중첩 객체를 재귀적으로 freeze하여 완전한 불변성 보장
 * Extension이 모듈 레지스트리를 오염시키는 것을 방지
 *
 * NOTE: Portable 빌드에서 "Cannot assign to read only property" 에러를 유발하여
 * Shallow Freeze(Object.freeze)로 변경됨. 상태 관리 라이브러리(Zustand, ReactFlow)의
 * 내부 객체는 런타임에 수정 가능해야 함.
 *
 * @deprecated Use shallow freeze instead
 */
function _deepFreeze<T>(obj: T): T {
  // 이미 freeze된 객체는 건너뛰기
  if (Object.isFrozen(obj)) {
    return obj;
  }

  // 객체의 모든 속성을 freeze
  Object.freeze(obj);

  // 중첩 객체도 재귀적으로 freeze
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as any)[prop];
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      !Object.isFrozen(value)
    ) {
      _deepFreeze(value);
    }
  });

  return obj;
}

/**
 * 모듈 레지스트리 초기화
 *
 * Extension 로드 전에 반드시 호출되어야 합니다.
 * 모든 external 의존성을 globalThis.__SEPILOT_MODULES__에 등록합니다.
 */
export function initializeModuleRegistry(): void {
  if (typeof window === 'undefined') {
    logger.warn('[ModuleRegistry] Skipping initialization in SSR/SSG environment');
    return;
  }

  if (window.__SEPILOT_MODULES__) {
    logger.debug('[ModuleRegistry] Already initialized');
    return;
  }

  logger.info('[ModuleRegistry] Initializing host module registry...');

  const registry: ModuleRegistry = {
    // React core
    react: React,
    'react-dom': ReactDOM,
    'react/jsx-runtime': ReactJSXRuntime,
    'next/dynamic': dynamic,

    // UI libraries
    'lucide-react': LucideReact,
    zustand: Zustand,
    'react-i18next': ReactI18next,
    i18next: i18next,
    reactflow: ReactFlow,

    // Editor dependencies
    '@monaco-editor/react': MonacoEditorReact,
    'markdown-to-jsx': MarkdownToJsx,
    'next-themes': NextThemes,

    // Terminal dependencies
    '@xterm/xterm': { Terminal },
    '@xterm/addon-fit': { FitAddon },
    '@xterm/addon-web-links': { WebLinksAddon },

    // Date utilities
    'date-fns': DateFns,
    'date-fns/locale': DateFnsLocale,

    // GitHub Actions dependencies
    'ansi-to-html': AnsiToHtml,
    '@octokit/rest': OctokitRest,

    // GitHub Project dependencies (Drag and Drop)
    '@dnd-kit/core': DndKitCore,
    '@dnd-kit/sortable': DndKitSortable,
    '@dnd-kit/utilities': DndKitUtilities,

    // Utility libraries
    'class-variance-authority': { cva },
    clsx: clsx,
    'tailwind-merge': { twMerge },
    sonner: { toast, Toaster },

    // Extension SDK (main)
    '@sepilot/extension-sdk': ExtensionSDK,

    // Extension SDK (subpaths)
    '@sepilot/extension-sdk/store': ExtensionSDKStore,
    '@sepilot/extension-sdk/ui': ExtensionSDKUI,
    '@sepilot/extension-sdk/utils': ExtensionSDKUtils,
    '@sepilot/extension-sdk/types': ExtensionSDKTypes,
    '@sepilot/extension-sdk/ipc': ExtensionSDKIPC,
    '@sepilot/extension-sdk/runtime': ExtensionSDKRuntime,
    '@sepilot/extension-sdk/hooks': ExtensionSDKHooks,
    '@sepilot/extension-sdk/chat': ExtensionSDKChat,
    '@sepilot/extension-sdk/services': ExtensionSDKServices,
  };

  // Radix UI 패키지들 동적 등록 (lazy loading)
  // Extension이 실제로 사용할 때 import되도록 함
  // Webpack 경고(Critical dependency)를 방지하기 위해 static string require 사용
  const radixPackages: Record<string, () => any> = {
    '@radix-ui/react-dialog': () => require('@radix-ui/react-dialog'),
    '@radix-ui/react-dropdown-menu': () => require('@radix-ui/react-dropdown-menu'),
    '@radix-ui/react-select': () => require('@radix-ui/react-select'),
    '@radix-ui/react-tooltip': () => require('@radix-ui/react-tooltip'),
    '@radix-ui/react-tabs': () => require('@radix-ui/react-tabs'),
    '@radix-ui/react-switch': () => require('@radix-ui/react-switch'),
    '@radix-ui/react-slider': () => require('@radix-ui/react-slider'),
    '@radix-ui/react-separator': () => require('@radix-ui/react-separator'),
    '@radix-ui/react-scroll-area': () => require('@radix-ui/react-scroll-area'),
    '@radix-ui/react-popover': () => require('@radix-ui/react-popover'),
    '@radix-ui/react-label': () => require('@radix-ui/react-label'),
    '@radix-ui/react-checkbox': () => require('@radix-ui/react-checkbox'),
    '@radix-ui/react-avatar': () => require('@radix-ui/react-avatar'),
    '@radix-ui/react-slot': () => require('@radix-ui/react-slot'),
  };

  // Radix UI는 실제로 사용될 때 동적으로 import
  for (const [pkg, loader] of Object.entries(radixPackages)) {
    Object.defineProperty(registry, pkg, {
      get() {
        try {
          return loader();
        } catch (error) {
          logger.error(`[ModuleRegistry] Failed to load ${pkg}`, { error });
          return {};
        }
      },
      enumerable: true,
      configurable: true,
    });
  }

  // 레지스트리를 globalThis에 등록
  window.__SEPILOT_MODULES__ = registry;
  window.__SEPILOT_EXTENSIONS__ = {};

  // 보안: Registry 최상위 레벨만 freeze (Shallow Freeze)
  // 상태 관리 라이브러리(Zustand, ReactFlow)의 내부 객체는 런타임에 수정 가능해야 함
  // Deep Freeze는 "Cannot assign to read only property" 에러를 유발하므로 제거
  Object.freeze(window.__SEPILOT_MODULES__);

  logger.info('[ModuleRegistry] Host module registry initialized', {
    moduleCount: Object.keys(registry).length,
  });
}

/**
 * 모듈 조회 (디버깅용)
 *
 * @param moduleName - 모듈 이름
 * @returns 모듈 객체 또는 undefined
 */
export function resolveModule(moduleName: string): any {
  if (typeof window === 'undefined' || !window.__SEPILOT_MODULES__) {
    logger.warn('[ModuleRegistry] Module registry not initialized');
    return undefined;
  }

  const registry = window.__SEPILOT_MODULES__;

  // 정확한 이름 매칭
  if (registry[moduleName]) {
    return registry[moduleName];
  }

  // 서브패스 매칭 (@radix-ui/*, @sepilot/extension-sdk/* 등)
  for (const [key, value] of Object.entries(registry)) {
    if (moduleName.startsWith(`${key}/`)) {
      return value;
    }
  }

  logger.warn(`[ModuleRegistry] Module not found: ${moduleName}`);
  return undefined;
}

/**
 * 등록된 모듈 목록 조회 (디버깅용)
 */
export function getRegisteredModules(): string[] {
  if (typeof window === 'undefined' || !window.__SEPILOT_MODULES__) {
    return [];
  }
  return Object.keys(window.__SEPILOT_MODULES__);
}

/**
 * 레지스트리 초기화 상태 확인
 */
export function isModuleRegistryInitialized(): boolean {
  return typeof window !== 'undefined' && !!window.__SEPILOT_MODULES__;
}
