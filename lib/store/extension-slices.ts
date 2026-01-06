/**
 * Extension Store Slices Integration
 *
 * 이 파일은 모든 Extension의 Zustand store slice를 중앙에서 관리합니다.
 * 새로운 Extension의 store를 추가하려면 이 파일만 수정하면 됩니다.
 *
 * 메인 chat-store.ts는 이 파일을 통해 Extension store slices를 동적으로 로드하므로,
 * Extension 관련 코드가 chat-store.ts에 직접 나타나지 않습니다.
 */

import { createPresentationSlice } from '@/extensions/presentation/store';
import { createTerminalSlice } from '@/extensions/terminal/store';
import { manifest as editorManifest } from '@/extensions/editor/manifest';
import { manifest as browserManifest } from '@/extensions/browser/manifest';
import { manifest as presentationManifest } from '@/extensions/presentation/manifest';
import { manifest as terminalManifest } from '@/extensions/terminal/manifest';

/**
 * 모든 Extension의 createStoreSlice 함수를 모아둔 객체
 *
 * 새 Extension을 추가하려면 여기에 추가하세요:
 * ```typescript
 * import { createMyExtensionSlice } from '@/extensions/my-extension/store';
 *
 * export const extensionStoreSlices = {
 *   createPresentationSlice,
 *   createTerminalSlice,
 *   createMyExtensionSlice,  // 추가
 * };
 * ```
 */
export const extensionStoreSlices = {
  createPresentationSlice,
  createTerminalSlice,
};

/**
 * Extension Store의 전체 타입
 *
 * 모든 Extension store slice의 반환 타입을 합친 것입니다.
 */
export type ExtensionStoreState = ReturnType<typeof createPresentationSlice> &
  ReturnType<typeof createTerminalSlice>;

/**
 * Extension store slices를 Zustand store에 병합
 *
 * @param set - Zustand set 함수
 * @param get - Zustand get 함수
 * @returns 모든 Extension store slices를 병합한 객체
 */
export function mergeExtensionStoreSlices(set: any, get: any): ExtensionStoreState {
  return Object.values(extensionStoreSlices).reduce(
    (merged, createSlice) => ({
      ...merged,
      ...createSlice(set, get),
    }),
    {} as ExtensionStoreState
  ) as ExtensionStoreState;
}

/**
 * AppMode 타입 - 모든 Extension의 mode를 자동으로 포함
 *
 * 'chat' (built-in) + 모든 Extension의 mode를 union 타입으로 결합
 *
 * 새 Extension을 추가하면 이 타입도 자동으로 업데이트됩니다.
 */
export type AppMode =
  | 'chat' // Built-in mode
  | typeof editorManifest.mode
  | typeof browserManifest.mode
  | typeof presentationManifest.mode
  | typeof terminalManifest.mode;
