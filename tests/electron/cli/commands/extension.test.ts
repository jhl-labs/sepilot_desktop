/**
 * Extension CLI command 테스트
 */

// Mock electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test-userdata'),
    isPackaged: false,
  },
}));

// Mock chalk (ESM 모듈)
jest.mock('chalk', () => {
  const identity = (str: string) => str;
  const chainable: any = new Proxy(identity, {
    get: () => chainable,
    apply: (_target: any, _thisArg: any, args: any[]) => args[0],
  });
  chainable.level = 3;
  return { __esModule: true, default: chainable };
});

// Mock output utilities
jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: jest.fn().mockReturnValue(false),
  printExtensionTable: jest.fn(),
  printSuccess: jest.fn(),
  printError: jest.fn(),
  printInfo: jest.fn(),
  printJson: jest.fn(),
}));

// Mock extensionRegistry
jest.mock('../../../../lib/extensions/registry', () => ({
  extensionRegistry: {
    getAll: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(null),
  },
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}));

// Mock adm-zip
const mockGetEntry = jest.fn();
const mockExtractAllTo = jest.fn();
jest.mock('adm-zip', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      getEntry: mockGetEntry,
      extractAllTo: mockExtractAllTo,
    })),
  };
});

import path from 'path';
import fs from 'fs';
import {
  runList,
  runInstall,
  runUninstall,
  runDiagnose,
} from '../../../../electron/cli/commands/extension';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';
import {
  isJsonMode,
  printExtensionTable,
  printSuccess,
  printInfo,
  printJson,
} from '../../../../electron/cli/utils/output';
import { extensionRegistry } from '../../../../lib/extensions/registry';

const mockFs = fs as jest.Mocked<typeof fs>;
const expectedExtensionsDir = path.join(process.cwd(), 'resources', 'extensions');

describe('Extension CLI commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isJsonMode as jest.Mock).mockReturnValue(false);
  });

  describe('runList', () => {
    it('Extension이 없으면 빈 배열로 테이블 출력', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await runList();

      expect(printExtensionTable).toHaveBeenCalledWith([]);
    });

    it('Extension이 있으면 테이블에 출력', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === expectedExtensionsDir) return true;
        if (pathStr.endsWith('manifest.json')) return true;
        return false;
      });

      mockFs.readdirSync.mockReturnValue(['editor', 'browser'] as any);

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const pathStr = String(p);
        if (pathStr.includes('editor')) {
          return JSON.stringify({ id: 'editor', version: '1.0.0', enabled: true });
        }
        if (pathStr.includes('browser')) {
          return JSON.stringify({ id: 'browser', version: '2.0.0', enabled: false });
        }
        return '';
      });

      await runList();

      expect(printExtensionTable).toHaveBeenCalledWith([
        { id: 'editor', version: '1.0.0', source: 'local', enabled: true },
        { id: 'browser', version: '2.0.0', source: 'local', enabled: false },
      ]);
    });

    it('JSON 모드에서 printJson 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === expectedExtensionsDir) return true;
        if (pathStr.endsWith('manifest.json')) return true;
        return false;
      });

      mockFs.readdirSync.mockReturnValue(['editor'] as any);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({ id: 'editor', version: '1.0.0', enabled: true })
      );

      await runList();

      expect(printJson).toHaveBeenCalledWith([
        { id: 'editor', version: '1.0.0', source: 'local', enabled: true },
      ]);
      expect(printExtensionTable).not.toHaveBeenCalled();
    });
  });

  describe('runInstall', () => {
    it('파일이 존재하지 않으면 CLIError(NOT_FOUND) throw', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(runInstall('/path/to/nonexistent.sepx')).rejects.toThrow(CLIError);
      await expect(runInstall('/path/to/nonexistent.sepx')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
      });
    });

    it('.sepx 확장자가 아니면 CLIError(INVALID_ARGUMENT) throw', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await expect(runInstall('/path/to/file.zip')).rejects.toThrow(CLIError);
      await expect(runInstall('/path/to/file.zip')).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
        message: 'Invalid file extension: only .sepx files are allowed',
      });
    });

    it('manifest에 잘못된 Extension ID가 있으면 CLIError(INVALID_ARGUMENT) throw', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const mockManifestEntry = {
        getData: () => Buffer.from(JSON.stringify({ id: 'INVALID_ID!', version: '1.0.0' })),
      };
      mockGetEntry.mockReturnValue(mockManifestEntry);

      await expect(runInstall('/path/to/test.sepx')).rejects.toThrow(CLIError);
      await expect(runInstall('/path/to/test.sepx')).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
        message: expect.stringContaining('Invalid extension ID'),
      });
    });

    it('유효한 .sepx 파일을 정상 설치', async () => {
      // existsSync: 파일 존재, extensions 디렉토리 없음, 설치 경로 없음
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr.endsWith('.sepx')) return true;
        return false;
      });

      const mockManifestEntry = {
        getData: () => Buffer.from(JSON.stringify({ id: 'my-ext', version: '1.0.0' })),
      };
      mockGetEntry.mockReturnValue(mockManifestEntry);

      await runInstall('/path/to/my-ext.sepx');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedExtensionsDir, { recursive: true });
      expect(mockExtractAllTo).toHaveBeenCalledWith(
        path.join(expectedExtensionsDir, 'my-ext'),
        true
      );
      expect(printSuccess).toHaveBeenCalledWith('Extension installed successfully: my-ext@1.0.0');
    });

    it('이미 설치된 Extension이 있으면 덮어쓰기', async () => {
      // existsSync: 파일 존재, extensions 디렉토리 존재, 설치 경로 존재
      mockFs.existsSync.mockReturnValue(true);

      const mockManifestEntry = {
        getData: () => Buffer.from(JSON.stringify({ id: 'my-ext', version: '2.0.0' })),
      };
      mockGetEntry.mockReturnValue(mockManifestEntry);

      await runInstall('/path/to/my-ext.sepx');

      expect(printInfo).toHaveBeenCalledWith('Extension already exists, overwriting...');
      expect(mockFs.rmSync).toHaveBeenCalledWith(path.join(expectedExtensionsDir, 'my-ext'), {
        recursive: true,
        force: true,
      });
      expect(mockExtractAllTo).toHaveBeenCalledWith(
        path.join(expectedExtensionsDir, 'my-ext'),
        true
      );
      expect(printSuccess).toHaveBeenCalledWith('Extension installed successfully: my-ext@2.0.0');
    });

    it('manifest.json이 없으면 CLIError(ERROR) throw', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockGetEntry.mockReturnValue(null);

      await expect(runInstall('/path/to/test.sepx')).rejects.toThrow(CLIError);
      await expect(runInstall('/path/to/test.sepx')).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
        message: 'manifest.json not found in .sepx file',
      });
    });
  });

  describe('runUninstall', () => {
    it('잘못된 Extension ID면 CLIError(INVALID_ARGUMENT) throw', async () => {
      await expect(runUninstall('INVALID_ID!')).rejects.toThrow(CLIError);
      await expect(runUninstall('INVALID_ID!')).rejects.toMatchObject({
        exitCode: ExitCode.INVALID_ARGUMENT,
        message: expect.stringContaining('Invalid extension ID'),
      });
    });

    it('Extension을 찾을 수 없으면 CLIError(NOT_FOUND) throw', async () => {
      // extensions 디렉토리 존재하지만 해당 Extension 없음
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        if (pathStr === expectedExtensionsDir) return true;
        return false;
      });

      await expect(runUninstall('nonexistent')).rejects.toThrow(CLIError);
      await expect(runUninstall('nonexistent')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
        message: 'Extension not found: nonexistent',
      });
    });

    it('extensions 디렉토리가 없으면 CLIError(NOT_FOUND) throw', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(runUninstall('my-ext')).rejects.toThrow(CLIError);
      await expect(runUninstall('my-ext')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
        message: 'No extensions directory found',
      });
    });

    it('Extension을 정상 제거', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await runUninstall('my-ext');

      expect(mockFs.rmSync).toHaveBeenCalledWith(path.join(expectedExtensionsDir, 'my-ext'), {
        recursive: true,
        force: true,
      });
      expect(printSuccess).toHaveBeenCalledWith('Extension uninstalled successfully: my-ext');
    });
  });

  describe('runDiagnose', () => {
    it('renderer 옵션이면 안내 메시지 출력 후 바로 리턴', async () => {
      await runDiagnose('editor', { renderer: true });

      expect(printInfo).toHaveBeenCalledWith(
        'Renderer 진단은 GUI가 실행 중일 때만 사용 가능합니다.'
      );
    });

    it('extId 없이 호출하면 모든 Extension 진단 (Extension 없는 경우)', async () => {
      (extensionRegistry.getAll as jest.Mock).mockReturnValue([]);

      await runDiagnose();

      expect(printInfo).toHaveBeenCalledWith('No extensions loaded.');
    });

    it('all 옵션으로 모든 Extension 진단', async () => {
      const mockDiagnostics = jest.fn().mockReturnValue({
        status: 'healthy',
        message: 'All checks passed',
      });

      (extensionRegistry.getAll as jest.Mock).mockReturnValue([
        {
          manifest: { id: 'editor' },
          diagnostics: mockDiagnostics,
        },
      ]);

      await runDiagnose(undefined, { all: true });

      expect(mockDiagnostics).toHaveBeenCalled();
    });

    it('all 옵션 + JSON 모드에서 printJson 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);

      const mockDiagnostics = jest.fn().mockReturnValue({
        status: 'healthy',
        message: 'OK',
      });

      (extensionRegistry.getAll as jest.Mock).mockReturnValue([
        {
          manifest: { id: 'editor' },
          diagnostics: mockDiagnostics,
        },
      ]);

      await runDiagnose(undefined, { all: true });

      expect(printJson).toHaveBeenCalledWith([
        {
          id: 'editor',
          result: { status: 'healthy', message: 'OK' },
        },
      ]);
    });

    it('diagnostics 함수가 없는 Extension은 healthy로 처리', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);

      (extensionRegistry.getAll as jest.Mock).mockReturnValue([
        {
          manifest: { id: 'simple-ext' },
          // diagnostics 없음
        },
      ]);

      await runDiagnose(undefined, { all: true });

      expect(printJson).toHaveBeenCalledWith([
        {
          id: 'simple-ext',
          result: {
            status: 'healthy',
            message: 'No diagnostics function provided',
          },
        },
      ]);
    });

    it('단일 Extension 진단: Extension을 찾을 수 없으면 CLIError(NOT_FOUND) throw', async () => {
      (extensionRegistry.get as jest.Mock).mockReturnValue(null);

      await expect(runDiagnose('nonexistent')).rejects.toThrow(CLIError);
      await expect(runDiagnose('nonexistent')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
        message: 'Extension not found: nonexistent',
      });
    });

    it('단일 Extension 진단: diagnostics 함수가 없으면 안내 메시지 출력', async () => {
      (extensionRegistry.get as jest.Mock).mockReturnValue({
        manifest: { id: 'no-diag' },
        // diagnostics 없음
      });

      await runDiagnose('no-diag');

      expect(printInfo).toHaveBeenCalledWith(
        "Extension 'no-diag' does not provide a diagnostics function."
      );
    });

    it('단일 Extension 진단: 정상 진단 실행', async () => {
      const mockDiagnostics = jest.fn().mockReturnValue({
        status: 'healthy',
        message: 'All good',
        checks: [{ name: 'check1', passed: true }],
      });

      (extensionRegistry.get as jest.Mock).mockReturnValue({
        manifest: { id: 'editor' },
        diagnostics: mockDiagnostics,
      });

      await runDiagnose('editor');

      expect(printInfo).toHaveBeenCalledWith('Running diagnostics for extension: editor...');
      expect(mockDiagnostics).toHaveBeenCalled();
    });

    it('단일 Extension 진단: JSON 모드에서 printJson 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);

      const diagResult = { status: 'healthy', message: 'OK' };
      const mockDiagnostics = jest.fn().mockReturnValue(diagResult);

      (extensionRegistry.get as jest.Mock).mockReturnValue({
        manifest: { id: 'editor' },
        diagnostics: mockDiagnostics,
      });

      await runDiagnose('editor');

      expect(printJson).toHaveBeenCalledWith({ id: 'editor', result: diagResult });
    });

    it('단일 Extension 진단: error 상태면 CLIError(ERROR) throw', async () => {
      const mockDiagnostics = jest.fn().mockReturnValue({
        status: 'error',
        message: 'Something is broken',
      });

      (extensionRegistry.get as jest.Mock).mockReturnValue({
        manifest: { id: 'broken-ext' },
        diagnostics: mockDiagnostics,
      });

      await expect(runDiagnose('broken-ext')).rejects.toThrow(CLIError);
      await expect(runDiagnose('broken-ext')).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
        message: 'Extension broken-ext diagnostics failed',
      });
    });
  });
});
