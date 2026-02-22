/**
 * Config CLI command 테스트
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

// Mock databaseService
const mockGetSetting = jest.fn();
const mockInitialize = jest.fn();
jest.mock('../../../../electron/services/database', () => ({
  databaseService: {
    initialize: mockInitialize,
    getSetting: mockGetSetting,
    db: null,
  },
}));

// Mock output utilities
jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: jest.fn().mockReturnValue(false),
  printInfo: jest.fn(),
  printKeyValue: jest.fn(),
  printJson: jest.fn(),
}));

import { runGetConfig, runConfigPath } from '../../../../electron/cli/commands/config';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';
import {
  isJsonMode,
  printInfo,
  printKeyValue,
  printJson,
} from '../../../../electron/cli/utils/output';
import { databaseService } from '../../../../electron/services/database';

describe('Config CLI commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // db를 null로 리셋하여 initialize 호출 보장
    (databaseService as any).db = null;
  });

  describe('runGetConfig', () => {
    it('설정 값이 존재하면 정상적으로 반환', async () => {
      mockGetSetting.mockResolvedValue('test-value');

      await runGetConfig('test-key');

      expect(mockGetSetting).toHaveBeenCalledWith('test-key');
      expect(printKeyValue).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('설정이 없으면 CLIError(NOT_FOUND) throw', async () => {
      mockGetSetting.mockResolvedValue(null);

      await expect(runGetConfig('nonexistent-key')).rejects.toThrow(CLIError);
      await expect(runGetConfig('nonexistent-key')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
        message: 'Setting not found: nonexistent-key',
      });
    });

    it('설정이 undefined이면 CLIError(NOT_FOUND) throw', async () => {
      mockGetSetting.mockResolvedValue(undefined);

      await expect(runGetConfig('missing-key')).rejects.toThrow(CLIError);
      await expect(runGetConfig('missing-key')).rejects.toMatchObject({
        exitCode: ExitCode.NOT_FOUND,
      });
    });

    it('JSON 모드에서 printJson 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);
      mockGetSetting.mockResolvedValue('json-value');

      await runGetConfig('json-key');

      expect(printJson).toHaveBeenCalledWith({ key: 'json-key', value: 'json-value' });
      expect(printKeyValue).not.toHaveBeenCalled();
    });

    it('일반 모드에서 printKeyValue 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(false);
      mockGetSetting.mockResolvedValue('normal-value');

      await runGetConfig('normal-key');

      expect(printKeyValue).toHaveBeenCalledWith('normal-key', 'normal-value');
      expect(printJson).not.toHaveBeenCalled();
    });

    it('객체 값은 JSON.stringify로 변환하여 printKeyValue 호출', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(false);
      const objectValue = { nested: 'data', count: 42 };
      mockGetSetting.mockResolvedValue(objectValue);

      await runGetConfig('object-key');

      expect(printKeyValue).toHaveBeenCalledWith(
        'object-key',
        JSON.stringify(objectValue, null, 2)
      );
    });

    it('db가 null이면 databaseService.initialize 호출', async () => {
      (databaseService as any).db = null;
      mockGetSetting.mockResolvedValue('value');

      await runGetConfig('key');

      expect(mockInitialize).toHaveBeenCalled();
    });

    it('db가 이미 초기화되어 있으면 initialize 호출하지 않음', async () => {
      (databaseService as any).db = {}; // truthy 값으로 설정
      mockGetSetting.mockResolvedValue('value');

      await runGetConfig('key');

      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('databaseService에서 예외 발생 시 CLIError(ERROR)로 래핑', async () => {
      mockGetSetting.mockRejectedValue(new Error('DB connection failed'));

      await expect(runGetConfig('key')).rejects.toThrow(CLIError);
      await expect(runGetConfig('key')).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
        message: 'Failed to get config: DB connection failed',
      });
    });

    it('비 Error 객체 예외 발생 시에도 CLIError(ERROR)로 래핑', async () => {
      mockGetSetting.mockRejectedValue('string error');

      await expect(runGetConfig('key')).rejects.toThrow(CLIError);
      await expect(runGetConfig('key')).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
        message: 'Failed to get config: string error',
      });
    });
  });

  describe('runConfigPath', () => {
    it('일반 모드에서 config 경로 출력', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(false);

      await runConfigPath();

      expect(printInfo).toHaveBeenCalledWith('Config file location:');
      expect(printKeyValue).toHaveBeenCalledWith('Config DB', '/tmp/test/config.db');
      expect(printKeyValue).toHaveBeenCalledWith('User Data', '/tmp/test');
    });

    it('JSON 모드에서 printJson으로 출력', async () => {
      (isJsonMode as jest.Mock).mockReturnValue(true);

      await runConfigPath();

      expect(printJson).toHaveBeenCalledWith({
        configPath: '/tmp/test/config.db',
        userDataPath: '/tmp/test',
      });
      expect(printInfo).not.toHaveBeenCalled();
      expect(printKeyValue).not.toHaveBeenCalled();
    });

    it('app.getPath 실패 시 CLIError(ERROR) throw', async () => {
      const { app } = require('electron');
      app.getPath.mockImplementation(() => {
        throw new Error('getPath failed');
      });

      await expect(runConfigPath()).rejects.toThrow(CLIError);

      app.getPath.mockImplementation(() => {
        throw new Error('getPath failed');
      });

      await expect(runConfigPath()).rejects.toMatchObject({
        exitCode: ExitCode.ERROR,
      });

      // 원래 동작 복원
      app.getPath.mockReturnValue('/tmp/test');
    });
  });
});
