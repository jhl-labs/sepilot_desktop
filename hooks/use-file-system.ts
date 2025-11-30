/**
 * File System Operations Hook
 *
 * Provides type-safe file system operations with error handling
 * and logging for debugging.
 */

import { useCallback } from 'react';
import { isElectron } from '@/lib/platform';

interface FileSystemError {
  code: string;
  message: string;
  operation: string;
}

interface UseFileSystemReturn {
  createFile: (filePath: string, content?: string) => Promise<boolean>;
  createDirectory: (dirPath: string) => Promise<boolean>;
  deleteItem: (targetPath: string) => Promise<boolean>;
  renameItem: (oldPath: string, newPath: string) => Promise<boolean>;
  readFile: (filePath: string) => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<any[] | null>;
  isAvailable: boolean;
}

export function useFileSystem(): UseFileSystemReturn {
  const isAvailable = isElectron() && !!window.electronAPI;

  const logOperation = useCallback((operation: string, params: any) => {
    console.log(`[FileSystem] ${operation}:`, params);
  }, []);

  const handleError = useCallback((operation: string, error: any): FileSystemError => {
    const fsError: FileSystemError = {
      code: error.code || 'UNKNOWN',
      message: error.message || 'Unknown error occurred',
      operation,
    };
    console.error(`[FileSystem] ${operation} failed:`, fsError);
    return fsError;
  }, []);

  const createFile = useCallback(async (filePath: string, content: string = ''): Promise<boolean> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return false;
    }

    try {
      logOperation('createFile', { filePath, contentLength: content.length });
      const result = await window.electronAPI.fs.createFile(filePath, content);

      if (result.success) {
        console.log(`[FileSystem] File created successfully: ${filePath}`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to create file');
      }
    } catch (error: any) {
      handleError('createFile', error);
      return false;
    }
  }, [isAvailable, logOperation, handleError]);

  const createDirectory = useCallback(async (dirPath: string): Promise<boolean> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return false;
    }

    try {
      logOperation('createDirectory', { dirPath });
      const result = await window.electronAPI.fs.createDirectory(dirPath);

      if (result.success) {
        console.log(`[FileSystem] Directory created successfully: ${dirPath}`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to create directory');
      }
    } catch (error: any) {
      handleError('createDirectory', error);
      return false;
    }
  }, [isAvailable, logOperation, handleError]);

  const deleteItem = useCallback(async (targetPath: string): Promise<boolean> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return false;
    }

    try {
      logOperation('delete', { targetPath });
      const result = await window.electronAPI.fs.delete(targetPath);

      if (result.success) {
        console.log(`[FileSystem] Deleted successfully: ${targetPath}`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to delete');
      }
    } catch (error: any) {
      handleError('delete', error);
      return false;
    }
  }, [isAvailable, logOperation, handleError]);

  const renameItem = useCallback(async (oldPath: string, newPath: string): Promise<boolean> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return false;
    }

    try {
      logOperation('rename', { oldPath, newPath });
      const result = await window.electronAPI.fs.rename(oldPath, newPath);

      if (result.success) {
        console.log(`[FileSystem] Renamed successfully: ${oldPath} -> ${newPath}`);
        return true;
      } else {
        throw new Error(result.error || 'Failed to rename');
      }
    } catch (error: any) {
      handleError('rename', error);
      return false;
    }
  }, [isAvailable, logOperation, handleError]);

  const readFile = useCallback(async (filePath: string): Promise<string | null> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return null;
    }

    try {
      logOperation('readFile', { filePath });
      const result = await window.electronAPI.fs.readFile(filePath);

      console.log('[FileSystem] readFile result:', {
        success: result.success,
        hasData: result.data !== undefined,
        dataLength: result.data?.length,
        error: result.error,
        code: (result as any).code,
      });

      if (result.success) {
        // success가 true면 data가 빈 문자열('')이어도 성공으로 처리
        console.log(`[FileSystem] File read successfully: ${filePath} (${result.data?.length || 0} bytes)`);
        return result.data || '';
      } else {
        // 에러 객체를 제대로 생성 (code 포함)
        const error: any = new Error(result.error || 'Failed to read file');
        error.code = (result as any).code || 'UNKNOWN';
        throw error;
      }
    } catch (error: any) {
      handleError('readFile', error);
      return null;
    }
  }, [isAvailable, logOperation, handleError]);

  const readDirectory = useCallback(async (dirPath: string): Promise<any[] | null> => {
    if (!isAvailable) {
      console.warn('[FileSystem] Not available in browser mode');
      return null;
    }

    try {
      logOperation('readDirectory', { dirPath });
      const result = await window.electronAPI.fs.readDirectory(dirPath);

      if (result.success && result.data) {
        console.log(`[FileSystem] Directory read successfully: ${dirPath} (${result.data.length} items)`);
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to read directory');
      }
    } catch (error: any) {
      handleError('readDirectory', error);
      return null;
    }
  }, [isAvailable, logOperation, handleError]);

  return {
    createFile,
    createDirectory,
    deleteItem,
    renameItem,
    readFile,
    readDirectory,
    isAvailable,
  };
}
