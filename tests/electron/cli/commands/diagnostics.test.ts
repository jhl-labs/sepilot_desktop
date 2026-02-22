/**
 * Diagnostics CLI command 테스트
 */

// Mock electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test'),
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

// Mock extension diagnostics
const mockGetExtensionDiagnostics = jest.fn();
jest.mock('../../../../electron/ipc/handlers/extension/extension-diagnostics', () => ({
  getExtensionDiagnostics: mockGetExtensionDiagnostics,
}));

// Mock output utilities
const mockIsJsonMode = jest.fn().mockReturnValue(false);
const mockPrintDiagnostics = jest.fn();
const mockPrintJson = jest.fn();

jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: mockIsJsonMode,
  printDiagnostics: mockPrintDiagnostics,
  printJson: mockPrintJson,
}));

import { runDiagnostics } from '../../../../electron/cli/commands/diagnostics';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';

/**
 * 테스트용 mock 진단 데이터 생성
 */
function createMockDiagnostics() {
  return {
    environment: {
      platform: 'linux',
      isPackaged: false,
      userDataPath: '/tmp/test',
    },
    searchPaths: [{ path: '/tmp/extensions', exists: true }],
    loadedExtensions: [
      { id: 'editor', version: '1.0.0', enabled: true },
      { id: 'browser', version: '1.0.0', enabled: false },
    ],
    registryStats: {
      totalRegistered: 2,
      enabledCount: 1,
    },
    recommendations: ['❌ Error: something wrong', '✅ Everything ok'],
  };
}

describe('runDiagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsJsonMode.mockReturnValue(false);
    mockGetExtensionDiagnostics.mockReturnValue(createMockDiagnostics());
  });

  describe('getExtensionDiagnostics 호출', () => {
    it('기본값 detailed=false로 getExtensionDiagnostics 호출', async () => {
      await runDiagnostics();

      expect(mockGetExtensionDiagnostics).toHaveBeenCalledWith(false);
      expect(mockGetExtensionDiagnostics).toHaveBeenCalledTimes(1);
    });

    it('detailed=true로 getExtensionDiagnostics 호출', async () => {
      await runDiagnostics(true);

      expect(mockGetExtensionDiagnostics).toHaveBeenCalledWith(true);
      expect(mockGetExtensionDiagnostics).toHaveBeenCalledTimes(1);
    });
  });

  describe('일반 출력 모드 (non-JSON)', () => {
    it('printDiagnostics를 호출하여 진단 정보 출력', async () => {
      await runDiagnostics();

      expect(mockPrintDiagnostics).toHaveBeenCalledTimes(1);
      expect(mockPrintJson).not.toHaveBeenCalled();
    });

    it('printDiagnostics에 올바르게 변환된 데이터 전달', async () => {
      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg).toEqual({
        environment: {
          platform: 'linux',
          isPackaged: false,
          userDataPath: '/tmp/test',
          extensionsPath: '/tmp/extensions',
        },
        loadedExtensions: [
          { id: 'editor', version: '1.0.0', enabled: true, source: 'local' },
          { id: 'browser', version: '1.0.0', enabled: false, source: 'local' },
        ],
        registryStats: {
          total: 2,
          enabled: 1,
          disabled: 1,
        },
        errors: ['❌ Error: something wrong'],
      });
    });
  });

  describe('JSON 출력 모드', () => {
    beforeEach(() => {
      mockIsJsonMode.mockReturnValue(true);
    });

    it('printJson을 호출하고 printDiagnostics는 호출하지 않음', async () => {
      await runDiagnostics();

      expect(mockPrintJson).toHaveBeenCalledTimes(1);
      expect(mockPrintDiagnostics).not.toHaveBeenCalled();
    });

    it('printJson에 올바르게 변환된 데이터 전달', async () => {
      await runDiagnostics();

      const arg = mockPrintJson.mock.calls[0][0];
      expect(arg).toEqual({
        environment: {
          platform: 'linux',
          isPackaged: false,
          userDataPath: '/tmp/test',
          extensionsPath: '/tmp/extensions',
        },
        loadedExtensions: [
          { id: 'editor', version: '1.0.0', enabled: true, source: 'local' },
          { id: 'browser', version: '1.0.0', enabled: false, source: 'local' },
        ],
        registryStats: {
          total: 2,
          enabled: 1,
          disabled: 1,
        },
        errors: ['❌ Error: something wrong'],
      });
    });
  });

  describe('데이터 변환', () => {
    it('loadedExtensions에 source: "local" 필드 추가', async () => {
      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      arg.loadedExtensions.forEach(
        (ext: { id: string; version: string; enabled: boolean; source: string }) => {
          expect(ext.source).toBe('local');
        }
      );
    });

    it('registryStats의 disabled 값을 total - enabled으로 계산', async () => {
      const diagnostics = createMockDiagnostics();
      diagnostics.registryStats = { totalRegistered: 5, enabledCount: 3 };
      mockGetExtensionDiagnostics.mockReturnValue(diagnostics);

      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg.registryStats).toEqual({
        total: 5,
        enabled: 3,
        disabled: 2,
      });
    });

    it('recommendations에서 오류/경고만 필터링하여 errors에 포함', async () => {
      const diagnostics = createMockDiagnostics();
      diagnostics.recommendations = [
        '❌ Critical error',
        '⚠️ Warning message',
        '✅ All good',
        '❌ Another error',
        'Info message',
      ];
      mockGetExtensionDiagnostics.mockReturnValue(diagnostics);

      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg.errors).toEqual(['❌ Critical error', '⚠️ Warning message', '❌ Another error']);
    });

    it('recommendations에 오류/경고가 없으면 errors가 빈 배열', async () => {
      const diagnostics = createMockDiagnostics();
      diagnostics.recommendations = ['✅ Everything ok', 'Normal info'];
      mockGetExtensionDiagnostics.mockReturnValue(diagnostics);

      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg.errors).toEqual([]);
    });

    it('searchPaths가 비어있으면 extensionsPath에 "N/A" 반환', async () => {
      const diagnostics = createMockDiagnostics();
      diagnostics.searchPaths = [];
      mockGetExtensionDiagnostics.mockReturnValue(diagnostics);

      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg.environment.extensionsPath).toBe('N/A');
    });
  });

  describe('빈 Extension 목록 처리', () => {
    it('loadedExtensions가 비어있으면 빈 배열로 변환', async () => {
      const diagnostics = createMockDiagnostics();
      diagnostics.loadedExtensions = [];
      diagnostics.registryStats = { totalRegistered: 0, enabledCount: 0 };
      mockGetExtensionDiagnostics.mockReturnValue(diagnostics);

      await runDiagnostics();

      const arg = mockPrintDiagnostics.mock.calls[0][0];
      expect(arg.loadedExtensions).toEqual([]);
      expect(arg.registryStats).toEqual({
        total: 0,
        enabled: 0,
        disabled: 0,
      });
    });
  });

  describe('에러 처리', () => {
    it('getExtensionDiagnostics에서 Error throw 시 CLIError로 래핑', async () => {
      mockGetExtensionDiagnostics.mockImplementation(() => {
        throw new Error('diagnostics failed');
      });

      await expect(runDiagnostics()).rejects.toThrow(CLIError);
      await expect(runDiagnostics()).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
      });
    });

    it('에러 메시지에 원본 에러 메시지 포함', async () => {
      mockGetExtensionDiagnostics.mockImplementation(() => {
        throw new Error('permission denied');
      });

      await expect(runDiagnostics()).rejects.toThrow(
        /Failed to get diagnostics.*permission denied/
      );
    });

    it('Error가 아닌 값이 throw되어도 CLIError로 래핑', async () => {
      mockGetExtensionDiagnostics.mockImplementation(() => {
        throw 'string error';
      });

      await expect(runDiagnostics()).rejects.toThrow(CLIError);
      await expect(runDiagnostics()).rejects.toThrow(/Failed to get diagnostics.*string error/);
    });
  });
});
