/**
 * CLIError 및 handleError 테스트
 */

jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test'),
  },
}));

jest.mock('chalk', () => {
  const identity = (str: string) => str;
  const chainable: any = new Proxy(identity, {
    get: () => chainable,
    apply: (_target: any, _thisArg: any, args: any[]) => args[0],
  });
  chainable.level = 3;
  return { __esModule: true, default: chainable };
});

import { CLIError, ExitCode, handleError } from '../../../../electron/cli/utils/cli-error';

describe('ExitCode', () => {
  it('올바른 값을 가짐', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.ERROR).toBe(1);
    expect(ExitCode.INVALID_ARGUMENT).toBe(2);
    expect(ExitCode.NOT_FOUND).toBe(3);
    expect(ExitCode.PERMISSION_DENIED).toBe(4);
  });
});

describe('CLIError', () => {
  it('메시지와 기본 exitCode(ERROR) 생성', () => {
    const error = new CLIError('test error');
    expect(error.message).toBe('test error');
    expect(error.exitCode).toBe(ExitCode.ERROR);
    expect(error.name).toBe('CLIError');
  });

  it('커스텀 exitCode 생성', () => {
    const error = new CLIError('not found', ExitCode.NOT_FOUND);
    expect(error.message).toBe('not found');
    expect(error.exitCode).toBe(ExitCode.NOT_FOUND);
  });

  it('Error 인스턴스', () => {
    const error = new CLIError('test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CLIError);
  });
});

describe('handleError', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.VERBOSE;
  });

  it('CLIError -> 해당 exitCode 반환', () => {
    const error = new CLIError('invalid arg', ExitCode.INVALID_ARGUMENT);
    const result = handleError(error);
    expect(result).toBe(ExitCode.INVALID_ARGUMENT);
  });

  it('CLIError -> NOT_FOUND exitCode 반환', () => {
    const error = new CLIError('missing', ExitCode.NOT_FOUND);
    const result = handleError(error);
    expect(result).toBe(ExitCode.NOT_FOUND);
  });

  it('일반 Error -> ExitCode.ERROR 반환', () => {
    const error = new Error('something went wrong');
    const result = handleError(error);
    expect(result).toBe(ExitCode.ERROR);
  });

  it('일반 Error + VERBOSE -> stack trace 출력', () => {
    process.env.VERBOSE = 'true';
    const error = new Error('verbose error');
    handleError(error);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('알 수 없는 에러(문자열) -> ExitCode.ERROR 반환', () => {
    const result = handleError('unknown error string');
    expect(result).toBe(ExitCode.ERROR);
  });

  it('알 수 없는 에러(숫자) -> ExitCode.ERROR 반환', () => {
    const result = handleError(42);
    expect(result).toBe(ExitCode.ERROR);
  });

  it('알 수 없는 에러(null) -> ExitCode.ERROR 반환', () => {
    const result = handleError(null);
    expect(result).toBe(ExitCode.ERROR);
  });
});
