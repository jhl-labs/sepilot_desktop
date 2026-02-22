import fs from 'fs';
import path from 'path';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

jest.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: jest.fn((name: string) => {
      if (name === 'userData') return '/user/data';
      return '';
    }),
    getAppPath: jest.fn(() => '/app/path'),
  },
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { resolveExtensionFilePath } from '@/electron/utils/extension-paths';

describe('resolveExtensionFilePath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves leading-slash pathname from protocol URL', () => {
    const expected = path.join('/user/data', 'extensions', 'browser', 'dist', 'renderer.js');
    (fs.existsSync as jest.Mock).mockImplementation((candidate: string) => candidate === expected);

    const result = resolveExtensionFilePath('browser', '/dist/renderer.js');

    expect(result).toBe(expected);
    expect(fs.existsSync).toHaveBeenCalledWith(expected);
  });

  it('rejects windows absolute drive path inputs', () => {
    const result = resolveExtensionFilePath('browser', 'C:\\dist\\renderer.js');

    expect(result).toBeNull();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('rejects windows UNC path inputs', () => {
    const result = resolveExtensionFilePath('browser', '\\\\server\\share\\renderer.js');

    expect(result).toBeNull();
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it('still blocks path traversal attempts', () => {
    const expected = path.join('/user/data', 'extensions', 'browser', 'dist', 'renderer.js');
    (fs.existsSync as jest.Mock).mockImplementation((candidate: string) => candidate === expected);

    const result = resolveExtensionFilePath('browser', '../../dist/renderer.js');

    expect(result).toBe(expected);
    expect(fs.existsSync).toHaveBeenCalledWith(expected);
  });
});
