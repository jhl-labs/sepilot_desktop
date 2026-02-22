/**
 * Info CLI command 테스트
 */

// Mock electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test'),
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

// Mock package.json
jest.mock(
  '../../../../package.json',
  () => ({
    version: '0.9.2',
  }),
  { virtual: true }
);

// Mock output utilities
const mockIsJsonMode = jest.fn().mockReturnValue(false);
const mockPrintHeader = jest.fn();
const mockPrintSection = jest.fn();
const mockPrintKeyValue = jest.fn();
const mockPrintJson = jest.fn();

jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: mockIsJsonMode,
  printHeader: mockPrintHeader,
  printSection: mockPrintSection,
  printKeyValue: mockPrintKeyValue,
  printJson: mockPrintJson,
}));

import { runInfo } from '../../../../electron/cli/commands/info';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';
import { app } from 'electron';

describe('runInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsJsonMode.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
  });

  describe('일반 출력 모드 (non-JSON)', () => {
    it('printHeader를 호출하여 제목 출력', async () => {
      await runInfo();

      expect(mockPrintHeader).toHaveBeenCalledWith('SEPilot Desktop System Information');
    });

    it('printSection을 호출하여 각 섹션 제목 출력', async () => {
      await runInfo();

      expect(mockPrintSection).toHaveBeenCalledWith('Version:');
      expect(mockPrintSection).toHaveBeenCalledWith('System:');
      expect(mockPrintSection).toHaveBeenCalledWith('Paths:');
      expect(mockPrintSection).toHaveBeenCalledWith('Environment:');
      expect(mockPrintSection).toHaveBeenCalledTimes(4);
    });

    it('printKeyValue를 호출하여 버전 정보 출력', async () => {
      await runInfo();

      expect(mockPrintKeyValue).toHaveBeenCalledWith('App', '0.9.2');
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Electron', process.versions.electron);
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Node', process.versions.node);
      expect(mockPrintKeyValue).toHaveBeenCalledWith('V8', process.versions.v8);
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Chrome', process.versions.chrome);
    });

    it('printKeyValue를 호출하여 시스템 정보 출력', async () => {
      await runInfo();

      expect(mockPrintKeyValue).toHaveBeenCalledWith('Platform', process.platform);
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Architecture', process.arch);
      expect(mockPrintKeyValue).toHaveBeenCalledWith('OS Type', expect.any(String));
      expect(mockPrintKeyValue).toHaveBeenCalledWith('OS Release', expect.any(String));
      expect(mockPrintKeyValue).toHaveBeenCalledWith('CPUs', expect.any(String));
      expect(mockPrintKeyValue).toHaveBeenCalledWith(
        'Total Memory',
        expect.stringMatching(/\d+\.\d+ GB/)
      );
      expect(mockPrintKeyValue).toHaveBeenCalledWith(
        'Free Memory',
        expect.stringMatching(/\d+\.\d+ GB/)
      );
    });

    it('printKeyValue를 호출하여 경로 정보 출력', async () => {
      await runInfo();

      expect(mockPrintKeyValue).toHaveBeenCalledWith('Executable', '/tmp/test');
      expect(mockPrintKeyValue).toHaveBeenCalledWith('User Data', '/tmp/test');
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Logs', '/tmp/test');
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Temp', '/tmp/test');
    });

    it('printKeyValue를 호출하여 환경 정보 출력', async () => {
      await runInfo();

      expect(mockPrintKeyValue).toHaveBeenCalledWith('Packaged', 'false');
      expect(mockPrintKeyValue).toHaveBeenCalledWith('Development', 'true');
    });

    it('JSON 모드에서는 printHeader, printSection, printKeyValue를 호출하지 않음', async () => {
      mockIsJsonMode.mockReturnValue(true);

      await runInfo();

      expect(mockPrintHeader).not.toHaveBeenCalled();
      expect(mockPrintSection).not.toHaveBeenCalled();
      expect(mockPrintKeyValue).not.toHaveBeenCalled();
    });
  });

  describe('JSON 출력 모드', () => {
    beforeEach(() => {
      mockIsJsonMode.mockReturnValue(true);
    });

    it('printJson을 호출', async () => {
      await runInfo();

      expect(mockPrintJson).toHaveBeenCalledTimes(1);
    });

    it('info 객체에 version 키 포함', async () => {
      await runInfo();

      const infoArg = mockPrintJson.mock.calls[0][0];
      expect(infoArg).toHaveProperty('version');
      expect(infoArg.version).toEqual(
        expect.objectContaining({
          app: '0.9.2',
          electron: process.versions.electron,
          node: process.versions.node,
          v8: process.versions.v8,
          chrome: process.versions.chrome,
        })
      );
    });

    it('info 객체에 system 키 포함', async () => {
      await runInfo();

      const infoArg = mockPrintJson.mock.calls[0][0];
      expect(infoArg).toHaveProperty('system');
      expect(infoArg.system).toEqual(
        expect.objectContaining({
          platform: process.platform,
          arch: process.arch,
          osType: expect.any(String),
          osRelease: expect.any(String),
          cpus: expect.any(Number),
          totalMemory: expect.stringMatching(/\d+\.\d+ GB/),
          freeMemory: expect.stringMatching(/\d+\.\d+ GB/),
        })
      );
    });

    it('info 객체에 paths 키 포함', async () => {
      await runInfo();

      const infoArg = mockPrintJson.mock.calls[0][0];
      expect(infoArg).toHaveProperty('paths');
      expect(infoArg.paths).toEqual({
        exe: '/tmp/test',
        userData: '/tmp/test',
        logs: '/tmp/test',
        temp: '/tmp/test',
      });
    });

    it('info 객체에 environment 키 포함', async () => {
      await runInfo();

      const infoArg = mockPrintJson.mock.calls[0][0];
      expect(infoArg).toHaveProperty('environment');
      expect(infoArg.environment).toEqual({
        isPackaged: false,
        isDev: true,
      });
    });

    it('info 객체가 version, system, paths, environment 4개 키를 가짐', async () => {
      await runInfo();

      const infoArg = mockPrintJson.mock.calls[0][0];
      expect(Object.keys(infoArg)).toEqual(
        expect.arrayContaining(['version', 'system', 'paths', 'environment'])
      );
      expect(Object.keys(infoArg)).toHaveLength(4);
    });
  });

  describe('에러 처리', () => {
    it('app.getPath 에러 시 CLIError throw', async () => {
      (app.getPath as jest.Mock).mockImplementation(() => {
        throw new Error('getPath failed');
      });

      await expect(runInfo()).rejects.toThrow(CLIError);
      await expect(runInfo()).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
      });

      // mock 복원
      (app.getPath as jest.Mock).mockReturnValue('/tmp/test');
    });

    it('에러 메시지에 원본 에러 메시지 포함', async () => {
      (app.getPath as jest.Mock).mockImplementation(() => {
        throw new Error('permission denied');
      });

      await expect(runInfo()).rejects.toThrow(/Failed to get system info.*permission denied/);

      // mock 복원
      (app.getPath as jest.Mock).mockReturnValue('/tmp/test');
    });

    it('Error가 아닌 값이 throw되어도 CLIError로 래핑', async () => {
      (app.getPath as jest.Mock).mockImplementation(() => {
        throw 'string error';
      });

      await expect(runInfo()).rejects.toThrow(CLIError);
      await expect(runInfo()).rejects.toThrow(/Failed to get system info.*string error/);

      // mock 복원
      (app.getPath as jest.Mock).mockReturnValue('/tmp/test');
    });
  });
});
