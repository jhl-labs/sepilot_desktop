/**
 * Extension Path Resolution Utilities
 *
 * Extension 파일 경로를 개발/번들/사용자 설치 순서로 검색합니다.
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from '@/lib/utils/logger';

/**
 * Extension 파일 경로 resolve
 *
 * 세 가지 실행 환경을 모두 지원합니다:
 *
 * 1. **개발 모드** (pnpm dev):
 *    - resources/extensions/{id}/ 디렉토리에서 직접 로드
 *    - app.getAppPath() = 프로젝트 루트
 *
 * 2. **Unpacked 빌드** (압축 해제 후 실행):
 *    - app.asar/resources/extensions/{id}/ 또는
 *    - extraResources/extensions/{id}/
 *
 * 3. **Portable 빌드** (단일 exe):
 *    - exe 옆 extensions/*.sepx 파일을 userData/extensions/{id}/로 추출
 *    - sepilot-ext:// 프로토콜이 이 경로에서 파일 서빙
 *
 * @param extensionId - Extension ID
 * @param filePath - 파일 경로 (예: /dist/renderer.js)
 * @returns 실제 파일 경로 또는 null
 */
export function resolveExtensionFilePath(extensionId: string, filePath: string): string | null {
  // Path traversal 방어 + absolute path 방어
  // URL pathname은 `/dist/renderer.js` 형태로 들어오기 때문에
  // path.join(base, '/dist/...')가 base를 무시하지 않도록 선행 슬래시 제거
  const normalizedPath = path
    .normalize(filePath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');

  // 원본 입력 기준 UNC 경로 차단 (normalize/trim 전에 감지)
  if (/^[\\/]{2}[^\\/]/.test(filePath)) {
    logger.warn(`[ExtensionPaths] Rejected UNC path: ${filePath}`);
    return null;
  }

  // Windows 절대경로 방어 (예: C:\...)
  if (/^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
    logger.warn(`[ExtensionPaths] Rejected absolute Windows path: ${filePath}`);
    return null;
  }

  const isDev = !app.isPackaged;

  const candidates: string[] = [];

  if (isDev) {
    // 개발 모드: resources/extensions/ 디렉토리에서 직접 로드
    candidates.push(
      path.join(app.getAppPath(), 'resources', 'extensions', extensionId, normalizedPath)
    );
  }

  // 프로덕션 + 개발 모드 공통: userData/extensions/ (.sepx 추출 경로 + 사용자 설치)
  candidates.push(path.join(app.getPath('userData'), 'extensions', extensionId, normalizedPath));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        logger.debug(`[ExtensionPaths] Resolved ${extensionId}${filePath} -> ${candidate}`);
        return candidate;
      }
    } catch (error) {
      // 파일 시스템 에러는 무시하고 다음 후보 시도
      logger.debug(`[ExtensionPaths] Failed to check ${candidate}:`, error);
    }
  }

  logger.warn(`[ExtensionPaths] File not found: ${extensionId}${filePath}`);
  logger.debug(`[ExtensionPaths] Searched paths:`, candidates);
  return null;
}

/**
 * Extension ID 검증
 *
 * 보안: Extension ID는 소문자, 숫자, 하이픈만 허용
 *
 * @param extensionId - Extension ID
 * @returns 유효 여부
 */
export function isValidExtensionId(extensionId: string): boolean {
  return /^[a-z0-9-]+$/.test(extensionId);
}

/**
 * Extension 설치 경로 조회
 *
 * @param extensionId - Extension ID
 * @returns Extension 디렉토리 경로 또는 null
 */
export function getExtensionDirectory(extensionId: string): string | null {
  if (!isValidExtensionId(extensionId)) {
    logger.error(`[ExtensionPaths] Invalid extension ID: ${extensionId}`);
    return null;
  }

  const isDev = !app.isPackaged;

  const candidates: string[] = [];

  if (isDev) {
    // 개발 모드: resources/extensions/ 디렉토리
    candidates.push(path.join(app.getAppPath(), 'resources', 'extensions', extensionId));
  }

  // 프로덕션 + 개발 모드 공통: userData/extensions/
  candidates.push(path.join(app.getPath('userData'), 'extensions', extensionId));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch (error) {
      logger.debug(`[ExtensionPaths] Failed to check directory ${candidate}:`, error);
    }
  }

  return null;
}
