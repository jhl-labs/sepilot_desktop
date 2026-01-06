/**
 * lib/utils.ts 테스트
 */

import { cn, formatDate, truncate, isTextFile } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-generator';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle conditional classes', () => {
      const result = cn('base', true && 'active', false && 'inactive');
      expect(result).toBe('base active');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should merge tailwind classes correctly', () => {
      // twMerge should remove duplicate/conflicting classes
      const result = cn('px-2 py-1', 'px-4');
      expect(result).toBe('py-1 px-4');
    });
  });

  describe('formatDate', () => {
    beforeEach(() => {
      // Mock current time to 2024-01-15 12:00:00
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T12:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should format today as time', () => {
      const today = new Date('2024-01-15T10:30:00').getTime();
      const result = formatDate(today);
      expect(result).toMatch(/\d{2}:\d{2}/); // Should be time format
    });

    it('should format yesterday', () => {
      const yesterday = new Date('2024-01-14T10:00:00').getTime();
      const result = formatDate(yesterday);
      expect(result).toBe('어제');
    });

    it('should format recent days (within a week)', () => {
      const threeDaysAgo = new Date('2024-01-12T10:00:00').getTime();
      const result = formatDate(threeDaysAgo);
      expect(result).toBe('3일 전');
    });

    it('should format dates older than a week', () => {
      const tenDaysAgo = new Date('2024-01-05T10:00:00').getTime();
      const result = formatDate(tenDaysAgo);
      expect(result).toContain('2024'); // Should include year
    });

    it('should handle edge case - exactly 1 day ago', () => {
      const oneDayAgo = new Date('2024-01-14T12:00:00').getTime();
      const result = formatDate(oneDayAgo);
      expect(result).toBe('어제');
    });

    it('should handle edge case - exactly 7 days ago', () => {
      const sevenDaysAgo = new Date('2024-01-08T10:00:00').getTime();
      const result = formatDate(sevenDaysAgo);
      expect(result).toContain('2024'); // Should be full date
    });
  });

  describe('generateId', () => {
    it('should generate a unique id', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should contain timestamp and random part', () => {
      const id = generateId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should generate different ids on consecutive calls', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100); // All should be unique
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      const result = truncate('hello', 10);
      expect(result).toBe('hello');
    });

    it('should truncate long strings', () => {
      const result = truncate('hello world', 5);
      expect(result).toBe('hello...');
    });

    it('should handle exact length', () => {
      const result = truncate('hello', 5);
      expect(result).toBe('hello');
    });

    it('should handle empty string', () => {
      const result = truncate('', 5);
      expect(result).toBe('');
    });

    it('should handle zero length', () => {
      const result = truncate('hello', 0);
      expect(result).toBe('...');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = truncate(longString, 10);
      expect(result).toBe('aaaaaaaaaa...');
      expect(result.length).toBe(13); // 10 + '...'
    });
  });

  describe('isTextFile', () => {
    it('should return true for text/* MIME types', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .txt files', () => {
      const file = new File(['content'], 'test.txt', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .md files', () => {
      const file = new File(['content'], 'README.md', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .json files', () => {
      const file = new File(['{}'], 'data.json', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .js files', () => {
      const file = new File(['code'], 'script.js', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .ts files', () => {
      const file = new File(['code'], 'app.ts', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return true for .tsx files', () => {
      const file = new File(['code'], 'Component.tsx', { type: '' });
      expect(isTextFile(file)).toBe(true);
    });

    it('should return false for binary files', () => {
      const file = new File(['binary'], 'image.png', { type: 'image/png' });
      expect(isTextFile(file)).toBe(false);
    });

    it('should return false for unknown file types', () => {
      const file = new File(['data'], 'file.bin', { type: '' });
      expect(isTextFile(file)).toBe(false);
    });
  });
});
