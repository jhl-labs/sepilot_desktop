/**
 * Safe JSON Parsing Utilities
 *
 * Prototype Pollution 공격을 방지하는 안전한 JSON 파싱 함수
 *
 * Prototype Pollution: __proto__, constructor, prototype 등의 위험한 키를 통해
 * 객체의 프로토타입을 오염시키는 공격 기법 방어
 */

import { logger } from './logger';

/**
 * 위험한 키 목록
 *
 * 이 키들은 객체의 프로토타입을 변경할 수 있어 보안 위험이 있습니다.
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * 객체에 위험한 키가 있는지 재귀적으로 검사
 *
 * @param obj - 검사할 객체
 * @param path - 현재 경로 (디버깅용)
 * @returns 위험한 키가 발견되면 해당 키 경로, 없으면 null
 */
function findDangerousKey(obj: any, path: string = ''): string | null {
  if (obj === null || typeof obj !== 'object') {
    return null;
  }

  // 배열인 경우 각 요소 검사
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = findDangerousKey(obj[i], `${path}[${i}]`);
      if (result) {
        return result;
      }
    }
    return null;
  }

  // 객체인 경우 각 키 검사
  for (const key of Object.keys(obj)) {
    // 위험한 키 검사
    if (DANGEROUS_KEYS.includes(key)) {
      const fullPath = path ? `${path}.${key}` : key;
      return fullPath;
    }

    // 재귀적으로 중첩 객체 검사
    const fullPath = path ? `${path}.${key}` : key;
    const result = findDangerousKey(obj[key], fullPath);
    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * 안전한 JSON 파싱
 *
 * JSON을 파싱한 후 __proto__, constructor, prototype 등의 위험한 키를 재귀적으로 검증합니다.
 * 위험한 키가 발견되면 에러를 던집니다.
 *
 * @param jsonString - 파싱할 JSON 문자열
 * @returns 파싱된 객체
 * @throws {Error} JSON 파싱 실패 또는 위험한 키 발견 시
 *
 * @example
 * ```typescript
 * // 안전한 JSON
 * const safe = safeParseJSON('{"name": "test"}'); // OK
 *
 * // 위험한 JSON (Prototype Pollution 시도)
 * const malicious = safeParseJSON('{"__proto__": {"isAdmin": true}}'); // Error!
 * ```
 */
export function safeParseJSON<T = any>(jsonString: string): T {
  try {
    // 1. JSON 파싱
    const parsed = JSON.parse(jsonString);

    // 2. 위험한 키 검사
    const dangerousKey = findDangerousKey(parsed);
    if (dangerousKey) {
      const error = new Error(
        `Prototype pollution detected: dangerous key "${dangerousKey}" found in JSON`
      );
      logger.error('[SafeJSON] Prototype pollution attempt blocked:', {
        dangerousKey,
        jsonPreview: jsonString.substring(0, 100),
      });
      throw error;
    }

    return parsed;
  } catch (error: any) {
    // JSON.parse 에러 또는 위험한 키 발견 에러를 그대로 던짐
    if (error.message.includes('Prototype pollution')) {
      throw error;
    }

    // JSON 파싱 에러
    logger.error('[SafeJSON] JSON parse error:', {
      error: error.message,
      jsonPreview: jsonString.substring(0, 100),
    });
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

/**
 * 객체에서 위험한 키 제거
 *
 * 파싱된 객체에서 __proto__, constructor, prototype 키를 재귀적으로 제거합니다.
 * 에러를 던지지 않고 조용히 제거합니다.
 *
 * @param obj - 정제할 객체
 * @returns 정제된 객체 (원본 수정)
 *
 * @example
 * ```typescript
 * const data = JSON.parse(untrustedInput);
 * sanitizeObject(data); // 위험한 키 제거
 * ```
 */
export function sanitizeObject<T = any>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 배열인 경우
  if (Array.isArray(obj)) {
    obj.forEach((item) => sanitizeObject(item));
    return obj;
  }

  // 객체인 경우
  for (const key of Object.keys(obj)) {
    // 위험한 키 제거
    if (DANGEROUS_KEYS.includes(key)) {
      delete (obj as any)[key];
      logger.warn(`[SafeJSON] Removed dangerous key: ${key}`);
      continue;
    }

    // 재귀적으로 중첩 객체 정제
    sanitizeObject((obj as any)[key]);
  }

  return obj;
}

/**
 * 안전한 JSON 파싱 (정제 모드)
 *
 * 위험한 키를 제거하고 파싱합니다. 에러를 던지지 않습니다.
 *
 * @param jsonString - 파싱할 JSON 문자열
 * @returns 정제된 파싱 객체
 */
export function safeParseJSONWithSanitize<T = any>(jsonString: string): T {
  try {
    const parsed = JSON.parse(jsonString);
    return sanitizeObject(parsed);
  } catch (error: any) {
    logger.error('[SafeJSON] JSON parse error:', {
      error: error.message,
      jsonPreview: jsonString.substring(0, 100),
    });
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}
