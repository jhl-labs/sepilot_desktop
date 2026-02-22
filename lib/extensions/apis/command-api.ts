/**
 * Command API 구현
 *
 * Extension에게 명령어 등록 및 실행 기능을 제공합니다.
 */

import type { CommandAPI, CommandHandler, Disposable } from '@sepilot/extension-sdk';

export class CommandAPIImpl implements CommandAPI {
  private commands = new Map<string, CommandHandler>();

  constructor(
    private extensionId: string,
    private permissions: string[]
  ) {}

  /**
   * 권한 체크
   */
  private checkPermission(permission: string): void {
    if (!this.permissions.includes(permission)) {
      throw new Error(`Extension "${this.extensionId}" does not have permission: ${permission}`);
    }
  }

  /**
   * 명령어 등록
   */
  registerCommand(commandId: string, handler: CommandHandler): Disposable {
    this.checkPermission('commands.register');

    // 네임스페이스가 포함된 전체 명령어 ID
    const fullCommandId = `${this.extensionId}:${commandId}`;

    if (this.commands.has(fullCommandId)) {
      throw new Error(`Command already registered: ${fullCommandId}`);
    }

    this.commands.set(fullCommandId, handler);

    // 전역 명령어 레지스트리에 등록
    if (typeof window !== 'undefined') {
      const globalCommands = (window as any).__extensionCommands || new Map();
      globalCommands.set(fullCommandId, {
        extensionId: this.extensionId,
        handler,
      });
      (window as any).__extensionCommands = globalCommands;
    }

    return {
      dispose: () => {
        this.commands.delete(fullCommandId);
        if (typeof window !== 'undefined') {
          const globalCommands = (window as any).__extensionCommands;
          if (globalCommands) {
            globalCommands.delete(fullCommandId);
          }
        }
      },
    };
  }

  /**
   * 명령어 실행
   */
  async executeCommand(commandId: string, ...args: any[]): Promise<any> {
    this.checkPermission('commands.execute');

    // 네임스페이스가 포함된 전체 명령어 ID
    let fullCommandId = commandId;
    if (!commandId.includes(':')) {
      // 네임스페이스가 없으면 현재 Extension의 명령어로 간주
      fullCommandId = `${this.extensionId}:${commandId}`;
    }

    // 전역 명령어 레지스트리에서 검색
    if (typeof window !== 'undefined') {
      const globalCommands = (window as any).__extensionCommands;
      if (globalCommands) {
        const commandEntry = globalCommands.get(fullCommandId);
        if (commandEntry) {
          return await commandEntry.handler(...args);
        }
      }
    }

    throw new Error(`Command not found: ${fullCommandId}`);
  }

  /**
   * 등록된 명령어 목록 조회
   */
  getCommands(): string[] {
    if (typeof window !== 'undefined') {
      const globalCommands = (window as any).__extensionCommands;
      if (globalCommands) {
        return Array.from(globalCommands.keys());
      }
    }
    return [];
  }

  /**
   * 모든 명령어 해제
   */
  dispose(): void {
    if (typeof window !== 'undefined') {
      const globalCommands = (window as any).__extensionCommands;
      if (globalCommands) {
        for (const commandId of this.commands.keys()) {
          globalCommands.delete(commandId);
        }
      }
    }
    this.commands.clear();
  }
}
