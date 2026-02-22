/**
 * Extension LLM IPC Handlers
 *
 * Extension이 ExtensionContext.llm API를 통해 LLM 기능에 접근하기 위한 IPC 핸들러
 * ext-docs/04-ipc-protocol.md 참조
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'crypto';
import { getLLMClient } from '@/lib/domains/llm/client';
import { logger } from '@/lib/utils/logger';
import { extensionRegistry } from '@/lib/extensions/registry';
import { PermissionValidator } from '@/lib/extensions/permission-validator';

/**
 * Extension LLM 핸들러 등록
 *
 * Extension Context의 llm API 구현
 * namespace: extension:{extensionId}:llm:*
 */
export function registerExtensionLLMHandlers() {
  /**
   * LLM Chat
   *
   * Extension이 LLM과 대화할 수 있게 함
   * Permission: llm:chat
   */
  ipcMain.handle(
    'extension:llm:chat',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        messages: any[];
        options?: any;
      }
    ) => {
      try {
        logger.info('[Extension LLM] Chat request:', {
          extensionId: data.extensionId,
          messageCount: data.messages?.length,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('llm:chat')) {
          return { success: false, error: 'Permission denied: llm:chat' };
        }

        const client = getLLMClient();
        const provider = client.getProvider();

        // 스트리밍 없이 전체 응답 반환
        let fullResponse = '';
        for await (const chunk of provider.stream(data.messages, data.options || {})) {
          if (typeof chunk === 'string') {
            fullResponse += chunk;
          }
        }

        return {
          success: true,
          data: fullResponse,
        };
      } catch (error: any) {
        logger.error('[Extension LLM] Chat error:', {
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
   * LLM Stream Chat
   *
   * Extension이 LLM 스트리밍 응답을 받을 수 있게 함
   * Permission: llm:stream
   */
  ipcMain.handle(
    'extension:llm:stream',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        messages: any[];
        options?: any;
      }
    ) => {
      // 보안: 서버에서 고유한 스트림 채널 생성
      const streamChannel = `extension:${data.extensionId}:llm-stream:${Date.now()}:${randomUUID()}`;

      try {
        logger.info('[Extension LLM] Stream request:', {
          extensionId: data.extensionId,
          streamChannel,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('llm:stream')) {
          return { success: false, error: 'Permission denied: llm:stream' };
        }

        const client = getLLMClient();
        const provider = client.getProvider();

        let fullResponse = '';

        // 스트리밍 청크를 Extension으로 전송
        for await (const chunk of provider.stream(data.messages, data.options || {})) {
          if (typeof chunk === 'string') {
            fullResponse += chunk;

            // Extension의 stream channel로 청크 전송
            event.sender.send(streamChannel, {
              type: 'chunk',
              data: chunk,
            });
          }
        }

        // 스트림 종료 신호
        event.sender.send(streamChannel, {
          type: 'end',
          data: fullResponse,
        });

        return {
          success: true,
          streamChannel, // 클라이언트에 채널 이름 반환
          data: fullResponse,
        };
      } catch (error: any) {
        logger.error('[Extension LLM] Stream error:', {
          extensionId: data.extensionId,
          error: error.message,
        });

        // 에러도 stream channel로 전송
        event.sender.send(streamChannel, {
          type: 'error',
          error: error.message,
        });

        return {
          success: false,
          streamChannel,
          error: error.message,
        };
      }
    }
  );

  logger.info('[Extension LLM] Handlers registered');
}
