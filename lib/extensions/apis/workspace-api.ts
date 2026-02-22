/**
 * Workspace API 구현
 *
 * Extension에게 파일 시스템 접근 기능을 제공합니다.
 * 권한 체크와 IPC 통신을 통해 안전하게 동작합니다.
 */

import type { WorkspaceAPI, FileChangeEvent, Disposable } from '@sepilot/extension-sdk';

export class WorkspaceAPIImpl implements WorkspaceAPI {
  private fileWatchers = new Map<string, Set<(event: FileChangeEvent) => void>>();

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
   * 파일 읽기
   */
  async readFile(path: string): Promise<string> {
    this.checkPermission('filesystem:read');

    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('workspace:read-file', { path });
      if (!result.success) {
        throw new Error(result.error || 'Failed to read file');
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 파일 쓰기
   */
  async writeFile(path: string, content: string): Promise<void> {
    this.checkPermission('filesystem:write');

    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('workspace:write-file', { path, content });
      if (!result.success) {
        throw new Error(result.error || 'Failed to write file');
      }
      return;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 파일 목록 조회
   */
  async listFiles(dirPath: string, pattern?: string): Promise<string[]> {
    this.checkPermission('filesystem:read');

    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('workspace:list-files', { dirPath, pattern });
      if (!result.success) {
        throw new Error(result.error || 'Failed to list files');
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 현재 작업 디렉토리 조회
   */
  getWorkingDirectory(): string {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Synchronous operation - no IPC needed
      return localStorage.getItem('workingDirectory') || process.cwd();
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 작업 디렉토리 변경
   */
  setWorkingDirectory(path: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workingDirectory', path);
      return;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 파일 변경 감지
   */
  watchFile(path: string, callback: (event: FileChangeEvent) => void): Disposable {
    this.checkPermission('filesystem:read');

    // 콜백 등록
    if (!this.fileWatchers.has(path)) {
      this.fileWatchers.set(path, new Set());
    }
    this.fileWatchers.get(path)!.add(callback);

    // IPC를 통해 파일 감시 시작
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.invoke('workspace:watch-file', { path, extensionId: this.extensionId });

      // 파일 변경 이벤트 수신
      const handler = ((...args: unknown[]) => {
        callback(args[0] as FileChangeEvent);
      }) as (...args: unknown[]) => void;

      window.electronAPI.on(`workspace:file-changed:${path}`, handler);

      return {
        dispose: () => {
          this.fileWatchers.get(path)?.delete(callback);
          if (this.fileWatchers.get(path)?.size === 0) {
            this.fileWatchers.delete(path);
            window.electronAPI?.invoke('workspace:unwatch-file', {
              path,
              extensionId: this.extensionId,
            });
          }
          window.electronAPI?.removeListener(`workspace:file-changed:${path}`, handler);
        },
      };
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 디렉토리 선택 다이얼로그
   */
  async selectDirectory(): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:select-directory');
      if (!result.success) {
        return null;
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 파일 선택 다이얼로그
   */
  async selectFile(options?: {
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:select-file', options);
      if (!result.success) {
        return null;
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 파일 통계 정보 조회
   */
  async getFileStat(path: string): Promise<{ mtime: number; size: number } | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:get-file-stat', path);
      if (!result.success) {
        return null;
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 이미지 파일을 Base64로 읽기
   */
  async readImageAsBase64(path: string): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:read-image-as-base64', path);
      if (!result.success) {
        throw new Error(result.error || 'Failed to read image');
      }
      return result.data;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 패턴으로 파일 검색 (glob)
   */
  async searchFiles(pattern: string): Promise<string[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const workingDir = this.getWorkingDirectory();
      const result = await window.electronAPI.invoke('fs:search-files', pattern, workingDir);
      if (!result.success) {
        return [];
      }
      return result.data || [];
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 상대 경로를 절대 경로로 변환
   */
  resolvePath(relativePath: string): string {
    const workingDir = this.getWorkingDirectory();
    const parts = workingDir.split('/').filter(Boolean);
    const relativeParts = relativePath.split('/').filter(Boolean);

    for (const part of relativeParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return `/${parts.join('/')}`;
  }

  /**
   * 파일 복제
   */
  async duplicate(sourcePath: string, targetPath: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:duplicate', sourcePath, targetPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to duplicate file');
      }
      return;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 클립보드 이미지를 지정된 디렉토리에 저장하고 파일 경로 반환
   */
  async saveClipboardImage(directory: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.invoke('fs:save-clipboard-image', directory);
      if (!result.success) {
        return null;
      }
      return result.data.path;
    }

    throw new Error('Workspace API is only available in Electron environment');
  }

  /**
   * 모든 파일 감시 해제
   */
  dispose(): void {
    if (typeof window !== 'undefined' && window.electronAPI) {
      for (const path of this.fileWatchers.keys()) {
        window.electronAPI.invoke('workspace:unwatch-file', {
          path,
          extensionId: this.extensionId,
        });
      }
    }
    this.fileWatchers.clear();
  }
}
