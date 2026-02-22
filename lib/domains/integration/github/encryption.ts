/**
 * GitHub Sync Encryption Utilities
 * AES-256-GCM 암호화를 사용하여 민감 정보를 암호화/복호화
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES GCM mode uses 16 bytes IV
const SALT_LENGTH = 64; // Salt for key derivation
const KEY_LENGTH = 32; // 256 bits

/**
 * 마스터 키를 생성하거나 반환
 * Electron의 userData 디렉토리에 저장됨
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * 비밀번호와 솔트를 사용하여 키를 파생
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(Buffer.from(masterKey, 'hex'), salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * 데이터를 암호화
 * @param data 암호화할 데이터 (객체 또는 문자열)
 * @param masterKey 마스터 암호화 키 (hex 문자열)
 * @returns 암호화된 데이터 (base64 문자열)
 */
export function encryptData(data: unknown, masterKey: string): string {
  try {
    // 데이터를 JSON 문자열로 변환
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

    // Salt 생성
    const salt = crypto.randomBytes(SALT_LENGTH);

    // 키 파생
    const key = deriveKey(masterKey, salt);

    // IV 생성
    const iv = crypto.randomBytes(IV_LENGTH);

    // 암호화
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Auth tag 가져오기
    const authTag = cipher.getAuthTag();

    // 결과 포맷: salt:iv:authTag:encrypted (모두 base64)
    const result = [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted,
    ].join(':');

    return result;
  } catch (error) {
    console.error('[Encryption] Failed to encrypt data:', error);
    throw new Error('암호화 실패');
  }
}

/**
 * 암호화된 데이터를 복호화
 * @param encryptedData 암호화된 데이터 (base64 문자열)
 * @param masterKey 마스터 암호화 키 (hex 문자열)
 * @returns 복호화된 데이터
 */
export function decryptData<T = unknown>(encryptedData: string, masterKey: string): T {
  try {
    // 암호화된 데이터 파싱
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltB64, ivB64, authTagB64, encrypted] = parts;

    // Base64 디코딩
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    // 키 파생
    const key = deriveKey(masterKey, salt);

    // 복호화
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // JSON 파싱 시도 (객체였다면)
    try {
      return JSON.parse(decrypted) as T;
    } catch {
      // 문자열이었다면 그대로 반환
      return decrypted as T;
    }
  } catch (error) {
    console.error('[Encryption] Failed to decrypt data:', error);
    throw new Error('복호화 실패');
  }
}

/**
 * 민감 정보 필드만 선택적으로 암호화
 * @param config 설정 객체
 * @param sensitiveFields 암호화할 필드 목록
 * @param masterKey 마스터 암호화 키
 */
export function encryptSensitiveFields<T extends Record<string, any>>(
  config: T,
  sensitiveFields: (keyof T)[],
  masterKey: string
): T {
  const encrypted = { ...config };

  for (const field of sensitiveFields) {
    if (encrypted[field] !== undefined && encrypted[field] !== null) {
      encrypted[field] = encryptData(encrypted[field], masterKey) as T[typeof field];
    }
  }

  return encrypted;
}

/**
 * 암호화된 민감 정보 필드를 복호화
 * @param config 암호화된 설정 객체
 * @param sensitiveFields 복호화할 필드 목록
 * @param masterKey 마스터 암호화 키
 */
export function decryptSensitiveFields<T extends Record<string, any>>(
  config: T,
  sensitiveFields: (keyof T)[],
  masterKey: string
): T {
  const decrypted = { ...config };

  for (const field of sensitiveFields) {
    if (
      decrypted[field] !== undefined &&
      decrypted[field] !== null &&
      typeof decrypted[field] === 'string'
    ) {
      try {
        decrypted[field] = decryptData(decrypted[field], masterKey) as T[typeof field];
      } catch (error) {
        console.error(`[Encryption] Failed to decrypt field "${String(field)}":`, error);
        // 복호화 실패 시 원본 유지
      }
    }
  }

  return decrypted;
}
