/**
 * Extension Registry
 *
 * 모든 빌트인 Extension을 등록하는 중앙 레지스트리
 *
 * 새 Extension 추가 시 이 파일만 수정하면 됩니다:
 * 1. definition.ts import 추가
 * 2. builtinExtensions 배열에 추가
 */

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { editorExtension } from './editor/definition';
import { browserExtension } from './browser/definition';
import { presentationExtension } from './presentation/definition';
import { terminalExtension } from './terminal/definition';

/**
 * 빌트인 Extension 목록
 *
 * 배열 순서는 로딩 순서를 결정하지만,
 * 실제 표시 순서는 각 Extension의 manifest.order에 의해 결정됩니다.
 */
export const builtinExtensions: ExtensionDefinition[] = [
  editorExtension,
  browserExtension,
  presentationExtension,
  // terminalExtension, // Phase 3 완료 시 활성화
];

/**
 * Extension ID로 검색
 */
export function getExtensionById(id: string): ExtensionDefinition | undefined {
  return builtinExtensions.find((ext) => ext.manifest.id === id);
}

/**
 * 활성화된 Extension만 필터링
 */
export function getEnabledExtensions(): ExtensionDefinition[] {
  return builtinExtensions.filter((ext) => ext.manifest.enabled !== false);
}
