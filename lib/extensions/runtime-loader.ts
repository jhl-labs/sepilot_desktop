/**
 * Extension Runtime Loader
 *
 * Script Tag 기반으로 Extension을 런타임에 동적으로 로드합니다.
 * sepilot-ext:// custom protocol을 통해 Extension 파일을 가져옵니다.
 *
 * 프로덕션 환경에서만 사용되며, 개발 환경에서는 webpack import를 사용합니다.
 */

import type { ExtensionDefinition } from './types';
import { logger } from '@/lib/utils/logger';

/**
 * 로드된 Extension 캐시
 */
const loadedExtensions = new Map<string, ExtensionDefinition>();

/**
 * 로딩 중인 Extension Promise 캐시 (중복 로드 방지)
 */
const loadingPromises = new Map<string, Promise<ExtensionDefinition>>();

/**
 * Extension을 런타임에 동적으로 로드 (Retry 지원)
 *
 * manifest.renderer 경로 또는 기본값(dist/renderer.js)으로 Extension을 로드합니다.
 * Script Tag를 사용하므로 CSP 준수합니다.
 *
 * ✅ 개선: 3회 재시도, 더 나은 에러 로깅
 *
 * @param extensionId - Extension ID
 * @param rendererPath - Renderer 엔트리 경로 (manifest.renderer에서 전달, 기본값: dist/renderer.js)
 * @param timeout - 타임아웃 (ms, 기본값: 30000)
 * @param maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @returns Extension Definition
 */
export async function loadExtensionRuntime(
  extensionId: string,
  rendererPath?: string,
  timeout: number = 30000,
  maxRetries: number = 3
): Promise<ExtensionDefinition> {
  // 캐시된 Extension 반환
  const cached = loadedExtensions.get(extensionId);
  if (cached) {
    logger.debug(`[RuntimeLoader] Using cached extension: ${extensionId}`);
    return cached;
  }

  // 이미 로딩 중이면 기존 Promise 반환 (중복 로드 방지)
  const loadingPromise = loadingPromises.get(extensionId);
  if (loadingPromise) {
    logger.debug(`[RuntimeLoader] Extension already loading: ${extensionId}`);
    return loadingPromise;
  }

  // globalThis에 이미 등록되어 있으면 반환
  const globalExtensions = (globalThis as any).__SEPILOT_EXTENSIONS__ || {};
  if (globalExtensions[extensionId]) {
    const ext = globalExtensions[extensionId].default || globalExtensions[extensionId];
    loadedExtensions.set(extensionId, ext);
    logger.debug(`[RuntimeLoader] Using globally registered extension: ${extensionId}`);
    return ext;
  }

  // 새로운 로드 시작 (Retry 로직 포함)
  const promise = loadExtensionWithRetry(extensionId, timeout, maxRetries, rendererPath);
  loadingPromises.set(extensionId, promise);

  try {
    const extension = await promise;
    loadedExtensions.set(extensionId, extension);
    return extension;
  } finally {
    loadingPromises.delete(extensionId);
  }
}

/**
 * Extension 로드 (Retry 로직)
 *
 * ✅ 네트워크 오류, 일시적 프로토콜 오류 대응
 */
async function loadExtensionWithRetry(
  extensionId: string,
  timeout: number,
  maxRetries: number,
  rendererPath?: string
): Promise<ExtensionDefinition> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `[RuntimeLoader] Loading extension: ${extensionId} (attempt ${attempt}/${maxRetries})`
      );
      return await loadExtensionInternal(extensionId, timeout, rendererPath);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        `[RuntimeLoader] ⚠️ Extension load attempt ${attempt}/${maxRetries} failed: ${extensionId}`,
        {
          error: lastError.message,
          willRetry: attempt < maxRetries,
        }
      );

      // 마지막 시도가 아니면 재시도 전 대기 (지수 백오프: 500ms, 1000ms, 2000ms)
      if (attempt < maxRetries) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 모든 재시도 실패
  logger.error(
    `[RuntimeLoader] ❌ Failed to load extension after ${maxRetries} attempts: ${extensionId}`,
    {
      error: lastError?.message,
    }
  );
  throw lastError || new Error(`Failed to load extension: ${extensionId}`);
}

/**
 * Extension 로드 내부 구현
 */
async function loadExtensionInternal(
  extensionId: string,
  timeout: number,
  rendererPathParam?: string
): Promise<ExtensionDefinition> {
  // Renderer 경로: 파라미터 우선, 없으면 기본값
  const rendererPath = rendererPathParam || 'dist/renderer.js';
  if (rendererPathParam) {
    logger.debug(`[RuntimeLoader] Using provided renderer path: ${rendererPath}`);
  }

  const scriptUrl = `sepilot-ext://${extensionId}/${rendererPath}`;

  logger.info(`[RuntimeLoader] Loading extension: ${extensionId} from ${scriptUrl}`);

  return new Promise((resolve, reject) => {
    // Timeout 타이머
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Extension load timeout: ${extensionId} (${timeout}ms)`));
    }, timeout);

    // Script 태그 생성
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;

    // 로드 성공
    script.onload = () => {
      clearTimeout(timeoutId);

      // globalThis.__SEPILOT_EXTENSIONS__에서 Extension 조회
      const globalExtensions = (globalThis as any).__SEPILOT_EXTENSIONS__ || {};
      const extensionModule = globalExtensions[extensionId];

      if (extensionModule) {
        const extension = extensionModule.default || extensionModule;

        // Manifest 검증
        if (!extension.manifest || !extension.manifest.id) {
          cleanup();
          logger.error(`[RuntimeLoader] Invalid extension manifest: ${extensionId}`, {
            hasManifest: !!extension.manifest,
            hasId: !!extension.manifest?.id,
          });
          reject(new Error(`Invalid extension manifest: ${extensionId}`));
          return;
        }

        logger.info(`[RuntimeLoader] ✅ Extension loaded successfully: ${extensionId}`);
        cleanup();
        resolve(extension);
      } else {
        cleanup();
        logger.error(`[RuntimeLoader] ❌ Extension ${extensionId} did not register itself`, {
          scriptUrl,
          globalExtensions: Object.keys(globalExtensions),
        });
        reject(
          new Error(
            `Extension ${extensionId} did not register itself in globalThis.__SEPILOT_EXTENSIONS__`
          )
        );
      }
    };

    // 로드 실패
    script.onerror = (event) => {
      clearTimeout(timeoutId);
      cleanup();
      logger.error(`[RuntimeLoader] ❌ Failed to load extension script: ${extensionId}`, {
        scriptUrl,
        event: event?.toString(),
      });
      reject(new Error(`Failed to load extension script: ${extensionId} from ${scriptUrl}`));
    };

    // Script Tag를 DOM에 추가
    document.head.appendChild(script);

    // Cleanup 함수
    function cleanup() {
      script.remove();
    }
  });
}

/**
 * Extension 언로드 (런타임)
 *
 * Extension을 비활성화하고 캐시에서 제거합니다.
 * globalThis.__SEPILOT_EXTENSIONS__에서도 제거합니다.
 *
 * @param extensionId - Extension ID
 */
export async function unloadExtensionRuntime(extensionId: string): Promise<void> {
  logger.info(`[RuntimeLoader] Unloading extension: ${extensionId}`);

  // 캐시에서 제거
  loadedExtensions.delete(extensionId);

  // globalThis에서 제거
  const globalExtensions = (globalThis as any).__SEPILOT_EXTENSIONS__;
  if (globalExtensions && globalExtensions[extensionId]) {
    delete globalExtensions[extensionId];
  }

  logger.info(`[RuntimeLoader] Extension unloaded: ${extensionId}`);
}

/**
 * 로드된 Extension 목록 조회 (디버깅용)
 */
export function getLoadedExtensions(): string[] {
  return Array.from(loadedExtensions.keys());
}

/**
 * Extension 로드 캐시 초기화 (테스트용)
 */
export function clearExtensionCache(): void {
  loadedExtensions.clear();
  loadingPromises.clear();
  logger.info('[RuntimeLoader] Extension cache cleared');
}
