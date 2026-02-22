/**
 * IPC Handler Helper Functions
 *
 * IPC 핸들러에서 공통적으로 사용되는 유틸리티 함수들
 * - 에러 처리
 * - 응답 포맷팅
 * - 로깅
 */

import { logger } from '@/lib/utils/logger';

/**
 * IPC 응답 타입
 */
export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * IPC 핸들러 래퍼 - 에러 처리 및 로깅 자동화
 *
 * @param handlerName - 핸들러 이름 (로깅용)
 * @param handler - 실제 핸들러 함수
 * @returns IPCResponse 타입 응답
 *
 * @example
 * ```typescript
 * ipcMain.handle('my-channel', async (event, data) => {
 *   return handleWithErrorLogging('my-channel', async () => {
 *     // 비즈니스 로직
 *     return { result: 'success' };
 *   });
 * });
 * ```
 */
export async function handleWithErrorLogging<T>(
  handlerName: string,
  handler: () => Promise<T>
): Promise<IPCResponse<T>> {
  try {
    logger.debug(`[IPC] ${handlerName} - Start`);
    const data = await handler();
    logger.debug(`[IPC] ${handlerName} - Success`);
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[IPC] ${handlerName} - Error:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 동기 IPC 핸들러 래퍼 - 동기 함수용
 *
 * @param handlerName - 핸들러 이름 (로깅용)
 * @param handler - 실제 핸들러 함수
 * @returns IPCResponse 타입 응답
 */
export function handleSyncWithErrorLogging<T>(
  handlerName: string,
  handler: () => T
): IPCResponse<T> {
  try {
    logger.debug(`[IPC] ${handlerName} - Start`);
    const data = handler();
    logger.debug(`[IPC] ${handlerName} - Success`);
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[IPC] ${handlerName} - Error:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 타임아웃이 있는 IPC 핸들러 래퍼
 *
 * @param handlerName - 핸들러 이름
 * @param timeoutMs - 타임아웃 (밀리초)
 * @param handler - 실제 핸들러 함수
 * @returns IPCResponse 타입 응답
 */
export async function handleWithTimeout<T>(
  handlerName: string,
  timeoutMs: number,
  handler: () => Promise<T>
): Promise<IPCResponse<T>> {
  return handleWithErrorLogging(handlerName, async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Handler timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([handler(), timeoutPromise]);
  });
}

/**
 * 재시도 로직이 있는 IPC 핸들러 래퍼
 *
 * @param handlerName - 핸들러 이름
 * @param maxRetries - 최대 재시도 횟수
 * @param retryDelay - 재시도 간 지연 시간 (밀리초)
 * @param handler - 실제 핸들러 함수
 * @returns IPCResponse 타입 응답
 */
export async function handleWithRetry<T>(
  handlerName: string,
  maxRetries: number,
  retryDelay: number,
  handler: () => Promise<T>
): Promise<IPCResponse<T>> {
  return handleWithErrorLogging(handlerName, async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await handler();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[IPC] ${handlerName} - Attempt ${attempt + 1}/${maxRetries + 1} failed`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  });
}

/**
 * 파라미터 검증 헬퍼
 *
 * @param handlerName - 핸들러 이름
 * @param params - 검증할 파라미터
 * @param validator - 검증 함수
 * @returns IPCResponse (검증 실패 시 에러 응답)
 *
 * @example
 * ```typescript
 * const validation = validateParams('my-channel', data, (d) => {
 *   if (!d.userId) return 'userId is required';
 *   if (typeof d.userId !== 'string') return 'userId must be string';
 *   return null;
 * });
 * if (!validation.success) return validation;
 * ```
 */
export function validateParams<T>(
  handlerName: string,
  params: T,
  validator: (params: T) => string | null
): IPCResponse<never> | null {
  const errorMessage = validator(params);
  if (errorMessage) {
    logger.error(`[IPC] ${handlerName} - Validation failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
  return null;
}

/**
 * 성공 응답 생성 헬퍼
 */
export function successResponse<T>(data: T): IPCResponse<T> {
  return { success: true, data };
}

/**
 * 에러 응답 생성 헬퍼
 */
export function errorResponse(error: string | Error): IPCResponse<never> {
  const errorMessage = error instanceof Error ? error.message : error;
  return { success: false, error: errorMessage };
}

/**
 * 조건부 응답 헬퍼
 *
 * @param condition - 성공 조건
 * @param successData - 성공 시 데이터
 * @param errorMessage - 실패 시 에러 메시지
 */
export function conditionalResponse<T>(
  condition: boolean,
  successData: T,
  errorMessage: string
): IPCResponse<T> {
  if (condition) {
    return successResponse(successData);
  } else {
    return errorResponse(errorMessage);
  }
}

/**
 * 빈 성공 응답 (데이터가 없는 성공)
 */
export function emptySuccessResponse(): IPCResponse<null> {
  return { success: true, data: null };
}

/**
 * 스트리밍 핸들러 래퍼
 *
 * 스트리밍 IPC 핸들러에서 에러 발생 시 적절한 에러 이벤트 전송
 *
 * @param event - Electron IpcMainInvokeEvent
 * @param channel - 응답 채널
 * @param handler - 스트리밍 핸들러 함수
 */
export async function handleStreamingWithErrorLogging(
  event: Electron.IpcMainInvokeEvent,
  channel: string,
  handler: (send: (data: any) => void) => Promise<void>
): Promise<void> {
  try {
    logger.debug(`[IPC] ${channel} - Streaming start`);

    await handler((data) => {
      event.sender.send(channel, data);
    });

    logger.debug(`[IPC] ${channel} - Streaming complete`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[IPC] ${channel} - Streaming error:`, error);

    // 에러 이벤트 전송
    event.sender.send(channel, {
      type: 'error',
      error: errorMessage,
    });
  }
}
