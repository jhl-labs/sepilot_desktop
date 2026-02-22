/**
 * Logs CLI command 테스트
 */

// Mock electron
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test-logs'),
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

// Mock output utils
jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: jest.fn().mockReturnValue(false),
  printInfo: jest.fn(),
  printKeyValue: jest.fn(),
  printJson: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
}));

import fs from 'fs';
import { runShowLogs, runLogsPath } from '../../../../electron/cli/commands/logs';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';
import {
  isJsonMode,
  printInfo,
  printKeyValue,
  printJson,
} from '../../../../electron/cli/utils/output';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockIsJsonMode = isJsonMode as jest.MockedFunction<typeof isJsonMode>;
const mockPrintInfo = printInfo as jest.MockedFunction<typeof printInfo>;
const mockPrintKeyValue = printKeyValue as jest.MockedFunction<typeof printKeyValue>;
const mockPrintJson = printJson as jest.MockedFunction<typeof printJson>;

/**
 * Helper: 로그 디렉토리에 로그 파일이 있는 상태로 fs mock 설정
 */
function setupLogFiles(
  files: string[] = ['app.log', 'error.log'],
  logContent: string = 'line1\nline2\nline3\nline4\nline5\n'
) {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.readdirSync.mockReturnValue(files as any);
  mockFs.readFileSync.mockReturnValue(logContent);

  // statSync: 파일 순서를 위한 mtime과 파일 크기 제공
  let mtimeCounter = files.length;
  mockFs.statSync.mockImplementation((_filePath: fs.PathLike) => {
    mtimeCounter--;
    return {
      mtime: new Date(2024, 0, 1, 0, 0, mtimeCounter),
      size: 2048, // 2 KB
    } as unknown as fs.Stats;
  });
}

/**
 * Helper: 로그 디렉토리가 비어있거나 존재하지 않는 상태
 */
function setupNoLogFiles() {
  mockFs.existsSync.mockReturnValue(false);
}

describe('runShowLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsJsonMode.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
  });

  it('로그 파일이 없으면 CLIError(NOT_FOUND) throw', async () => {
    setupNoLogFiles();

    await expect(runShowLogs()).rejects.toThrow(CLIError);
    await expect(runShowLogs()).rejects.toMatchObject({
      exitCode: ExitCode.NOT_FOUND,
    });
  });

  it('일반 모드에서 로그 라인을 읽어서 출력', async () => {
    const logContent = 'log entry 1\nlog entry 2\nlog entry 3\n';
    setupLogFiles(['app.log'], logContent);

    await runShowLogs();

    expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('app.log'), 'utf-8');
    expect(mockPrintInfo).toHaveBeenCalledWith(expect.stringContaining('Log file:'));
    expect(mockPrintInfo).toHaveBeenCalledWith(
      expect.stringContaining('Showing last 3 lines (total: 3):')
    );
    expect(console.log).toHaveBeenCalledWith('log entry 1');
    expect(console.log).toHaveBeenCalledWith('log entry 2');
    expect(console.log).toHaveBeenCalledWith('log entry 3');
  });

  it('JSON 모드에서 JSON 형식으로 출력', async () => {
    mockIsJsonMode.mockReturnValue(true);
    const logContent = 'json line 1\njson line 2\n';
    setupLogFiles(['app.log'], logContent);

    await runShowLogs();

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.stringContaining('app.log'),
        lines: ['json line 1', 'json line 2'],
        totalLines: 2,
      })
    );
    // 일반 모드 출력은 호출되지 않아야 함
    expect(mockPrintInfo).not.toHaveBeenCalled();
  });

  it('lines 파라미터로 출력 라인 수를 제한', async () => {
    const logContent = 'line1\nline2\nline3\nline4\nline5\n';
    setupLogFiles(['app.log'], logContent);

    await runShowLogs(2);

    expect(mockPrintInfo).toHaveBeenCalledWith(
      expect.stringContaining('Showing last 2 lines (total: 5):')
    );
    // 마지막 2줄만 출력되어야 함
    expect(console.log).toHaveBeenCalledWith('line4');
    expect(console.log).toHaveBeenCalledWith('line5');
  });
});

describe('runLogsPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsJsonMode.mockReturnValue(false);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore?.();
  });

  it('일반 모드에서 로그 경로와 파일 수를 출력', async () => {
    setupLogFiles(['app.log', 'error.log']);

    await runLogsPath();

    expect(mockPrintInfo).toHaveBeenCalledWith('Logs directory:');
    expect(mockPrintKeyValue).toHaveBeenCalledWith('Path', '/tmp/test-logs');
    expect(mockPrintKeyValue).toHaveBeenCalledWith('Log files', '2');
    expect(mockPrintInfo).toHaveBeenCalledWith('Available log files:');
    // 파일 크기 포함 출력 확인 (2048 bytes = 2.00 KB)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('app.log'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('KB'));
  });

  it('JSON 모드에서 JSON 형식으로 출력', async () => {
    mockIsJsonMode.mockReturnValue(true);
    setupLogFiles(['app.log']);

    await runLogsPath();

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        logsPath: '/tmp/test-logs',
        logFiles: expect.arrayContaining([expect.stringContaining('app.log')]),
      })
    );
    // 일반 모드 출력은 호출되지 않아야 함
    expect(mockPrintInfo).not.toHaveBeenCalled();
    expect(mockPrintKeyValue).not.toHaveBeenCalled();
  });

  it('로그 디렉토리가 비어있을 때 정상 처리', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([] as any);

    await runLogsPath();

    expect(mockPrintInfo).toHaveBeenCalledWith('Logs directory:');
    expect(mockPrintKeyValue).toHaveBeenCalledWith('Path', '/tmp/test-logs');
    expect(mockPrintKeyValue).toHaveBeenCalledWith('Log files', '0');
    // 파일이 없으므로 'Available log files:' 메시지는 출력되지 않아야 함
    expect(mockPrintInfo).not.toHaveBeenCalledWith('Available log files:');
  });
});
