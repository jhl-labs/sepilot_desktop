/**
 * Editor Extension IPC Handlers
 *
 * Editor Extension이 사용자의 working directory 내 파일에 접근하기 위한 IPC 핸들러
 *
 * 주의: 이 핸들러들은 extension:fs:* 와 달리 샌드박스가 없으며,
 * 사용자가 선택한 working directory 전체에 접근 가능합니다.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@/lib/utils/logger';

/**
 * 파일 트리 노드 인터페이스
 */
interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

/**
 * 디렉토리 트리 구조 읽기 (재귀적)
 */
async function readDirectoryTree(dirPath: string): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      };

      // 디렉토리면 children을 undefined로 설정 (lazy loading을 위해)
      if (entry.isDirectory()) {
        node.children = undefined;
      }

      nodes.push(node);
    }

    // 정렬: 디렉토리 먼저, 그 다음 파일 (알파벳 순)
    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  } catch (error: any) {
    logger.error('[Editor Extension] Read directory tree error:', error);
    throw error;
  }
}

/**
 * Editor Extension 핸들러 등록
 */
export function registerEditorExtensionHandlers() {
  /**
   * Read File
   *
   * 파일 내용 읽기
   */
  ipcMain.handle('editor:read-file', async (event: IpcMainInvokeEvent, data: { path: string }) => {
    try {
      logger.info('[Editor Extension] Read file:', data.path);

      const content = await fs.readFile(data.path, 'utf-8');

      return {
        success: true,
        data: {
          content,
        },
      };
    } catch (error: any) {
      logger.error('[Editor Extension] Read file error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  /**
   * Write File
   *
   * 파일 쓰기 (덮어쓰기)
   */
  ipcMain.handle(
    'editor:write-file',
    async (event: IpcMainInvokeEvent, data: { path: string; content: string }) => {
      try {
        logger.info('[Editor Extension] Write file:', data.path);

        // 디렉토리가 없으면 생성
        await fs.mkdir(path.dirname(data.path), { recursive: true });

        await fs.writeFile(data.path, data.content, 'utf-8');

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Write file error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * List Files
   *
   * 디렉토리 내 파일 목록 (단순 목록)
   */
  ipcMain.handle('editor:list-files', async (event: IpcMainInvokeEvent, data: { path: string }) => {
    try {
      logger.info('[Editor Extension] List files:', data.path);

      const entries = await fs.readdir(data.path, { withFileTypes: true });
      const files = entries.map((entry) => entry.name);

      return {
        success: true,
        data: {
          files,
        },
      };
    } catch (error: any) {
      logger.error('[Editor Extension] List files error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  /**
   * Delete File
   *
   * 파일 삭제
   */
  ipcMain.handle(
    'editor:delete-file',
    async (event: IpcMainInvokeEvent, data: { path: string }) => {
      try {
        logger.info('[Editor Extension] Delete file:', data.path);

        await fs.unlink(data.path);

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Delete file error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * File Exists
   *
   * 파일 존재 여부 확인
   */
  ipcMain.handle(
    'editor:file-exists',
    async (event: IpcMainInvokeEvent, data: { path: string }) => {
      try {
        await fs.access(data.path);
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
    }
  );

  /**
   * Read Directory
   *
   * 디렉토리 트리 구조 읽기 (파일 탐색기용)
   */
  ipcMain.handle(
    'editor:read-directory',
    async (event: IpcMainInvokeEvent, data: { path: string }) => {
      try {
        logger.info('[Editor Extension] Read directory:', data.path);

        const tree = await readDirectoryTree(data.path);

        return {
          success: true,
          data: tree,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Read directory error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * Create File
   *
   * 새 파일 생성
   */
  ipcMain.handle(
    'editor:create-file',
    async (event: IpcMainInvokeEvent, data: { path: string; content?: string }) => {
      try {
        logger.info('[Editor Extension] Create file:', data.path);

        // 디렉토리가 없으면 생성
        await fs.mkdir(path.dirname(data.path), { recursive: true });

        // 파일 생성 (내용이 없으면 빈 파일)
        await fs.writeFile(data.path, data.content || '', 'utf-8');

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Create file error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * Create Directory
   *
   * 새 디렉토리 생성
   */
  ipcMain.handle(
    'editor:create-directory',
    async (event: IpcMainInvokeEvent, data: { path: string }) => {
      try {
        logger.info('[Editor Extension] Create directory:', data.path);

        await fs.mkdir(data.path, { recursive: true });

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Create directory error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * Delete Item (file or directory)
   *
   * 파일 또는 디렉토리 삭제 (디렉토리는 재귀적으로 삭제)
   */
  ipcMain.handle(
    'editor:delete-item',
    async (event: IpcMainInvokeEvent, data: { path: string }) => {
      try {
        logger.info('[Editor Extension] Delete item:', data.path);

        const stat = await fs.stat(data.path);
        if (stat.isDirectory()) {
          // 디렉토리는 재귀적으로 삭제
          await fs.rm(data.path, { recursive: true, force: true });
        } else {
          // 파일 삭제
          await fs.unlink(data.path);
        }

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Delete item error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  /**
   * Rename Item (file or directory)
   *
   * 파일 또는 디렉토리 이름 변경 (이동)
   */
  ipcMain.handle(
    'editor:rename-item',
    async (event: IpcMainInvokeEvent, data: { oldPath: string; newPath: string }) => {
      try {
        logger.info('[Editor Extension] Rename item:', data.oldPath, '->', data.newPath);

        // 대상 디렉토리가 없으면 생성
        await fs.mkdir(path.dirname(data.newPath), { recursive: true });

        // 이름 변경 (이동)
        await fs.rename(data.oldPath, data.newPath);

        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('[Editor Extension] Rename item error:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  logger.info('[Editor Extension] Handlers registered');
}
