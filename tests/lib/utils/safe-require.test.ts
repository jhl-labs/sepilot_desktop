import path from 'path';

describe('safe-require', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should require module successfully in node runtime', () => {
    const { safeRequire } = require('@/lib/utils/safe-require');

    const loadedPath = safeRequire('path');

    expect(loadedPath).toBe(path);
    expect(typeof loadedPath.join).toBe('function');
  });

  it('should log and rethrow when module cannot be required', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { safeRequire } = require('@/lib/utils/safe-require');

    expect(() => safeRequire('__definitely_missing_module__')).toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[safeRequire] Failed to require '__definitely_missing_module__'."),
      expect.objectContaining({ message: expect.stringContaining("Cannot find module") })
    );
  });
});
