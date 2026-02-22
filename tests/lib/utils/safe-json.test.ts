import { logger } from '@/lib/utils/logger';
import {
  safeParseJSON,
  sanitizeObject,
  safeParseJSONWithSanitize,
} from '@/lib/utils/safe-json';

describe('safe-json', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('safeParseJSON should parse valid JSON payloads', () => {
    const parsed = safeParseJSON<{ name: string; nested: { values: number[] } }>(
      '{"name":"safe","nested":{"values":[1,2,3]}}'
    );

    expect(parsed).toEqual({
      name: 'safe',
      nested: { values: [1, 2, 3] },
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('safeParseJSON should block prototype pollution keys in nested structures', () => {
    expect(() =>
      safeParseJSON('{"safe":true,"items":[{"meta":{"constructor":{"polluted":true}}}]}')
    ).toThrow('Prototype pollution detected: dangerous key "items[0].meta.constructor" found in JSON');

    expect(errorSpy).toHaveBeenCalledWith('[SafeJSON] Prototype pollution attempt blocked:', {
      dangerousKey: 'items[0].meta.constructor',
      jsonPreview: '{"safe":true,"items":[{"meta":{"constructor":{"polluted":true}}}]}',
    });
  });

  it('safeParseJSON should wrap JSON parse errors with Invalid JSON prefix', () => {
    expect(() => safeParseJSON('{"broken":')).toThrow('Invalid JSON:');

    expect(errorSpy).toHaveBeenCalledWith('[SafeJSON] JSON parse error:', {
      error: expect.stringContaining('Unexpected end of JSON input'),
      jsonPreview: '{"broken":',
    });
  });

  it('sanitizeObject should remove dangerous keys recursively in-place', () => {
    const payload: any = {
      profile: {
        constructor: { unsafe: true },
        details: [{ prototype: { x: 1 } }, { ok: true }],
      },
    };

    const sanitized = sanitizeObject(payload);

    expect(sanitized).toBe(payload);
    expect(Object.prototype.hasOwnProperty.call((sanitized as any).profile, 'constructor')).toBe(false);
    expect((sanitized as any).profile.details[0].prototype).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('safeParseJSONWithSanitize should remove dangerous keys without throwing', () => {
    const sanitized = safeParseJSONWithSanitize<{ list: Array<Record<string, unknown>> }>(
      '{"list":[{"ok":1,"prototype":{"x":1}},{"safe":2}]}'
    );

    expect(sanitized).toEqual({ list: [{ ok: 1 }, { safe: 2 }] });
    expect(warnSpy).toHaveBeenCalledWith('[SafeJSON] Removed dangerous key: prototype');
  });

  it('safeParseJSONWithSanitize should throw Invalid JSON for malformed input', () => {
    expect(() => safeParseJSONWithSanitize('{not-json}')).toThrow('Invalid JSON:');

    expect(errorSpy).toHaveBeenCalledWith('[SafeJSON] JSON parse error:', {
      error: expect.any(String),
      jsonPreview: '{not-json}',
    });
  });
});
