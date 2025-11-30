/**
 * Config 암호화/복호화 테스트
 */

import { encryptConfig, decryptConfig, validatePassword } from '@/lib/config/encryption';

describe('encryption', () => {
  const testPassword = 'test-master-password-123';
  const testData = JSON.stringify({
    llm: {
      provider: 'openai',
      apiKey: 'sk-test-secret-key',
      model: 'gpt-4',
    },
    secret: 'sensitive-data',
  });

  describe('encryptConfig', () => {
    it('should encrypt data to base64 string', () => {
      const encrypted = encryptConfig(testData, testPassword);

      expect(typeof encrypted).toBe('string');
      // Should be valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      // Should not contain original data
      expect(encrypted).not.toContain('sk-test');
      expect(encrypted).not.toContain('sensitive-data');
    });

    it('should produce different output for same input (due to random salt/iv)', () => {
      const encrypted1 = encryptConfig(testData, testPassword);
      const encrypted2 = encryptConfig(testData, testPassword);

      // Salt and IV are random, so outputs should differ
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const encrypted = encryptConfig('', testPassword);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should handle unicode data', () => {
      const unicodeData = '한글 데이터 🎉 émojis';
      const encrypted = encryptConfig(unicodeData, testPassword);

      expect(encrypted).toBeDefined();
      // Verify by decrypting
      const decrypted = decryptConfig(encrypted, testPassword);
      expect(decrypted).toBe(unicodeData);
    });

    it('should handle large data', () => {
      const largeData = 'x'.repeat(100000);
      const encrypted = encryptConfig(largeData, testPassword);

      expect(encrypted).toBeDefined();
      const decrypted = decryptConfig(encrypted, testPassword);
      expect(decrypted).toBe(largeData);
    });
  });

  describe('decryptConfig', () => {
    it('should decrypt encrypted data correctly', () => {
      const encrypted = encryptConfig(testData, testPassword);
      const decrypted = decryptConfig(encrypted, testPassword);

      expect(decrypted).toBe(testData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(testData));
    });

    it('should throw error with wrong password', () => {
      const encrypted = encryptConfig(testData, testPassword);

      expect(() => {
        decryptConfig(encrypted, 'wrong-password');
      }).toThrow('Decryption failed');
    });

    it('should throw error with corrupted data', () => {
      const encrypted = encryptConfig(testData, testPassword);
      // Corrupt the data by changing some characters
      const corrupted = encrypted.slice(0, 50) + 'XXX' + encrypted.slice(53);

      expect(() => {
        decryptConfig(corrupted, testPassword);
      }).toThrow();
    });

    it('should throw error with invalid base64', () => {
      expect(() => {
        decryptConfig('not-valid-base64!!!', testPassword);
      }).toThrow();
    });

    it('should throw error with truncated data', () => {
      const encrypted = encryptConfig(testData, testPassword);
      // Truncate to less than salt + iv + tag length
      const truncated = encrypted.slice(0, 50);

      expect(() => {
        decryptConfig(truncated, testPassword);
      }).toThrow();
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', () => {
      const encrypted = encryptConfig(testData, testPassword);

      expect(validatePassword(encrypted, testPassword)).toBe(true);
    });

    it('should return false for wrong password', () => {
      const encrypted = encryptConfig(testData, testPassword);

      expect(validatePassword(encrypted, 'wrong-password')).toBe(false);
    });

    it('should return false for corrupted data', () => {
      const encrypted = encryptConfig(testData, testPassword);
      const corrupted = encrypted.slice(0, 50) + 'XXX' + encrypted.slice(53);

      expect(validatePassword(corrupted, testPassword)).toBe(false);
    });

    it('should return false for invalid data', () => {
      expect(validatePassword('invalid-data', testPassword)).toBe(false);
    });
  });

  describe('roundtrip', () => {
    it('should handle JSON config correctly', () => {
      const config = {
        llm: {
          provider: 'openai',
          apiKey: 'sk-secret-key-12345',
          model: 'gpt-4o',
          temperature: 0.7,
        },
        vectorDB: {
          type: 'sqlite-vec',
          index: 'documents',
        },
        mcp: [
          {
            name: 'server1',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        ],
      };

      const encrypted = encryptConfig(JSON.stringify(config), testPassword);
      const decrypted = decryptConfig(encrypted, testPassword);
      const parsed = JSON.parse(decrypted);

      expect(parsed).toEqual(config);
      expect(parsed.llm.apiKey).toBe('sk-secret-key-12345');
    });

    it('should preserve special characters', () => {
      const specialData = 'Line1\nLine2\tTab\r\nCRLF\\Backslash"Quotes"';

      const encrypted = encryptConfig(specialData, testPassword);
      const decrypted = decryptConfig(encrypted, testPassword);

      expect(decrypted).toBe(specialData);
    });

    it('should work with different password lengths', () => {
      const passwords = [
        'a',
        'short',
        'medium-length-password',
        'very-long-password-that-exceeds-typical-limits-and-continues-on-and-on',
      ];

      for (const password of passwords) {
        const encrypted = encryptConfig(testData, password);
        const decrypted = decryptConfig(encrypted, password);
        expect(decrypted).toBe(testData);
      }
    });
  });
});
