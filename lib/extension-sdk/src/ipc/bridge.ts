/**
 * IPC Bridge Implementation
 *
 * Extension이 Electron IPC를 통해 Backend와 통신하기 위한 브리지
 */

import type { IPCBridge } from '../types/extension';
import { getElectronAPI } from '../utils/platform';

/**
 * Electron IPC Bridge
 */
class ElectronIPCBridge implements IPCBridge {
  async invoke<T = any>(
    channel: string,
    data?: any
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    const api = getElectronAPI();
    if (!api) {
      return {
        success: false,
        error: 'Electron API not available',
      };
    }

    try {
      const result = await api.invoke(channel, data);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  on(channel: string, handler: (data: any) => void): () => void {
    const api = getElectronAPI();
    if (!api || !api.on) {
      console.warn('Electron API.on not available');
      return () => {};
    }

    api.on(channel, handler);

    // Return unsubscribe function
    return () => {
      if (api.off) {
        api.off(channel, handler);
      }
    };
  }

  send(channel: string, data?: any): void {
    const api = getElectronAPI();
    if (!api || !api.send) {
      console.warn('Electron API.send not available');
      return;
    }

    api.send(channel, data);
  }
}

/**
 * Mock IPC Bridge for testing
 */
class MockIPCBridge implements IPCBridge {
  private handlers = new Map<string, ((data: any) => any)[]>();
  private listeners = new Map<string, ((data: any) => void)[]>();

  async invoke<T = any>(
    channel: string,
    data?: any
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers || channelHandlers.length === 0) {
      return {
        success: false,
        error: `No handler registered for channel: ${channel}`,
      };
    }

    try {
      const result = await channelHandlers[0](data);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  on(channel: string, handler: (data: any) => void): () => void {
    const listeners = this.listeners.get(channel) || [];
    listeners.push(handler);
    this.listeners.set(channel, listeners);

    return () => {
      const updatedListeners = this.listeners.get(channel)?.filter((h) => h !== handler) || [];
      this.listeners.set(channel, updatedListeners);
    };
  }

  send(channel: string, data?: any): void {
    const listeners = this.listeners.get(channel) || [];
    listeners.forEach((listener) => listener(data));
  }

  // Test helper: register mock handler
  registerMockHandler(channel: string, handler: (data: any) => any): void {
    const handlers = this.handlers.get(channel) || [];
    handlers.push(handler);
    this.handlers.set(channel, handlers);
  }

  // Test helper: emit event
  emitMockEvent(channel: string, data: any): void {
    this.send(channel, data);
  }
}

/**
 * Create IPC Bridge instance
 *
 * @param mock - Use mock bridge for testing
 */
export function createIPCBridge(mock = false): IPCBridge {
  if (mock) {
    return new MockIPCBridge();
  }
  return new ElectronIPCBridge();
}

/**
 * Default IPC Bridge instance
 */
export const ipcBridge = createIPCBridge();

/**
 * Export mock bridge for testing
 */
export { MockIPCBridge };
