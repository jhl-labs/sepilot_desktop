/**
 * Type-Safe IPC Communication Layer
 *
 * Electron IPC 통신에 타입 안전성을 제공합니다.
 */

import type {
  IPCChannel,
  IPCRequest,
  IPCResponse,
  TypedInvoke,
  TypedHandle,
} from '@/types/ipc-channels';
import type { IpcMainInvokeEvent, IpcRenderer, IpcMain } from 'electron';

/**
 * Renderer Process에서 사용하는 타입 안전한 IPC invoke
 *
 * @example
 * ```typescript
 * import { typedInvoke } from '@/lib/ipc/typed-ipc';
 *
 * // 타입이 자동으로 추론됨
 * const result = await typedInvoke('llm-chat', messages, options);
 * // result: { content: string; usage?: any }
 *
 * const files = await typedInvoke('file:list', '/home/user');
 * // files: { files: string[] }
 * ```
 */
export function createTypedInvoke(ipcRenderer: IpcRenderer): TypedInvoke {
  return async <T extends IPCChannel>(
    channel: T,
    ...args: IPCRequest<T>
  ): Promise<IPCResponse<T>> => {
    return ipcRenderer.invoke(channel, ...args);
  };
}

/**
 * Main Process에서 사용하는 타입 안전한 IPC handler 등록
 *
 * @example
 * ```typescript
 * import { ipcMain } from 'electron';
 * import { createTypedHandle } from '@/lib/ipc/typed-ipc';
 *
 * const typedHandle = createTypedHandle(ipcMain);
 *
 * // 타입이 자동으로 추론됨
 * typedHandle('llm-chat', async (event, messages, options) => {
 *   // messages: Message[], options: any
 *   return { content: 'Hello', usage: {} };
 *   // 반환 타입도 체크됨
 * });
 * ```
 */
export function createTypedHandle(ipcMain: IpcMain): {
  handle: TypedHandle;
  removeHandler: (channel: IPCChannel) => void;
} {
  return {
    handle: <T extends IPCChannel>(
      channel: T,
      handler: (
        event: IpcMainInvokeEvent,
        ...args: IPCRequest<T>
      ) => Promise<IPCResponse<T>> | IPCResponse<T>
    ) => {
      ipcMain.handle(channel, handler as any);
    },
    removeHandler: (channel: IPCChannel) => {
      ipcMain.removeHandler(channel);
    },
  };
}

/**
 * IPC 채널 유효성 검증
 *
 * 런타임에 채널 이름이 올바른지 검증합니다.
 */
export function isValidChannel(channel: string): channel is IPCChannel {
  // 실제 검증 로직은 IPCChannelMap의 키와 비교
  // 현재는 간단히 문자열 검증만 수행
  return typeof channel === 'string' && channel.length > 0;
}

/**
 * IPC 에러 래퍼
 *
 * IPC 통신 중 발생한 에러를 구조화합니다.
 */
export class IPCError extends Error {
  constructor(
    public channel: IPCChannel,
    public originalError: Error,
    message?: string
  ) {
    super(message || `IPC Error on channel "${channel}": ${originalError.message}`);
    this.name = 'IPCError';
  }
}

/**
 * IPC 타임아웃 에러
 */
export class IPCTimeoutError extends IPCError {
  constructor(channel: IPCChannel, timeoutMs: number) {
    super(channel, new Error('Timeout'), `IPC call timed out after ${timeoutMs}ms`);
    this.name = 'IPCTimeoutError';
  }
}

/**
 * 타임아웃이 적용된 타입 안전한 IPC invoke
 *
 * @param timeoutMs - 타임아웃 시간 (밀리초)
 *
 * @example
 * ```typescript
 * const result = await typedInvokeWithTimeout(5000, 'llm-chat', messages);
 * // 5초 내에 응답이 없으면 IPCTimeoutError 발생
 * ```
 */
export function createTypedInvokeWithTimeout(
  ipcRenderer: IpcRenderer,
  timeoutMs: number
): TypedInvoke {
  return async <T extends IPCChannel>(
    channel: T,
    ...args: IPCRequest<T>
  ): Promise<IPCResponse<T>> => {
    return Promise.race([
      ipcRenderer.invoke(channel, ...args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new IPCTimeoutError(channel, timeoutMs)), timeoutMs)
      ),
    ]);
  };
}

/**
 * IPC 채널 그룹핑 유틸리티
 *
 * 관련된 IPC 채널들을 그룹화하여 조직화합니다.
 */
export const IPCChannelGroups = {
  llm: [
    'llm-chat',
    'llm-stream-chat',
    'llm-init',
    'llm-validate',
    'llm-abort',
    'llm-clear-context',
  ] as const,

  langgraph: [
    'langgraph-stream',
    'langgraph-abort',
    'langgraph-tool-approval-response',
    'langgraph-list-graphs',
  ] as const,

  chat: ['chat-save', 'chat-load', 'chat-delete', 'chat-list', 'chat-search'] as const,

  file: [
    'file:read',
    'file:write',
    'file:delete',
    'file:exists',
    'file:list',
    'file:select-directory',
    'file:select-file',
    'file:load-image',
  ] as const,

  extension: [
    'extension:discover',
    'extension:install',
    'extension:install-from-file',
    'extension:uninstall',
    'extension:list-renderer-extensions',
    'extension:check-updates',
  ] as const,

  mcp: [
    'mcp-add-server',
    'mcp-remove-server',
    'mcp-list-servers',
    'mcp-get-all-tools',
    'mcp-call-tool',
  ] as const,

  vectordb: [
    'vectordb-search',
    'vectordb-insert',
    'vectordb-delete',
    'vectordb-index-documents',
  ] as const,

  config: ['config:get', 'config:set', 'config:delete', 'config:get-all'] as const,

  auth: [
    'auth-initiate-login',
    'auth-exchange-code',
    'auth-get-token',
    'auth-get-user-info',
    'auth-logout',
  ] as const,

  terminal: [
    'terminal:create-session',
    'terminal:write',
    'terminal:resize',
    'terminal:destroy',
    'terminal:execute-command',
    'terminal:get-history',
  ] as const,

  browser: [
    'browser-view:create-tab',
    'browser-view:load-url',
    'browser-view:close-tab',
    'browser-view:switch-tab',
    'browser-view:get-tabs',
    'browser-view:reload',
    'browser-view:go-back',
    'browser-view:go-forward',
  ] as const,

  notification: [
    'notification:show',
    'notification:close',
    'notification:click',
    'notification:ready',
  ] as const,

  update: ['update:check', 'update:download', 'update:install'] as const,

  skills: ['skills:list', 'skills:get', 'skills:execute'] as const,
} as const;

/**
 * IPC 채널 그룹 타입
 */
export type IPCChannelGroup = keyof typeof IPCChannelGroups;

/**
 * 특정 그룹의 채널 목록 가져오기
 */
export function getChannelsInGroup<T extends IPCChannelGroup>(group: T): readonly IPCChannel[] {
  return IPCChannelGroups[group];
}

/**
 * IPC 디버깅 유틸리티
 *
 * 개발 환경에서 IPC 통신을 로깅합니다.
 */
/**
 * IPC 로거 함수 타입
 */
export type IPCLogger = (
  channel: IPCChannel,
  args: unknown[],
  response: unknown,
  duration: number
) => void;

export function createDebugInvoke(ipcRenderer: IpcRenderer, logger?: IPCLogger): TypedInvoke {
  return async <T extends IPCChannel>(
    channel: T,
    ...args: IPCRequest<T>
  ): Promise<IPCResponse<T>> => {
    const startTime = Date.now();
    try {
      const response = await ipcRenderer.invoke(channel, ...args);
      const duration = Date.now() - startTime;

      if (logger) {
        logger(channel, args, response, duration);
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[IPC] ${channel}`, {
          args,
          response,
          duration: `${duration.toFixed(2)}ms`,
        });
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      if (logger) {
        logger(channel, args, error, duration);
      } else if (process.env.NODE_ENV === 'development') {
        console.error(`[IPC Error] ${channel}`, {
          args,
          error,
          duration: `${duration.toFixed(2)}ms`,
        });
      }
      throw new IPCError(channel, error as Error);
    }
  };
}
