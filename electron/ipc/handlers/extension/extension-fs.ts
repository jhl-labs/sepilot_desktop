/**
 * Extension File System IPC Handlers
 *
 * Extension이 ExtensionContext.fs API를 통해 파일 시스템에 접근하기 위한 IPC 핸들러
 * ext-docs/04-ipc-protocol.md 및 ext-docs/nfr.md#NFR-SEC-002 참조
 *
 * 중요: Extension은 자신의 storagePath 내에서만 파일 작업 가능
 */

import { ipcMain, IpcMainInvokeEvent, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@/lib/utils/logger';
import { extensionRegistry } from '@/lib/extensions/registry';
import { PermissionValidator } from '@/lib/extensions/permission-validator';

/**
 * Extension File System 핸들러 등록
 *
 * Extension Context의 fs API 구현
 * namespace: extension:{extensionId}:fs:*
 */
export function registerExtensionFSHandlers() {
  /**
   * Get Extension Storage Path
   *
   * Extension의 전용 저장 경로 반환
   */
  function getExtensionStoragePath(extensionId: string): string {
    return path.join(app.getPath('userData'), 'extensions', extensionId);
  }

  /**
   * Validate Path
   *
   * Path Traversal 공격 방지 및 basePath 내 경로인지 검증
   * Symlink를 통한 우회 공격도 방지
   */
  async function validatePath(
    extensionId: string,
    filePath: string
  ): Promise<{
    valid: boolean;
    resolvedPath?: string;
    error?: string;
  }> {
    try {
      const basePath = getExtensionStoragePath(extensionId);
      const resolvedPath = path.resolve(basePath, filePath);

      // Path Traversal 검증: resolvedPath가 basePath 내에 있는지 확인
      if (!resolvedPath.startsWith(basePath)) {
        return {
          valid: false,
          error: `Path traversal detected: ${filePath} is outside extension storage`,
        };
      }

      // Symlink 공격 방지: 실제 경로 검증
      try {
        // 파일/디렉토리가 존재하는 경우 실제 경로로 변환
        const realPath = await fs.realpath(resolvedPath);

        // 실제 경로도 basePath 내에 있어야 함
        if (!realPath.startsWith(basePath)) {
          return {
            valid: false,
            error: `Symlink attack detected: ${filePath} points outside extension storage`,
          };
        }

        return {
          valid: true,
          resolvedPath: realPath,
        };
      } catch (error: any) {
        // 파일이 없는 경우 (새로 생성할 파일)
        if (error.code === 'ENOENT') {
          // 부모 디렉토리가 존재하면 검증
          const dir = path.dirname(resolvedPath);
          try {
            const realDir = await fs.realpath(dir);
            if (!realDir.startsWith(basePath)) {
              return {
                valid: false,
                error: `Parent directory symlink detected: ${filePath}`,
              };
            }

            return {
              valid: true,
              resolvedPath,
            };
          } catch {
            // 부모 디렉토리도 없으면 원래 경로 사용
            return {
              valid: true,
              resolvedPath,
            };
          }
        }

        throw error;
      }
    } catch (error: any) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Read File
   *
   * Extension 저장 경로 내의 파일 읽기
   * Permission: filesystem:read
   */
  ipcMain.handle(
    'extension:fs:read',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        path: string;
      }
    ) => {
      try {
        logger.info('[Extension FS] Read file request:', {
          extensionId: data.extensionId,
          path: data.path,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('filesystem:read')) {
          return { success: false, error: 'Permission denied: filesystem:read' };
        }

        // Path 검증
        const validation = await validatePath(data.extensionId, data.path);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // 파일 읽기
        const content = await fs.readFile(validation.resolvedPath!, 'utf-8');

        return {
          success: true,
          data: content,
        };
      } catch (error: any) {
        logger.error('[Extension FS] Read file error:', {
          extensionId: data.extensionId,
          path: data.path,
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
   * Write File
   *
   * Extension 저장 경로 내에 파일 쓰기
   * Permission: filesystem:write
   */
  ipcMain.handle(
    'extension:fs:write',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        path: string;
        content: string;
      }
    ) => {
      try {
        logger.info('[Extension FS] Write file request:', {
          extensionId: data.extensionId,
          path: data.path,
          contentLength: data.content?.length,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('filesystem:write')) {
          return { success: false, error: 'Permission denied: filesystem:write' };
        }

        // Path 검증
        const validation = await validatePath(data.extensionId, data.path);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // 디렉토리 생성 (없으면)
        await fs.mkdir(path.dirname(validation.resolvedPath!), { recursive: true });

        // 파일 쓰기
        await fs.writeFile(validation.resolvedPath!, data.content, 'utf-8');

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Extension FS] Write file error:', {
          extensionId: data.extensionId,
          path: data.path,
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
   * Read Directory
   *
   * Extension 저장 경로 내의 디렉토리 목록 읽기
   * Permission: filesystem:read
   */
  ipcMain.handle(
    'extension:fs:readdir',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        path: string;
      }
    ) => {
      try {
        logger.info('[Extension FS] Read directory request:', {
          extensionId: data.extensionId,
          path: data.path,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('filesystem:read')) {
          return { success: false, error: 'Permission denied: filesystem:read' };
        }

        // Path 검증
        const validation = await validatePath(data.extensionId, data.path);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // 디렉토리 읽기
        const entries = await fs.readdir(validation.resolvedPath!, { withFileTypes: true });

        const files = entries.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
        }));

        return {
          success: true,
          data: files,
        };
      } catch (error: any) {
        logger.error('[Extension FS] Read directory error:', {
          extensionId: data.extensionId,
          path: data.path,
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
   * Delete File
   *
   * Extension 저장 경로 내의 파일 삭제
   * Permission: filesystem:delete
   */
  ipcMain.handle(
    'extension:fs:delete',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        path: string;
      }
    ) => {
      try {
        logger.info('[Extension FS] Delete file request:', {
          extensionId: data.extensionId,
          path: data.path,
        });

        // 권한 검증
        const extension = extensionRegistry.get(data.extensionId);
        if (!extension) {
          return { success: false, error: `Extension not found: ${data.extensionId}` };
        }
        const permissionValidator = new PermissionValidator(data.extensionId, extension.manifest);
        if (!permissionValidator.hasPermission('filesystem:delete')) {
          return { success: false, error: 'Permission denied: filesystem:delete' };
        }

        // Path 검증
        const validation = await validatePath(data.extensionId, data.path);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // 파일 삭제
        await fs.unlink(validation.resolvedPath!);

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Extension FS] Delete file error:', {
          extensionId: data.extensionId,
          path: data.path,
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
   * Check if File Exists
   *
   * Extension 저장 경로 내의 파일 존재 여부 확인
   * Permission: filesystem:read
   */
  ipcMain.handle(
    'extension:fs:exists',
    async (
      event: IpcMainInvokeEvent,
      data: {
        extensionId: string;
        path: string;
      }
    ) => {
      try {
        // Path 검증
        const validation = await validatePath(data.extensionId, data.path);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.error,
          };
        }

        // 파일 존재 여부 확인
        try {
          await fs.access(validation.resolvedPath!);
          return {
            success: true,
            data: true,
          };
        } catch {
          return {
            success: true,
            data: false,
          };
        }
      } catch (error: any) {
        logger.error('[Extension FS] Check exists error:', {
          extensionId: data.extensionId,
          path: data.path,
          error: error.message,
        });
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  logger.info('[Extension FS] Handlers registered');
}
