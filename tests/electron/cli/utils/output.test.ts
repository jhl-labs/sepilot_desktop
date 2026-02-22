/**
 * CLI 출력 유틸리티 테스트
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

import {
  setJsonMode,
  isJsonMode,
  setColorMode,
  printJson,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printHeader,
  printSection,
  printKeyValue,
} from '../../../../electron/cli/utils/output';

describe('output 유틸리티', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // 각 테스트 전 jsonMode 초기화
    setJsonMode(false);
    setColorMode(true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('setJsonMode / isJsonMode', () => {
    it('기본값은 false', () => {
      expect(isJsonMode()).toBe(false);
    });

    it('true로 설정', () => {
      setJsonMode(true);
      expect(isJsonMode()).toBe(true);
    });

    it('false로 되돌리기', () => {
      setJsonMode(true);
      setJsonMode(false);
      expect(isJsonMode()).toBe(false);
    });
  });

  describe('printJson', () => {
    it('JSON 형식으로 출력', () => {
      printJson({ key: 'value' });
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('배열도 올바르게 출력', () => {
      printJson([1, 2, 3]);
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify([1, 2, 3], null, 2));
    });

    it('jsonMode에서도 출력 (printJson은 jsonMode에 영향 없음)', () => {
      setJsonMode(true);
      printJson({ test: true });
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('printSuccess', () => {
    it('메시지 출력', () => {
      printSuccess('done');
      expect(logSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printSuccess('done');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printError', () => {
    it('에러 메시지 출력', () => {
      printError('failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printError('failed');
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('printWarning', () => {
    it('경고 메시지 출력', () => {
      printWarning('caution');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printWarning('caution');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('printInfo', () => {
    it('정보 메시지 출력', () => {
      printInfo('info message');
      expect(logSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printInfo('info message');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printHeader', () => {
    it('헤더 출력', () => {
      printHeader('Title');
      expect(logSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printHeader('Title');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printSection', () => {
    it('섹션 제목 출력', () => {
      printSection('Section');
      expect(logSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printSection('Section');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printKeyValue', () => {
    it('키-값 출력', () => {
      printKeyValue('key', 'value');
      expect(logSpy).toHaveBeenCalled();
    });

    it('jsonMode일 때 억제', () => {
      setJsonMode(true);
      printKeyValue('key', 'value');
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
