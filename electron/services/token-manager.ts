import { safeStorage } from 'electron';
import crypto from 'crypto';
import os from 'os';
import { databaseService } from './database';

/**
 * Token Manager
 *
 * Electron safeStorage를 사용하여 안전하게 토큰 저장
 */
class TokenManagerClass {
  private getTokenValueKey(key: string): string {
    return `secure_token:${key}`;
  }

  private getTokenTypeKey(key: string): string {
    return `secure_token_type:${key}`;
  }

  /**
   * Machine-specific 키 생성 (safeStorage fallback)
   */
  private getMachineKey(): Buffer {
    const machineId = [os.hostname(), os.platform(), os.arch(), os.homedir()].join('|');
    const salt = crypto.createHash('sha256').update(`sepilot-token-v1-${machineId}`).digest();
    return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
  }

  private encryptFallback(token: string): string {
    const iv = crypto.randomBytes(16);
    const key = this.getMachineKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      version: 'fallback-v1',
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encrypted,
    });
  }

  private decryptFallback(payload: string): string {
    const parsed = JSON.parse(payload);
    const key = this.getMachineKey();
    const iv = Buffer.from(parsed.iv, 'hex');
    const authTag = Buffer.from(parsed.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(parsed.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 토큰 저장
   */
  async storeToken(key: string, token: string): Promise<void> {
    const valueKey = this.getTokenValueKey(key);
    const typeKey = this.getTokenTypeKey(key);

    if (!token) {
      await this.deleteToken(key);
      return;
    }

    if (safeStorage.isEncryptionAvailable()) {
      // OS 레벨 암호화
      const encrypted = safeStorage.encryptString(token);
      const encryptedBase64 = encrypted.toString('base64');
      databaseService.updateSetting(valueKey, encryptedBase64);
      databaseService.updateSetting(typeKey, 'safeStorage');
    } else {
      // safeStorage 미지원 플랫폼 fallback
      const encrypted = this.encryptFallback(token);
      databaseService.updateSetting(valueKey, encrypted);
      databaseService.updateSetting(typeKey, 'fallback');
    }

    // Legacy 키 정리
    databaseService.updateSetting(key, null);

    console.log(`Token stored: ${key}`);
  }

  /**
   * 토큰 가져오기
   */
  async getToken(key: string): Promise<string | null> {
    const valueKey = this.getTokenValueKey(key);
    const typeKey = this.getTokenTypeKey(key);

    // 1) 신규 저장 포맷 조회
    const encryptedValue = databaseService.getSetting(valueKey);
    const encryptionType = databaseService.getSetting(typeKey);

    if (encryptedValue) {
      if (encryptionType === 'fallback') {
        return this.decryptFallback(encryptedValue);
      }

      // 기본값: safeStorage
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available on this platform');
      }
      const encrypted = Buffer.from(encryptedValue, 'base64');
      return safeStorage.decryptString(encrypted);
    }

    // 2) Legacy 포맷 조회 (key 자체에 저장)
    const legacyValue = databaseService.getSetting(key);
    if (!legacyValue) {
      return null;
    }

    // Legacy는 safeStorage base64 형태를 우선 가정
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage unavailable');
      }
      const encrypted = Buffer.from(legacyValue, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);

      // 마이그레이션: 신규 포맷으로 이전
      await this.storeToken(key, decrypted);
      return decrypted;
    } catch {
      // 예상과 다른 legacy 값이면 raw 반환 (호환성)
      return legacyValue;
    }
  }

  /**
   * 토큰 삭제
   */
  async deleteToken(key: string): Promise<void> {
    databaseService.updateSetting(this.getTokenValueKey(key), null);
    databaseService.updateSetting(this.getTokenTypeKey(key), null);
    databaseService.updateSetting(key, null); // Legacy cleanup
    console.log(`Token deleted: ${key}`);
  }

  /**
   * 토큰 존재 여부 확인
   */
  async hasToken(key: string): Promise<boolean> {
    const token = await this.getToken(key);
    return token !== null;
  }
}

export const tokenManager = new TokenManagerClass();
