/**
 * Extension MCP IPC Handlers
 *
 * Extension이 ExtensionContext.mcp API를 통해 MCP 도구를 실행하기 위한 IPC 핸들러
 * ext-docs/04-ipc-protocol.md 참조
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { MCPServerManager } from '@/lib/domains/mcp';
import { logger } from '@/lib/utils/logger';
import { extensionRegistry } from '@/lib/extensions/registry';
import { PermissionValidator } from '@/lib/extensions/permission-validator';

/**
 * Extension MCP 핸들러 등록
 *
 * Extension Context의 mcp API 구현
 * namespace: extension:{extensionId}:mcp:*
 */
export function registerExtensionMCPHandlers() {
  /**
   * MCP Tool Execution
   *
   * Extension이 MCP 도구를 실행할 수 있게 함
   * Permission: mcp:call-tool
   */
  ipcMain.handle(
    'extension:mcp:execute',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        toolName: string;
        args: any;
        options?: {
          serverId?: string;
        };
      }
    ) => {
      try {
        logger.info('[Extension MCP] Execute tool request:', {
          extensionId: data.extensionId,
          toolName: data.toolName,
          serverId: data.options?.serverId,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('mcp:call-tool')) {
          return { success: false, error: 'Permission denied: mcp:call-tool' };
        }

        // MCP 도구 실행
        const serverId = data.options?.serverId;
        if (!serverId) {
          throw new Error('serverId is required');
        }
        const result = await MCPServerManager.callToolInMainProcess(
          serverId,
          data.toolName,
          data.args
        );

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('[Extension MCP] Execute tool error:', {
          extensionId: data.extensionId,
          toolName: data.toolName,
          error: error.message,
        });
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * MCP List Tools
   *
   * Extension이 사용 가능한 MCP 도구 목록을 조회할 수 있게 함
   * Permission: mcp:list-tools
   */
  ipcMain.handle(
    'extension:mcp:list',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        options?: {
          serverId?: string;
        };
      }
    ) => {
      try {
        logger.info('[Extension MCP] List tools request:', {
          extensionId: data.extensionId,
          serverId: data.options?.serverId,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('mcp:list-tools')) {
          return { success: false, error: 'Permission denied: mcp:list-tools' };
        }

        // MCP 도구 목록 조회
        const tools = data.options?.serverId
          ? MCPServerManager.getServerTools(data.options.serverId)
          : MCPServerManager.getAllToolsInMainProcess();

        return {
          success: true,
          data: tools,
        };
      } catch (error: any) {
        logger.error('[Extension MCP] List tools error:', {
          extensionId: data.extensionId,
          error: error.message,
        });
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * MCP List Servers
   *
   * Extension이 연결된 MCP 서버 목록을 조회할 수 있게 함
   * Permission: mcp:list-tools
   */
  ipcMain.handle(
    'extension:mcp:servers',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
      }
    ) => {
      try {
        logger.info('[Extension MCP] List servers request:', {
          extensionId: data.extensionId,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('mcp:list-tools')) {
          return { success: false, error: 'Permission denied: mcp:list-tools' };
        }

        // MCP 서버 목록 조회
        const servers = MCPServerManager.listServersInMainProcess();

        return {
          success: true,
          data: servers,
        };
      } catch (error: any) {
        logger.error('[Extension MCP] List servers error:', {
          extensionId: data.extensionId,
          error: error.message,
        });
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  logger.info('[Extension MCP] Handlers registered');
}
