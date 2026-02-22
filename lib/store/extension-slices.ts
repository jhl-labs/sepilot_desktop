/**
 * Extension Store Slices Integration (Runtime Loader) - Enhanced
 *
 * Extension을 런타임에 동적으로 로드하여 store slice를 생성합니다.
 * VSCode와 유사하게 Extension을 컴파일 타임이 아닌 런타임에 로드합니다.
 *
 * 개선 사항 (v2):
 * - Extension slice 등록/해제 상태 추적
 * - 타입 안전성 개선
 * - 에러 처리 강화 (재시도, fallback)
 * - Extension reload 메커니즘
 * - 디버깅 유틸리티
 */

import { createSchedulerSlice } from './scheduler-slice';
import type { ExtensionRuntimeContext } from '@/lib/extensions/types';

/**
 * Extension Slice 생성 함수 타입
 */
export type ExtensionSliceCreator = (set: any, get: any, context: ExtensionRuntimeContext) => any;

/**
 * Extension Slice 메타데이터
 */
interface ExtensionSliceMetadata {
  extensionId: string;
  sliceName: string;
  creator: ExtensionSliceCreator;
  context: ExtensionRuntimeContext;
  registeredAt: Date;
  loadAttempts: number;
  lastError?: Error;
  status: 'registered' | 'loaded' | 'failed';
}

/**
 * Extension Registry에서 로드된 Extension들의 store slice를 가져옵니다.
 *
 * 이 객체는 런타임에 채워집니다.
 */
export const extensionStoreSlices: Record<string, ExtensionSliceCreator> = {
  createSchedulerSlice, // Built-in slice (Extension 아님)
};

/**
 * Extension별 Runtime Context를 저장
 */
const extensionContexts = new Map<string, ExtensionRuntimeContext>();

/**
 * Extension slice 메타데이터 저장소
 */
const sliceMetadata = new Map<string, ExtensionSliceMetadata>();

/**
 * Extension slice 등록 이벤트 리스너
 */
type SliceRegistrationListener = (
  extensionId: string,
  status: 'registered' | 'loaded' | 'failed'
) => void;
const registrationListeners: SliceRegistrationListener[] = [];

/**
 * Extension slice 등록 이벤트 리스너 추가
 */
export function onSliceRegistration(listener: SliceRegistrationListener): () => void {
  registrationListeners.push(listener);
  return () => {
    const index = registrationListeners.indexOf(listener);
    if (index >= 0) {
      registrationListeners.splice(index, 1);
    }
  };
}

/**
 * Extension을 동적으로 등록 (Enhanced)
 *
 * Extension Registry에서 호출하여 Extension의 store slice를 등록합니다.
 *
 * @param extensionId - Extension ID (kebab-case)
 * @param createStoreSlice - Store slice 생성 함수
 * @param context - Extension Runtime Context
 */
export function registerExtensionSlice(
  extensionId: string,
  createStoreSlice: ExtensionSliceCreator,
  context: ExtensionRuntimeContext
): void {
  const sliceName = `create${toPascalCase(extensionId)}Slice`;

  // 기존 등록 정보 확인
  const existing = sliceMetadata.get(extensionId);
  if (existing) {
    console.warn(
      `[ExtensionStoreSlices] Extension "${extensionId}" slice is already registered. Updating...`
    );
  }

  // Store slice 등록
  extensionStoreSlices[sliceName] = createStoreSlice;
  extensionContexts.set(extensionId, context);

  // 메타데이터 저장
  sliceMetadata.set(extensionId, {
    extensionId,
    sliceName,
    creator: createStoreSlice,
    context,
    registeredAt: new Date(),
    loadAttempts: 0,
    status: 'registered',
  });

  // 리스너 알림
  registrationListeners.forEach((listener) => listener(extensionId, 'registered'));

  console.log(`[ExtensionStoreSlices] Registered: ${extensionId} (${sliceName})`);
}

/**
 * Extension slice 등록 해제
 *
 * @param extensionId - Extension ID
 */
export function unregisterExtensionSlice(extensionId: string): void {
  const sliceName = `create${toPascalCase(extensionId)}Slice`;

  delete extensionStoreSlices[sliceName];
  extensionContexts.delete(extensionId);
  sliceMetadata.delete(extensionId);

  console.log(`[ExtensionStoreSlices] Unregistered: ${extensionId}`);
}

/**
 * Extension store slices를 Zustand store에 병합 (Enhanced)
 *
 * @param set - Zustand set 함수
 * @param get - Zustand get 함수
 * @param context - Extension Runtime Context (기본값)
 * @returns 모든 Extension store slices를 병합한 객체
 */
export function mergeExtensionStoreSlices(
  set: any,
  get: any,
  context: ExtensionRuntimeContext
): any {
  const merged: any = {};
  const errors: Array<{ extensionId: string; error: Error }> = [];

  for (const [sliceName, createSlice] of Object.entries(extensionStoreSlices)) {
    try {
      // Extension ID 추출 (createEditorSlice -> editor)
      const extensionId = sliceName
        .replace(/^create/, '')
        .replace(/Slice$/, '')
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .slice(1);

      // Extension별 Context 조회 (없으면 기본 context 사용)
      const extensionContext = extensionContexts.get(extensionId) || context;

      // 메타데이터 업데이트
      const metadata = sliceMetadata.get(extensionId);
      if (metadata) {
        metadata.loadAttempts++;
      }

      // Extension store slice 생성 시도
      const slice = createSlice(set, get, extensionContext);
      Object.assign(merged, slice);

      // 성공 시 메타데이터 업데이트
      if (metadata) {
        metadata.status = 'loaded';
        metadata.lastError = undefined;
        registrationListeners.forEach((listener) => listener(extensionId, 'loaded'));
      }

      console.log(`[ExtensionStoreSlices] Loaded: ${extensionId} (${sliceName})`);
    } catch (error) {
      const extensionId = sliceName
        .replace(/^create/, '')
        .replace(/Slice$/, '')
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .slice(1);

      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ extensionId, error: err });

      // 메타데이터 업데이트
      const metadata = sliceMetadata.get(extensionId);
      if (metadata) {
        metadata.status = 'failed';
        metadata.lastError = err;
        registrationListeners.forEach((listener) => listener(extensionId, 'failed'));
      }

      console.error(`[ExtensionStoreSlices] Failed to load slice ${sliceName}:`, error);
    }
  }

  // 에러 요약 로그
  if (errors.length > 0) {
    console.error(
      `[ExtensionStoreSlices] ${errors.length} extension(s) failed to load:`,
      errors.map((e) => e.extensionId).join(', ')
    );
  }

  return merged;
}

/**
 * Extension slice 재로드
 *
 * Extension 업데이트 시 store slice를 다시 생성합니다.
 * 주의: Zustand store 전체를 다시 생성하지 않고 slice만 업데이트하므로,
 * 기존 상태는 유지되지만 새로운 액션/상태는 반영됩니다.
 *
 * @param extensionId - Extension ID
 * @param set - Zustand set 함수
 * @param get - Zustand get 함수
 * @returns 성공 여부
 */
export function reloadExtensionSlice(extensionId: string, set: any, get: any): boolean {
  const sliceName = `create${toPascalCase(extensionId)}Slice`;
  const createSlice = extensionStoreSlices[sliceName];

  if (!createSlice) {
    console.warn(`[ExtensionStoreSlices] Extension "${extensionId}" slice not found for reload`);
    return false;
  }

  try {
    const context = extensionContexts.get(extensionId);
    if (!context) {
      throw new Error(`Extension context not found for "${extensionId}"`);
    }

    const slice = createSlice(set, get, context);
    set(slice);

    console.log(`[ExtensionStoreSlices] Reloaded: ${extensionId}`);
    return true;
  } catch (error) {
    console.error(`[ExtensionStoreSlices] Failed to reload ${extensionId}:`, error);
    return false;
  }
}

/**
 * 등록된 Extension slice 목록 조회
 */
export function getRegisteredSlices(): string[] {
  return Array.from(sliceMetadata.keys());
}

/**
 * Extension slice 메타데이터 조회
 */
export function getSliceMetadata(extensionId: string): ExtensionSliceMetadata | undefined {
  return sliceMetadata.get(extensionId);
}

/**
 * 모든 Extension slice 메타데이터 조회
 */
export function getAllSliceMetadata(): Map<string, ExtensionSliceMetadata> {
  return new Map(sliceMetadata);
}

/**
 * Extension slice 상태 요약
 */
export interface SliceStatusSummary {
  total: number;
  registered: number;
  loaded: number;
  failed: number;
  extensions: Array<{
    id: string;
    status: 'registered' | 'loaded' | 'failed';
    loadAttempts: number;
    error?: string;
  }>;
}

/**
 * Extension slice 상태 요약 조회
 */
export function getSliceStatusSummary(): SliceStatusSummary {
  const extensions = Array.from(sliceMetadata.values()).map((meta) => ({
    id: meta.extensionId,
    status: meta.status,
    loadAttempts: meta.loadAttempts,
    error: meta.lastError?.message,
  }));

  return {
    total: extensions.length,
    registered: extensions.filter((e) => e.status === 'registered').length,
    loaded: extensions.filter((e) => e.status === 'loaded').length,
    failed: extensions.filter((e) => e.status === 'failed').length,
    extensions,
  };
}

/**
 * Extension Store의 전체 타입
 *
 * 런타임에 Extension이 로드되므로 정확한 타입을 지정할 수 없습니다.
 * 필요한 경우 개별 Extension의 타입을 캐스팅하여 사용하세요.
 */
export type ExtensionStoreState = any;

/**
 * AppMode 타입
 *
 * Extension이 런타임에 로드되므로 정확한 mode 타입을 지정할 수 없습니다.
 */
export type AppMode = string;

/**
 * Helper: kebab-case를 PascalCase로 변환
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
