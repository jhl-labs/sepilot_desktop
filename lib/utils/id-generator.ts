/**
 * ID 생성 유틸리티
 *
 * 프로젝트 전반에서 사용하는 고유 ID 생성 함수들
 */

import { ID_PREFIXES } from '../constants';

/**
 * 타임스탬프와 랜덤 문자열을 조합한 고유 ID 생성
 *
 * @param prefix - ID 접두사 (선택사항)
 * @returns 고유 ID (예: "conv-1700000000000-a1b2c3d4e")
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);

  if (prefix) {
    return `${prefix}-${timestamp}-${random}`;
  }

  return `${timestamp}-${random}`;
}

/**
 * 대화 ID 생성
 */
export function generateConversationId(): string {
  return generateId(ID_PREFIXES.CONVERSATION);
}

/**
 * 메시지 ID 생성
 */
export function generateMessageId(): string {
  return generateId(ID_PREFIXES.MESSAGE);
}

/**
 * 도구 호출 ID 생성
 */
export function generateToolCallId(): string {
  return generateId(ID_PREFIXES.TOOL_CALL);
}

/**
 * 이미지 ID 생성
 *
 * @param source - 이미지 출처 ('clipboard' | 'file')
 */
export function generateImageId(source: 'clipboard' | 'file' = 'file'): string {
  const prefix = source === 'clipboard' ? ID_PREFIXES.CLIPBOARD : ID_PREFIXES.FILE;
  return generateId(prefix);
}

/**
 * UUID v4 생성 (crypto API 사용)
 *
 * 브라우저 환경에서만 사용 가능
 */
export function generateUUID(): string {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: 간단한 UUID v4 구현
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
