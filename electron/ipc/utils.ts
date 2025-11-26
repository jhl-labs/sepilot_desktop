/**
 * IPC Handler Utilities
 * 공통 에러 처리 및 응답 형식을 위한 유틸리티
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { logger } from '../services/logger';

/**
 * Standard IPC response format
 */
export interface IPCResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a success response
 */
export function successResponse<T>(data?: T): IPCResponse<T> {
  return { success: true, data };
}

/**
 * Create an error response
 */
export function errorResponse(error: unknown): IPCResponse<never> {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
}

/**
 * Handler function type
 */
type HandlerFunction<TArgs extends unknown[], TReturn> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TReturn> | TReturn;

/**
 * Safe IPC handler wrapper
 * Automatically wraps handler with try-catch and standardizes response format
 */
export function safeHandler<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (...args: TArgs) => Promise<TReturn> | TReturn,
  options?: {
    logArgs?: boolean;
    logResult?: boolean;
  }
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      if (options?.logArgs) {
        logger.debug(`[IPC] ${channel} called with:`, args);
      }

      const result = await handler(...(args as TArgs));

      if (options?.logResult) {
        logger.debug(`[IPC] ${channel} returned:`, result);
      }

      return successResponse(result);
    } catch (error) {
      logger.error(`[IPC] ${channel} error:`, error);
      return errorResponse(error);
    }
  });
}

/**
 * Safe IPC handler that returns data directly (no wrapper)
 * For handlers that need custom response format
 */
export function safeHandlerRaw<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (...args: TArgs) => Promise<TReturn> | TReturn
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(...(args as TArgs));
    } catch (error) {
      logger.error(`[IPC] ${channel} error:`, error);
      return errorResponse(error);
    }
  });
}

/**
 * Remove handler if exists (for hot reload)
 */
export function removeHandlerIfExists(channel: string): void {
  try {
    ipcMain.removeHandler(channel);
  } catch {
    // Handler doesn't exist, ignore
  }
}

/**
 * Register multiple handlers at once
 * Automatically removes existing handlers first (for hot reload)
 */
export function registerHandlers(
  handlers: Array<{
    channel: string;
    handler: (...args: unknown[]) => Promise<unknown> | unknown;
    options?: {
      logArgs?: boolean;
      logResult?: boolean;
      rawResponse?: boolean;
    };
  }>
): void {
  for (const { channel, handler, options } of handlers) {
    removeHandlerIfExists(channel);

    if (options?.rawResponse) {
      safeHandlerRaw(channel, handler);
    } else {
      safeHandler(channel, handler, options);
    }
  }
}
