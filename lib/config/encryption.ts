import crypto from 'crypto';

/**
 * Config 암호화/복호화 유틸리티
 *
 * AES-256-GCM 사용
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * 마스터 비밀번호에서 키 파생
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * 설정 암호화
 */
export function encryptConfig(data: string, password: string): string {
  try {
    // Salt 생성
    const salt = crypto.randomBytes(SALT_LENGTH);

    // 키 파생
    const key = deriveKey(password, salt);

    // IV 생성
    const iv = crypto.randomBytes(IV_LENGTH);

    // 암호화
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Auth Tag
    const tag = cipher.getAuthTag();

    // 결과: salt + iv + tag + encrypted
    const result = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);

    return result.toString('base64');
  } catch (error: any) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * 설정 복호화
 */
export function decryptConfig(encryptedData: string, password: string): string {
  try {
    // Base64 디코딩
    const buffer = Buffer.from(encryptedData, 'base64');

    // 데이터 분리
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // 키 파생
    const key = deriveKey(password, salt);

    // 복호화
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * 비밀번호 검증 (복호화 시도)
 */
export function validatePassword(encryptedData: string, password: string): boolean {
  try {
    decryptConfig(encryptedData, password);
    return true;
  } catch {
    return false;
  }
}
