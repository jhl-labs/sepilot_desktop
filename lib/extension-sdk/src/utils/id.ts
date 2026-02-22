/**
 * ID 생성 유틸리티
 *
 * Extension에서 사용하는 고유 ID 생성 함수들
 */

/**
 * 타임스탬프와 랜덤 문자열을 조합한 고유 ID 생성
 *
 * @param prefix - ID 접두사 (선택사항)
 * @returns 고유 ID (예: "ext-1700000000000-a1b2c3d4e")
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

/**
 * Short ID 생성 (8자리)
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}
