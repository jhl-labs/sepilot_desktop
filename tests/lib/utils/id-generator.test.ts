/**
 * ID Generator 유틸리티 테스트
 */

import {
  generateId,
  generateConversationId,
  generateMessageId,
  generateToolCallId,
  generateImageId,
  generateUUID,
} from '@/lib/utils/id-generator';
import { ID_PREFIXES } from '@/lib/constants';

describe('id-generator', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
    });

    it('should generate ID without prefix', () => {
      const id = generateId();

      // Format: timestamp-random
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should generate ID with custom prefix', () => {
      const id = generateId('custom');

      expect(id).toMatch(/^custom-\d+-[a-z0-9]+$/);
    });

    it('should include timestamp in ID', () => {
      const before = Date.now();
      const id = generateId();
      const after = Date.now();

      const timestamp = parseInt(id.split('-')[0], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('generateConversationId', () => {
    it('should generate ID with conversation prefix', () => {
      const id = generateConversationId();

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.CONVERSATION}-\\d+-[a-z0-9]+$`));
    });

    it('should generate unique conversation IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateConversationId()));

      expect(ids.size).toBe(100);
    });
  });

  describe('generateMessageId', () => {
    it('should generate ID with message prefix', () => {
      const id = generateMessageId();

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.MESSAGE}-\\d+-[a-z0-9]+$`));
    });
  });

  describe('generateToolCallId', () => {
    it('should generate ID with tool call prefix', () => {
      const id = generateToolCallId();

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.TOOL_CALL}-\\d+-[a-z0-9]+$`));
    });
  });

  describe('generateImageId', () => {
    it('should generate ID with file prefix by default', () => {
      const id = generateImageId();

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.FILE}-\\d+-[a-z0-9]+$`));
    });

    it('should generate ID with file prefix for file source', () => {
      const id = generateImageId('file');

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.FILE}-\\d+-[a-z0-9]+$`));
    });

    it('should generate ID with clipboard prefix for clipboard source', () => {
      const id = generateImageId('clipboard');

      expect(id).toMatch(new RegExp(`^${ID_PREFIXES.CLIPBOARD}-\\d+-[a-z0-9]+$`));
    });
  });

  describe('generateUUID', () => {
    it('should return mocked UUID when crypto.randomUUID is available', () => {
      const uuid = generateUUID();

      // The mock returns this specific value
      expect(uuid).toBe('12345678-1234-4567-8901-123456789012');
    });

    it('should generate valid UUID v4 format when crypto.randomUUID is not available', () => {
      // Temporarily remove randomUUID
      const originalCrypto = global.crypto;
      Object.defineProperty(global, 'crypto', {
        value: {},
        writable: true,
      });

      const uuid = generateUUID();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Restore crypto
      Object.defineProperty(global, 'crypto', {
        value: originalCrypto,
        writable: true,
      });
    });
  });
});
