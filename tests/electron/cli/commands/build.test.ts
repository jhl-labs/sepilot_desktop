/**
 * Build CLI command 테스트
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

// Mock output utilities
const mockIsJsonMode = jest.fn().mockReturnValue(false);
const mockPrintSuccess = jest.fn();
const mockPrintError = jest.fn();
const mockPrintInfo = jest.fn();
const mockPrintJson = jest.fn();
const mockPrintWarning = jest.fn();

jest.mock('../../../../electron/cli/utils/output', () => ({
  isJsonMode: mockIsJsonMode,
  printSuccess: mockPrintSuccess,
  printError: mockPrintError,
  printInfo: mockPrintInfo,
  printJson: mockPrintJson,
  printWarning: mockPrintWarning,
}));

// Mock child_process.spawn
import { EventEmitter } from 'events';

interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

let spawnCallbacks: Array<(proc: MockProcess) => void> = [];

const mockSpawn = jest.fn().mockImplementation(() => {
  const proc: MockProcess = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  const callback = spawnCallbacks.shift();
  if (callback) {
    // 비동기로 콜백 실행하여 이벤트 리스너 등록 후 실행되도록 함
    process.nextTick(() => callback(proc));
  } else {
    // 기본: 성공 완료
    process.nextTick(() => {
      proc.emit('close', 0);
    });
  }

  return proc;
});

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { runBuildCheck } from '../../../../electron/cli/commands/build';
import { CLIError, ExitCode } from '../../../../electron/cli/utils/cli-error';

// process.exit mock
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// console.log mock (상세 에러 출력 검증용)
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('runBuildCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spawnCallbacks = [];
    mockIsJsonMode.mockReturnValue(false);
    mockExit.mockClear();
    mockConsoleLog.mockClear();
  });

  afterAll(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  describe('빌드 성공', () => {
    it('백엔드와 프론트엔드 모두 성공 시 성공 메시지 출력', async () => {
      // 두 번의 spawn 호출 모두 exit code 0으로 완료
      spawnCallbacks = [
        (proc) => proc.emit('close', 0), // backend
        (proc) => proc.emit('close', 0), // frontend
      ];

      await runBuildCheck();

      // printInfo가 호출되었는지 확인
      expect(mockPrintInfo).toHaveBeenCalledWith('Checking TypeScript compilation...\n');
      expect(mockPrintInfo).toHaveBeenCalledWith('Checking backend (tsconfig.backend.json)...');
      expect(mockPrintInfo).toHaveBeenCalledWith('\nChecking frontend (tsconfig.json)...');

      // 성공 메시지
      expect(mockPrintSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Backend: 0 errors, 0 warnings')
      );
      expect(mockPrintSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Frontend: 0 errors, 0 warnings')
      );
      expect(mockPrintSuccess).toHaveBeenCalledWith(expect.stringContaining('Build check passed!'));

      // process.exit이 호출되지 않아야 함
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('tsc를 올바른 인자로 호출', async () => {
      spawnCallbacks = [(proc) => proc.emit('close', 0), (proc) => proc.emit('close', 0)];

      await runBuildCheck();

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(
        1,
        'npx',
        ['tsc', '--noEmit', '-p', 'tsconfig.backend.json'],
        expect.objectContaining({ shell: true })
      );
      expect(mockSpawn).toHaveBeenNthCalledWith(
        2,
        'npx',
        ['tsc', '--noEmit', '-p', 'tsconfig.json'],
        expect.objectContaining({ shell: true })
      );
    });
  });

  describe('빌드 실패', () => {
    it('백엔드 빌드 실패 시 에러 메시지 출력 및 process.exit 호출', async () => {
      const backendErrorOutput =
        "src/main.ts(10,5): error TS2304: Cannot find name 'foo'\n" +
        "src/main.ts(20,3): error TS2322: Type 'string' is not assignable to type 'number'\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(backendErrorOutput));
          proc.emit('close', 1); // backend 실패
        },
        (proc) => proc.emit('close', 0), // frontend 성공
      ];

      await runBuildCheck();

      // 백엔드 에러 출력
      expect(mockPrintError).toHaveBeenCalledWith(
        expect.stringContaining('Backend: 2 errors, 0 warnings')
      );

      // 프론트엔드 성공
      expect(mockPrintSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Frontend: 0 errors, 0 warnings')
      );

      // 상세 에러 출력
      expect(mockPrintError).toHaveBeenCalledWith('\nBackend Errors:');

      // 최종 실패 메시지
      expect(mockPrintError).toHaveBeenCalledWith(expect.stringContaining('Build check failed!'));
      expect(mockPrintError).toHaveBeenCalledWith(expect.stringContaining('2 error(s) found'));

      // process.exit(1) 호출
      expect(mockExit).toHaveBeenCalledWith(ExitCode.ERROR);
    });

    it('프론트엔드 빌드 실패 시 에러 메시지 출력 및 process.exit 호출', async () => {
      const frontendErrorOutput =
        "components/App.tsx(5,10): error TS2307: Cannot find module './Missing'\n";

      spawnCallbacks = [
        (proc) => proc.emit('close', 0), // backend 성공
        (proc) => {
          proc.stdout.emit('data', Buffer.from(frontendErrorOutput));
          proc.emit('close', 1); // frontend 실패
        },
      ];

      await runBuildCheck();

      // 백엔드 성공
      expect(mockPrintSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Backend: 0 errors, 0 warnings')
      );

      // 프론트엔드 에러
      expect(mockPrintError).toHaveBeenCalledWith(
        expect.stringContaining('Frontend: 1 errors, 0 warnings')
      );

      // 최종 실패
      expect(mockExit).toHaveBeenCalledWith(ExitCode.ERROR);
    });

    it('양쪽 모두 실패 시 총 에러 수 합산', async () => {
      const backendError = "electron/main.ts(1,1): error TS2304: Cannot find name 'x'\n";
      const frontendError = "app/page.tsx(1,1): error TS2304: Cannot find name 'y'\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(backendError));
          proc.emit('close', 1);
        },
        (proc) => {
          proc.stdout.emit('data', Buffer.from(frontendError));
          proc.emit('close', 1);
        },
      ];

      await runBuildCheck();

      expect(mockPrintError).toHaveBeenCalledWith(expect.stringContaining('2 error(s) found'));
      expect(mockExit).toHaveBeenCalledWith(ExitCode.ERROR);
    });

    it('10개 이상의 에러 시 truncation 메시지 출력', async () => {
      // 12개의 에러 생성
      const lines =
        Array.from(
          { length: 12 },
          (_, i) => `src/file${i}.ts(${i + 1},1): error TS2304: Cannot find name 'var${i}'`
        ).join('\n') + '\n';

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(lines));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      // "... and 2 more errors" 메시지 확인
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('... and 2 more errors'));
    });
  });

  describe('경고 처리', () => {
    it('경고가 있으면 경고 메시지 출력', async () => {
      const warningOutput =
        "src/utils.ts(3,1): warning TS6133: 'unused' is declared but its value is never read.\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(warningOutput));
          proc.emit('close', 0); // 경고만 있으므로 성공
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintWarning).toHaveBeenCalledWith(expect.stringContaining('Total warnings: 1'));

      // 경고만 있고 에러 없으므로 빌드는 통과
      expect(mockPrintSuccess).toHaveBeenCalledWith(expect.stringContaining('Build check passed!'));
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('stderr 처리', () => {
    it('stderr 출력도 파싱하여 에러를 수집', async () => {
      const stderrOutput =
        "lib/service.ts(7,12): error TS2339: Property 'foo' does not exist on type 'Bar'.\n";

      spawnCallbacks = [
        (proc) => {
          proc.stderr.emit('data', Buffer.from(stderrOutput));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintError).toHaveBeenCalledWith(
        expect.stringContaining('Backend: 1 errors, 0 warnings')
      );
      expect(mockExit).toHaveBeenCalledWith(ExitCode.ERROR);
    });
  });

  describe('JSON 모드', () => {
    it('JSON 모드에서 성공 시 결과를 JSON으로 출력', async () => {
      mockIsJsonMode.mockReturnValue(true);

      spawnCallbacks = [(proc) => proc.emit('close', 0), (proc) => proc.emit('close', 0)];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          backend: expect.objectContaining({
            success: true,
            errors: [],
            warnings: [],
          }),
          frontend: expect.objectContaining({
            success: true,
            errors: [],
            warnings: [],
          }),
          summary: expect.objectContaining({
            totalErrors: 0,
            totalWarnings: 0,
            canBuild: true,
          }),
        })
      );

      // JSON 모드에서 성공 시 process.exit 호출 안 함
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('JSON 모드에서 실패 시 JSON 출력 후 process.exit 호출', async () => {
      mockIsJsonMode.mockReturnValue(true);

      const errorOutput = "src/index.ts(5,3): error TS2304: Cannot find name 'missing'\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(errorOutput));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          backend: expect.objectContaining({
            success: false,
            errors: [
              expect.objectContaining({
                file: 'src/index.ts',
                line: 5,
                column: 3,
                code: 'TS2304',
                message: "Cannot find name 'missing'",
                severity: 'error',
              }),
            ],
          }),
          summary: expect.objectContaining({
            totalErrors: 1,
            canBuild: false,
          }),
        })
      );

      expect(mockExit).toHaveBeenCalledWith(ExitCode.ERROR);
    });

    it('JSON 모드에서 에러와 경고가 모두 있을 때 올바르게 집계', async () => {
      mockIsJsonMode.mockReturnValue(true);

      const mixedOutput =
        "src/a.ts(1,1): error TS2304: Cannot find name 'a'\n" +
        "src/b.ts(2,2): warning TS6133: 'b' is declared but its value is never read.\n" +
        "src/c.ts(3,3): error TS2322: Type 'x' is not assignable to type 'y'\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(mixedOutput));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          backend: expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({ code: 'TS2304' }),
              expect.objectContaining({ code: 'TS2322' }),
            ]),
            warnings: [
              expect.objectContaining({
                code: 'TS6133',
                severity: 'warning',
              }),
            ],
          }),
          summary: expect.objectContaining({
            totalErrors: 2,
            totalWarnings: 1,
          }),
        })
      );
    });
  });

  describe('에러 핸들링', () => {
    it('spawn 에러 시 CLIError로 래핑하여 throw', async () => {
      mockSpawn.mockImplementationOnce(() => {
        throw new Error('spawn ENOENT');
      });

      await expect(runBuildCheck()).rejects.toThrow(CLIError);
      await expect(
        // mockSpawn을 다시 에러로 설정해야 두 번째 호출도 실패
        (() => {
          mockSpawn.mockImplementationOnce(() => {
            throw new Error('spawn ENOENT');
          });
          return runBuildCheck();
        })()
      ).rejects.toMatchObject({
        message: expect.stringContaining('Failed to check build'),
        exitCode: ExitCode.ERROR,
      });
    });

    it('비-Error 객체 throw 시에도 CLIError로 래핑', async () => {
      mockSpawn.mockImplementationOnce(() => {
        throw 'string error';
      });

      await expect(runBuildCheck()).rejects.toThrow(CLIError);
      await expect(
        (() => {
          mockSpawn.mockImplementationOnce(() => {
            throw 'string error';
          });
          return runBuildCheck();
        })()
      ).rejects.toMatchObject({
        message: expect.stringContaining('string error'),
      });
    });
  });

  describe('TypeScript 에러 파싱', () => {
    it('표준 TypeScript 에러 형식을 올바르게 파싱', async () => {
      mockIsJsonMode.mockReturnValue(true);

      const errorOutput =
        "electron/main.ts(42,17): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n";

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(errorOutput));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          backend: expect.objectContaining({
            errors: [
              {
                file: 'electron/main.ts',
                line: 42,
                column: 17,
                code: 'TS2345',
                message:
                  "Argument of type 'string' is not assignable to parameter of type 'number'.",
                severity: 'error',
              },
            ],
          }),
        })
      );
    });

    it('파싱 불가능한 출력 라인은 무시', async () => {
      mockIsJsonMode.mockReturnValue(true);

      const mixedOutput =
        'Found 2 errors.\n' +
        "src/file.ts(1,1): error TS2304: Cannot find name 'x'\n" +
        '\n' +
        '  some indented text\n';

      spawnCallbacks = [
        (proc) => {
          proc.stdout.emit('data', Buffer.from(mixedOutput));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          backend: expect.objectContaining({
            errors: expect.arrayContaining([expect.objectContaining({ code: 'TS2304' })]),
          }),
          summary: expect.objectContaining({
            totalErrors: 1,
          }),
        })
      );
    });

    it('여러 chunk로 분할된 출력을 올바르게 처리', async () => {
      mockIsJsonMode.mockReturnValue(true);

      spawnCallbacks = [
        (proc) => {
          // 출력을 여러 chunk로 분할 전송
          proc.stdout.emit('data', Buffer.from('src/a.ts(1,1): error TS'));
          proc.stdout.emit('data', Buffer.from("2304: Cannot find name 'x'\n"));
          proc.stdout.emit('data', Buffer.from('src/b.ts(2,2): error TS2322: Type mismatch\n'));
          proc.emit('close', 1);
        },
        (proc) => proc.emit('close', 0),
      ];

      await runBuildCheck();

      expect(mockPrintJson).toHaveBeenCalledWith(
        expect.objectContaining({
          backend: expect.objectContaining({
            errors: expect.arrayContaining([
              expect.objectContaining({ file: 'src/a.ts', code: 'TS2304' }),
              expect.objectContaining({ file: 'src/b.ts', code: 'TS2322' }),
            ]),
          }),
          summary: expect.objectContaining({
            totalErrors: 2,
          }),
        })
      );
    });
  });
});
