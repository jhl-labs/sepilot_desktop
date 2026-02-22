/**
 * Extension IPC Handler Registry
 *
 * Extension이 등록한 IPC handler를 관리하고 활성화/비활성화를 지원합니다.
 * VSCode처럼 Extension이 비활성화되면 IPC handler도 제거됩니다.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';

type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any;

interface RegisteredHandler {
  extensionId: string;
  channel: string;
  handler: IpcHandler;
  isActive: boolean;
}

/**
 * Extension IPC Handler Registry
 *
 * Extension의 IPC handler를 중앙에서 관리하고,
 * activate/deactivate 시 handler를 등록/해제합니다.
 */
class ExtensionHandlerRegistry {
  private handlers = new Map<string, RegisteredHandler>();

  /**
   * Extension IPC handler 등록
   *
   * @param extensionId - Extension ID
   * @param channel - IPC 채널 이름
   * @param handler - IPC handler 함수
   */
  register(extensionId: string, channel: string, handler: IpcHandler): void {
    const key = `${extensionId}:${channel}`;

    // 이미 등록된 handler가 있으면 먼저 제거
    if (this.handlers.has(key)) {
      console.warn(`[ExtensionHandlerRegistry] Handler already registered: ${key}, replacing...`);
      this.unregister(extensionId, channel);
    }

    // Wrapper handler: Extension이 활성화되어 있을 때만 실행
    const wrappedHandler = async (event: IpcMainInvokeEvent, ...args: any[]) => {
      const registered = this.handlers.get(key);

      if (!registered) {
        throw new Error(`Handler not found: ${key}`);
      }

      if (!registered.isActive) {
        throw new Error(`Extension ${extensionId} is not active`);
      }

      try {
        return await registered.handler(event, ...args);
      } catch (error) {
        console.error(`[ExtensionHandlerRegistry] Handler error (${key}):`, error);
        throw error;
      }
    };

    // ipcMain에 등록
    ipcMain.handle(channel, wrappedHandler);

    // Registry에 저장
    this.handlers.set(key, {
      extensionId,
      channel,
      handler,
      isActive: true,
    });

    console.log(`[ExtensionHandlerRegistry] Registered handler: ${key}`);
  }

  /**
   * Extension IPC handler 등록 해제
   *
   * @param extensionId - Extension ID
   * @param channel - IPC 채널 이름
   */
  unregister(extensionId: string, channel: string): void {
    const key = `${extensionId}:${channel}`;
    const registered = this.handlers.get(key);

    if (!registered) {
      console.warn(`[ExtensionHandlerRegistry] Handler not found: ${key}`);
      return;
    }

    // ipcMain에서 제거
    ipcMain.removeHandler(channel);

    // Registry에서 제거
    this.handlers.delete(key);

    console.log(`[ExtensionHandlerRegistry] Unregistered handler: ${key}`);
  }

  /**
   * Extension의 모든 IPC handler 활성화
   *
   * @param extensionId - Extension ID
   */
  activate(extensionId: string): void {
    let count = 0;

    for (const [key, registered] of this.handlers.entries()) {
      if (registered.extensionId === extensionId) {
        registered.isActive = true;
        count++;
      }
    }

    if (count > 0) {
      console.log(
        `[ExtensionHandlerRegistry] Activated ${count} handler(s) for extension: ${extensionId}`
      );
    }
  }

  /**
   * Extension의 모든 IPC handler 비활성화
   *
   * @param extensionId - Extension ID
   */
  deactivate(extensionId: string): void {
    let count = 0;

    for (const [key, registered] of this.handlers.entries()) {
      if (registered.extensionId === extensionId) {
        registered.isActive = false;
        count++;
      }
    }

    if (count > 0) {
      console.log(
        `[ExtensionHandlerRegistry] Deactivated ${count} handler(s) for extension: ${extensionId}`
      );
    }
  }

  /**
   * Extension의 모든 IPC handler 제거
   *
   * Extension unload 시 사용됩니다.
   *
   * @param extensionId - Extension ID
   */
  removeAll(extensionId: string): void {
    const channels: string[] = [];

    // 해당 Extension의 모든 channel 수집
    for (const [key, registered] of this.handlers.entries()) {
      if (registered.extensionId === extensionId) {
        channels.push(registered.channel);
      }
    }

    // 모든 handler 제거
    for (const channel of channels) {
      this.unregister(extensionId, channel);
    }

    if (channels.length > 0) {
      console.log(
        `[ExtensionHandlerRegistry] Removed ${channels.length} handler(s) for extension: ${extensionId}`
      );
    }
  }

  /**
   * 특정 Extension의 등록된 channel 목록 조회
   *
   * @param extensionId - Extension ID
   * @returns 등록된 channel 목록
   */
  getChannels(extensionId: string): string[] {
    const channels: string[] = [];

    for (const [key, registered] of this.handlers.entries()) {
      if (registered.extensionId === extensionId) {
        channels.push(registered.channel);
      }
    }

    return channels;
  }

  /**
   * Extension이 특정 channel을 등록했는지 확인
   *
   * @param extensionId - Extension ID
   * @param channel - IPC 채널 이름
   * @returns 등록 여부
   */
  has(extensionId: string, channel: string): boolean {
    const key = `${extensionId}:${channel}`;
    return this.handlers.has(key);
  }

  /**
   * Registry 초기화 (테스트용)
   */
  clear(): void {
    // 모든 handler 제거
    for (const [key, registered] of this.handlers.entries()) {
      ipcMain.removeHandler(registered.channel);
    }

    this.handlers.clear();
    console.log('[ExtensionHandlerRegistry] Cleared all handlers');
  }
}

// Singleton instance
export const extensionHandlerRegistry = new ExtensionHandlerRegistry();

/**
 * Extension IPC Handler 등록 헬퍼 함수
 *
 * Extension의 setupIpcHandlers 함수에서 사용합니다.
 *
 * @example
 * ```typescript
 * export function setupIpcHandlers() {
 *   registerExtensionHandler('my-extension', 'my-extension:do-something', async (event, data) => {
 *     // handler implementation
 *     return { success: true };
 *   });
 * }
 * ```
 */
export function registerExtensionHandler(
  extensionId: string,
  channel: string,
  handler: IpcHandler
): void {
  extensionHandlerRegistry.register(extensionId, channel, handler);
}

/**
 * Extension IPC Handler 등록 해제 헬퍼 함수
 *
 * @example
 * ```typescript
 * unregisterExtensionHandler('my-extension', 'my-extension:do-something');
 * ```
 */
export function unregisterExtensionHandler(extensionId: string, channel: string): void {
  extensionHandlerRegistry.unregister(extensionId, channel);
}
