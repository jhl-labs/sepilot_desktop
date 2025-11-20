import { safeStorage } from 'electron';
import { databaseService } from './database';

/**
 * Token Manager
 *
 * Electron safeStorage를 사용하여 안전하게 토큰 저장
 */
class TokenManagerClass {
  /**
   * 토큰 저장
   */
  async storeToken(key: string, token: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this platform');
    }

    // 암호화
    const encrypted = safeStorage.encryptString(token);
    const encryptedBase64 = encrypted.toString('base64');

    // 데이터베이스에 저장
    databaseService.updateSetting(key, encryptedBase64);

    console.log(`Token stored: ${key}`);
  }

  /**
   * 토큰 가져오기
   */
  async getToken(key: string): Promise<string | null> {
    // 데이터베이스에서 가져오기
    const encryptedBase64 = databaseService.getSetting(key);

    if (!encryptedBase64) {
      return null;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available on this platform');
    }

    // 복호화
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decrypted = safeStorage.decryptString(encrypted);

    return decrypted;
  }

  /**
   * 토큰 삭제
   */
  async deleteToken(key: string): Promise<void> {
    databaseService.updateSetting(key, null);
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
