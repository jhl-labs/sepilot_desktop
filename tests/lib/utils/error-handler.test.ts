/**
 * Error Handler 유틸리티 테스트
 */

import {
  isError,
  getErrorMessage,
  getErrorStack,
  createErrorResponse,
  createSuccessResponse,
  getHTTPErrorMessage,
  safeAsync,
  combineErrors,
  isErrorType,
  isAbortError,
  isNetworkError,
} from '@/lib/utils/error-handler';

describe('error-handler', () => {
  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('type error'))).toBe(true);
      expect(isError(new RangeError('range error'))).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isError('string error')).toBe(false);
      expect(isError(123)).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
      expect(isError({ message: 'fake error' })).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('test error message');
      expect(getErrorMessage(error)).toBe('test error message');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('should extract message from object with message property', () => {
      expect(getErrorMessage({ message: 'object error' })).toBe('object error');
    });

    it('should return default message for unknown errors', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
      expect(getErrorMessage(123)).toBe('Unknown error occurred');
    });
  });

  describe('getErrorStack', () => {
    it('should extract stack from Error instance', () => {
      const error = new Error('test');
      expect(getErrorStack(error)).toBeDefined();
      expect(getErrorStack(error)).toContain('Error: test');
    });

    it('should return undefined for non-Error values', () => {
      expect(getErrorStack('string')).toBeUndefined();
      expect(getErrorStack({ message: 'object' })).toBeUndefined();
      expect(getErrorStack(null)).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with message', () => {
      const response = createErrorResponse(new Error('test error'));

      expect(response.success).toBe(false);
      expect(response.error).toBe('test error');
    });

    it('should create error response with context', () => {
      const response = createErrorResponse(new Error('test'), 'TestContext');

      expect(response.success).toBe(false);
      expect(response.error).toBe('test');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response without data', () => {
      const response = createSuccessResponse();

      expect(response.success).toBe(true);
      expect(response.data).toBeUndefined();
    });

    it('should create success response with data', () => {
      const data = { id: 1, name: 'test' };
      const response = createSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('getHTTPErrorMessage', () => {
    it('should return correct message for 400 error', () => {
      expect(getHTTPErrorMessage(400, 'default')).toBe('잘못된 요청입니다. 입력값을 확인해주세요.');
    });

    it('should return correct message for 401 error', () => {
      expect(getHTTPErrorMessage(401, 'default')).toBe(
        'API 키가 유효하지 않습니다. 설정에서 API 키를 확인해주세요.'
      );
    });

    it('should return correct message for 403 error', () => {
      expect(getHTTPErrorMessage(403, 'default')).toBe(
        '접근 권한이 없습니다. API 키 권한을 확인해주세요.'
      );
    });

    it('should return correct message for 404 error', () => {
      expect(getHTTPErrorMessage(404, 'default')).toBe('요청한 리소스를 찾을 수 없습니다.');
    });

    it('should return correct message for 429 error', () => {
      expect(getHTTPErrorMessage(429, 'default')).toBe(
        'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
      );
    });

    it('should return correct message for 5xx errors', () => {
      const serverErrorMsg = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      expect(getHTTPErrorMessage(500, 'default')).toBe(serverErrorMsg);
      expect(getHTTPErrorMessage(502, 'default')).toBe(serverErrorMsg);
      expect(getHTTPErrorMessage(503, 'default')).toBe(serverErrorMsg);
      expect(getHTTPErrorMessage(504, 'default')).toBe(serverErrorMsg);
    });

    it('should return default message with status code for unknown errors', () => {
      expect(getHTTPErrorMessage(418, 'Custom error')).toBe('Custom error (상태 코드: 418)');
    });
  });

  describe('safeAsync', () => {
    it('should return success result on successful execution', async () => {
      const result = await safeAsync(async () => 'success');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('success');
      }
    });

    it('should return error result on failure', async () => {
      const result = await safeAsync(async () => {
        throw new Error('async error');
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('async error');
      }
    });

    it('should handle context parameter', async () => {
      const result = await safeAsync(async () => {
        throw new Error('error with context');
      }, 'TestContext');

      expect(result.success).toBe(false);
    });
  });

  describe('combineErrors', () => {
    it('should combine multiple error messages', () => {
      const errors = [new Error('first error'), 'second error', { message: 'third error' }];

      expect(combineErrors(errors)).toBe('first error; second error; third error');
    });

    it('should handle empty array', () => {
      expect(combineErrors([])).toBe('');
    });

    it('should filter out unknown errors', () => {
      const errors = [new Error('valid'), null, undefined];
      expect(combineErrors(errors)).toContain('valid');
    });
  });

  describe('isErrorType', () => {
    it('should identify error by name', () => {
      const error = new Error('test');
      error.name = 'CustomError';

      expect(isErrorType(error, 'CustomError')).toBe(true);
      expect(isErrorType(error, 'OtherError')).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isErrorType('string', 'Error')).toBe(false);
    });
  });

  describe('isAbortError', () => {
    it('should identify AbortError', () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      expect(isAbortError(abortError)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isAbortError(new Error('not abort'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should identify NetworkError by name', () => {
      const networkError = new Error('Failed');
      networkError.name = 'NetworkError';

      expect(isNetworkError(networkError)).toBe(true);
    });

    it('should identify network errors by message content', () => {
      expect(isNetworkError(new Error('network failure'))).toBe(true);
      expect(isNetworkError(new Error('fetch failed'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return false for non-network errors', () => {
      expect(isNetworkError(new Error('some other error'))).toBe(false);
      expect(isNetworkError('string')).toBe(false);
    });
  });
});
