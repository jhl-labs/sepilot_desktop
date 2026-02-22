/**
 * Extension Loader
 *
 * External Extension (.sepx)을 자동으로 로드하고 등록합니다.
 * Built-in Extension 개념은 제거되고, 모든 Extension은 External 방식으로 로드됩니다.
 */

import i18next from 'i18next';
import { extensionRegistry } from './registry';
import type { ExtensionDefinition } from './types';
import type { ExtensionStateConfig } from '@/types';
import { logger } from '@/lib/utils/logger';
import { initializeSDK } from '@sepilot/extension-sdk/host';
import { initI18n } from '@/lib/i18n';

// Browser 환경 체크
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * 저장된 Extension 설정 로드
 */
async function loadExtensionsConfig(): Promise<ExtensionStateConfig> {
  if (!isBrowser()) {
    return {};
  }

  try {
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.config.load();
      return result.data?.extensions || {};
    } else {
      const saved = localStorage.getItem('sepilot_app_config');
      if (saved) {
        const config = JSON.parse(saved);
        return config.extensions || {};
      }
      return {};
    }
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load extensions config', { error });
    return {};
  }
}

/**
 * Extension을 의존성 레벨별로 그룹화
 *
 * 같은 레벨의 Extension들은 서로 의존성이 없으므로 병렬로 활성화 가능합니다.
 *
 * @param extensions - 정렬할 Extension 목록
 * @returns 레벨별로 그룹화된 Extension 목록
 */
function groupByDependencyLevel(extensions: ExtensionDefinition[]): ExtensionDefinition[][] {
  const extensionMap = new Map<string, ExtensionDefinition>();
  extensions.forEach((ext) => extensionMap.set(ext.manifest.id, ext));

  const levels: ExtensionDefinition[][] = [];
  const processed = new Set<string>();

  // 의존성 없는 Extension들을 Level 0으로
  while (processed.size < extensions.length) {
    const currentLevel: ExtensionDefinition[] = [];

    for (const ext of extensions) {
      if (processed.has(ext.manifest.id)) {
        continue;
      }

      const deps = ext.manifest.dependencies || [];
      const allDepsProcessed = deps.every((depId) => processed.has(depId));

      if (allDepsProcessed) {
        currentLevel.push(ext);
      }
    }

    if (currentLevel.length === 0) {
      // 순환 의존성 감지
      const remaining = extensions
        .filter((ext) => !processed.has(ext.manifest.id))
        .map((ext) => ext.manifest.id);
      throw new Error(`Circular dependency detected in extensions: ${remaining.join(', ')}`);
    }

    currentLevel.forEach((ext) => processed.add(ext.manifest.id));
    levels.push(currentLevel);
  }

  return levels;
}

/**
 * 모든 Extension을 로드하고 등록 (Browser 환경 전용)
 *
 * Browser 환경에서만 실행되며, SSR/SSG 중에는 건너뜁니다.
 * Main Process에서 Extension을 로드하려면 loader-runtime.ts의 loadAllExtensions를 사용하세요.
 */
export async function loadExtensions(): Promise<void> {
  // Browser 환경 체크 - SSR/SSG 중에는 Extension 로드 건너뛰기
  if (!isBrowser()) {
    logger.warn('[ExtensionLoader] Skipping extension load during SSR/SSG');
    return;
  }

  logger.info('[ExtensionLoader] Loading extensions in browser...');

  try {
    // 0. Ensure i18n is initialized
    await initI18n();

    // 0. SDK 초기화 (Extension 로드 전에 확실히 완료되어야 함)
    logger.info('[ExtensionLoader] Initializing Renderer SDK...');
    await initializeRendererSDK();
    logger.info('[ExtensionLoader] Renderer SDK initialized');

    // 1. 저장된 Extension 설정 로드
    const extensionsConfig = await loadExtensionsConfig();

    // 2. Renderer용 Extension 로드 (npm 패키지로 설치된 Editor, Browser)
    const { all: extensions, toActivate } = await loadRendererExtensions(extensionsConfig);

    // 3. Registry에 등록 (병렬 처리, Store slice 등록 완료까지 대기)
    const registerPromises = extensions.map(async (extension) => {
      try {
        await extensionRegistry.register(extension);

        // Extension 번역 리소스 동적 등록
        if (extension.locales && i18next.isInitialized) {
          for (const [lang, resources] of Object.entries(extension.locales)) {
            i18next.addResourceBundle(lang, extension.manifest.id, resources, true, true);
          }
          logger.info(
            `[ExtensionLoader] Registered locales for ${extension.manifest.id} (namespace: ${extension.manifest.id})`,
            {
              languages: Object.keys(extension.locales),
            }
          );
        }
      } catch (error) {
        logger.error(`[ExtensionLoader] Failed to register extension ${extension.manifest.id}`, {
          error,
        });
      }
    });
    await Promise.all(registerPromises);

    // 4. 활성화할 Extension들만 필터링
    const extensionsToActivate = extensions.filter((ext) => toActivate.includes(ext.manifest.id));

    // 5. 의존성 레벨별로 그룹화 (같은 레벨은 병렬 활성화 가능)
    let extensionLevels: ExtensionDefinition[][];
    try {
      extensionLevels = groupByDependencyLevel(extensionsToActivate);
      logger.info('[ExtensionLoader] Extensions grouped by dependency levels', {
        levels: extensionLevels.map((level) => level.map((ext) => ext.manifest.id)),
      });
    } catch (error) {
      logger.error('[ExtensionLoader] Failed to group extensions by dependencies', { error });
      // 순환 의존성이 있으면 모두 하나의 레벨로 (순차 활성화)
      extensionLevels = [extensionsToActivate];
    }

    // 6. 레벨별로 병렬 활성화 (같은 레벨 내에서는 병렬, 레벨 간에는 순차)
    let activatedCount = 0;
    for (const level of extensionLevels) {
      const activatePromises = level.map(async (extension) => {
        const extensionId = extension.manifest.id;
        try {
          await extensionRegistry.activate(extensionId);
          logger.debug(`[ExtensionLoader] Activated extension: ${extensionId}`);
          return { success: true, id: extensionId };
        } catch (error) {
          logger.error(`[ExtensionLoader] Failed to activate extension ${extensionId}`, {
            error,
          });
          return { success: false, id: extensionId };
        }
      });

      const results = await Promise.all(activatePromises);
      activatedCount += results.filter((r) => r.success).length;
    }

    logger.info(
      `[ExtensionLoader] ✅ Loaded ${extensions.length} extension(s), activated ${activatedCount}`
    );
    logger.debug('[ExtensionLoader] Extension details:', {
      registered: extensions.map((e) => e.manifest.id),
      activated: extensionsToActivate.map((e) => e.manifest.id),
    });

    // 7. Store 업데이트 (UI 동기화 보장)
    try {
      const { useChatStore } = await import('@/lib/store/chat-store');
      useChatStore.getState().updateActiveExtensions(extensionRegistry.getActive());
      logger.info('[ExtensionLoader] Updated store with active extensions');
    } catch (error) {
      logger.error('[ExtensionLoader] Failed to update store with active extensions', { error });
    }
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to load extensions', { error });
    throw error;
  }
}

/**
 * Renderer용 Extension 로드 (개발/프로덕션 분기)
 *
 * 개발 환경: runtime loading 사용 (타이밍 문제 없음)
 * 프로덕션 환경: runtime loading 사용 (빌드 타임 의존성 없음)
 */
async function loadRendererExtensions(
  extensionsConfig: ExtensionStateConfig
): Promise<{ all: ExtensionDefinition[]; toActivate: string[] }> {
  const isDev = process.env.NODE_ENV === 'development';

  logger.info(`[ExtensionLoader] Loading renderer extensions (${isDev ? 'dev' : 'production'})...`);

  // 개발/프로덕션 모두 runtime loading 사용
  // webpack import는 Next.js 시작 시점과 Extension 빌드 시점의 타이밍 문제로 인해 비활성화
  return loadRendererExtensionsRuntime(extensionsConfig);
}

// NOTE: Webpack import 방식은 타이밍 문제로 인해 제거되었습니다.
// 모든 환경에서 runtime loading (sepilot-ext:// 프로토콜)을 사용합니다.
// 이전 구현은 git history에서 확인 가능합니다 (commit 8faa2166 이전).

function resolveExtensionDefinition(module: any): ExtensionDefinition | null {
  let current = module?.default ?? module;

  // Handle nested default wrappers from CJS/ESM interop across bundlers.
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current) {
      return null;
    }

    if (current.manifest) {
      return current as ExtensionDefinition;
    }

    if (current.default) {
      current = current.default;
      continue;
    }

    return null;
  }

  return null;
}

/**
 * Renderer용 Extension 로드 (Runtime Loading)
 *
 * 프로덕션 환경에서 사용되며, sepilot-ext:// 프로토콜을 통해 Extension을 런타임에 로드합니다.
 * 빌드 타임에 Extension을 알 필요가 없으므로 써드파티 Extension 지원 가능합니다.
 *
 * **동작 과정:**
 * 1. Main Process가 .sepx를 userData/extensions/{id}/로 추출 (완료 대기)
 * 2. IPC로 Renderer용 Extension 목록 조회
 * 3. sepilot-ext://{id}/dist/renderer.js 로드
 * 4. resolveExtensionFilePath()가 userData/extensions/{id}/ 경로에서 파일 찾음
 */
async function loadRendererExtensionsRuntime(
  extensionsConfig: ExtensionStateConfig
): Promise<{ all: ExtensionDefinition[]; toActivate: string[] }> {
  logger.info('[ExtensionLoader] 🔄 Loading extensions in PRODUCTION mode (Runtime Loading)...');

  // 1. Module registry 초기화
  const { initializeModuleRegistry } = await import('./host-module-registry');
  initializeModuleRegistry();
  logger.info('[ExtensionLoader] ✅ Module registry initialized');

  // 2. Main Process 로딩 완료 대기
  logger.info('[ExtensionLoader] ⏳ Waiting for Main Process extensions ready...');
  await waitForMainExtensionsReady();
  logger.info('[ExtensionLoader] ✅ Main Process extensions ready');

  // 3. IPC로 Extension 목록 조회
  const api = (window as any).electronAPI;
  if (!api) {
    logger.error('[ExtensionLoader] ❌ electronAPI not available');
    return { all: [], toActivate: [] };
  }

  const result = await api.invoke('extension:list-renderer-extensions');
  if (!result?.success) {
    logger.error('[ExtensionLoader] ❌ Failed to list renderer extensions', {
      error: result?.error,
    });
    return { all: [], toActivate: [] };
  }

  const extensionList = result.data || [];
  logger.info(`[ExtensionLoader] 📋 Found ${extensionList.length} renderer extension(s)`, {
    extensions: extensionList.map((e: any) => `${e.id}@${e.version}`),
  });

  // Log IPC result to extension logger (if available)
  try {
    const { extensionLogger } = await import('@/lib/utils/extension-logger');
    extensionLogger.ipcResult('Renderer', 'extension:list-renderer-extensions', true, {
      count: extensionList.length,
      extensions: extensionList.map((e: any) => `${e.id}@${e.version}`),
    });
  } catch {
    // Extension logger not available in browser
  }

  // 4. 각 Extension을 runtime으로 로드
  const { loadExtensionRuntime } = await import('./runtime-loader');
  const extensions: ExtensionDefinition[] = [];
  const toActivate: string[] = [];

  for (const extInfo of extensionList) {
    try {
      const extension = await loadExtensionRuntime(extInfo.id, extInfo.renderer);
      if (extension) {
        extensions.push(extension);

        const savedConfig = extensionsConfig[extInfo.id];
        const shouldActivate = savedConfig !== undefined ? savedConfig.enabled : true;

        if (shouldActivate) {
          toActivate.push(extInfo.id);
        }

        logger.debug(`[ExtensionLoader] Loaded ${extInfo.id} extension from runtime`, {
          willActivate: shouldActivate,
        });
      }
    } catch (error) {
      logger.error(`[ExtensionLoader] Failed to load ${extInfo.id} extension`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return { all: extensions, toActivate };
}

/**
 * Main Process Extension 로딩 완료 대기
 *
 * Renderer가 Extension을 로드하기 전에 Main Process가 Extension 로딩을 완료할 때까지 대기합니다.
 *
 * **레이스 컨디션 대응:**
 * - extensions:main-ready 이벤트 리스너 등록
 * - IPC 폴링으로 이미 로드된 상태 확인 (이벤트를 놓친 경우 대응)
 * - 최종 타임아웃 (15초) 안전장치
 */
/**
 * Main Process Extension 로딩 완료 대기 (동기 플래그 체크)
 *
 * ✅ 개선: 이벤트/폴링 대신 extension:is-ready IPC 핸들러로 플래그 직접 체크
 * - 윈도우 생성 전에 Extension 로딩이 완료되므로 항상 true 반환
 * - Race condition 제거, timeout 불필요
 */
async function waitForMainExtensionsReady(): Promise<void> {
  const api = (window as any).electronAPI;
  if (!api || !api.invoke) {
    logger.warn('[ExtensionLoader] electronAPI.invoke not available, skipping main wait');
    return;
  }

  const MAX_RETRIES = 30; // 30 attempts
  const RETRY_DELAY = 1000; // 1 second
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    attempts++;

    try {
      const isReady = await api.invoke('extension:is-ready');
      if (isReady) {
        logger.info(
          `[ExtensionLoader] ✅ Main extensions ready (attempt ${attempts}/${MAX_RETRIES})`
        );

        // Log to extension logger (if available)
        try {
          const { extensionLogger } = await import('@/lib/utils/extension-logger');
          extensionLogger.mainReady();
        } catch {
          // Extension logger not available in browser
        }

        return;
      } else {
        if (attempts % 5 === 0) {
          logger.info(
            `[ExtensionLoader] ⏳ Waiting for main extensions... (attempt ${attempts}/${MAX_RETRIES})`
          );

          // Log to extension logger (if available)
          try {
            const { extensionLogger } = await import('@/lib/utils/extension-logger');
            extensionLogger.waitingForMain(attempts, MAX_RETRIES);
          } catch {
            // Extension logger not available in browser
          }
        }
      }
    } catch (error) {
      logger.error(
        `[ExtensionLoader] Failed to check extension ready status (attempt ${attempts}):`,
        error
      );
    }

    if (attempts >= MAX_RETRIES) {
      logger.error(
        '[ExtensionLoader] ⚠️ Timeout waiting for main extensions (30s), continuing anyway'
      );
      return; // Continue without main extensions
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  }
}

// NOTE: Extension 동적 로드는 runtime loading으로 대체되었습니다.
// extensionRegistry.activate(extensionId)를 직접 사용하세요.

/**
 * Extension 언로드 (런타임)
 *
 * Extension을 비활성화하고 등록 해제합니다.
 * VSCode처럼 사용자가 Extension을 비활성화할 때 사용됩니다.
 *
 * @param extensionId - extension ID
 */
/**
 * Renderer SDK 초기화
 *
 * Extension 로드 전에 SDK에 Host의 실제 구현체를 등록합니다.
 * Store accessor, Chat 컴포넌트, Hooks 등이 여기서 등록됩니다.
 */
async function initializeRendererSDK(): Promise<void> {
  try {
    // 동적 import로 순환 의존성 방지
    const [{ useChatStore }, { useLangGraphStream }] = await Promise.all([
      import('@/lib/store/chat-store'),
      import('@/lib/hooks/useLangGraphStream'),
    ]);

    // Chat 컴포넌트는 lazy load (필요 시)
    let chatComponents: Record<string, any> = {};
    try {
      const [
        unifiedChatModule,
        unifiedInputModule,
        markdownModule,
        errorBoundaryModule,
        agentLogsModule,
      ] = await Promise.all([
        import('@/components/chat/unified/UnifiedChatArea'),
        import('@/components/chat/unified/UnifiedChatInput'),
        import('@/components/markdown/MarkdownRenderer'),
        import('@/components/ErrorBoundary'),
        import('@/components/chat/unified/plugins/AgentLogsPlugin'),
      ]);

      chatComponents = {
        UnifiedChatArea: unifiedChatModule.UnifiedChatArea,
        UnifiedChatInput: unifiedInputModule.UnifiedChatInput,
        MarkdownRenderer: markdownModule.MarkdownRenderer,
        ErrorBoundary: errorBoundaryModule.ErrorBoundary,
        AgentLogsPlugin: agentLogsModule.AgentLogsPlugin,
      };

      // Debug: 등록된 컴포넌트 확인
      logger.info('[ExtensionLoader] Chat components registered:', {
        components: Object.keys(chatComponents),
        agentLogsPlugin: !!chatComponents.AgentLogsPlugin,
      });
    } catch (error) {
      logger.warn('[ExtensionLoader] Some chat components not available for SDK', { error });
    }

    initializeSDK({
      storeAccessor: useChatStore,
      chatComponents,
      hooks: {
        useLangGraphStream,
      },
    });

    // Host UI 컴포넌트 등록
    try {
      const { registerHostUIComponents } = await import('@sepilot/extension-sdk');
      const [settingsModule, errorBoundaryModule] = await Promise.all([
        import('@/components/settings/SettingsSectionHeader'),
        import('@/components/ErrorBoundary'),
      ]);

      registerHostUIComponents({
        SettingsSectionHeader: settingsModule.SettingsSectionHeader,
        ErrorBoundary: errorBoundaryModule.ErrorBoundary,
      });
    } catch (error) {
      logger.warn('[ExtensionLoader] Some host UI components not available', { error });
    }

    // Host Hooks 등록
    try {
      const { registerHostHooks } = await import('@sepilot/extension-sdk');
      const terminalHotkeysModule = await import('@/lib/hooks/use-terminal-hotkeys');

      registerHostHooks({
        useTerminalHotkeys: terminalHotkeysModule.useTerminalHotkeys,
      });
    } catch (error) {
      logger.warn('[ExtensionLoader] Some host hooks not available', { error });
    }

    // Host LLM Services 등록 (Renderer용)
    try {
      const { registerHostServices, isHostServicesRegistered } =
        await import('@sepilot/extension-sdk');
      if (!isHostServicesRegistered()) {
        const webClientModule = await import('@/lib/domains/llm/web-client');
        registerHostServices({
          llm: {
            getLLMClient: () => null, // Main Process only
            getWebLLMClient: () => webClientModule.getWebLLMClient(),
            getLLMService: () => null, // Main Process only
          },
        });
      }
    } catch (error) {
      logger.warn('[ExtensionLoader] Host LLM services registration failed', { error });
    }

    logger.info('[ExtensionLoader] Renderer SDK initialized');
  } catch (error) {
    logger.error('[ExtensionLoader] Failed to initialize renderer SDK', { error });
    // SDK 초기화 실패해도 Extension 로드는 계속 진행
  }
}

export async function unloadExtension(extensionId: string): Promise<void> {
  if (!isBrowser()) {
    throw new Error('unloadExtension can only be called in browser environment');
  }

  try {
    logger.info(`[ExtensionLoader] Unloading extension: ${extensionId}...`);

    // 비활성화
    await extensionRegistry.deactivate(extensionId);

    // Registry에서 제거
    extensionRegistry.unregister(extensionId);

    logger.info(`[ExtensionLoader] Successfully unloaded extension: ${extensionId}`);
  } catch (error) {
    logger.error(`[ExtensionLoader] Failed to unload extension ${extensionId}`, { error });
    throw error;
  }
}
