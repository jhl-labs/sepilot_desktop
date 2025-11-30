/**
 * lib/utils.ts 유틸리티 함수 테스트
 */

import { cn, formatDate, generateId, truncate } from '@/lib/utils';

describe('utils', () => {
  describe('cn (classnames)', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'inactive')).toBe('base active');
    });

    it('should handle arrays', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });

    it('should handle objects', () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
    });

    it('should merge tailwind classes properly', () => {
      // tailwind-merge should deduplicate conflicting classes
      expect(cn('p-4', 'p-2')).toBe('p-2');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should handle undefined and null', () => {
      expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
    });
  });

  describe('formatDate', () => {
    beforeEach(() => {
      // Mock Date to have consistent test results
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should format today's date as time", () => {
      const now = new Date('2024-01-15T14:30:00');
      jest.setSystemTime(now);

      const todayTimestamp = now.getTime() - 3600000; // 1 hour ago
      const result = formatDate(todayTimestamp);

      // Should be formatted as time (HH:MM format)
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should format yesterday as "어제"', () => {
      const now = new Date('2024-01-15T14:30:00');
      jest.setSystemTime(now);

      const yesterday = new Date('2024-01-14T10:00:00').getTime();
      const result = formatDate(yesterday);

      expect(result).toBe('어제');
    });

    it('should format dates within a week as "N일 전"', () => {
      const now = new Date('2024-01-15T14:30:00');
      jest.setSystemTime(now);

      const threeDaysAgo = new Date('2024-01-12T10:00:00').getTime();
      const result = formatDate(threeDaysAgo);

      expect(result).toBe('3일 전');
    });

    it('should format older dates with full date', () => {
      const now = new Date('2024-01-15T14:30:00');
      jest.setSystemTime(now);

      const oldDate = new Date('2024-01-01T10:00:00').getTime();
      const result = formatDate(oldDate);

      // Should include year, month, day in Korean format
      expect(result).toMatch(/\d{4}년.*\d{1,2}월.*\d{1,2}일/);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
    });

    it('should follow timestamp-random format', () => {
      const id = generateId();

      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 5)).toBe('hello...');
    });

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('should handle length of 0', () => {
      expect(truncate('hello', 0)).toBe('...');
    });
  });
});
