/**
 * Extension Vector DB IPC Handlers
 *
 * Extension이 ExtensionContext.vectorDB API를 통해 Vector DB에 접근하기 위한 IPC 핸들러
 * ext-docs/04-ipc-protocol.md 참조
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { vectorDBService } from '@/electron/services/vectordb';
import { logger } from '@/lib/utils/logger';
import { extensionRegistry } from '@/lib/extensions/registry';
import { PermissionValidator } from '@/lib/extensions/permission-validator';

/**
 * Extension Vector DB 핸들러 등록
 *
 * Extension Context의 vectorDB API 구현
 * namespace: extension:{extensionId}:vectordb:*
 */
export function registerExtensionVectorDBHandlers() {
  // FIXME: VectorDBService 인터페이스에 search/insertDocuments/deleteDocuments 메서드 추가 필요
  const vectorDB = vectorDBService as any;

  /**
   * Vector Search
   *
   * Extension이 Vector DB에서 유사 문서를 검색할 수 있게 함
   * Permission: vectordb:search
   */
  ipcMain.handle(
    'extension:vectordb:search',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        query: string;
        options?: {
          topK?: number;
          threshold?: number;
          collection?: string;
        };
      }
    ) => {
      try {
        logger.info('[Extension VectorDB] Search request:', {
          extensionId: data.extensionId,
          queryLength: data.query?.length,
          options: data.options,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('vectordb:search')) {
          return { success: false, error: 'Permission denied: vectordb:search' };
        }

        // Collection name을 extension ID로 강제 격리 (보안)
        const collection = `extension-${data.extensionId}`;

        const results = await vectorDB.search(data.query, {
          topK: data.options?.topK || 5,
          threshold: data.options?.threshold || 0.7,
          collection,
        });

        return {
          success: true,
          data: results,
        };
      } catch (error: any) {
        logger.error('[Extension VectorDB] Search error:', {
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
   * Vector Insert
   *
   * Extension이 Vector DB에 문서를 삽입할 수 있게 함
   * Permission: vectordb:insert
   */
  ipcMain.handle(
    'extension:vectordb:insert',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        documents: Array<{
          id?: string;
          content: string;
          metadata?: Record<string, any>;
        }>;
        options?: {
          collection?: string;
        };
      }
    ) => {
      try {
        logger.info('[Extension VectorDB] Insert request:', {
          extensionId: data.extensionId,
          documentCount: data.documents?.length,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('vectordb:insert')) {
          return { success: false, error: 'Permission denied: vectordb:insert' };
        }

        // Collection name을 extension ID로 격리
        const collection = data.options?.collection || `extension-${data.extensionId}`;

        await vectorDB.insertDocuments(
          data.documents.map((doc) => ({
            ...doc,
            metadata: {
              ...doc.metadata,
              extensionId: data.extensionId, // Extension ID 메타데이터 추가
            },
          })),
          { collection }
        );

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Extension VectorDB] Insert error:', {
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
   * Vector Delete
   *
   * Extension이 Vector DB에서 문서를 삭제할 수 있게 함
   * Permission: vectordb:delete
   */
  ipcMain.handle(
    'extension:vectordb:delete',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        ids: string[];
        options?: {
          collection?: string;
        };
      }
    ) => {
      try {
        logger.info('[Extension VectorDB] Delete request:', {
          extensionId: data.extensionId,
          idCount: data.ids?.length,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('vectordb:delete')) {
          return { success: false, error: 'Permission denied: vectordb:delete' };
        }

        // Collection name을 extension ID로 격리
        const collection = data.options?.collection || `extension-${data.extensionId}`;

        await vectorDB.deleteDocuments(data.ids, { collection });

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Extension VectorDB] Delete error:', {
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

  logger.info('[Extension VectorDB] Handlers registered');
}
